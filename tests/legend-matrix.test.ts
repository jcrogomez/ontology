import { describe, it, expect } from "vitest";
import type { HomeomorphismVerdict } from "../src/runtime/legend/verify-homeomorphism.js";
import {
  aggregateByAxis,
  buildMatrixCost,
  buildPerNodeMatrix,
  emptyByAxis,
  verdictDerivedTags,
  verdictToMatrixCell,
  ByAxisSchema,
  MatrixCellSchema,
  PerNodeMatrixSchema,
  type MatrixCell,
  type MatrixCost,
} from "../src/runtime/legend/matrix.js";

const ZERO_COST: MatrixCost = {
  provider: "mock",
  model: "mock",
  task: "code_sketch",
  inputTokens: 0,
  outputTokens: 0,
  usd: 0,
  wallClockMs: 0,
};

// ── Verdict → cell mapping (PREWORK §C table) ───────────────────────────────

describe("legend-matrix — verdictToMatrixCell", () => {
  const cases: Array<{
    verdict: HomeomorphismVerdict;
    expectStructural: MatrixCell["structural"];
    expectBehavior: MatrixCell["behavior"];
    expectIntent: MatrixCell["intent"];
  }> = [
    {
      verdict: "epsilon_equivalent",
      expectStructural: "pass",
      expectBehavior: "untested",
      expectIntent: "not-reviewed",
    },
    {
      verdict: "divergent_loc",
      expectStructural: "partial",
      expectBehavior: "untested",
      expectIntent: "not-reviewed",
    },
    {
      verdict: "divergent_structural",
      expectStructural: "fail",
      expectBehavior: "untested",
      expectIntent: "not-reviewed",
    },
    {
      verdict: "divergent_both",
      expectStructural: "fail",
      expectBehavior: "untested",
      expectIntent: "not-reviewed",
    },
    {
      verdict: "unrecoverable",
      expectStructural: "not-measured",
      expectBehavior: "not-applicable",
      expectIntent: "needs-human",
    },
  ];

  for (const c of cases) {
    it(`maps ${c.verdict} → structural=${c.expectStructural}, behavior=${c.expectBehavior}, intent=${c.expectIntent}`, () => {
      const cell = verdictToMatrixCell({
        verdict: c.verdict,
        literal: false,
        cost: ZERO_COST,
      });
      expect(cell.structural).toBe(c.expectStructural);
      expect(cell.behavior).toBe(c.expectBehavior);
      expect(cell.intent).toBe(c.expectIntent);
      expect(cell.contract).toBe("not-measured");
      expect(cell.literalRequired).toBe("false");
    });
  }

  it("sets literalRequired='true' when node.literal === true", () => {
    const cell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: true,
      cost: ZERO_COST,
    });
    expect(cell.literalRequired).toBe("true");
  });

  it("treats literal=undefined as literalRequired='false' (the default)", () => {
    const cell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: undefined,
      cost: ZERO_COST,
    });
    expect(cell.literalRequired).toBe("false");
  });
});

// ── Verdict-derived tags (for prework D intersection aggregator) ────────────

describe("legend-matrix — verdictDerivedTags", () => {
  it("emits structural-drift for divergent_structural", () => {
    const cell = verdictToMatrixCell({
      verdict: "divergent_structural",
      literal: false,
      cost: ZERO_COST,
    });
    expect(verdictDerivedTags(cell)).toContain("structural-drift");
  });

  it("emits structural-drift for divergent_both", () => {
    const cell = verdictToMatrixCell({
      verdict: "divergent_both",
      literal: false,
      cost: ZERO_COST,
    });
    expect(verdictDerivedTags(cell)).toContain("structural-drift");
  });

  it("does NOT emit structural-drift for divergent_loc (structure is OK, LoC is the dissent)", () => {
    const cell = verdictToMatrixCell({
      verdict: "divergent_loc",
      literal: false,
      cost: ZERO_COST,
    });
    expect(verdictDerivedTags(cell)).not.toContain("structural-drift");
  });

  it("does NOT emit structural-drift for unrecoverable (structural is not-measured, not failed)", () => {
    const cell = verdictToMatrixCell({
      verdict: "unrecoverable",
      literal: false,
      cost: ZERO_COST,
    });
    expect(verdictDerivedTags(cell)).not.toContain("structural-drift");
  });

  it("always emits not-reviewed when intent is not-reviewed (pilot default)", () => {
    const cell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: false,
      cost: ZERO_COST,
    });
    expect(verdictDerivedTags(cell)).toContain("not-reviewed");
  });

  it("emits literal-required mirroring the literalRequired axis", () => {
    const cell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: true,
      cost: ZERO_COST,
    });
    expect(verdictDerivedTags(cell)).toContain("literal-required");
  });

  it("does NOT emit contract-missing in the pilot (contract is not-measured by default)", () => {
    const cell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: false,
      cost: ZERO_COST,
    });
    expect(verdictDerivedTags(cell)).not.toContain("contract-missing");
  });
});

// ── buildPerNodeMatrix (the convenience entry point) ────────────────────────

