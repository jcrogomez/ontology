import {
  classifyVerdict,
  type DistanceMetrics,
  type HomeomorphismVerdict,
  type VerdictThresholds,
  type VerificationResult,
  type VerificationUsage,
} from "./verify-homeomorphism.js";

// Per-node N-reps aggregator — Phase ε design item §4.2.
//
// γ surfaced a draw-level variance hazard: a single compile-back
// dispatch can land a structural Jaccard of 1.0 on one rep and 0.0
// on the next for the same node. A point-estimate verdict at reps=1
// is therefore an artifact of which draw the run happened to roll,
// not a measurement of the model's behaviour. Before the Opus 4.7
// ceiling probe spends money, the verify harness has to defang that
// variance.
//
// This module is the deterministic, no-LLM, no-IO reducer. Given N
// already-computed `VerificationResult`s for the same node (one per
// rep), it folds them into a single result whose metrics are the
// median or mean of the per-rep metrics, and whose verdict is re-
// derived from those aggregated metrics by the same `classifyVerdict`
// the single-draw path uses. Usage is summed (each rep was a real
// dispatch). Full per-rep transparency is preserved on the returned
// result so the JSON report still carries the underlying draws.
//
// Pure — testable without paying for any dispatch and unit-coverable
// across odd/even rep counts, all-unrecoverable cohorts, and mixed
// success/failure cohorts.

// ── Types ───────────────────────────────────────────────────────────

export type Aggregator = "median" | "mean";

export const DEFAULT_AGGREGATOR: Aggregator = "median";

export interface RepsAggregateOptions {
  /** Picker over the per-rep numeric metrics. Defaults to {@link DEFAULT_AGGREGATOR}. */
  aggregator?: Aggregator;
  /** Thresholds for re-classifying the verdict from the aggregated metrics. */
  thresholds: VerdictThresholds;
}

// ── Numeric reducers ────────────────────────────────────────────────

/**
 * Median of a non-empty numeric list. For even-length lists, returns
 * the arithmetic mean of the two middle values. Sorts a copy — does
 * not mutate the input.
 */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) {
    throw new Error("median: empty list");
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Arithmetic mean of a non-empty numeric list. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) {
    throw new Error("mean: empty list");
  }
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function pick(aggregator: Aggregator, xs: readonly number[]): number {
  return aggregator === "median" ? median(xs) : mean(xs);
}

// ── Distance metrics aggregator ─────────────────────────────────────

/**
 * Fold N per-rep {@link DistanceMetrics} into a single aggregated
 * metrics record. The numeric axes (`locDistance`, `structuralJaccard`,
 * `regenLineCount`) are reduced under the chosen aggregator. The
 * deterministic axes (`originalLineCount`, `originalDeclarations`) are
 * carried over from the first rep (they're functions of the unchanged
 * source file). The `regenDeclarations` field is taken from the rep
 * whose structuralJaccard is closest to the aggregated Jaccard — that
 * way the headline declaration list is a *real* draw, not a synthetic
 * chimera.
 */
export function aggregateDistanceMetrics(
  reps: readonly DistanceMetrics[],
  aggregator: Aggregator = DEFAULT_AGGREGATOR,
): DistanceMetrics {
  if (reps.length === 0) {
    throw new Error("aggregateDistanceMetrics: empty rep list");
  }
  const locValues = reps.map((r) => r.locDistance);
  const jaccardValues = reps.map((r) => r.structuralJaccard);
  const regenLineValues = reps.map((r) => r.regenLineCount);

  const aggLoc = pick(aggregator, locValues);
  const aggJaccard = pick(aggregator, jaccardValues);
  const aggRegenLines = Math.round(pick(aggregator, regenLineValues));

  // Pick the rep whose Jaccard is closest to the aggregated Jaccard
  // as the representative draw for `regenDeclarations`. Ties broken by
  // first occurrence (stable for determinism).
  let bestIdx = 0;
  let bestDiff = Math.abs(jaccardValues[0] - aggJaccard);
  for (let i = 1; i < reps.length; i++) {
    const d = Math.abs(jaccardValues[i] - aggJaccard);
    if (d < bestDiff) {
      bestIdx = i;
      bestDiff = d;
    }
  }

  return {
    locDistance: aggLoc,
    structuralJaccard: aggJaccard,
    originalLineCount: reps[0].originalLineCount,
    regenLineCount: aggRegenLines,
    originalDeclarations: reps[0].originalDeclarations,
    regenDeclarations: reps[bestIdx].regenDeclarations,
  };
}

// ── Usage aggregator ────────────────────────────────────────────────

/**
 * Sum per-rep usage telemetry. Cost and tokens add across reps (every
 * rep is a real dispatch); `cached` is true iff EVERY rep was a cache
 * hit (the conservative interpretation — if any rep paid, the
 * aggregate paid). Returns `undefined` when no rep carried usage.
 */
