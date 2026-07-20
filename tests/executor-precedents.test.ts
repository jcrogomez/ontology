import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  createPrecedentStore,
  fichaHashFor,
  precedentsPath,
  type NodePrecedent,
  type PrecedentStore,
} from "../src/runtime/executor/precedents.js";
import { decide } from "../src/runtime/executor/policy.js";
import { runExecutor, type ExecutorConfig, type ExecutorDeps } from "../src/runtime/executor/runner.js";
import type { RegenerateCommandOptions, RegenerateResult } from "../src/surfaces/commands/regenerate.js";

// Episodic precedent store — the executor's memory across runs. Contract under
// test: (a) precedents are keyed to ficha CONTENT (an edit voids them), (b) an
// extraction-gap precedent on an unchanged ficha short-circuits the climb and
// is cited (evidence "precedent"), never re-recorded, (c) closed precedents
// only warm-start κ* — they never green-light a write, (d) a taller ladder
// voids a plateau precedent (new capacity to try).

function setupNode(tempDir: string): string {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greeting domain"]).status).toBe(0);
  expect(
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", 'print("hello world")',
    ]).status,
  ).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
  return "node_0002";
}

function patchNode(tempDir: string, nodeId: string, mutate: (n: Record<string, unknown>) => void): void {
  const p = path.join(tempDir, ".ontology/nodes", `${nodeId}.json`);
  const n = JSON.parse(fs.readFileSync(p, "utf-8"));
  mutate(n);
  fs.writeFileSync(p, JSON.stringify(n, null, 2));
}

describe("precedent store (persistence + ficha-hash invalidation)", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("records and looks up while the ficha is unchanged; an edit voids it", () => {
    const id = setupNode(tempDir);
    const store = createPrecedentStore(tempDir);
    store.record({ nodeId: id, terminal: "extraction-gap", kappa: null, gapEvidence: "draw-disagreement", ladderSize: 2 });

    const p = store.lookup(id);
    expect(p?.terminal).toBe("extraction-gap");
    expect(p?.gapEvidence).toBe("draw-disagreement");
    expect(p?.fichaHash).toBe(fichaHashFor(id, tempDir));

    // Editing the intent surface voids the precedent — the node earns a fresh climb.
    patchNode(tempDir, id, (n) => {
      n.prompt = 'print("hola mundo")';
    });
    expect(store.lookup(id)).toBeUndefined();
  });

  it("rules/context changes void it too (the whole intent surface is keyed)", () => {
    const id = setupNode(tempDir);
    const store = createPrecedentStore(tempDir);
    store.record({ nodeId: id, terminal: "closed", kappa: 1, ladderSize: 2 });
    expect(store.lookup(id)?.kappa).toBe(1);
    patchNode(tempDir, id, (n) => {
      n.rules = ["REQUIRE greet"];
    });
    expect(store.lookup(id)).toBeUndefined();
  });

  it("unknown node: record is a no-op, lookup undefined; corrupt file reads empty", () => {
    setupNode(tempDir);
    const store = createPrecedentStore(tempDir);
    store.record({ nodeId: "node_ghost", terminal: "closed", kappa: 0, ladderSize: 1 });
    expect(fs.existsSync(precedentsPath(tempDir))).toBe(false);
    expect(store.lookup("node_ghost")).toBeUndefined();

    fs.mkdirSync(path.dirname(precedentsPath(tempDir)), { recursive: true });
    fs.writeFileSync(precedentsPath(tempDir), "{corrupt");
    expect(store.lookup("node_0002")).toBeUndefined();
  });
});

describe("policy — precedent short-circuit", () => {
  const base = {
    nodeId: "n",
    rung: 0,
    ladderSize: 2,
    history: [],
    upstreamAllClosed: true,
    maxAttemptsPerNode: 8,
  };

  it("first touch with an extraction-gap precedent → cite, do not climb", () => {
    expect(decide({ ...base, priorExtractionGap: true })).toEqual({
      type: "terminate",
      terminal: "extraction-gap",
    });
  });

  it("open upstream still wins over a precedent", () => {
    expect(decide({ ...base, priorExtractionGap: true, upstreamAllClosed: false })).toEqual({
      type: "terminate",
      terminal: "blocked-upstream",
    });
  });

  it("without the flag, first touch generates as before", () => {
    expect(decide({ ...base })).toEqual({ type: "apply", lever: { kind: "generate" } });
  });
});

