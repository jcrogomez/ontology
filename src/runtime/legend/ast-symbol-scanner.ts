import * as fs from "node:fs";
import { parseTypeScriptFile } from "../static/typescript.js";

// AST symbol scanner (Phase ε Move 3α — grounding determinista).
//
// Reads a TypeScript source file and returns the deterministic list of
// exported identifiers as the AST sees them. The output is the ground
// truth that downstream consumers use to validate, repair, or constrain
// LLM-extracted contracts:
//
//   - Move 1c safety net: when an LLM extraction emits `provides: []`
//     for a file with N>0 AST-detected exports, fall back to the AST
//     list so the gluing check can match downstream `requires` (the
//     concrete cause of the context/types.ts and fibration/types.ts
//     stragglers — schemas/ontology.ts emitted empty provides because
//     qwen 3b gave up on the ~60-export file).
//
//   - Move 3α code_sketch injection: surface mandatoryExports to the
//     compile-back prompt as a deterministic MUST-emit constraint,
//     orthogonal to the LLM-extracted contract. δ' showed that the
//     extraction-side MANDATORY rule is acknowledged structurally and
//     ignored semantically by qwen 7b at compile-back; AST-derived
//     mandatoryExports inject the truth a second time, at the codegen
//     stage.
//
// Wildcard re-exports (`export * from "./x.js"`) produce no entries
// because they have no local name at the AST surface. Default exports
// are excluded from mandatoryExports because "default" is a position,
// not a symbol identifier — downstream provides/requires arrays match
// on named symbols, and a `requires: ["default"]` would never resolve.

export interface ASTSymbolScanResult {
  filePath: string;
  /** All exported identifiers from the source file's AST. Includes
   * value exports (`export const X`, `export function X`, exported
   * classes/enums), type-only exports (`export interface X`,
   * `export type X`), and named re-exports (`export { X } from "./y.js"`).
   * Excludes wildcard re-exports (no local name) and the bare
   * `default` position (not a matchable identifier).
   *
   * Use as deterministic ground truth for contract completeness and
   * code_sketch grounding constraints. */
  mandatoryExports: string[];
  /** Subset of mandatoryExports that pass through from another module
   * (`export { X } from "./y.js"`). Surfaced so consumers can be lenient
   * when matching upstream provides — the canonical source of a
   * re-export may live in the re-exported-from module, not in this
   * file. */
  reExportedNames: string[];
  /** Whether the file could be read and parsed. Returns ok=false for
   * unreadable files (permission errors, missing) or non-TS content.
   * Callers must guard: an ok=false result has an empty mandatoryExports
   * which is indistinguishable from a legitimately empty file. */
  ok: boolean;
}

/**
 * Scan a TypeScript source file and return its AST-derived export
 * surface. Pure function over (path, readable content) — never
 * dispatches to an LLM, never mutates state.
 */
export function scanFileSymbols(filePath: string): ASTSymbolScanResult {
  let source: string;
  try {
    source = fs.readFileSync(filePath, "utf-8");
  } catch {
    return { filePath, mandatoryExports: [], reExportedNames: [], ok: false };
  }
  try {
    const parsed = parseTypeScriptFile(filePath, source);
    // Default exports carry name="default" — exclude from the matchable
    // identifier set (they cannot appear as a `requires` entry in
    // downstream nodes). Re-exports keep their public name, which is
    // what consumers cite. Order preserved from AST traversal order
    // (which matches source order) so two scans of the same file return
    // the same list — important for test fixtures and for diffing the
    // scanner output against LLM-extracted provides.
    const mandatoryExports: string[] = [];
    const reExportedNames: string[] = [];
    for (const ref of parsed.exports) {
      if (ref.isDefault) continue;
      mandatoryExports.push(ref.name);
      if (ref.reExportedFrom !== undefined) {
        reExportedNames.push(ref.name);
      }
    }
    return { filePath, mandatoryExports, reExportedNames, ok: true };
  } catch {
    return { filePath, mandatoryExports: [], reExportedNames: [], ok: false };
  }
}

/**
 * Compute the diff between AST-derived exports and an LLM-emitted
 * provides list. Used by the Move 1c safety net to detect the
 * "LLM dropped everything" failure mode and by the Move 3α
 * code_sketch metric to score how much of the AST surface survived
 * compile-back.
 */
export interface ExportDiff {
  /** AST exports the LLM emitted (intersection). */
  recovered: string[];
  /** AST exports the LLM omitted (AST − LLM). The Move 1c straggler
   * signal: when this equals the full AST list, the LLM gave up. */
  missing: string[];
  /** LLM provides not in the AST (LLM − AST). Hallucinated symbols
   * that aren't actually exported by the source. */
  hallucinated: string[];
}

export function diffExportsAgainstAST(
  llmProvides: readonly string[],
  astExports: readonly string[],
): ExportDiff {
  const astSet = new Set(astExports);
  const llmSet = new Set(llmProvides);
  const recovered: string[] = [];
  const missing: string[] = [];
  const hallucinated: string[] = [];
  for (const e of astExports) {
    if (llmSet.has(e)) recovered.push(e);
    else missing.push(e);
  }
  for (const p of llmProvides) {
    if (!astSet.has(p)) hallucinated.push(p);
  }
  return { recovered, missing, hallucinated };
}

// ── Move 1c safety net ──────────────────────────────────────────────

export interface AstProvidesPatch {
  /** Whether the safety net fired and overrode `provides`. False when the
   * LLM emitted any provides or the AST scan turned up no exports. */
  applied: boolean;
  /** The provides list to use downstream. Equals the input when
   * `applied=false`, else equals astExports. */
  provides: string[];
  /** Diagnostic: how many AST exports were rescued. Zero when not applied. */
  rescuedCount: number;
}

/**
 * The Move 1c safety net. When an LLM extraction emits no provides at all
 * for a file the AST scanner says has exports, override `provides` with
 * the AST list so downstream gluing has names to match against.
 *
 * Conservative by design:
 *   - Fires ONLY when llmProvides is empty (undefined or length 0).
 *     Partial extractions (some symbols dropped, others kept) are a
 *     different failure mode and are left for Move 3α's code_sketch
 *     intervention to address. Overriding partial extractions here
 *     would risk replacing the model's signal with a uniformly stronger
 *     constraint that may not be what the file's runtime surface
 *     actually warrants.
 *   - Fires ONLY when astExports is non-empty. Files with no exports
 *     (side-effect modules, config files) legitimately have provides=[]
 *     and should not be patched.
 *   - Returns the unchanged input when neither condition holds so callers
 *     can safely apply unconditionally without re-checking the guards.
 *
 * Background: discovered via Move 1c diagnostic on context/types.ts +
 * fibration/types.ts. Their upstream supplier src/schemas/ontology.ts
 * emitted provides=[] from qwen 3b ingest because the ~600-line file
 * with ~60 exports exceeded the model's working-memory budget, so the
 * model emitted an empty array rather than a partial list. The empty
 * provides cascaded into gluing failures for every downstream that
 * required OntologyNode / OntologyEdge / similar type re-exports.
 */
export function patchProvidesWithAST(
  llmProvides: readonly string[] | undefined,
  astExports: readonly string[],
): AstProvidesPatch {
  const llmHasContent = llmProvides !== undefined && llmProvides.length > 0;
  const astHasExports = astExports.length > 0;
  if (llmHasContent || !astHasExports) {
    return {
      applied: false,
      provides: llmProvides ? [...llmProvides] : [],
      rescuedCount: 0,
    };
  }
  return {
    applied: true,
    provides: [...astExports],
    rescuedCount: astExports.length,
  };
}
