import { describe, it, expect } from "vitest";
import {
  aggregateByIntersection,
  entryMatchesIntersection,
  REQUIRED_INTERSECTIONS,
  type IntersectionSpec,
} from "../src/runtime/legend/matrix-intersections.js";
import {
  buildPerNodeMatrix,
  type MatrixCost,
  type PerNodeMatrix,
} from "../src/runtime/legend/matrix.js";
import type { FrontierAttribute } from "../src/runtime/legend/frontier-tagger.js";
import type { HomeomorphismVerdict } from "../src/runtime/legend/verify-homeomorphism.js";

const ZERO_COST: MatrixCost = {
  provider: "mock",
  model: "mock",
  task: "code_sketch",
  inputTokens: 0,
  outputTokens: 0,
  usd: 0,
  wallClockMs: 0,
};

function makeEntry(args: {
  nodeId: string;
  sourceFile: string;
  taggerTags: FrontierAttribute[];
  verdict: HomeomorphismVerdict;
  literal?: boolean;
}): PerNodeMatrix {
  return buildPerNodeMatrix({
    nodeId: args.nodeId,
    sourceFile: args.sourceFile,
    // buildPerNodeMatrix accepts TaggerAttribute[]; the test's
    // taggerTags is already only tagger-emitable tags. The cast keeps
    // the test type-safe while exercising the union step.
    taggerTags: args.taggerTags as unknown as readonly (Exclude<
      FrontierAttribute,
      | "contract-missing"
      | "structural-drift"
      | "behavior-drift"
      | "not-reviewed"
    >)[],
    verdict: args.verdict,
    literal: args.literal ?? false,
    cost: ZERO_COST,
  });
}

// ── Required intersections always present ───────────────────────────────────

describe("matrix-intersections — required intersections", () => {
  it("publishes all seven required keys even when the matrix is empty", () => {
    const out = aggregateByIntersection([]);
    expect(Object.keys(out)).toEqual(
      expect.arrayContaining(REQUIRED_INTERSECTIONS.map((s) => s.name)),
    );
    for (const s of REQUIRED_INTERSECTIONS) {
      expect(out[s.name]).toBe(0);
    }
  });

  it("publishes all seven required keys even when no entry matches", () => {
    const entries = [
      makeEntry({
        nodeId: "n1",
        sourceFile: "x.ts",
        taggerTags: ["operational-glue"],
        verdict: "epsilon_equivalent",
      }),
    ];
    const out = aggregateByIntersection(entries);
    for (const s of REQUIRED_INTERSECTIONS) {
      expect(out[s.name]).toBeDefined();
    }
  });

  it("REQUIRED_INTERSECTIONS lists exactly the seven hypothesis §6 entries", () => {
    expect(REQUIRED_INTERSECTIONS.map((s) => s.name).sort()).toEqual(
      [
        "cli-parsing ∧ behavior-drift",
        "contract-missing ∧ not-reviewed",
        "io-bound ∧ behavior-drift",
        "io-bound ∧ structural-drift",
        "literal-required ∧ prompt-sensitive",
        "pure-transform ∧ behavior-equivalent",
        "schema-driven ∧ contract-equivalent",
      ].sort(),
    );
  });
});

// ── Tag ∧ tag intersections ─────────────────────────────────────────────────

describe("matrix-intersections — tag ∧ tag predicates", () => {
  it("io-bound ∧ structural-drift fires when both tags are in the union", () => {
    // io-bound from tagger; structural-drift derived from
    // divergent_structural verdict.
    const entry = makeEntry({
      nodeId: "n1",
      sourceFile: "fs.ts",
      taggerTags: ["io-bound", "operational-glue"],
      verdict: "divergent_structural",
    });
    const out = aggregateByIntersection([entry]);
    expect(out["io-bound ∧ structural-drift"]).toBe(1);
  });

  it("io-bound ∧ behavior-drift does NOT fire when no behavior verdict failed (pilot)", () => {
    const entry = makeEntry({
      nodeId: "n1",
      sourceFile: "fs.ts",
      taggerTags: ["io-bound"],
      verdict: "divergent_structural", // no behavior-drift
    });
    const out = aggregateByIntersection([entry]);
    expect(out["io-bound ∧ behavior-drift"]).toBe(0);
  });

  it("literal-required ∧ prompt-sensitive fires when both content rules tagged the same file", () => {
    const entry = makeEntry({
      nodeId: "n1",
      sourceFile: "prompt.ts",
      taggerTags: ["literal-required", "prompt-sensitive"],
      verdict: "epsilon_equivalent",
    });
    const out = aggregateByIntersection([entry]);
    expect(out["literal-required ∧ prompt-sensitive"]).toBe(1);
  });

  it("contract-missing ∧ not-reviewed: not-reviewed is always present in the pilot; contract-missing is not (contract=not-measured by default)", () => {
    const entry = makeEntry({
      nodeId: "n1",
      sourceFile: "x.ts",
      taggerTags: ["operational-glue"],
      verdict: "epsilon_equivalent",
    });
    const out = aggregateByIntersection([entry]);
    // contract-missing requires contract.fail or unknown, which the pilot does not set.
    expect(out["contract-missing ∧ not-reviewed"]).toBe(0);
  });
});

