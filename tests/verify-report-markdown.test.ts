import { describe, it, expect } from "vitest";
import { renderReportMarkdown } from "../src/commands/verify/homeomorphism.js";
import type {
  AggregateReport,
  HomeomorphismVerdict,
} from "../src/runtime/legend/verify-homeomorphism.js";
import type {
  ByAxis,
  PerNodeMatrix,
} from "../src/runtime/legend/matrix.js";

const BASE_THRESHOLDS = { loc: 0.3, jaccard: 0.5 };

function makeReportWithoutMatrix(): AggregateReport {
  return {
    rootDir: "/tmp/test",
    thresholds: BASE_THRESHOLDS,
    total: 3,
    byVerdict: {
      epsilon_equivalent: 2,
      divergent_loc: 0,
      divergent_structural: 1,
      divergent_both: 0,
      unrecoverable: 0,
    },
    results: [
      {
        nodeId: "n1",
        sourceFile: "/tmp/test/foo.ts",
        ok: true,
        verdict: "epsilon_equivalent" as HomeomorphismVerdict,
        thresholds: BASE_THRESHOLDS,
        metrics: {
          locDistance: 0.1,
          structuralJaccard: 0.95,
          lineDelta: 2,
          originalLines: 20,
          regenLines: 22,
          originalDeclarations: ["foo"],
          regenDeclarations: ["foo"],
        },
      },
    ],
  };
}

function makeReportWithMatrix(): AggregateReport {
  const base = makeReportWithoutMatrix();
  const byAxis: ByAxis = {
    contract: { pass: 0, fail: 0, unknown: 0, "not-measured": 3 },
    structural: { pass: 2, fail: 1, partial: 0, "not-measured": 0 },
    behavior: { pass: 0, fail: 0, untested: 3, "not-applicable": 0 },
    intent: {
      accepted: 0,
      rejected: 0,
      "needs-human": 0,
      "not-reviewed": 3,
    },
    literalRequired: { true: 1, false: 2, candidate: 0, unknown: 0 },
  };
  const matrix: PerNodeMatrix[] = [
    {
      nodeId: "n1",
      sourceFile: "foo.ts",
      frontier: ["pure-transform", "not-reviewed"],
      cell: {
        contract: "not-measured",
        structural: "pass",
        behavior: "untested",
        intent: "not-reviewed",
        literalRequired: "false",
        cost: {
          provider: "ollama",
          model: "qwen2.5-coder:7b",
          task: "code_sketch",
          inputTokens: 0,
          outputTokens: 0,
          usd: 0,
          wallClockMs: 0,
        },
      },
      honesty: { structural: 0.9, contract: null, behavior: null, intent: null },
    },
    {
      nodeId: "n2",
      sourceFile: "bar.ts",
      frontier: ["io-bound", "operational-glue", "structural-drift", "not-reviewed"],
      cell: {
        contract: "not-measured",
        structural: "fail",
        behavior: "untested",
        intent: "not-reviewed",
        literalRequired: "false",
        cost: {
          provider: "ollama",
          model: "qwen2.5-coder:7b",
          task: "code_sketch",
          inputTokens: 0,
          outputTokens: 0,
          usd: 0,
          wallClockMs: 0,
        },
      },
      honesty: { structural: 0.2, contract: null, behavior: null, intent: null },
    },
    {
      nodeId: "n3",
      sourceFile: "prompt.ts",
      frontier: [
        "literal-required",
        "prompt-sensitive",
        "schema-driven",
        "not-reviewed",
      ],
      cell: {
        contract: "not-measured",
        structural: "pass",
        behavior: "untested",
        intent: "not-reviewed",
        literalRequired: "true",
        cost: {
          provider: "ollama",
          model: "qwen2.5-coder:7b",
          task: "code_sketch",
          inputTokens: 0,
          outputTokens: 0,
          usd: 0,
          wallClockMs: 0,
        },
      },
      honesty: { structural: 0.7, contract: null, behavior: null, intent: null },
    },
  ];
  const byIntersection: Record<string, number> = {
    "io-bound ∧ structural-drift": 1,
    "io-bound ∧ behavior-drift": 0,
    "literal-required ∧ prompt-sensitive": 1,
    "cli-parsing ∧ behavior-drift": 0,
    "schema-driven ∧ contract-equivalent": 0,
    "pure-transform ∧ behavior-equivalent": 0,
    "contract-missing ∧ not-reviewed": 0,
  };
  // Pareto pivot — derived from `matrix` but pre-computed here so the
  // renderer test fixture matches what the verify command produces.
  const paretoByTaskModel = [
    {
      task: "code_sketch",
      provider: "ollama",
      model: "qwen2.5-coder:7b",
      n: 3,
      meanHonestyStructural: (0.9 + 0.2 + 0.7) / 3,
      honestyN: 3,
      meanUsdPerNode: 0,
      meanInputTokensPerNode: 0,
      meanOutputTokensPerNode: 0,
      paretoFrontier: true,
    },
  ];
  return { ...base, matrix, byAxis, byIntersection, paretoByTaskModel };
}

describe("renderReportMarkdown — legacy shape unchanged when matrix is absent", () => {
  it("omits matrix sections entirely", () => {
    const md = renderReportMarkdown(makeReportWithoutMatrix());
    expect(md).not.toContain("Matrix by axis");
    expect(md).not.toContain("Frontier coverage");
    expect(md).not.toContain("Frontier intersections");
  });

  it("includes the existing aggregate verdict table and per-node table", () => {
    const md = renderReportMarkdown(makeReportWithoutMatrix());
    expect(md).toContain("## Aggregate");
    expect(md).toContain("epsilon_equivalent");
    expect(md).toContain("## Per-node");
    expect(md).toContain("## Methodology");
  });
});