// ── Runner integration with an injected in-memory store. ──

const LADDER = [
  { provider: "ollama" as const, model: "cheap" },
  { provider: "ollama" as const, model: "capable" },
];

const PASS: Partial<RegenerateResult> = {
  ok: true,
  verdict: "epsilon_equivalent",
  behaviorVerdict: "pass",
  ruleViolations: 0,
  lintIssueCount: 0,
  fixturePresent: true,
};

function memoryStore(seed: NodePrecedent[] = []): { store: PrecedentStore; recorded: NodePrecedent[] } {
  const nodes = new Map(seed.map((p) => [p.nodeId, p]));
  const recorded: NodePrecedent[] = [];
  return {
    recorded,
    store: {
      lookup: (nodeId) => nodes.get(nodeId),
      record: (p) => {
        const full = { ...p, fichaHash: "h", recordedAt: "2026-07-20T00:00:00.000Z" };
        nodes.set(p.nodeId, full);
        recorded.push(full);
      },
    },
  };
}

function mockRegen(
  decideResult: (nodeId: string, opts: RegenerateCommandOptions) => Partial<RegenerateResult>,
): { fn: ExecutorDeps["regenerate"]; calls: { nodeId: string; opts: RegenerateCommandOptions }[] } {
  const calls: { nodeId: string; opts: RegenerateCommandOptions }[] = [];
  const fn: ExecutorDeps["regenerate"] = async (nodeId, opts) => {
    calls.push({ nodeId, opts });
    const v = decideResult(nodeId, opts);
    const written = opts.write === true && v.behaviorVerdict === "pass";
    return { nodeId, written, ...v } as RegenerateResult;
  };
  return { fn, calls };
}

const gapPrecedent = (nodeId: string, ladderSize: number): NodePrecedent => ({
  nodeId,
  fichaHash: "h",
  terminal: "extraction-gap",
  kappa: null,
  gapEvidence: "draw-disagreement",
  ladderSize,
  recordedAt: "2026-07-19T00:00:00.000Z",
});

describe("executor runner — episodic precedents", () => {
  it("honours an extraction-gap precedent: zero attempts, cited, not re-recorded", async () => {
    const { store, recorded } = memoryStore([gapPrecedent("node_gap", 2)]);
    const { fn, calls } = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_gap"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn, precedents: store });

    const rec = report.nodes[0];
    expect(rec.terminal).toBe("extraction-gap");
    expect(rec.attempts).toBe(0);
    expect(rec.gapEvidence).toBe("precedent");
    expect(calls.length).toBe(0); // no ladder burned
    expect(recorded.length).toBe(0); // the citation is not re-recorded
  });

  it("a taller ladder voids the precedent — the node is re-measured", async () => {
    const { store } = memoryStore([gapPrecedent("node_gap", 1)]); // recorded on a 1-rung ladder
    const { fn, calls } = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_gap"], ladder: LADDER }; // now 2 rungs
    const report = await runExecutor(config, { edges: [], regenerate: fn, precedents: store });

    expect(report.nodes[0].terminal).toBe("closed");
    expect(calls.length).toBeGreaterThan(0);
  });

  it("closed precedents warm-start κ* (first draw at the remembered rung)", async () => {
    const { store } = memoryStore([
      { nodeId: "node_warm", fichaHash: "h", terminal: "closed", kappa: 1, ladderSize: 2, recordedAt: "2026-07-19T00:00:00.000Z" },
    ]);
    const { fn, calls } = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_warm"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn, precedents: store });

    expect(report.nodes[0].terminal).toBe("closed");
    expect(calls[0]?.opts.model).toBe("capable"); // started at rung 1, not 0
  });

  it("records measured outcomes so the next run remembers", async () => {
    const { store, recorded } = memoryStore();
    const { fn } = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_new"], ladder: LADDER };
    await runExecutor(config, { edges: [], regenerate: fn, precedents: store });

    expect(recorded).toMatchObject([
      { nodeId: "node_new", terminal: "closed", kappa: 0, ladderSize: 2 },
    ]);
  });

  it("runs identically with no store injected (memory is opt-in)", async () => {
    const { fn } = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_plain"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });
    expect(report.nodes[0].terminal).toBe("closed");
  });
});
