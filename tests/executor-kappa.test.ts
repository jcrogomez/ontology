import { describe, it, expect } from "vitest";
import { kappaStar, kappaDistribution } from "../src/runtime/executor/kappa-star.js";
import { runExecutor, type ExecutorConfig, type ExecutorDeps } from "../src/runtime/executor/runner.js";
import type { RegenerateCommandOptions, RegenerateResult } from "../src/surfaces/commands/regenerate.js";

describe("kappaStar — least-element of the capability chain", () => {
  it("κ* is the least rung that closes", () => {
    const r = kappaStar([{ rung: 0, closed: false }, { rung: 1, closed: false }, { rung: 2, closed: true }]);
    expect(r.kappa).toBe(2);
    expect(r.monotone).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("null when no rung closes", () => {
    expect(kappaStar([{ rung: 0, closed: false }, { rung: 1, closed: false }]).kappa).toBeNull();
  });

  it("flags a monotonicity violation (closed low, reopened high = variance)", () => {
    const r = kappaStar([{ rung: 0, closed: true }, { rung: 2, closed: false }]);
    expect(r.kappa).toBe(0);
    expect(r.monotone).toBe(false);
    expect(r.violations).toEqual([{ closedAt: 0, reopenedAt: 2 }]);
  });

  it("dedups + sorts unordered observations", () => {
    const r = kappaStar([{ rung: 2, closed: true }, { rung: 0, closed: false }, { rung: 2, closed: true }]);
    expect(r.observedRungs).toEqual([0, 2]);
    expect(r.kappa).toBe(2);
  });

  it("kappaDistribution histograms κ* and counts never-closed", () => {
    expect(kappaDistribution([2, 2, 0, null])).toEqual({ byRung: { 0: 1, 2: 2 }, closed: 3, neverClosed: 1 });
  });
});

// ── runner: warm-start + κ* recording ───────────────────────────────────────

const LADDER = [
  { provider: "ollama" as const, model: "cheap" },
  { provider: "ollama" as const, model: "capable" },
];

const PASS: Partial<RegenerateResult> = { ok: true, verdict: "epsilon_equivalent", behaviorVerdict: "pass", ruleViolations: 0, lintIssueCount: 0, fixturePresent: true };
const FAIL: Partial<RegenerateResult> = { ok: true, verdict: "divergent_structural", behaviorVerdict: "fail", ruleViolations: 0, lintIssueCount: 2, fixturePresent: true };

function mockRegen(decide: (opts: RegenerateCommandOptions) => Partial<RegenerateResult>): {
  fn: ExecutorDeps["regenerate"];
  calls: RegenerateCommandOptions[];
} {
  const calls: RegenerateCommandOptions[] = [];
  const fn: ExecutorDeps["regenerate"] = async (nodeId, opts) => {
    calls.push(opts);
    const v = decide(opts);
    return { nodeId, written: opts.write === true && v.behaviorVerdict === "pass", ...v } as RegenerateResult;
  };
  return { fn, calls };
}

describe("executor runner — κ* recording + cost-optimal warm start", () => {
  // closes only on the capable rung.
  const onlyCapable = (opts: RegenerateCommandOptions) => (opts.model === "capable" ? PASS : FAIL);

  it("records κ* = the rung that closed", async () => {
    const { fn } = mockRegen(onlyCapable);
    const report = await runExecutor({ focalIds: ["node_x"], ladder: LADDER }, { edges: [], regenerate: fn });
    expect(report.nodes[0].terminal).toBe("closed");
    expect(report.nodes[0].kappa).toBe(1); // climbed to capable
    expect(report.kappa).toEqual({ byRung: { 1: 1 }, closed: 1, neverClosed: 0 });
  });

  it("warm start at prior κ* skips the rungs known to fail", async () => {
    const { fn, calls } = mockRegen(onlyCapable);
    const report = await runExecutor(
      { focalIds: ["node_x"], ladder: LADDER, priorKappa: { node_x: 1 } },
      { edges: [], regenerate: fn },
    );
    const rec = report.nodes[0];
    expect(rec.terminal).toBe("closed");
    expect(rec.kappa).toBe(1);
    // started straight at capable — no wasted cheap-rung attempts
    expect(calls.every((c) => c.model === "capable")).toBe(true);
    expect(rec.attempts).toBe(1);
  });
});
