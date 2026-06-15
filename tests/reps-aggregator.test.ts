import { describe, it, expect } from "vitest";
import {
  median,
  mean,
  aggregateDistanceMetrics,
  aggregateUsage,
  aggregateRepResults,
  DEFAULT_AGGREGATOR,
} from "../src/laws/reps-aggregator.js";
import {
  DEFAULT_THRESHOLDS,
  type DistanceMetrics,
  type HomeomorphismVerdict,
  type VerificationResult,
} from "../src/laws/verify-homeomorphism.js";

// Coverage for the per-node multi-rep aggregator (design item §4.2).
// All tests are pure — no LLM, no IO — so the suite runs in <100 ms
// and exercises odd/even cohorts, all-unrecoverable cohorts, mixed
// success/failure cohorts, and the verdict re-classification path.

// ── Fixture builders ────────────────────────────────────────────────

function metrics(loc: number, jaccard: number, regenLineCount = 10): DistanceMetrics {
  return {
    locDistance: loc,
    structuralJaccard: jaccard,
    originalLineCount: 10,
    regenLineCount,
    originalDeclarations: ["foo", "bar"],
    regenDeclarations: ["foo", "bar"],
  };
}

function okResult(
  nodeId: string,
  m: DistanceMetrics,
  verdict: HomeomorphismVerdict,
  usage?: { totalTokens?: number; costUSD?: number; cached?: boolean },
): VerificationResult {
  return {
    nodeId,
    sourceFile: "src/a.ts",
    regenPath: ".ontology/verify/a.ts",
    ok: true,
    metrics: m,
    verdict,
    thresholds: DEFAULT_THRESHOLDS,
    ...(usage ? { usage } : {}),
    dispatchModel: { provider: "ollama", model: "qwen2.5-coder:7b" },
  };
}

function unrecoverable(nodeId: string, failure = "compile-back failed"): VerificationResult {
  return {
    nodeId,
    sourceFile: "src/a.ts",
    ok: false,
    failure,
    verdict: "unrecoverable",
    thresholds: DEFAULT_THRESHOLDS,
  };
}

// ── Numeric reducers ────────────────────────────────────────────────

describe("median", () => {
  it("picks the middle element for odd-length lists", () => {
    expect(median([1, 5, 3])).toBe(3);
    expect(median([0.1, 0.9, 0.5, 0.3, 0.7])).toBe(0.5);
  });

  it("averages the two middle elements for even-length lists", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([0.0, 1.0])).toBe(0.5);
  });

  it("is order-independent", () => {
    expect(median([3, 1, 4, 1, 5, 9, 2, 6])).toBe(median([9, 6, 5, 4, 3, 2, 1, 1]));
  });

  it("does not mutate the input", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it("throws on an empty list", () => {
    expect(() => median([])).toThrow();
  });
});

describe("mean", () => {
  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([0, 1])).toBe(0.5);
  });

  it("throws on an empty list", () => {
    expect(() => mean([])).toThrow();
  });
});

describe("DEFAULT_AGGREGATOR", () => {
  it("is median (variance-resistant for the H1 floor read)", () => {
    expect(DEFAULT_AGGREGATOR).toBe("median");
  });
});

// ── Distance metrics aggregator ─────────────────────────────────────

