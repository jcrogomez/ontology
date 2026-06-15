import { z } from "zod";
import type { CompileBackExportIntegration } from "./export-recovery.js";

// Failure-mode tagger for Move 3α — minimal grounding-focused set.
//
// The δ' synthesis showed a single per-node verdict ("unrecoverable",
// "divergent_loc", "divergent_structural", "divergent_both",
// "epsilon_equivalent") is coarse — two nodes with the same verdict
// often fail for different reasons, and 3α's experimental power comes
// from distinguishing those reasons across model arms.
//
// This tagger emits a structured set of failure modes per node,
// derived from data the verify pipeline already collects (verdict,
// failure message, export-recovery report). It is a labelling pass,
// not new measurement. Aggregation across nodes produces the
// model × file_kind × failure_mode tensor that the 3α-3γ bake-off
// will mine for routing-by-failure-mode decisions.
//
// The v0 set is grounding-focused (the 3α intervention's axis).
// Code-sketch generation-specific modes (typecheck_failed,
// invariant_loss, …) mature in 3γ when the bake-off across coding-
// specialized models needs them; adding them here without data to
// justify their granularity risks the same fossilisation pattern the
// premature router design fell into.

export type FailureMode =
  /** Regen omitted one or more AST-mandated exports. The dump-vs-weave
   * signal: AST grounding may be present in the system prompt yet the
   * model still fails to emit the names in the regenerated file. */
  | "missing_exports"
  /** Regen emitted exports not declared by the source AST. The opposite
   * failure: the model is inventing surface that the source doesn't
   * have, often when the contract is ambiguous or the model is
   * pattern-matching neighbouring code. */
  | "hallucinated_exports"
  /** Regen produced no exports despite the source AST having some.
   * The pathological dropout (qwen 3b on schemas/ontology.ts) — the
   * model gave up rather than partially fail. */
  | "empty_regen"
  /** Compile-back never produced a verifiable regen. Covers
   * dispatch_failed, write_failed, target_exists, runtime_failed.
   * Distinct from missing_exports — the artifact didn't exist at all. */
  | "compile_back_failed"
  /** Verify rejected the regen at the gluing check. The free-text
   * failure message names the gluing path — surface it structurally
   * so the matrix can bucket. */
  | "gluing_rejected"
  /** Verify produced an artifact that failed structural validation
   * (the failure message names schema / Zod / parser). Distinct from
   * compile_back_failed: bytes were written, but they didn't parse
   * as the expected TypeScript shape. */
  | "schema_invalid";

export const FailureModeSchema = z.enum([
  "missing_exports",
  "hallucinated_exports",
  "empty_regen",
  "compile_back_failed",
  "gluing_rejected",
  "schema_invalid",
]);

/**
 * Inputs the tagger needs to label one node. Plain data — no
 * dependencies on the verify pipeline's internal types beyond what's
 * already in scope. Callers pass these through from the matrix loop.
 */
export interface FailureModeTaggerInput {
  ok: boolean;
  failure: string | undefined;
  recovery: CompileBackExportIntegration;
}

/**
 * Tag one node with zero or more failure modes. Returns the modes in
 * a stable order (matches the FailureMode type's declaration order)
 * so test fixtures and matrix renderers don't drift on insertion.
 */
export function tagFailureModes(input: FailureModeTaggerInput): FailureMode[] {
  const modes: FailureMode[] = [];
  const compileFailed = !input.ok;
  if (compileFailed) modes.push("compile_back_failed");

  // The recovery-derived modes are meaningful only when the regen
  // produced exports to compare against. compile_back_failed already
  // covers the no-regen case; firing missing_exports + empty_regen on
  // top would double-count.
  if (!compileFailed) {
    const r = input.recovery;
    if (r.astExportsCount > 0) {
      if (r.regeneratedExportsCount === 0) {
        modes.push("empty_regen");
      } else if (r.missingMandatoryExports.length > 0) {
        modes.push("missing_exports");
      }
      if (r.hallucinatedExports.length > 0) {
        modes.push("hallucinated_exports");
      }
    }
  }

  // Free-text failure message heuristics. Conservative regexes —
  // false negatives (failure message phrasing changes upstream) are
  // preferable to false positives (a tag firing on unrelated text).
  if (input.failure !== undefined) {
    const f = input.failure.toLowerCase();
    if (/gluing|missing requirement|forbidden match|duplicate provider/.test(f)) {
      modes.push("gluing_rejected");
    }
    if (/schema|zod|parse|validate/.test(f) && !modes.includes("gluing_rejected")) {
      modes.push("schema_invalid");
    }
  }

  return modes;
}

// ── Aggregate across nodes ──────────────────────────────────────────

export interface FailureModeAggregate {
  /** Total nodes with at least one failure mode flagged. */
  affectedNodes: number;
  /** Total nodes inspected (denominator for rate views). */
  totalInspected: number;
  /** Per-mode counts. Every FailureMode key is present (zero when none
   * fired) so callers can render the table without branching. */
  counts: Record<FailureMode, number>;
  /** Per-node breakdown: nodeId → modes[]. Empty modes arrays for
   * clean nodes are included so a later 3γ join with the file-kind
   * classifier produces full cells (no implicit drop). */
  perNode: Array<{ nodeId: string; modes: FailureMode[] }>;
}

export function aggregateFailureModes(
  reports: ReadonlyArray<{ nodeId: string; modes: FailureMode[] }>,
): FailureModeAggregate {
  const counts: Record<FailureMode, number> = {
    missing_exports: 0,
    hallucinated_exports: 0,
    empty_regen: 0,
    compile_back_failed: 0,
    gluing_rejected: 0,
    schema_invalid: 0,
  };
  let affectedNodes = 0;
  for (const r of reports) {
    if (r.modes.length > 0) affectedNodes += 1;
    for (const m of r.modes) {
      counts[m] += 1;
    }
  }
  return {
    affectedNodes,
    totalInspected: reports.length,
    counts,
    perNode: reports.map((r) => ({ nodeId: r.nodeId, modes: [...r.modes] })),
  };
}

export const FailureModeAggregateSchema = z.object({
  affectedNodes: z.number().int().nonnegative(),
  totalInspected: z.number().int().nonnegative(),
  counts: z.object({
    missing_exports: z.number().int().nonnegative(),
    hallucinated_exports: z.number().int().nonnegative(),
    empty_regen: z.number().int().nonnegative(),
    compile_back_failed: z.number().int().nonnegative(),
    gluing_rejected: z.number().int().nonnegative(),
    schema_invalid: z.number().int().nonnegative(),
  }),
  perNode: z.array(
    z.object({
      nodeId: z.string(),
      modes: z.array(FailureModeSchema),
    }),
  ),
});