// ── Tag ∧ axis-state intersections ─────────────────────────────────────────

describe("matrix-intersections — tag ∧ axis-state predicates", () => {
  it("schema-driven ∧ contract-equivalent does NOT fire under pilot defaults (contract=not-measured)", () => {
    const entry = makeEntry({
      nodeId: "n1",
      sourceFile: "src/schemas/ontology.ts",
      taggerTags: ["schema-driven"],
      verdict: "epsilon_equivalent",
    });
    const out = aggregateByIntersection([entry]);
    expect(out["schema-driven ∧ contract-equivalent"]).toBe(0);
  });

  it("schema-driven ∧ contract-equivalent fires when the contract axis is pinned to pass", () => {
    // Manually construct an entry with contract='pass' to simulate a
    // future run where a contract checker has fired.
    const entry: PerNodeMatrix = {
      nodeId: "n2",
      sourceFile: "src/schemas/ontology.ts",
      frontier: [
        "schema-driven",
        "not-reviewed",
      ],
      cell: {
        contract: "pass",
        structural: "pass",
        behavior: "untested",
        intent: "not-reviewed",
        literalRequired: "false",
        cost: ZERO_COST,
      },
    };
    const out = aggregateByIntersection([entry]);
    expect(out["schema-driven ∧ contract-equivalent"]).toBe(1);
  });

  it("pure-transform ∧ behavior-equivalent fires when the behavior axis is pinned to pass", () => {
    const entry: PerNodeMatrix = {
      nodeId: "n3",
      sourceFile: "src/core/integrity/hash.ts",
      frontier: ["pure-transform", "not-reviewed"],
      cell: {
        contract: "not-measured",
        structural: "pass",
        behavior: "pass",
        intent: "not-reviewed",
        literalRequired: "false",
        cost: ZERO_COST,
      },
    };
    const out = aggregateByIntersection([entry]);
    expect(out["pure-transform ∧ behavior-equivalent"]).toBe(1);
  });
});

// ── Synthetic 6-file fixture with pinned counts ─────────────────────────────

describe("matrix-intersections — synthetic 6-file fixture", () => {
  it("pins counts for a deliberately mixed entry set", () => {
    const entries: PerNodeMatrix[] = [
      // 1) IO adapter with structural drift → io-bound ∧ structural-drift
      makeEntry({
        nodeId: "f1",
        sourceFile: "src/runtime/llm/anthropic/adapter.ts",
        taggerTags: ["adapter-boundary", "io-bound", "operational-glue"],
        verdict: "divergent_structural",
      }),
      // 2) Another IO file with structural drift → io-bound ∧ structural-drift
      makeEntry({
        nodeId: "f2",
        sourceFile: "src/core/fs/lock.ts",
        taggerTags: ["io-bound", "operational-glue"],
        verdict: "divergent_structural",
      }),
      // 3) Prompt-heavy + literal: literal-required ∧ prompt-sensitive
      makeEntry({
        nodeId: "f3",
        sourceFile: "src/runtime/prompt/inspector.ts",
        taggerTags: ["literal-required", "prompt-sensitive"],
        verdict: "epsilon_equivalent",
      }),
      // 4) Pure-transform ε-equivalent under default pilot axes
      //    → nothing matches behavior-equivalent because behavior=untested
      makeEntry({
        nodeId: "f4",
        sourceFile: "src/core/integrity/hash.ts",
        taggerTags: ["pure-transform"],
        verdict: "epsilon_equivalent",
      }),
      // 5) Schema-driven divergent (not pass) → schema-driven ∧ contract-equivalent fails axis
      makeEntry({
        nodeId: "f5",
        sourceFile: "src/schemas/ontology.ts",
        taggerTags: ["schema-driven"],
        verdict: "divergent_loc",
      }),
      // 6) CLI parser with no behavior verdict → cli-parsing ∧ behavior-drift = 0
      makeEntry({
        nodeId: "f6",
        sourceFile: "src/commands/ingest/index.ts",
        taggerTags: ["cli-parsing", "operational-glue"],
        verdict: "epsilon_equivalent",
      }),
    ];

    const out = aggregateByIntersection(entries);
    expect(out["io-bound ∧ structural-drift"]).toBe(2);
    expect(out["io-bound ∧ behavior-drift"]).toBe(0);
    expect(out["literal-required ∧ prompt-sensitive"]).toBe(1);
    expect(out["cli-parsing ∧ behavior-drift"]).toBe(0);
    expect(out["schema-driven ∧ contract-equivalent"]).toBe(0);
    expect(out["pure-transform ∧ behavior-equivalent"]).toBe(0);
    expect(out["contract-missing ∧ not-reviewed"]).toBe(0);
  });
});