describe("legend-matrix — buildPerNodeMatrix unions tagger tags with verdict-derived tags", () => {
  it("unions correctly and sorts", () => {
    const entry = buildPerNodeMatrix({
      nodeId: "node_test_001",
      sourceFile: "src/runtime/topos/omega.ts",
      taggerTags: ["algebraic-lawful", "pure-transform"],
      verdict: "divergent_structural",
      literal: false,
      cost: ZERO_COST,
    });
    // Tagger contribution
    expect(entry.frontier).toContain("algebraic-lawful");
    expect(entry.frontier).toContain("pure-transform");
    // Verdict-derived contribution
    expect(entry.frontier).toContain("structural-drift");
    expect(entry.frontier).toContain("not-reviewed");
    // Sorted
    const sorted = [...entry.frontier].sort();
    expect(entry.frontier).toEqual(sorted);
    // No duplicates
    expect(new Set(entry.frontier).size).toBe(entry.frontier.length);
  });
});

// ── aggregateByAxis ─────────────────────────────────────────────────────────

describe("legend-matrix — aggregateByAxis", () => {
  it("emptyByAxis returns zeros across every state", () => {
    const empty = emptyByAxis();
    expect(empty.contract["not-measured"]).toBe(0);
    expect(empty.structural.pass).toBe(0);
    expect(empty.structural.fail).toBe(0);
    expect(empty.behavior.untested).toBe(0);
    expect(empty.intent["not-reviewed"]).toBe(0);
    expect(empty.literalRequired["false"]).toBe(0);
  });

  it("counts states across cells", () => {
    const cells = [
      verdictToMatrixCell({ verdict: "epsilon_equivalent", literal: false, cost: ZERO_COST }),
      verdictToMatrixCell({ verdict: "epsilon_equivalent", literal: true, cost: ZERO_COST }),
      verdictToMatrixCell({ verdict: "divergent_loc", literal: false, cost: ZERO_COST }),
      verdictToMatrixCell({ verdict: "divergent_structural", literal: false, cost: ZERO_COST }),
      verdictToMatrixCell({ verdict: "divergent_both", literal: false, cost: ZERO_COST }),
      verdictToMatrixCell({ verdict: "unrecoverable", literal: false, cost: ZERO_COST }),
    ];
    const agg = aggregateByAxis(cells);
    expect(agg.structural.pass).toBe(2);
    expect(agg.structural.partial).toBe(1);
    expect(agg.structural.fail).toBe(2);
    expect(agg.structural["not-measured"]).toBe(1);
    expect(agg.intent["not-reviewed"]).toBe(5);
    expect(agg.intent["needs-human"]).toBe(1);
    expect(agg.behavior.untested).toBe(5);
    expect(agg.behavior["not-applicable"]).toBe(1);
    expect(agg.contract["not-measured"]).toBe(6);
    expect(agg.literalRequired["true"]).toBe(1);
    expect(agg.literalRequired["false"]).toBe(5);
  });

  it("every axis state is present in the output even with zero counts", () => {
    const agg = aggregateByAxis([
      verdictToMatrixCell({ verdict: "epsilon_equivalent", literal: false, cost: ZERO_COST }),
    ]);
    // Existence of each state key
    for (const s of ["pass", "fail", "unknown", "not-measured"] as const) {
      expect(agg.contract[s]).toBeDefined();
    }
    for (const s of ["accepted", "rejected", "needs-human", "not-reviewed"] as const) {
      expect(agg.intent[s]).toBeDefined();
    }
  });
});

// ── buildMatrixCost ─────────────────────────────────────────────────────────

describe("legend-matrix — buildMatrixCost", () => {
  it("fills tokens + usd from usage when present", () => {
    const cost = buildMatrixCost({
      provider: "anthropic",
      model: "claude-opus-4-7",
      task: "code_sketch",
      usage: { promptTokens: 1234, completionTokens: 567, costUSD: 0.012 },
      wallClockMs: 4321,
    });
    expect(cost.inputTokens).toBe(1234);
    expect(cost.outputTokens).toBe(567);
    expect(cost.usd).toBeCloseTo(0.012);
    expect(cost.wallClockMs).toBe(4321);
  });

  it("defaults missing usage fields to zero (honest 'we ran but no telemetry' signal)", () => {
    const cost = buildMatrixCost({
      provider: "ollama",
      model: "qwen2.5-coder:3b",
      task: "code_sketch",
    });
    expect(cost.inputTokens).toBe(0);
    expect(cost.outputTokens).toBe(0);
    expect(cost.usd).toBe(0);
    expect(cost.wallClockMs).toBe(0);
  });
});

// ── Zod schemas ─────────────────────────────────────────────────────────────

describe("legend-matrix — Zod schemas", () => {
  it("MatrixCellSchema validates a well-formed cell", () => {
    const cell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: false,
      cost: ZERO_COST,
    });
    const parsed = MatrixCellSchema.safeParse(cell);
    expect(parsed.success).toBe(true);
  });

  it("MatrixCellSchema rejects an unknown structural state", () => {
    const bad = {
      contract: "not-measured",
      structural: "fail-bogus",
      behavior: "untested",
      intent: "not-reviewed",
      literalRequired: "false",
      cost: ZERO_COST,
    };
    expect(MatrixCellSchema.safeParse(bad).success).toBe(false);
  });

  it("PerNodeMatrixSchema requires at least one frontier attribute", () => {
    const bad = {
      nodeId: "n",
      sourceFile: "f",
      frontier: [],
      cell: verdictToMatrixCell({
        verdict: "epsilon_equivalent",
        literal: false,
        cost: ZERO_COST,
      }),
    };
    expect(PerNodeMatrixSchema.safeParse(bad).success).toBe(false);
  });

  it("ByAxisSchema validates an emptyByAxis output", () => {
    const empty = emptyByAxis();
    expect(ByAxisSchema.safeParse(empty).success).toBe(true);
  });
});
