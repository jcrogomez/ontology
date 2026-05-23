import { describe, it, expect } from "vitest";
import {
  synthesizeBakeoff,
  renderBakeoffSynthesisMarkdown,
  BakeoffSynthesisSchema,
  VERDICT_ORDINAL,
  FAILURE_MODE_ORDER,
  DEFAULT_H1_JACCARD_FLOOR,
  type BakeoffArm,
} from "../src/runtime/legend/bakeoff-synthesis.js";
import type {
  AggregateReport,
  HomeomorphismVerdict,
  VerificationResult,
} from "../src/runtime/legend/verify-homeomorphism.js";
import type { FailureMode } from "../src/runtime/legend/failure-mode-tagger.js";

// ── Fixture builders ────────────────────────────────────────────────

function res(
  nodeId: string,
  sourceFile: string,
  verdict: HomeomorphismVerdict,
  jaccard: number | null,
  ok = true,
  model = "qwen2.5-coder:7b",
): VerificationResult {
  return {
    nodeId,
    sourceFile,
    ok,
    verdict,
    thresholds: { loc: 0.3, jaccard: 0.5 },
    dispatchModel: { provider: "ollama", model },
    ...(jaccard !== null
      ? {
          metrics: {
            locDistance: 0.1,
            structuralJaccard: jaccard,
            originalLineCount: 10,
            regenLineCount: 11,
            originalDeclarations: [],
            regenDeclarations: [],
          },
        }
      : {}),
  };
}

interface ReportOpts {
  micro?: number;
  macro?: number;
  exact?: number;
  nodesWithMandatory?: number;
  fm?: Partial<Record<FailureMode, number>>;
  pareto?: boolean;
}

function report(results: VerificationResult[], opts: ReportOpts = {}): AggregateReport {
  const byVerdict: Record<HomeomorphismVerdict, number> = {
    epsilon_equivalent: 0,
    divergent_loc: 0,
    divergent_structural: 0,
    divergent_both: 0,
    unrecoverable: 0,
  };
  for (const r of results) byVerdict[r.verdict]++;
  const r: AggregateReport = {
    rootDir: "/repo",
    thresholds: { loc: 0.3, jaccard: 0.5 },
    total: results.length,
    byVerdict,
    results,
  };
  if (opts.micro !== undefined) {
    r.exportRecovery = {
      nodesWithMandatory: opts.nodesWithMandatory ?? results.length,
      totalMandatory: 10,
      totalRecovered: Math.round(opts.micro * 10),
      totalMissing: 10 - Math.round(opts.micro * 10),
      totalHallucinated: 0,
      microRecoveryRate: opts.micro,
      macroRecoveryRate: opts.macro ?? opts.micro,
      exactMatchCount: opts.exact ?? 0,
    };
  }
  if (opts.fm) {
    r.failureModes = {
      affectedNodes: results.length,
      totalInspected: results.length,
      counts: {
        missing_exports: 0,
        hallucinated_exports: 0,
        empty_regen: 0,
        compile_back_failed: 0,
        gluing_rejected: 0,
        schema_invalid: 0,
        ...opts.fm,
      },
      perNode: [],
    };
  }
  if (opts.pareto) {
    r.paretoByTaskModel = [
      {
        task: "code_sketch",
        provider: "ollama",
        model: "qwen2.5-coder:7b",
        n: 3,
        meanHonestyStructural: 0.4,
        honestyN: 3,
        meanUsdPerNode: 0,
        meanInputTokensPerNode: 100,
        meanOutputTokensPerNode: 50,
        paretoFrontier: true,
      },
      {
        task: "code_sketch",
        provider: "ollama",
        model: "loser:1b",
        n: 3,
        meanHonestyStructural: 0.1,
        honestyN: 3,
        meanUsdPerNode: 0,
        meanInputTokensPerNode: 100,
        meanOutputTokensPerNode: 50,
        paretoFrontier: false,
      },
    ];
  }
  return r;
}

function armA(): BakeoffArm {
  return {
    label: "A",
    provider: "ollama",
    model: "qwen2.5-coder:7b",
    report: report(
      [
        res("n1", "src/a.ts", "divergent_structural", 0.2),
        res("n2", "src/b.ts", "unrecoverable", null, false),
        res("n3", "src/c.ts", "epsilon_equivalent", 0.9),
      ],
      { micro: 0.5, macro: 0.5, exact: 1, fm: { missing_exports: 3, empty_regen: 1 }, pareto: true },
    ),
  };
}