describe("aggregateDistanceMetrics", () => {
  it("medians the numeric axes by default", () => {
    const reps = [metrics(0.1, 1.0), metrics(0.5, 0.0), metrics(0.2, 0.6)];
    const agg = aggregateDistanceMetrics(reps);
    expect(agg.locDistance).toBeCloseTo(0.2, 10);
    expect(agg.structuralJaccard).toBeCloseTo(0.6, 10);
  });

  it("means the numeric axes under aggregator='mean'", () => {
    const reps = [metrics(0.1, 1.0), metrics(0.5, 0.0), metrics(0.3, 0.6)];
    const agg = aggregateDistanceMetrics(reps, "mean");
    expect(agg.locDistance).toBeCloseTo(0.3, 10);
    // (1.0 + 0.0 + 0.6) / 3 ≈ 0.5333
    expect(agg.structuralJaccard).toBeCloseTo(0.5333, 3);
  });

  it("carries originalLineCount and originalDeclarations from the first rep (deterministic source)", () => {
    const reps = [metrics(0.1, 1.0), metrics(0.5, 0.0)];
    const agg = aggregateDistanceMetrics(reps);
    expect(agg.originalLineCount).toBe(10);
    expect(agg.originalDeclarations).toEqual(["foo", "bar"]);
  });

  it("rounds regenLineCount to an integer", () => {
    const reps = [metrics(0, 0, 10), metrics(0, 0, 13)];
    const agg = aggregateDistanceMetrics(reps);
    // median of [10, 13] = 11.5 → rounds to 12
    expect(agg.regenLineCount).toBe(12);
    expect(Number.isInteger(agg.regenLineCount)).toBe(true);
  });

  it("picks regenDeclarations from the rep closest to the aggregated Jaccard (real draw, not chimera)", () => {
    const rep0: DistanceMetrics = { ...metrics(0, 1.0), regenDeclarations: ["alpha"] };
    const rep1: DistanceMetrics = { ...metrics(0, 0.5), regenDeclarations: ["beta"] };
    const rep2: DistanceMetrics = { ...metrics(0, 0.0), regenDeclarations: ["gamma"] };
    // median Jaccard = 0.5 → closest rep is rep1 → regenDeclarations = ["beta"]
    const agg = aggregateDistanceMetrics([rep0, rep1, rep2]);
    expect(agg.regenDeclarations).toEqual(["beta"]);
  });

  it("throws on an empty rep list", () => {
    expect(() => aggregateDistanceMetrics([])).toThrow();
  });
});

// ── Usage aggregator ────────────────────────────────────────────────

describe("aggregateUsage", () => {
  it("sums token counts and cost across reps", () => {
    const reps = [
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 100, costUSD: 0.01 }),
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 200, costUSD: 0.02 }),
    ];
    const u = aggregateUsage(reps);
    expect(u?.totalTokens).toBe(300);
    expect(u?.costUSD).toBeCloseTo(0.03, 10);
  });

  it("returns undefined when no rep carried usage", () => {
    const reps = [okResult("n", metrics(0, 1), "epsilon_equivalent")];
    expect(aggregateUsage(reps)).toBeUndefined();
  });

  it("reports cached=true only when EVERY rep was a cache hit (conservative)", () => {
    const allCached = [
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 100, cached: true }),
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 100, cached: true }),
    ];
    expect(aggregateUsage(allCached)?.cached).toBe(true);

    const mixed = [
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 100, cached: true }),
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 100, cached: false }),
    ];
    expect(aggregateUsage(mixed)?.cached).toBeUndefined();
  });
});

// ── Per-node result aggregator ──────────────────────────────────────

