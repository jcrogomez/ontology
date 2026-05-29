// Per-node round-trip loss diagnostic (Phase ε).
//
// The structural fidelity headline (mean Jaccard) collapses two very
// different failure modes into one number. This module decomposes the
// F∘G round-trip loss per node into its two directions:
//
//   - RECALL loss  — declarations in the ORIGINAL that the regen
//                    DROPPED   (A \ B). Low recall = "G/F forgot things".
//   - PRECISION loss — declarations the regen OVER-EMITTED that were
//                    NOT in the original (B \ A). Low precision =
//                    "F invented things" (the over-stuffing failure).
//
// where A = original top-level declarations (set), B = regen's. The
// structural Jaccard is J = |A∩B| / |A∪B|; recall = |A∩B|/|A|,
// precision = |A∩B|/|B|. A node can have a low Jaccard from EITHER
// direction, and the aggregate declaration count hides this (a repo
// can under-emit overall while individual nodes wildly over-emit).
//
// Pure: no IO, no LLM. Operates on the `originalDeclarations` /
// `regenDeclarations` arrays that `computeDistanceMetrics`
// (verify-homeomorphism.ts) already produces and that the verify
// report serialises per node — so it runs $0 on any existing run's
// sidecar JSON. Complementary to export-recovery.ts (exact recall of
// the AST `mandatoryExports` set) and vocab-gap.ts (loose word overlap
// on conceptual `provides` keys); this is the symbol-level
// precision+recall split with the offending names named.

export interface NodeLoss {
  nodeId: string;
  /** |A∩B| / |A∪B| — recomputed here from the sets for self-consistency. */
  jaccard: number;
  /** |A∩B| / |A| — fraction of the original's declarations that survived. */
  recall: number;
  /** |A∩B| / |B| — fraction of the regen's declarations that were legitimate. */
  precision: number;
  /** Declarations present in both (A∩B). */
  preserved: string[];
  /** In the original, missing from the regen (A\B) — recall loss. */
  dropped: string[];
  /** In the regen, absent from the original (B\A) — precision loss / over-emit. */
  overEmitted: string[];
  originalCount: number;
  regenCount: number;
}

function ratio(numerator: number, denominator: number): number {
  // Vacuous-truth convention matches structuralJaccard: an empty
  // denominator means "nothing to lose", so the fraction is 1.
  return denominator === 0 ? 1 : numerator / denominator;
}

export function computeNodeLoss(
  nodeId: string,
  originalDeclarations: readonly string[],
  regenDeclarations: readonly string[],
): NodeLoss {
  const a = new Set(originalDeclarations);
  const b = new Set(regenDeclarations);
  const preserved: string[] = [];
  const dropped: string[] = [];
  for (const x of a) (b.has(x) ? preserved : dropped).push(x);
  const overEmitted: string[] = [];
  for (const y of b) if (!a.has(y)) overEmitted.push(y);
  const inter = preserved.length;
  const union = a.size + b.size - inter;
  preserved.sort();
  dropped.sort();
  overEmitted.sort();
  return {
    nodeId,
    jaccard: union === 0 ? 1 : inter / union,
    recall: ratio(inter, a.size),
    precision: ratio(inter, b.size),
    preserved,
    dropped,
    overEmitted,
    originalCount: a.size,
    regenCount: b.size,
  };
}

export interface LossAggregate {
  nodeCount: number;
  /** Nodes with a perfect round trip (jaccard === 1). */
  perfectCount: number;
  meanJaccard: number;
  meanRecall: number;
  meanPrecision: number;
  /** Σ dropped / Σ over-emitted across all nodes. */
  totalDropped: number;
  totalOverEmitted: number;
  totalOriginal: number;
  totalRegen: number;
  /**
   * Which failure direction dominates. recall-bound = dropping is the
   * bigger problem (meanRecall < meanPrecision); precision-bound =
   * over-emitting dominates; balanced when they are within `0.05`.
   */
  dominantFailure: "recall-bound" | "precision-bound" | "balanced";
  /** Imperfect nodes ranked by most dropped (recall loss), worst first. */
  worstDroppers: NodeLoss[];
  /** Imperfect nodes ranked by most over-emitted (precision loss), worst first. */
  worstOverEmitters: NodeLoss[];
}

export function aggregateLoss(
  nodeLosses: readonly NodeLoss[],
  topN = 10,
): LossAggregate {
  const n = nodeLosses.length;
  const sum = (f: (l: NodeLoss) => number) =>
    nodeLosses.reduce((acc, l) => acc + f(l), 0);
  const meanRecall = n === 0 ? 1 : sum((l) => l.recall) / n;
  const meanPrecision = n === 0 ? 1 : sum((l) => l.precision) / n;
  const imperfect = nodeLosses.filter((l) => l.jaccard < 1);
  const byDropped = [...imperfect]
    .filter((l) => l.dropped.length > 0)
    .sort((x, y) => y.dropped.length - x.dropped.length)
    .slice(0, topN);
  const byOver = [...imperfect]
    .filter((l) => l.overEmitted.length > 0)
    .sort((x, y) => y.overEmitted.length - x.overEmitted.length)
    .slice(0, topN);
  const gap = meanPrecision - meanRecall;
  return {
    nodeCount: n,
    perfectCount: nodeLosses.filter((l) => l.jaccard === 1).length,
    meanJaccard: n === 0 ? 1 : sum((l) => l.jaccard) / n,
    meanRecall,
    meanPrecision,
    totalDropped: sum((l) => l.dropped.length),
    totalOverEmitted: sum((l) => l.overEmitted.length),
    totalOriginal: sum((l) => l.originalCount),
    totalRegen: sum((l) => l.regenCount),
    dominantFailure:
      Math.abs(gap) <= 0.05 ? "balanced" : gap > 0 ? "recall-bound" : "precision-bound",
    worstDroppers: byDropped,
    worstOverEmitters: byOver,
  };
}

/**
 * Build the per-node loss table from anything shaped like the verify
 * report's `results[]` (each carrying `nodeId` + `metrics` with the
 * declaration arrays). Nodes without declaration metrics (unrecoverable
 * verdict, cache hit, dry run) are skipped.
 */
export function lossFromResults(
  results: ReadonlyArray<{
    nodeId: string;
    metrics?: {
      originalDeclarations?: readonly string[];
      regenDeclarations?: readonly string[];
    } | null;
  }>,
): NodeLoss[] {
  const out: NodeLoss[] = [];
  for (const r of results) {
    const m = r.metrics;
    if (!m || !Array.isArray(m.originalDeclarations) || !Array.isArray(m.regenDeclarations)) {
      continue;
    }
    out.push(computeNodeLoss(r.nodeId, m.originalDeclarations, m.regenDeclarations));
  }
  return out;
}