function armB(): BakeoffArm {
  return {
    label: "B",
    provider: "ollama",
    model: "granite4.1:8b",
    report: report(
      [
        res("n1", "src/a.ts", "epsilon_equivalent", 0.8, true, "granite4.1:8b"),
        res("n2", "src/b.ts", "divergent_loc", 0.6, true, "granite4.1:8b"),
        res("n3", "src/c.ts", "divergent_both", 0.1, true, "granite4.1:8b"),
      ],
      { micro: 0.7, macro: 0.7, exact: 2, fm: { missing_exports: 1, empty_regen: 0 } },
    ),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("verdict ordinal", () => {
  it("orders worst→best as documented", () => {
    expect(VERDICT_ORDINAL.unrecoverable).toBe(0);
    expect(VERDICT_ORDINAL.divergent_both).toBe(1);
    expect(VERDICT_ORDINAL.divergent_structural).toBe(2);
    expect(VERDICT_ORDINAL.divergent_loc).toBe(3);
    expect(VERDICT_ORDINAL.epsilon_equivalent).toBe(4);
  });
});

describe("synthesizeBakeoff", () => {
  it("emits a schema-valid synthesis and treats the first arm as baseline", () => {
    const s = synthesizeBakeoff([armA(), armB()]);
    expect(BakeoffSynthesisSchema.safeParse(s).success).toBe(true);
    expect(s.baselineLabel).toBe("A");
    expect(s.armCount).toBe(2);
    expect(s.exportRecovery.baselineLabel).toBe("A");
    expect(s.failureModes.baselineLabel).toBe("A");
    expect(s.failureModes.modes).toEqual([...FAILURE_MODE_ORDER]);
  });

  it("throws on an empty arm list", () => {
    expect(() => synthesizeBakeoff([])).toThrow();
  });

  it("computes mean structural Jaccard only over nodes with metrics", () => {
    const s = synthesizeBakeoff([armA(), armB()]);
    // A: 0.2 and 0.9 (n2 unrecoverable, no metrics) → 0.55 over 2
    expect(s.arms[0].nodesWithMetrics).toBe(2);
    expect(s.arms[0].meanStructuralJaccard).toBeCloseTo(0.55, 10);
    // B: 0.8, 0.6, 0.1 → 0.5 over 3
    expect(s.arms[1].nodesWithMetrics).toBe(3);
    expect(s.arms[1].meanStructuralJaccard).toBeCloseTo(0.5, 10);
  });

  it("computes export-recovery deltas relative to the baseline", () => {
    const s = synthesizeBakeoff([armA(), armB()]);
    expect(s.exportRecovery.rows[0].microDeltaVsBaseline).toBe(0); // baseline vs itself
    expect(s.exportRecovery.rows[1].microRecoveryRate).toBe(0.7);
    expect(s.exportRecovery.rows[1].microDeltaVsBaseline).toBeCloseTo(0.2, 10);
    expect(s.exportRecovery.rows[1].exactMatchCount).toBe(2);
  });

  it("computes signed per-mode failure deltas (negative = improvement)", () => {
    const s = synthesizeBakeoff([armA(), armB()]);
    const b = s.failureModes.rows[1].deltaVsBaseline!;
    expect(b.missing_exports).toBe(-2);
    expect(b.empty_regen).toBe(-1);
    expect(b.hallucinated_exports).toBe(0);
  });

  it("classifies per-file trends against the baseline verdict ordinal", () => {
    const s = synthesizeBakeoff([armA(), armB()]);
    const byFile = new Map(s.perFile.map((r) => [r.sourceFile, r]));
    expect(byFile.get("src/a.ts")!.trend).toBe("improved"); // divergent_structural→epsilon
    expect(byFile.get("src/b.ts")!.trend).toBe("improved"); // unrecoverable→divergent_loc
    expect(byFile.get("src/c.ts")!.trend).toBe("regressed"); // epsilon→divergent_both
    // Deterministic, sorted by source file.
    expect(s.perFile.map((r) => r.sourceFile)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("marks 'stable' when ordinals match and 'mixed' when arms disagree", () => {
    const base: BakeoffArm = { label: "A", report: report([res("n1", "src/x.ts", "divergent_loc", 0.6)]) };
    const same: BakeoffArm = { label: "B", report: report([res("n1", "src/x.ts", "divergent_loc", 0.6)]) };
    expect(synthesizeBakeoff([base, same]).perFile[0].trend).toBe("stable");

    const up: BakeoffArm = { label: "B", report: report([res("n1", "src/x.ts", "epsilon_equivalent", 0.9)]) };
    const down: BakeoffArm = { label: "C", report: report([res("n1", "src/x.ts", "unrecoverable", null, false)]) };
    expect(synthesizeBakeoff([base, up, down]).perFile[0].trend).toBe("mixed");
  });

  it("marks files present in only some arms as incomparable", () => {
    const a: BakeoffArm = { label: "A", report: report([res("n1", "src/a.ts", "divergent_loc", 0.7)]) };
    const b: BakeoffArm = { label: "B", report: report([res("n9", "src/only-b.ts", "epsilon_equivalent", 0.9)]) };
    const s = synthesizeBakeoff([a, b]);
    const onlyB = s.perFile.find((r) => r.sourceFile === "src/only-b.ts")!;
    expect(onlyB.trend).toBe("incomparable");
    expect(onlyB.perArm[0].verdict).toBeNull(); // absent in baseline A
    expect(onlyB.perArm[1].verdict).toBe("epsilon_equivalent");
  });

  it("reads the H1 floor: all arms pass at 0.1, none pass at 0.6", () => {
    const low = synthesizeBakeoff([armA(), armB()]);
    expect(low.h1.jaccardFloor).toBe(DEFAULT_H1_JACCARD_FLOOR);
    expect(low.h1.allPass).toBe(true);
    expect(low.h1.anyPass).toBe(true);

    const high = synthesizeBakeoff([armA(), armB()], { h1JaccardFloor: 0.6 });
    expect(high.h1.allPass).toBe(false);
    expect(high.h1.anyPass).toBe(false);
  });

  it("surfaces Pareto-frontier winners per arm and skips dominated entries", () => {
    const s = synthesizeBakeoff([armA(), armB()]);
    expect(s.arms[0].paretoFrontier).toHaveLength(1);
    expect(s.arms[0].paretoFrontier[0].model).toBe("qwen2.5-coder:7b");
    expect(s.arms[1].paretoFrontier).toHaveLength(0); // armB report has no matrix/pareto
  });

  it("handles legacy verdict-only reports (no matrix) without throwing", () => {
    const legacy: BakeoffArm = { label: "L", report: report([res("n1", "src/a.ts", "divergent_loc", 0.7)]) };
    const s = synthesizeBakeoff([legacy]);
    expect(s.arms[0].microRecoveryRate).toBeNull();
    expect(s.arms[0].macroRecoveryRate).toBeNull();
    expect(s.arms[0].failureModeCounts).toBeNull();
    expect(s.arms[0].paretoFrontier).toEqual([]);
    // model still introspected from the per-node dispatchModel
    expect(s.arms[0].model).toBe("qwen2.5-coder:7b");
    expect(BakeoffSynthesisSchema.safeParse(s).success).toBe(true);
  });
});

describe("renderBakeoffSynthesisMarkdown", () => {
  it("renders all sections and is byte-deterministic", () => {
    const md1 = renderBakeoffSynthesisMarkdown(synthesizeBakeoff([armA(), armB()]));
    const md2 = renderBakeoffSynthesisMarkdown(synthesizeBakeoff([armA(), armB()]));
    expect(md1).toBe(md2);
    expect(md1).toContain("# Move 3α bake-off synthesis");
    expect(md1).toContain("## Arms");
    expect(md1).toContain("## Verdict distribution");
    expect(md1).toContain("## Export recovery");
    expect(md1).toContain("## Failure modes");
    expect(md1).toContain("## Pareto frontier");
    expect(md1).toContain("## H1 read");
    expect(md1).toContain("## Per-file rebuild status");
  });

  it("renders the H1 decision gate text for the all-pass case", () => {
    const md = renderBakeoffSynthesisMarkdown(synthesizeBakeoff([armA(), armB()]));
    expect(md).toContain("TARGET_ARCHITECTURE router skeleton");
  });

  it("renders the Opus-ceiling gate text when no arm clears the floor", () => {
    const md = renderBakeoffSynthesisMarkdown(
      synthesizeBakeoff([armA(), armB()], { h1JaccardFloor: 0.99 }),
    );
    expect(md).toContain("Opus 4.7 ceiling probe is mandatory");
  });
});