// ── Additional intersection appending ───────────────────────────────────────

describe("matrix-intersections — additional specs may append but required ones must not be removed", () => {
  it("additional specs are counted and appear in the output", () => {
    const entries = [
      makeEntry({
        nodeId: "n1",
        sourceFile: "src/runtime/llm/anthropic/adapter.ts",
        taggerTags: ["adapter-boundary", "io-bound"],
        verdict: "divergent_structural",
      }),
    ];
    const additional: IntersectionSpec[] = [
      {
        name: "adapter-boundary ∧ structural-drift",
        tags: ["adapter-boundary", "structural-drift"],
      },
    ];
    const out = aggregateByIntersection(entries, additional);
    expect(out["adapter-boundary ∧ structural-drift"]).toBe(1);
    // Required entries still appear
    for (const s of REQUIRED_INTERSECTIONS) {
      expect(out[s.name]).toBeDefined();
    }
  });

  it("a zero-match additional intersection still appears in the output", () => {
    const entries = [
      makeEntry({
        nodeId: "n1",
        sourceFile: "x.ts",
        taggerTags: ["operational-glue"],
        verdict: "epsilon_equivalent",
      }),
    ];
    const additional: IntersectionSpec[] = [
      {
        name: "human-authored ∧ structural-drift",
        tags: ["human-authored", "structural-drift"],
      },
    ];
    const out = aggregateByIntersection(entries, additional);
    expect(out["human-authored ∧ structural-drift"]).toBe(0);
  });
});

// ── Single-entry predicate evaluation ───────────────────────────────────────

describe("matrix-intersections — entryMatchesIntersection", () => {
  it("matches when every tag is present", () => {
    const entry = makeEntry({
      nodeId: "n1",
      sourceFile: "x.ts",
      taggerTags: ["io-bound"],
      verdict: "divergent_structural",
    });
    expect(
      entryMatchesIntersection(entry, {
        name: "io-bound ∧ structural-drift",
        tags: ["io-bound", "structural-drift"],
      }),
    ).toBe(true);
  });

  it("fails when any required tag is missing", () => {
    const entry = makeEntry({
      nodeId: "n1",
      sourceFile: "x.ts",
      taggerTags: ["operational-glue"],
      verdict: "epsilon_equivalent",
    });
    expect(
      entryMatchesIntersection(entry, {
        name: "io-bound ∧ structural-drift",
        tags: ["io-bound", "structural-drift"],
      }),
    ).toBe(false);
  });

  it("fails when an axis-state predicate disagrees with the cell", () => {
    const entry: PerNodeMatrix = {
      nodeId: "n1",
      sourceFile: "x.ts",
      frontier: ["pure-transform", "not-reviewed"],
      cell: {
        contract: "not-measured",
        structural: "pass",
        behavior: "untested", // not pass
        intent: "not-reviewed",
        literalRequired: "false",
        cost: ZERO_COST,
      },
    };
    expect(
      entryMatchesIntersection(entry, {
        name: "pure-transform ∧ behavior-equivalent",
        tags: ["pure-transform"],
        axisStates: { behavior: "pass" },
      }),
    ).toBe(false);
  });
});
