import { z } from "zod";

// Phase ε E6 step 4 — high-confidence ensemble for structured
// extraction. Currently wired only for ingest's semantic_parse path.
//
// Background. The bake-off (BAKEOFF_3B_FAMILY_2026-05-15.md §2.2)
// measured llama3.2:3b on a curated 20-file subset and observed that
// its failures are STOCHASTIC with zero rep-to-rep overlap — the
// model loses different files each run. Ensembling × 3 reps therefore
// reaches 100% coverage on the bake-off subset at ~70 s/file
// wall-clock on M1-class hardware. qwen2.5-coder:3b, by contrast, is
// deterministic at 95% — ensembling does not help because the one
// file it fails on fails every time. The high-confidence mode
// hard-codes the calibrated stochastic-complementary model;
// downstream variants (e.g. a "qwen + llama mixed ensemble" for
// pathological cases) are out of scope here.
//
// This module ships only the pure pieces (mode enum + constants +
// selection helper). The orchestrator that actually runs N attempts
// lives next to the existing extractIntentFromFile in
// commands/ingest/index.ts because it reuses that function as its
// per-attempt primitive — keeping it there avoids a circular import
// with ExtractionResult and keeps single-run / ensemble paths
// adjacent for review.

// ── Mode enum ───────────────────────────────────────────────────────────────

export const ENSEMBLE_MODES = ["none", "high-confidence"] as const;
export const EnsembleModeSchema = z.enum(ENSEMBLE_MODES);
export type EnsembleMode = z.infer<typeof EnsembleModeSchema>;

// ── Calibrated constants (from BAKEOFF_3B_FAMILY_2026-05-15.md §2.2 + §6) ──

export const HIGH_CONFIDENCE_MODEL = "llama3.2:3b";
export const HIGH_CONFIDENCE_REPS = 3;

// ── Pure selection helper ──────────────────────────────────────────────────

/**
 * Return the index of the highest-scoring candidate. Ties go to the
 * earliest (deterministic — operators expect ensemble output to be
 * reproducible across re-runs when the underlying dispatches
 * happened to produce identical results). Empty input returns
 * `undefined`.
 *
 * Pure: caller supplies the score function. Keeping the function
 * generic means the bake-off-specific "score by completeness"
 * lives next to the ExtractionResult schema in ingest/index.ts,
 * not here.
 */
export function selectBestByScore<T>(
  candidates: readonly T[],
  score: (candidate: T) => number,
): number | undefined {
  if (candidates.length === 0) return undefined;
  let bestIdx = 0;
  let bestScore = score(candidates[0]);
  for (let i = 1; i < candidates.length; i++) {
    const s = score(candidates[i]);
    if (s > bestScore) {
      bestIdx = i;
      bestScore = s;
    }
  }
  return bestIdx;
}

// ── Metadata shapes ────────────────────────────────────────────────────────

/**
 * Per-run outcome of one attempt in an ensemble pass. Generic over
 * the value type so the caller can carry whatever the underlying
 * primitive produces (a parsed extraction, a raw response, etc.).
 */
export interface EnsembleRunOutcome<T> {
  /** 1-based attempt number. */
  attempt: number;
  /** Whether the attempt's validation succeeded. */
  ok: boolean;
  /** The validated value when ok. */
  value?: T;
  /** Concise human reason when !ok — fed back into the
   * `ensemble_failed` error message so the operator sees per-run
   * detail without spelunking through logs. */
  failureReason?: string;
  /** Wall-clock of this attempt (including any retries inside it). */
  wallClockMs: number;
}

/**
 * Persisted ensemble metadata — what we tell the operator about a
 * file that went through the ensemble path. Surfaces in the INGEST
 * report's per-file table when present.
 */
export interface EnsembleMetadata {
  mode: "high-confidence";
  model: string;
  /** N intended (3 for high-confidence). */
  repetitions: number;
  /** Of the N attempts, how many produced a valid extraction. */
  validCount: number;
  /** N − validCount. */
  failedCount: number;
  /** 1-based attempt number of the selected winner; undefined when
   * all N failed. */
  selectedAttempt?: number;
}

export const EnsembleMetadataSchema = z.object({
  mode: z.literal("high-confidence"),
  model: z.string(),
  repetitions: z.number().int().positive(),
  validCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  selectedAttempt: z.number().int().positive().optional(),
});
