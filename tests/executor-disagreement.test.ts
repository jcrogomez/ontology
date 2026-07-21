import { describe, it, expect } from "vitest";
import { decide, classifyPlateauWithEvidence, DEFAULT_PROBE_DRAWS } from "../src/runtime/executor/policy.js";
import { normalize } from "../src/runtime/executor/verdict.js";
import { runExecutor, type ExecutorConfig, type ExecutorDeps } from "../src/runtime/executor/runner.js";
import type { Attempt, LeverKind, NodeExecState } from "../src/runtime/executor/types.js";
import type { DrawAgreement, GateOutcome, GateVerdict } from "../src/runtime/executor/verdict.js";
import type { RegenerateCommandOptions, RegenerateResult } from "../src/surfaces/commands/regenerate.js";
import { computeGrayZone } from "../src/laws/gray-zone.js";

// The disagreement router: at plateau, the executor probes with N independent
// draws and reads the gray-zone fold — draws that DISAGREE with each other →
// extraction-gap (Gap A: repair the ficha); draws that AGREE yet fail → the
// models are the limit (Gap B), unless lint is clean (the pre-existing rule).
// The probe fires at most once per node, never past the attempt backstop, and
// keeps write governed by runRegenerate (a consensus pass still closes).

const agreement = (over: Partial<DrawAgreement> = {}): DrawAgreement => ({
  zone: "unanimous",
  disagreementRate: 0,
  clusterCount: 1,
  compiledDraws: 3,
  behaviorSplit: false,
  semanticSplit: false,
  ...over,
});

function verdict(
  outcome: GateOutcome,
  opts: { lintClean?: boolean; hasFixture?: boolean; grayZone?: DrawAgreement } = {},
): GateVerdict {
  return {
    outcome,
    lintClean: opts.lintClean,
    hasFixture: opts.hasFixture ?? true,
    grayZone: opts.grayZone,
    detail: outcome,
  };
}

function attempt(rung: number, lever: LeverKind | "initial", v: GateVerdict): Attempt {
  return { rung, lever, verdict: v };
}

function state(over: Partial<NodeExecState> = {}): NodeExecState {
  return {
    nodeId: "node_0001",
    rung: 0,
    ladderSize: 1,
    history: [],
    upstreamAllClosed: true,
    maxAttemptsPerNode: 8,
    ...over,
  };
}

// A single-rung ladder exhausted the lever space: generate → refine → decompose.
const exhaustedHistory = (last: GateVerdict): Attempt[] => [
  attempt(0, "generate", verdict("behavior-fail")),
  attempt(0, "refine", verdict("behavior-fail")),
  attempt(0, "decompose", last),
];

describe("policy — disagreement probe", () => {
  it("fires the probe once at plateau when no draw evidence exists", () => {
    const s = state({ history: exhaustedHistory(verdict("behavior-fail", { lintClean: false })) });
    expect(decide(s)).toEqual({
      type: "apply",
      lever: { kind: "probe", draws: DEFAULT_PROBE_DRAWS },
    });
  });

  it("does not probe past the attempt backstop", () => {
    const s = state({
      maxAttemptsPerNode: 3,
      history: exhaustedHistory(verdict("behavior-fail", { lintClean: false })),
    });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "capacity-ceiling" });
  });

  it("does not probe twice even when the probe produced no draw evidence", () => {
    const s = state({
      history: [
        ...exhaustedHistory(verdict("behavior-fail", { lintClean: false })),
        // Probe attempt whose regenerate failed outright → no grayZone.
        attempt(0, "probe", verdict("broken", { lintClean: false })),
      ],
    });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "capacity-ceiling" });
  });

  it("terminates directly when the last verdict already carries draw evidence", () => {
    const s = state({
      history: exhaustedHistory(
        verdict("behavior-fail", { lintClean: false, grayZone: agreement({ zone: "gray", clusterCount: 3 }) }),
      ),
    });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "extraction-gap" });
  });
});

