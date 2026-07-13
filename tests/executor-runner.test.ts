import { describe, it, expect } from "vitest";
import { runExecutor, type ExecutorConfig, type ExecutorDeps } from "../src/runtime/executor/runner.js";
import type { RegenerateCommandOptions, RegenerateResult } from "../src/surfaces/commands/regenerate.js";
import type { OntologyEdge } from "../src/kernel/schemas/ontology.js";

const LADDER = [
  { provider: "ollama" as const, model: "cheap" },
  { provider: "ollama" as const, model: "capable" },
];

function edge(from: string, to: string, type = "depends_on"): OntologyEdge {
  return {
    edgeId: `edge_${from}_${to}`,
    from,
    to,
    type,
    branch: "main",
    createdAt: "2026-06-18T00:00:00.000Z",
    createdByEventId: "evt_test",
    integrity: { hash: "h", schemaVersion: "1" },
  } as unknown as OntologyEdge;
}

const PASS: Partial<RegenerateResult> = {
  ok: true,
  verdict: "epsilon_equivalent",
  behaviorVerdict: "pass",
  ruleViolations: 0,
  lintIssueCount: 0,
};
const FAIL_DIRTY: Partial<RegenerateResult> = {
  ok: true,
  verdict: "divergent_structural",
  behaviorVerdict: "fail",
  ruleViolations: 0,
  lintIssueCount: 2,
};

// A mock actuator that records calls and returns a verdict chosen by a per-test
// resolver. `write:true` calls echo back the verdict's writeability.
function mockRegen(
  decide: (nodeId: string, opts: RegenerateCommandOptions) => Partial<RegenerateResult>,
): { fn: ExecutorDeps["regenerate"]; calls: { nodeId: string; opts: RegenerateCommandOptions }[] } {
  const calls: { nodeId: string; opts: RegenerateCommandOptions }[] = [];
  const fn: ExecutorDeps["regenerate"] = async (nodeId, opts) => {
    calls.push({ nodeId, opts });
    const v = decide(nodeId, opts);
    const written = opts.write === true && v.behaviorVerdict === "pass";
    return { nodeId, written, ...v } as RegenerateResult;
  };
  return { fn, calls };
}

describe("executor runner", () => {
  it("closes a pure node cheaply without escalating (node_0110 shape)", async () => {
    const { fn, calls } = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_0110"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });

    expect(report.closed).toBe(1);
    const rec = report.nodes[0];
    expect(rec.terminal).toBe("closed");
    expect(rec.written).toBe(true);
    expect(rec.finalRung).toBe(0); // never climbed
    expect(rec.attempts).toBe(1);
    // a single attempt at the cheap rung that writes atomically (governed) —
    // no separate re-draw at converge time
    expect(calls.map((c) => c.opts.model)).toEqual(["cheap"]);
    expect(calls.every((c) => c.opts.write)).toBe(true);
  });

  it("escalates the ladder to close a glue node (node_0013 shape)", async () => {
    const { fn, calls } = mockRegen((_n, opts) => (opts.model === "capable" ? PASS : FAIL_DIRTY));
    const config: ExecutorConfig = { focalIds: ["node_0013"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });

    const rec = report.nodes[0];
    expect(rec.terminal).toBe("closed");
    expect(rec.written).toBe(true);
    expect(rec.finalRung).toBe(1); // climbed to the capable rung
    // generate(cheap) → refine(cheap) → escalate(capable, pass)
    expect(rec.decisions.map((d) => d.action).filter((a) => a.type === "apply")).toMatchObject([
      { lever: { kind: "generate" } },
      { lever: { kind: "refine" } },
      { lever: { kind: "escalate" } },
    ]);
    // the attempt that closed (and wrote) was on the capable rung
    expect(rec.written).toBe(true);
    expect(calls.at(-1)?.opts.model).toBe("capable");
  });

  it("reports blocked-upstream instead of mis-blaming a downstream node", async () => {
    // node_B depends_on node_A; A never closes.
    const edges = [edge("node_B", "node_A")];
    const { fn, calls } = mockRegen(() => FAIL_DIRTY);
    const config: ExecutorConfig = { focalIds: ["node_B"], ladder: [LADDER[0]] };
    const report = await runExecutor(config, { edges, regenerate: fn });

    const a = report.nodes.find((n) => n.nodeId === "node_A")!;
    const b = report.nodes.find((n) => n.nodeId === "node_B")!;
    expect(a.terminal).toBe("capacity-ceiling"); // dirty lint, single rung exhausted
    expect(b.terminal).toBe("blocked-upstream");
    expect(b.attempts).toBe(0); // never attempted
    expect(report.blockedUpstream).toBe(1);
    // no regenerate call was ever made for the blocked node
    expect(calls.some((c) => c.nodeId === "node_B")).toBe(false);
  });

  it("flags extraction-gap when clean lint plateaus at the top rung", async () => {
    const FAIL_CLEAN = { ...FAIL_DIRTY, lintIssueCount: 0 };
    const { fn } = mockRegen(() => FAIL_CLEAN);
    const config: ExecutorConfig = { focalIds: ["node_X"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });
    expect(report.nodes[0].terminal).toBe("extraction-gap");
    expect(report.extractionGap).toBe(1);
  });

  it("dry run (write:false) reaches closed but never writes", async () => {
    const { fn, calls } = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_0110"], ladder: LADDER, write: false };
    const report = await runExecutor(config, { edges: [], regenerate: fn });
    expect(report.nodes[0].terminal).toBe("closed");
    expect(report.nodes[0].written).toBe(false);
    expect(calls.some((c) => c.opts.write)).toBe(false);
  });

  it("throws on an empty ladder (premise excluded everything)", async () => {
    await expect(
      runExecutor({ focalIds: ["node_0110"], ladder: [] }, { edges: [], regenerate: mockRegen(() => PASS).fn }),
    ).rejects.toThrow(/empty capability ladder/);
  });

  it("a dead provider terminates infra-error on the FIRST attempt — no ladder burn (2026-07-07 misreport, pinned)", async () => {
    const { fn, calls } = mockRegen((nodeId) => ({
      ok: false,
      failure: `compile-back failed: Compile failed at step ${nodeId}: connect ECONNREFUSED 127.0.0.1:11434`,
    }));
    const config: ExecutorConfig = { focalIds: ["node_A"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });

    const rec = report.nodes[0];
    expect(rec.terminal).toBe("infra-error");
    expect(rec.attempts).toBe(1); // one probe, then stop
    expect(rec.finalRung).toBe(0); // never escalated against a down provider
    expect(calls.length).toBe(1);
    expect(report.infraError).toBe(1);
    expect(report.capacityCeiling).toBe(0); // the misclassification this pins away
  });
});