export function aggregateUsage(
  reps: readonly VerificationResult[],
): VerificationUsage | undefined {
  const withUsage = reps.filter((r): r is VerificationResult & { usage: VerificationUsage } => !!r.usage);
  if (withUsage.length === 0) return undefined;
  const agg: VerificationUsage = {};
  let promptSum = 0;
  let completionSum = 0;
  let totalSum = 0;
  let costSum = 0;
  let promptDefined = false;
  let completionDefined = false;
  let totalDefined = false;
  let costDefined = false;
  let allCached = true;
  for (const r of withUsage) {
    const u = r.usage;
    if (u.promptTokens !== undefined) {
      promptSum += u.promptTokens;
      promptDefined = true;
    }
    if (u.completionTokens !== undefined) {
      completionSum += u.completionTokens;
      completionDefined = true;
    }
    if (u.totalTokens !== undefined) {
      totalSum += u.totalTokens;
      totalDefined = true;
    }
    if (u.costUSD !== undefined) {
      costSum += u.costUSD;
      costDefined = true;
    }
    if (!u.cached) allCached = false;
  }
  if (promptDefined) agg.promptTokens = promptSum;
  if (completionDefined) agg.completionTokens = completionSum;
  if (totalDefined) agg.totalTokens = totalSum;
  if (costDefined) agg.costUSD = costSum;
  if (allCached) agg.cached = true;
  return agg;
}

// ── Per-node result aggregator ──────────────────────────────────────

/**
 * Telemetry attached to an aggregated multi-rep result so the report
 * carries the underlying draws and the aggregator that folded them.
 * The single-rep code path leaves this undefined.
 */
export interface RepsTelemetry {
  /** Number of reps that actually ran. */
  count: number;
  /** Which numeric aggregator folded the metrics. */
  aggregator: Aggregator;
  /** Per-rep metrics, in run order. Undefined entries = `unrecoverable` reps. */
  perRepMetrics: Array<DistanceMetrics | null>;
  /** Per-rep verdicts, in run order. */
  perRepVerdicts: HomeomorphismVerdict[];
  /** Count of reps where compile-back succeeded (ok=true). */
  successCount: number;
}

/**
 * Fold N {@link VerificationResult}s for the same node into one
 * aggregated result. Metrics are aggregated under {@link aggregateDistanceMetrics}
 * over reps that succeeded (ok=true and metrics present); the verdict
 * is re-classified from the aggregated metrics via {@link classifyVerdict}.
 * Usage is summed across all reps.
 *
 * **Edge cases:**
 * - Empty rep list → throws (callers must have at least one rep).
 * - All reps unrecoverable → returns an unrecoverable aggregate with
 *   the first failure message attached.
 * - Mixed (some ok, some unrecoverable) → aggregates only the ok reps
 *   for metrics, but the aggregate `ok` field reflects "at least one
 *   rep succeeded". The telemetry preserves the full sequence.
 *
 * The aggregate `regenPath` is taken from the last successful rep
 * (since each rep overwrote the same staging path; the file on disk
 * is the last one written).
 */
export function aggregateRepResults(
  reps: readonly VerificationResult[],
  options: RepsAggregateOptions,
): VerificationResult {
  if (reps.length === 0) {
    throw new Error("aggregateRepResults: empty rep list");
  }
  const aggregator = options.aggregator ?? DEFAULT_AGGREGATOR;
  const first = reps[0];
  const okReps = reps.filter(
    (r): r is VerificationResult & { metrics: DistanceMetrics } =>
      r.ok && !!r.metrics,
  );

  const perRepMetrics: Array<DistanceMetrics | null> = reps.map(
    (r) => r.metrics ?? null,
  );
  const perRepVerdicts = reps.map((r) => r.verdict);
  const telemetry: RepsTelemetry = {
    count: reps.length,
    aggregator,
    perRepMetrics,
    perRepVerdicts,
    successCount: okReps.length,
  };

  const usage = aggregateUsage(reps);
  const dispatchModel = first.dispatchModel;

  // All-unrecoverable cohort: no metrics to aggregate.
  if (okReps.length === 0) {
    const failure =
      reps.find((r) => r.failure !== undefined)?.failure ??
      "all reps unrecoverable";
    return {
      nodeId: first.nodeId,
      sourceFile: first.sourceFile,
      ok: false,
      failure,
      verdict: "unrecoverable",
      thresholds: options.thresholds,
      ...(usage ? { usage } : {}),
      ...(dispatchModel ? { dispatchModel } : {}),
      reps: telemetry,
    };
  }

  // ≥1 successful rep: aggregate metrics, reclassify verdict.
  const aggMetrics = aggregateDistanceMetrics(
    okReps.map((r) => r.metrics),
    aggregator,
  );
  const verdict = classifyVerdict(aggMetrics, options.thresholds);
  // Last successful rep wrote the staging file; that's the regenPath
  // a consumer would find on disk.
  const lastOk = okReps[okReps.length - 1];
  const regenPath = lastOk.regenPath;

  return {
    nodeId: first.nodeId,
    sourceFile: first.sourceFile,
    ok: true,
    ...(regenPath !== undefined ? { regenPath } : {}),
    metrics: aggMetrics,
    verdict,
    thresholds: options.thresholds,
    ...(usage ? { usage } : {}),
    ...(dispatchModel ? { dispatchModel } : {}),
    reps: telemetry,
  };
}
