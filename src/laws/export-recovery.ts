import { z } from "zod";

// Export-recovery metric — Phase ε Move 3α candado #2.
//
// The δ' synthesis line that motivates this metric:
//
//   > "the compile-back model still drops 488 of them across the
//   >  perimeter. The model is acknowledging the contract structurally
//   >  and ignoring it semantically."
//
// vocab-gap.ts measures the LOOSE asymmetry between the CONCEPTUAL
// provides keys (G said) and the artifact's actual exports (F
// produced) — useful for detecting drift between intent vocabulary
// and implementation vocabulary, with permissive word-token overlap.
//
// This module measures something tighter and complementary: the
// EXACT preservation of the source AST's export identifiers across
// compile-back. Inputs are two identifier lists (AST-derived
// mandatoryExports and the regenerated file's actual top-level
// declarations). The contract that this metric answers:
//
//   "Did F preserve each name the source AST mandated?"
//
// Move 3α candado #2 (user-pre-registered): the score must live on
// the regenerated OUTPUT, not on the prompt. A prompt-level metric
// rewards models that recite mandatoryExports verbatim in the bullet
// list ("dump") without weaving them into the regenerated TypeScript
// ("weave"). Measuring at the output forces the only thing that
// actually matters: does the export survive into the .ts file?
//
// Combined with the AST grounding system-prompt section (`ast-
// grounding.ts`), the experiment compares model arms by their ability
// to translate a deterministic ground-truth constraint into actual
// code, not just into well-formed prose.

export interface CompileBackExportIntegration {
  /** AST-mandated exports the regen needs to preserve. */
  astExportsCount: number;
  /** Top-level exports the regen actually produced. */
  regeneratedExportsCount: number;
  /** Subset of mandatoryExports that appear in the regen, exact-match. */
  recoveredMandatoryExports: string[];
  /** Mandatory exports the regen omitted (AST − regen). */
  missingMandatoryExports: string[];
  /** Regen exports the source AST did not declare (regen − AST). */
  hallucinatedExports: string[];
  /**
   * Recovery rate: |recovered| / |mandatory|. Returns 1.0 when AST has
   * no exports (vacuously perfect — there was nothing to recover).
   * The principal score for 3α: a higher rate means the model is
   * weaving the AST-grounded names into the regenerated code, not
   * just dumping them in the prompt.
   */
  exportRecoveryRate: number;
  /**
   * Hallucination rate: |hallucinated| / |regenerated|. Returns 0
   * when the regen produced no exports. Complementary to recovery —
   * a model can have high recovery and high hallucination if it
   * emits the AST exports plus a pile of invented ones.
   */
  hallucinationRate: number;
  /** True iff the regen's exact export set equals the AST's exact
   * export set (no missing, no hallucinated). The strictest pass/fail
   * line — what an ideal compile-back returns. */
  exactExportSetMatch: boolean;
}

/**
 * Compute the per-node export integration between an AST-derived
 * mandatory list and the regen's actual top-level declarations.
 * Pure — no IO. Order of input arrays does not affect set semantics
 * but does affect the order of the output lists, which preserve input
 * order (recovered / missing follow AST order, hallucinated follows
 * regen order).
 */
export function computeExportRecovery(
  astExports: readonly string[],
  regeneratedExports: readonly string[],
): CompileBackExportIntegration {
  const astSet = new Set(astExports);
  const regenSet = new Set(regeneratedExports);
  const recoveredMandatoryExports: string[] = [];
  const missingMandatoryExports: string[] = [];
  for (const e of astExports) {
    if (regenSet.has(e)) recoveredMandatoryExports.push(e);
    else missingMandatoryExports.push(e);
  }
  const hallucinatedExports: string[] = [];
  for (const r of regeneratedExports) {
    if (!astSet.has(r)) hallucinatedExports.push(r);
  }
  const astExportsCount = astExports.length;
  const regeneratedExportsCount = regeneratedExports.length;
  const exportRecoveryRate =
    astExportsCount === 0
      ? 1.0
      : recoveredMandatoryExports.length / astExportsCount;
  const hallucinationRate =
    regeneratedExportsCount === 0
      ? 0
      : hallucinatedExports.length / regeneratedExportsCount;
  const exactExportSetMatch =
    missingMandatoryExports.length === 0 && hallucinatedExports.length === 0;
  return {
    astExportsCount,
    regeneratedExportsCount,
    recoveredMandatoryExports,
    missingMandatoryExports,
    hallucinatedExports,
    exportRecoveryRate,
    hallucinationRate,
    exactExportSetMatch,
  };
}

