import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import {
  WorkflowRunRecordSchema,
  OntologyEventSchema,
  type WorkflowRunRecord,
  type WorkflowRunStep,
  type OntologyEvent,
} from "../../schemas/ontology.js";
import { hashObject } from "../integrity/hash.js";
import { getOntologyPaths } from "../project/paths.js";
import { appendJsonl, ensureDir, writeJson } from "../fs/json.js";
import { readState, writeState } from "../state/state-store.js";

// Workflow run records (spec §3.6 provenance).
//
// One record per `onto workflow run --as-proposal` execution, written
// BEFORE the proposals so each proposal's `source` can reference it.
// Mirrors `createPersistedRun`'s write discipline (record file + a
// `run_persisted` event + state counters) but NOT its identity contract:
// workflow executions are not deterministic functions of (input, model),
// so ids are random (`wfrun_<8hex>`) and there is no same-id caching.
// The body hash still self-certifies the record.

export interface CreateWorkflowRunRecordOptions {
  graphName: string | null;
  /** Basename of the graph file (no machine paths — checkout-portable). */
  graphFile: string;
  /** Raw graph file text; hashed into `graph.graphHash`. */
  graphText: string;
  /** Raw initial input text; hashed into `inputHash`. */
  inputText: string;
  provider: string | null;
  model: string | null;
  result: {
    verdict: "accept" | "reject";
    reason: string | null;
    stepCount: number;
    durationMs: number;
  };
  steps: WorkflowRunStep[];
  cwd?: string;
}

export function computeWorkflowGraphHash(graphText: string): string {
  return `wfgraph:hash:${hashObject(graphText)}`;
}

export function computeWorkflowInputHash(inputText: string): string {
  return `wfinput:hash:${hashObject(inputText)}`;
}

export function workflowRunRecordPath(id: string, cwd: string = process.cwd()): string {
  const paths = getOntologyPaths(cwd);
  return path.join(paths.runsDir, `${id}.json`);
}

export function loadWorkflowRunRecord(
  id: string,
  cwd: string = process.cwd(),
): WorkflowRunRecord | null {
  const filePath = workflowRunRecordPath(id, cwd);
  if (!fs.existsSync(filePath)) return null;
  return WorkflowRunRecordSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf-8")));
}

// Recompute-and-compare self-certification, the `onto runs verify` analogue.
export function verifyWorkflowRunRecord(record: WorkflowRunRecord): boolean {
  const { hash, ...body } = record;
  return hash === `wfrun:hash:${hashObject(body)}`;
}

export function createWorkflowRunRecord(
  options: CreateWorkflowRunRecordOptions,
): { record: WorkflowRunRecord; event: OntologyEvent } {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);

  const id = `wfrun_${randomBytes(4).toString("hex")}`;
  const recordWithoutHash = {
    id,
    createdAt: Math.floor(Date.now() / 1000),
    graph: {
      name: options.graphName,
      file: options.graphFile,
      graphHash: computeWorkflowGraphHash(options.graphText),
    },
    inputHash: computeWorkflowInputHash(options.inputText),
    model: { provider: options.provider, model: options.model },
    result: options.result,
    steps: options.steps,
  };
  const bodyHash = `wfrun:hash:${hashObject(recordWithoutHash)}`;
  const record = WorkflowRunRecordSchema.parse({ ...recordWithoutHash, hash: bodyHash });

  ensureDir(paths.runsDir);
  writeJson(workflowRunRecordPath(id, cwd), record);

  // Same event type as single-dispatch runs; `runKind: "workflow"`
  // distinguishes it in the audit log without widening the event enum.
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
      runKind: "workflow",
      outputHash: bodyHash,
      verdict: options.result.verdict,
      stepCount: options.result.stepCount,
    },
  });
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { record, event };
}
