// Verdict-map variance — the quantitative half of the §3.10 adjoint claim.
//
// MATHEMATICAL_CLAIMS.md §3.10 ("compile adjoint") is T2 and CANNOT honestly
// reach a binary-determinism T1, because production LLM inference is not
// bit-deterministic even at temperature 0 (server batching, fp nondeterminism).
// The honest object is therefore a *probabilistic* functor G with a natural
// transformation η: id_C ⇒ F∘G valued in a category enriched over probability
// distributions — not a Set-functor. For an enriched/probabilistic adjoint the
// right rigor artefact is not "prove determinism" but "MEASURE the spread":
// run G∘F N times on the same source and quantify how concentrated the verdict
// distribution is. Concentration → 1 (zero entropy) recovers the deterministic
// idealisation as a limiting case; the measured spread IS the ε.
//
// This module is the deterministic measurement core. It is pure (no LLM, no
// clock, no randomness) and reuses the test-pinned fold from
// verify-homeomorphism.ts, so it is unit-testable now. Feeding it N identical
// samples (what the deterministic `mock` provider yields) gives agreement = 1
// / entropy = 0, which validates the plumbing. Feeding it N real-LLM samples
// quantifies the adjoint's stochasticity — that run is budget/frontier-gated
// (an 8 GB local box cannot host an adequate model; see ROADMAP), so this file
// ships the core and the real N-run generation is deferred, not faked.

import {
  computeDistanceMetrics,
  classifyVerdict,
  emptyVerdictCounts,
  type HomeomorphismVerdict,
  type VerdictThresholds,
  type LanguageHint,
  DEFAULT_THRESHOLDS,
} from "./verify-homeomorphism.js";

/**
 * One stochastic G∘F sample for a node: either the regenerated source text, or
 * `null` when compile-back failed (verdict "unrecoverable" — the fold is not
 * invoked for that case, matching verify-homeomorphism's contract).
 */
export type RegenSample = string | null;

export interface NodeVarianceReport {
  nodeId: string;
  /** Number of samples folded. */
  n: number;
  /** Count per verdict label across the N samples. */
  verdictCounts: Record<HomeomorphismVerdict, number>;
  /** The most frequent verdict (ties broken by the label order in emptyVerdictCounts). */
  modalVerdict: HomeomorphismVerdict;
  /** Fraction of samples equal to the modal verdict. 1.0 ⇔ the verdict map is reproduced deterministically. */
  agreementRate: number;
  /** Shannon entropy (bits) of the verdict distribution. 0 ⇔ deterministic; grows with spread. */
  verdictEntropyBits: number;
  /** Mean / population-stdev of the continuous metrics over the recoverable samples (excludes nulls). */
  jaccardMean: number;
  jaccardStdev: number;
  locMean: number;
  locStdev: number;
  /** Recoverable sample count (non-null); the metric stats are over these. */
  recoverable: number;
}

function meanStdev(xs: number[]): { mean: number; stdev: number } {
  if (xs.length === 0) return { mean: 0, stdev: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length;
  return { mean, stdev: Math.sqrt(variance) };
}

function entropyBits(counts: Record<HomeomorphismVerdict, number>, n: number): number {
  if (n === 0) return 0;
  let h = 0;
  for (const k of Object.keys(counts) as HomeomorphismVerdict[]) {
    const p = counts[k] / n;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Fold N samples of a single node through the verify-homeomorphism distance →
 * verdict pipeline and summarise the spread. Pure and deterministic: same
 * inputs → same report (the only nondeterminism in the real pipeline lives in
 * how the `samples` were generated upstream, which is exactly what we measure).
 */
export function measureNodeVariance(
  nodeId: string,
  original: string,
  samples: RegenSample[],
  language: LanguageHint,
  thresholds: VerdictThresholds = DEFAULT_THRESHOLDS,
): NodeVarianceReport {
  const verdictCounts = emptyVerdictCounts();
  const jaccards: number[] = [];
  const locs: number[] = [];

  for (const sample of samples) {
    if (sample === null) {
      verdictCounts.unrecoverable += 1;
      continue;
    }
    const metrics = computeDistanceMetrics(original, sample, language, `<${nodeId}>`);
    const verdict = classifyVerdict(metrics, thresholds);
    verdictCounts[verdict] += 1;
    jaccards.push(metrics.structuralJaccard);
    locs.push(metrics.locDistance);
  }

  const n = samples.length;
  // Modal verdict: max count, ties broken by stable key order.
  let modalVerdict: HomeomorphismVerdict = "unrecoverable";
  let best = -1;
  for (const k of Object.keys(verdictCounts) as HomeomorphismVerdict[]) {
    if (verdictCounts[k] > best) {
      best = verdictCounts[k];
      modalVerdict = k;
    }
  }

  const jac = meanStdev(jaccards);
  const loc = meanStdev(locs);

  return {
    nodeId,
    n,
    verdictCounts,
    modalVerdict,
    agreementRate: n === 0 ? 0 : best / n,
    verdictEntropyBits: entropyBits(verdictCounts, n),
    jaccardMean: jac.mean,
    jaccardStdev: jac.stdev,
    locMean: loc.mean,
    locStdev: loc.stdev,
    recoverable: jaccards.length,
  };
}

export interface AggregateVarianceReport {
  nodeCount: number;
  /** Mean agreement rate across nodes. 1.0 ⇔ every node's verdict reproduced deterministically. */
  meanAgreementRate: number;
  /** Mean verdict entropy (bits) across nodes. 0 ⇔ deterministic verdict map. */
  meanVerdictEntropyBits: number;
  /** Fraction of nodes whose verdict never varied across samples (agreement == 1). */
  fullyDeterministicFraction: number;
  /** Mean structural-Jaccard stdev across nodes — the continuous-metric spread. */
  meanJaccardStdev: number;
  perNode: NodeVarianceReport[];
}

/** Aggregate per-node variance reports into a single adjoint-stability summary. */
export function aggregateVariance(perNode: NodeVarianceReport[]): AggregateVarianceReport {
  const nodeCount = perNode.length;
  if (nodeCount === 0) {
    return {
      nodeCount: 0,
      meanAgreementRate: 0,
      meanVerdictEntropyBits: 0,
      fullyDeterministicFraction: 0,
      meanJaccardStdev: 0,
      perNode: [],
    };
  }
  const mean = (f: (r: NodeVarianceReport) => number) => perNode.reduce((a, r) => a + f(r), 0) / nodeCount;
  return {
    nodeCount,
    meanAgreementRate: mean((r) => r.agreementRate),
    meanVerdictEntropyBits: mean((r) => r.verdictEntropyBits),
    fullyDeterministicFraction: perNode.filter((r) => r.agreementRate === 1).length / nodeCount,
    meanJaccardStdev: mean((r) => r.jaccardStdev),
    perNode,
  };
}