describe("classifyPlateauWithEvidence — the Gap A / Gap B split", () => {
  const failing = (gz?: DrawAgreement, lintClean?: boolean) =>
    verdict("behavior-fail", { lintClean, grayZone: gz });

  it("gray zone (no majority cluster) → extraction-gap, draw-disagreement", () => {
    expect(classifyPlateauWithEvidence(failing(agreement({ zone: "gray", clusterCount: 3 }), false))).toEqual({
      terminal: "extraction-gap",
      evidence: "draw-disagreement",
    });
  });

  it("behaviour split beats everything → extraction-gap, behaviour-split", () => {
    expect(
      classifyPlateauWithEvidence(failing(agreement({ behaviorSplit: true }), false)),
    ).toEqual({ terminal: "extraction-gap", evidence: "behaviour-split" });
  });

  it("semantic split (all fail on DIFFERENT cases) → extraction-gap, semantic-split, even with structure agreeing + lint dirty", () => {
    // The bespoke case found inert on foreign code 2026-07-21: structure agrees
    // (unanimous declKey cluster), no draw passes (so behaviorSplit is false),
    // lint dirty — the OLD hierarchy would call this capacity. semanticSplit
    // rescues it: draws fail different cases ⇒ the ficha under-determines which
    // behaviour is correct.
    expect(
      classifyPlateauWithEvidence(failing(agreement({ semanticSplit: true }), false)),
    ).toEqual({ terminal: "extraction-gap", evidence: "semantic-split" });
  });

  it("draws agree + lint dirty → capacity-ceiling with draw-agreement evidence", () => {
    expect(classifyPlateauWithEvidence(failing(agreement(), false))).toEqual({
      terminal: "capacity-ceiling",
      evidence: "draw-agreement",
    });
  });

  it("draws agree + lint clean → extraction-gap (pre-existing calibrated rule preserved)", () => {
    expect(classifyPlateauWithEvidence(failing(agreement(), true))).toEqual({
      terminal: "extraction-gap",
      evidence: "clean-lint",
    });
  });

  it("fewer than 2 compiled draws is no evidence → lint fallback", () => {
    expect(
      classifyPlateauWithEvidence(failing(agreement({ zone: "no-signal", compiledDraws: 0, clusterCount: 0 }), undefined)),
    ).toEqual({ terminal: "capacity-ceiling", evidence: "dirty-or-unknown-lint" });
  });

  it("no draw evidence at all → original lint proxy on both sides", () => {
    expect(classifyPlateauWithEvidence(failing(undefined, true))).toEqual({
      terminal: "extraction-gap",
      evidence: "clean-lint",
    });
    expect(classifyPlateauWithEvidence(failing(undefined, false))).toEqual({
      terminal: "capacity-ceiling",
      evidence: "dirty-or-unknown-lint",
    });
  });
});

describe("verdict.normalize — draw-agreement passthrough", () => {
  it("maps RegenerateResult.grayZone onto the GateVerdict", () => {
    const gz = computeGrayZone([
      { i: 1, compiled: true, declKey: "a", behaviorVerdict: "fail", acceptable: false },
      { i: 2, compiled: true, declKey: "b", behaviorVerdict: "pass", acceptable: true },
      { i: 3, compiled: true, declKey: "c", behaviorVerdict: "fail", acceptable: false },
    ]);
    const v = normalize({
      ok: true,
      nodeId: "n",
      written: false,
      verdict: "divergent_structural",
      behaviorVerdict: "fail",
      fixturePresent: true,
      grayZone: gz,
    } as RegenerateResult);
    expect(v.grayZone).toEqual({
      zone: "gray",
      disagreementRate: gz.disagreementRate,
      clusterCount: 3,
      compiledDraws: 3,
      behaviorSplit: true,
      semanticSplit: false,
    });
  });

  it("single-draw results leave grayZone undefined", () => {
    const v = normalize({
      ok: true,
      nodeId: "n",
      written: false,
      verdict: "epsilon_equivalent",
      behaviorVerdict: "pass",
      fixturePresent: true,
    } as RegenerateResult);
    expect(v.grayZone).toBeUndefined();
  });
});