describe("renderReportMarkdown — matrix sections when present", () => {
  it("renders a 'Matrix by axis' section with one row per axis", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    expect(md).toContain("## Matrix by axis");
    expect(md).toContain("| contract |");
    expect(md).toContain("| structural |");
    expect(md).toContain("| behavior |");
    expect(md).toContain("| intent |");
    expect(md).toContain("| literalRequired |");
  });

  it("includes non-zero state counts inline per axis", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    // structural pass=2, fail=1 (zero states omitted from the row)
    expect(md).toMatch(/\| structural \| .*pass.*=2.*/);
    expect(md).toMatch(/\| structural \| .*fail.*=1.*/);
    // intent all not-reviewed (only that state shows up)
    expect(md).toMatch(/\| intent \| .*not-reviewed.*=3.*/);
    // contract uniformly not-measured
    expect(md).toMatch(/\| contract \| .*not-measured.*=3.*/);
  });

  it("renders 'Frontier coverage' with tag counts sorted descending", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    expect(md).toContain("## Frontier coverage");
    // not-reviewed appears in every node → 3
    expect(md).toMatch(/\| `not-reviewed` \| 3 \|/);
    // pure-transform appears in only one node → 1
    expect(md).toMatch(/\| `pure-transform` \| 1 \|/);
  });

  it("renders all seven required intersections with their counts", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    expect(md).toContain("## Frontier intersections");
    expect(md).toContain("| io-bound ∧ structural-drift | 1 |");
    expect(md).toContain("| io-bound ∧ behavior-drift | 0 |");
    expect(md).toContain("| literal-required ∧ prompt-sensitive | 1 |");
    expect(md).toContain("| cli-parsing ∧ behavior-drift | 0 |");
    expect(md).toContain("| schema-driven ∧ contract-equivalent | 0 |");
    expect(md).toContain("| pure-transform ∧ behavior-equivalent | 0 |");
    expect(md).toContain("| contract-missing ∧ not-reviewed | 0 |");
  });

  it("labels additional (non-required) intersections as discovered", () => {
    const report = makeReportWithMatrix();
    report.byIntersection!["adapter-boundary ∧ structural-drift"] = 2;
    const md = renderReportMarkdown(report);
    expect(md).toMatch(
      /\| adapter-boundary ∧ structural-drift \*\(discovered\)\* \| 2 \|/,
    );
  });

  it("includes the matrix methodology paragraph", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    expect(md).toContain("six-axis Phase ε matrix");
    expect(md).toContain("POSITIONING.md");
    expect(md).toContain("frontier-tagger");
  });
});

describe("renderReportMarkdown — partial matrix data is honest", () => {
  it("renders byAxis without 'Frontier coverage' when matrix is empty", () => {
    const r = makeReportWithMatrix();
    r.matrix = [];
    const md = renderReportMarkdown(r);
    expect(md).toContain("## Matrix by axis");
    expect(md).not.toContain("## Frontier coverage");
  });
});

describe("renderReportMarkdown — honesty (Phase ε prework F)", () => {
  it("renders the 'Honesty by axis' section with mean + n + coverage", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    expect(md).toContain("## Honesty by axis (Phase ε prework F)");
    // structural mean = (0.9 + 0.2 + 0.7) / 3 = 0.600 over 3 nodes (100% coverage)
    expect(md).toMatch(/\| structural \| 0\.600 \| 3 \| 100% \|/);
    // contract / behavior / intent have n=0 → mean dashed, 0% coverage
    expect(md).toMatch(/\| contract \| — \| 0 \| 0% \|/);
    expect(md).toMatch(/\| behavior \| — \| 0 \| 0% \|/);
    expect(md).toMatch(/\| intent \| — \| 0 \| 0% \|/);
  });

  it("adds a 'Honesty' column in the per-node table when matrix is present", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    // Header includes Honesty
    expect(md).toMatch(
      /\| Node \| Source \| Verdict \| LoC dist \| Jaccard \| Honesty \| Tokens \| Cost \|/,
    );
    // n1's structural honesty = 0.9 appears as 0.900
    expect(md).toMatch(/\| `n1` \|.*\| 0\.900 \|/);
  });

  it("dashes the Honesty column when matrix is absent (legacy report)", () => {
    const md = renderReportMarkdown(makeReportWithoutMatrix());
    // Honesty column header is no longer rendered in legacy mode? Confirm
    // policy: prework F adds the column unconditionally so the legacy
    // shape stays uniform; dashes signal "no matrix".
    expect(md).toContain("Honesty");
    // Per-node row for n1: honesty must be "—" since matrix is absent
    expect(md).toMatch(/\| `n1` \|.*foo\.ts \| epsilon_equivalent \|.*\| — \|/);
  });

  it("omits the 'Honesty by axis' section when matrix is empty", () => {
    const r = makeReportWithMatrix();
    r.matrix = [];
    const md = renderReportMarkdown(r);
    expect(md).not.toContain("## Honesty by axis");
  });
});

describe("renderReportMarkdown — Pareto (Phase ε prework G)", () => {
  it("renders the Pareto section with frontier markers", () => {
    const md = renderReportMarkdown(makeReportWithMatrix());
    expect(md).toContain(
      "## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)",
    );
    expect(md).toContain("| code_sketch | ollama |");
    expect(md).toContain("`qwen2.5-coder:7b`");
    // Star marker for the only entry → on the frontier (trivially).
    expect(md).toMatch(/\| ★ \|/);
  });

  it("omits the Pareto section when paretoByTaskModel is absent", () => {
    const md = renderReportMarkdown(makeReportWithoutMatrix());
    expect(md).not.toContain("Pareto: cost vs fidelity");
  });
});
