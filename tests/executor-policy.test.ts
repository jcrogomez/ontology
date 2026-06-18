import { describe, it, expect } from "vitest";
import { decide } from "../src/runtime/executor/policy.js";
import type { Attempt, LeverKind, NodeExecState } from "../src/runtime/executor/types.js";
import type { GateOutcome, GateVerdict } from "../src/runtime/executor/verdict.js";

function verdict(
  outcome: GateOutcome,
  opts: { lintClean?: boolean; hasFixture?: boolean } = {},
): GateVerdict {
  return {
    outcome,
    lintClean: opts.lintClean,
    hasFixture: opts.hasFixture ?? true,
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
    ladderSize: 2,
    history: [],
    upstreamAllClosed: true,
    maxAttemptsPerNode: 8,
    ...over,
  };
}

describe("executor policy — graph coupling", () => {
  it("terminates blocked-upstream regardless of history when a dependency is open", () => {
    const s = state({
      upstreamAllClosed: false,
      history: [attempt(0, "generate", verdict("pass"))],
    });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "blocked-upstream" });
  });
});

describe("executor policy — short-circuit terminals", () => {
  it("first touch with no history → plain generate", () => {
    expect(decide(state())).toEqual({ type: "apply", lever: { kind: "generate" } });
  });

  it("behaviour pass → closed", () => {
    const s = state({ history: [attempt(0, "generate", verdict("pass"))] });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "closed" });
  });

  it("infra-error → terminate infra-error (not a capacity result)", () => {
    const s = state({ history: [attempt(0, "generate", verdict("infra-error"))] });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "infra-error" });
  });

  it("untested with no fixture → unverified-no-fixture (cannot gate behaviour)", () => {
    const s = state({
      history: [attempt(0, "generate", verdict("untested", { hasFixture: false }))],
    });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "unverified-no-fixture" });
  });
});

describe("executor policy — lever ladder on needs-work outcomes", () => {
  it("behaviour-fail, not yet refined → refine", () => {
    const s = state({ history: [attempt(0, "generate", verdict("behavior-fail"))] });
    expect(decide(s)).toEqual({ type: "apply", lever: { kind: "refine", rounds: 3 } });
  });

  it("refined at this rung, not at top → escalate", () => {
    const s = state({
      rung: 0,
      ladderSize: 2,
      history: [
        attempt(0, "generate", verdict("behavior-fail")),
        attempt(0, "refine", verdict("behavior-fail")),
      ],
    });
    expect(decide(s)).toEqual({ type: "apply", lever: { kind: "escalate" } });
  });

  it("refined at top rung, not decomposed → decompose", () => {
    const s = state({
      rung: 1,
      ladderSize: 2,
      history: [
        attempt(0, "generate", verdict("behavior-fail")),
        attempt(0, "refine", verdict("behavior-fail")),
        attempt(1, "escalate", verdict("behavior-fail")),
        attempt(1, "refine", verdict("behavior-fail")),
      ],
    });
    expect(decide(s)).toEqual({ type: "apply", lever: { kind: "decompose" } });
  });

  it("broken code (dirty lint) takes the same refine-first path", () => {
    const s = state({
      history: [attempt(0, "generate", verdict("broken", { lintClean: false }))],
    });
    expect(decide(s)).toEqual({ type: "apply", lever: { kind: "refine", rounds: 3 } });
  });

  it("rule-violation is treated as refinable, not green", () => {
    const s = state({ history: [attempt(0, "generate", verdict("rule-violation"))] });
    expect(decide(s)).toEqual({ type: "apply", lever: { kind: "refine", rounds: 3 } });
  });

  it("single-rung ladder never escalates: generate → refine → decompose", () => {
    const s = state({
      rung: 0,
      ladderSize: 1,
      history: [
        attempt(0, "generate", verdict("behavior-fail")),
        attempt(0, "refine", verdict("behavior-fail")),
      ],
    });
    expect(decide(s)).toEqual({ type: "apply", lever: { kind: "decompose" } });
  });
});

describe("executor policy — plateau classification (the hardest call)", () => {
  const exhaustedTop = (last: GateVerdict): NodeExecState =>
    state({
      rung: 1,
      ladderSize: 2,
      history: [
        attempt(0, "generate", verdict("behavior-fail")),
        attempt(0, "refine", verdict("behavior-fail")),
        attempt(1, "escalate", verdict("behavior-fail")),
        attempt(1, "refine", verdict("behavior-fail")),
        attempt(1, "decompose", last),
      ],
    });

  it("clean lint at the top rung, still failing → extraction-gap (blame intention)", () => {
    expect(decide(exhaustedTop(verdict("behavior-fail", { lintClean: true })))).toEqual({
      type: "terminate",
      terminal: "extraction-gap",
    });
  });

  it("dirty lint exhausted → capacity-ceiling (blame capacity)", () => {
    expect(decide(exhaustedTop(verdict("behavior-fail", { lintClean: false })))).toEqual({
      type: "terminate",
      terminal: "capacity-ceiling",
    });
  });

  it("unknown lint exhausted → capacity-ceiling (never accuse intention without evidence)", () => {
    expect(decide(exhaustedTop(verdict("behavior-fail", { lintClean: undefined })))).toEqual({
      type: "terminate",
      terminal: "capacity-ceiling",
    });
  });

  it("hard attempt budget terminates even mid-ladder", () => {
    const history = Array.from({ length: 4 }, (_, i) =>
      attempt(0, i === 0 ? "generate" : "refine", verdict("behavior-fail", { lintClean: true })),
    );
    const s = state({ maxAttemptsPerNode: 4, ladderSize: 3, history });
    expect(decide(s)).toEqual({ type: "terminate", terminal: "extraction-gap" });
  });
});