// ── Runner integration: the probe call and the recorded evidence. ──

const LADDER = [{ provider: "ollama" as const, model: "cheap" }];

const FAIL_DIRTY: Partial<RegenerateResult> = {
  ok: true,
  verdict: "divergent_structural",
  behaviorVerdict: "fail",
  ruleViolations: 0,
  lintIssueCount: 2,
  fixturePresent: true,
};

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

describe("executor runner — disagreement probe integration", () => {
  it("probes with N draws at plateau and records draw-disagreement Gap-A evidence", async () => {
    const grayFold = computeGrayZone([
      { i: 1, compiled: true, declKey: "a", behaviorVerdict: "fail", acceptable: false },
      { i: 2, compiled: true, declKey: "b", behaviorVerdict: "fail", acceptable: false },
      { i: 3, compiled: true, declKey: "c", behaviorVerdict: "fail", acceptable: false },
    ]);
    const { fn, calls } = mockRegen((_n, opts) =>
      (opts.draws ?? 1) > 1 ? { ...FAIL_DIRTY, draws: opts.draws, grayZone: grayFold } : FAIL_DIRTY,
    );
    const config: ExecutorConfig = { focalIds: ["node_gap_a"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });

    const rec = report.nodes[0];
    expect(rec.terminal).toBe("extraction-gap");
    expect(rec.gapEvidence).toBe("draw-disagreement");
    expect(rec.written).toBe(false);
    // generate → refine → decompose → probe(draws=3) → terminate
    expect(rec.decisions.map((d) => d.action).filter((a) => a.type === "apply")).toMatchObject([
      { lever: { kind: "generate" } },
      { lever: { kind: "refine" } },
      { lever: { kind: "decompose" } },
      { lever: { kind: "probe", draws: DEFAULT_PROBE_DRAWS } },
    ]);
    expect(calls.at(-1)?.opts.draws).toBe(DEFAULT_PROBE_DRAWS);
    expect(report.extractionGap).toBe(1);
  });

  it("agreeing-but-failing probe records capacity-ceiling with draw-agreement evidence", async () => {
    const unanimousFold = computeGrayZone([
      { i: 1, compiled: true, declKey: "f,g", behaviorVerdict: "fail", acceptable: false },
      { i: 2, compiled: true, declKey: "f,g", behaviorVerdict: "fail", acceptable: false },
      { i: 3, compiled: true, declKey: "f,g", behaviorVerdict: "fail", acceptable: false },
    ]);
    const { fn } = mockRegen((_n, opts) =>
      (opts.draws ?? 1) > 1 ? { ...FAIL_DIRTY, draws: opts.draws, grayZone: unanimousFold } : FAIL_DIRTY,
    );
    const config: ExecutorConfig = { focalIds: ["node_gap_b"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });

    const rec = report.nodes[0];
    expect(rec.terminal).toBe("capacity-ceiling");
    expect(rec.gapEvidence).toBe("draw-agreement");
  });

  it("a probe whose consensus passes closes the node (write stays governed)", async () => {
    const { fn } = mockRegen((_n, opts) =>
      (opts.draws ?? 1) > 1
        ? {
            ok: true,
            verdict: "epsilon_equivalent",
            behaviorVerdict: "pass",
            ruleViolations: 0,
            lintIssueCount: 0,
            fixturePresent: true,
            draws: opts.draws,
            grayZone: computeGrayZone([
              { i: 1, compiled: true, declKey: "f", behaviorVerdict: "pass", acceptable: true },
              { i: 2, compiled: true, declKey: "f", behaviorVerdict: "pass", acceptable: true },
              { i: 3, compiled: true, declKey: "f", behaviorVerdict: "pass", acceptable: true },
            ]),
          }
        : FAIL_DIRTY,
    );
    const config: ExecutorConfig = { focalIds: ["node_probe_pass"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: fn });

    const rec = report.nodes[0];
    expect(rec.terminal).toBe("closed");
    expect(rec.written).toBe(true);
    expect(rec.gapEvidence).toBeUndefined();
  });
});