// ── Aggregate across nodes ──────────────────────────────────────────

export interface ExportRecoveryAggregate {
  /** Number of nodes with at least one AST export — only these contribute
   * to the recovery-rate mean (files with no AST exports are vacuously
   * perfect and not informative for the 3α comparison). */
  nodesWithMandatory: number;
  /** Total mandatory exports across all qualifying nodes. */
  totalMandatory: number;
  /** Total recovered across all qualifying nodes. */
  totalRecovered: number;
  /** Total missing across all qualifying nodes. */
  totalMissing: number;
  /** Total hallucinated across all qualifying nodes. */
  totalHallucinated: number;
  /** Micro-averaged recovery rate: totalRecovered / totalMandatory.
   * The single number 3α reports as the principal axis result. */
  microRecoveryRate: number;
  /** Macro-averaged recovery rate: mean of per-node rates over
   * qualifying nodes. Complementary to micro; reports how the average
   * file fared (one large file with 60 exports can dominate micro). */
  macroRecoveryRate: number;
  /** Files that achieved exactExportSetMatch — the strict pass count. */
  exactMatchCount: number;
}

export function aggregateExportRecovery(
  reports: ReadonlyArray<{ nodeId: string; recovery: CompileBackExportIntegration }>,
): ExportRecoveryAggregate {
  let nodesWithMandatory = 0;
  let totalMandatory = 0;
  let totalRecovered = 0;
  let totalMissing = 0;
  let totalHallucinated = 0;
  let sumPerNodeRate = 0;
  let exactMatchCount = 0;
  for (const r of reports) {
    if (r.recovery.astExportsCount === 0) continue;
    nodesWithMandatory += 1;
    totalMandatory += r.recovery.astExportsCount;
    totalRecovered += r.recovery.recoveredMandatoryExports.length;
    totalMissing += r.recovery.missingMandatoryExports.length;
    totalHallucinated += r.recovery.hallucinatedExports.length;
    sumPerNodeRate += r.recovery.exportRecoveryRate;
    if (r.recovery.exactExportSetMatch) exactMatchCount += 1;
  }
  const microRecoveryRate =
    totalMandatory === 0 ? 0 : totalRecovered / totalMandatory;
  const macroRecoveryRate =
    nodesWithMandatory === 0 ? 0 : sumPerNodeRate / nodesWithMandatory;
  return {
    nodesWithMandatory,
    totalMandatory,
    totalRecovered,
    totalMissing,
    totalHallucinated,
    microRecoveryRate,
    macroRecoveryRate,
    exactMatchCount,
  };
}

// ── Zod schemas ─────────────────────────────────────────────────────

export const CompileBackExportIntegrationSchema = z.object({
  astExportsCount: z.number().int().nonnegative(),
  regeneratedExportsCount: z.number().int().nonnegative(),
  recoveredMandatoryExports: z.array(z.string()),
  missingMandatoryExports: z.array(z.string()),
  hallucinatedExports: z.array(z.string()),
  exportRecoveryRate: z.number().min(0).max(1),
  hallucinationRate: z.number().min(0).max(1),
  exactExportSetMatch: z.boolean(),
});

export const ExportRecoveryAggregateSchema = z.object({
  nodesWithMandatory: z.number().int().nonnegative(),
  totalMandatory: z.number().int().nonnegative(),
  totalRecovered: z.number().int().nonnegative(),
  totalMissing: z.number().int().nonnegative(),
  totalHallucinated: z.number().int().nonnegative(),
  microRecoveryRate: z.number().min(0).max(1),
  macroRecoveryRate: z.number().min(0).max(1),
  exactMatchCount: z.number().int().nonnegative(),
});
