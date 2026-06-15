import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  PersistedRunSchema,
  OntologyEventSchema,
  type PersistedRun,
  type PersistedRunInput,
  type PersistedRunModel,
  type PersistedRunOutput,
  type PersistedRunValidation,
  type OntologyEvent,
} from "../../schemas/ontology.js";
import { hashObject, hashRun } from "../integrity/hash.js";
import { getOntologyPaths } from "../project/paths.js";
import { appendJsonl, ensureDir, writeJson } from "../fs/json.js";
import { readState, writeState } from "../state/state-store.js";

// Run persistence module.
// See docs/design/kernel/RUN_PERSISTENCE.md for the full RFC.
//
// Identity contract:
//   id        = "run_" + first 8 hex chars of hashRun(input, model)
//   hash      = "run:hash:" + sha256 of the full record body (excluding the hash field itself)
// Re-running structurally identical input + model produces the same id by construction.

const ID_PREFIX_LEN = 8;

export interface CreatePersistedRunOptions {
  kind: "prompt" | "context";
  input: PersistedRunInput;
  model: PersistedRunModel;
  output: PersistedRunOutput;
  validation: PersistedRunValidation | null;
  durationMs: number;
  cwd?: string;
}

// Compute the deterministic run id from input + model. Exposed for tests and for callers
// that want to check whether a run already exists without dispatching to a model.
export function computeRunId(input: PersistedRunInput, model: PersistedRunModel): string {
  const fullHash = hashRun(input, model);
  // Strip the "run:hash:" prefix before slicing to get pure hex characters.
  const hex = fullHash.slice("run:hash:".length);
  return `run_${hex.slice(0, ID_PREFIX_LEN)}`;
}

export function persistedRunPath(id: string, cwd: string = process.cwd()): string {
  const paths = getOntologyPaths(cwd);
  return path.join(paths.runsDir, `${id}.json`);
}

// Compute the body hash for a persisted run. The hash field itself is excluded so the
// record can certify itself without recursion.
function computeBodyHash(record: Omit<PersistedRun, "hash">): string {
  const digest = hashObject(record);
  return `run:hash:${digest}`;
}

export function loadPersistedRun(id: string, cwd: string = process.cwd()): PersistedRun | null {
  const filePath = persistedRunPath(id, cwd);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  try {
    return PersistedRunSchema.parse(JSON.parse(content));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const summary = err.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
      throw new Error(`Failed to parse run ${id}: ${summary}`);
    }
    throw new Error(`Failed to parse run ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function listPersistedRuns(cwd: string = process.cwd()): PersistedRun[] {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.runsDir)) {
    return [];
  }
  const files = fs.readdirSync(paths.runsDir).filter(f => f.startsWith("run_") && f.endsWith(".json"));
  const runs: PersistedRun[] = [];
  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const run = loadPersistedRun(id, cwd);
    if (run) {
      runs.push(run);
    }
  }
  // Stable order by createdAt then id.
  return runs.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
}

export interface VerifyResult {
  ok: boolean;
  idMatches: boolean;
  hashMatches: boolean;
  expectedId: string;
  expectedHash: string;
}

// Recompute the deterministic id from (input, model) and the body hash from the stored record.
// Reports any divergence from the persisted values. Read-only.
export function verifyPersistedRun(id: string, cwd: string = process.cwd()): VerifyResult {
  const run = loadPersistedRun(id, cwd);
  if (!run) {
    throw new Error(`Run not found: ${id}`);
  }
  const expectedId = computeRunId(run.input, run.model);
  const { hash: _, ...body } = run;
  const expectedHash = computeBodyHash(body);
  const idMatches = run.id === expectedId;
  const hashMatches = run.hash === expectedHash;
  return {
    ok: idMatches && hashMatches,
    idMatches,
    hashMatches,
    expectedId,
    expectedHash,
  };
}

// Persist a run, append a run_persisted event, and update state.
//
// If a record with the same deterministic id already exists, we return it unchanged
// rather than re-dispatching to the model. The caller is expected to handle the cache-hit
// case before invoking this function (so it can decide whether to skip the LLM call).
// This function assumes the LLM call already happened.
export function createPersistedRun(options: CreatePersistedRunOptions): {
  run: PersistedRun;
  event: OntologyEvent;
  cached: boolean;
} {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);

  const id = computeRunId(options.input, options.model);
  const existing = loadPersistedRun(id, cwd);
  if (existing) {
    // The same deterministic record already exists. Return it as-is and skip event emission.
    // Callers can decide whether to surface "cached" to the user.
    return {
      run: existing,
      event: OntologyEventSchema.parse({
        eventId: "evt_" + randomBytes(4).toString("hex"),
        sequence: 0,
        timestamp: new Date().toISOString(),
        eventType: "run_persisted",
        branch: "main",
        previousEventId: null,
        payload: { runId: id, runKind: existing.kind, cached: true },
      }),
      cached: true,
    };
  }

  const recordWithoutHash = {
    id,
    createdAt: Math.floor(Date.now() / 1000),
    kind: options.kind,
    input: options.input,
    model: options.model,
    output: options.output,
    validation: options.validation,
    duration_ms: options.durationMs,
  };

  const bodyHash = computeBodyHash(recordWithoutHash);
  const run = PersistedRunSchema.parse({ ...recordWithoutHash, hash: bodyHash });

  // Write the run record.
  ensureDir(paths.runsDir);
  writeJson(persistedRunPath(id, cwd), run);

  // Append the run_persisted event to the temporal log so audits can replay session timelines.
  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "run_persisted",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      runId: id,
      runKind: options.kind,
      outputHash: bodyHash,
    },
  });
  appendJsonl(paths.eventsPath, event);

  // Update state counters.
  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { run, event, cached: false };
}