describe("aggregateRepResults", () => {
  const opts = { thresholds: DEFAULT_THRESHOLDS };

  it("re-classifies the verdict from the aggregated metrics (defangs single-draw variance)", () => {
    // rep0: Jaccard 1.0 (ε-equivalent), rep1: Jaccard 0.0 (divergent_structural),
    // rep2: Jaccard 0.6 (ε-equivalent). Median Jaccard = 0.6, median LoC = 0.1.
    // → verdict should be ε-equivalent (jaccard ≥ 0.5 AND loc < 0.3).
    const reps = [
      okResult("n", metrics(0.0, 1.0), "epsilon_equivalent"),
      okResult("n", metrics(0.2, 0.0), "divergent_structural"),
      okResult("n", metrics(0.1, 0.6), "epsilon_equivalent"),
    ];
    const agg = aggregateRepResults(reps, opts);
    expect(agg.verdict).toBe("epsilon_equivalent");
    expect(agg.metrics?.structuralJaccard).toBeCloseTo(0.6, 10);
    expect(agg.ok).toBe(true);
  });

  it("preserves the full per-rep sequence in the reps telemetry", () => {
    const reps = [
      okResult("n", metrics(0.0, 1.0), "epsilon_equivalent"),
      okResult("n", metrics(0.2, 0.5), "epsilon_equivalent"),
      okResult("n", metrics(0.4, 0.3), "divergent_both"),
    ];
    const agg = aggregateRepResults(reps, opts);
    expect(agg.reps?.count).toBe(3);
    expect(agg.reps?.aggregator).toBe(DEFAULT_AGGREGATOR);
    expect(agg.reps?.perRepVerdicts).toEqual([
      "epsilon_equivalent",
      "epsilon_equivalent",
      "divergent_both",
    ]);
    expect(agg.reps?.perRepMetrics).toHaveLength(3);
    expect(agg.reps?.perRepMetrics[0]?.structuralJaccard).toBe(1.0);
    expect(agg.reps?.successCount).toBe(3);
  });

  it("returns unrecoverable when ALL reps failed (no metrics to aggregate)", () => {
    const reps = [
      unrecoverable("n", "compile error A"),
      unrecoverable("n", "compile error B"),
    ];
    const agg = aggregateRepResults(reps, opts);
    expect(agg.ok).toBe(false);
    expect(agg.verdict).toBe("unrecoverable");
    expect(agg.failure).toBe("compile error A");
    expect(agg.metrics).toBeUndefined();
    expect(agg.reps?.successCount).toBe(0);
  });

  it("aggregates only the ok reps when the cohort is mixed (some unrecoverable)", () => {
    const reps = [
      unrecoverable("n"),
      okResult("n", metrics(0.1, 0.8), "epsilon_equivalent"),
      okResult("n", metrics(0.2, 0.7), "epsilon_equivalent"),
    ];
    const agg = aggregateRepResults(reps, opts);
    expect(agg.ok).toBe(true);
    expect(agg.verdict).toBe("epsilon_equivalent");
    // median Jaccard over the two ok reps = 0.75
    expect(agg.metrics?.structuralJaccard).toBeCloseTo(0.75, 10);
    expect(agg.reps?.successCount).toBe(2);
    expect(agg.reps?.count).toBe(3);
  });

  it("sums usage across all reps", () => {
    const reps = [
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 100, costUSD: 0.01 }),
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 200, costUSD: 0.02 }),
      okResult("n", metrics(0, 1), "epsilon_equivalent", { totalTokens: 150, costUSD: 0.015 }),
    ];
    const agg = aggregateRepResults(reps, opts);
    expect(agg.usage?.totalTokens).toBe(450);
    expect(agg.usage?.costUSD).toBeCloseTo(0.045, 10);
  });

  it("uses 'mean' aggregator when requested", () => {
    const reps = [
      okResult("n", metrics(0.1, 1.0), "epsilon_equivalent"),
      okResult("n", metrics(0.5, 0.0), "divergent_both"),
    ];
    const agg = aggregateRepResults(reps, { ...opts, aggregator: "mean" });
    // mean Jaccard = 0.5 → ε-equivalent (just at the threshold)
    // mean LoC = 0.3 → at the LoC threshold (locDistance < 0.3 fails)
    // → divergent_loc
    expect(agg.metrics?.structuralJaccard).toBeCloseTo(0.5, 10);
    expect(agg.metrics?.locDistance).toBeCloseTo(0.3, 10);
    expect(agg.verdict).toBe("divergent_loc");
    expect(agg.reps?.aggregator).toBe("mean");
  });

  it("carries dispatchModel from the first rep (verify --provider/--model held constant across reps)", () => {
    const reps = [
      okResult("n", metrics(0, 1), "epsilon_equivalent"),
      okResult("n", metrics(0, 1), "epsilon_equivalent"),
    ];
    const agg = aggregateRepResults(reps, opts);
    expect(agg.dispatchModel).toEqual({ provider: "ollama", model: "qwen2.5-coder:7b" });
  });

  it("regenPath points at the LAST successful rep's staging file (the file actually on disk)", () => {
    const reps = [
      okResult("n", metrics(0, 1), "epsilon_equivalent"),
      okResult("n", metrics(0, 1), "epsilon_equivalent"),
    ];
    const agg = aggregateRepResults(reps, opts);
    expect(agg.regenPath).toBe(".ontology/verify/a.ts");
  });

  it("throws on an empty rep list", () => {
    expect(() => aggregateRepResults([], opts)).toThrow();
  });
});
