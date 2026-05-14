import * as fs from "node:fs";
import * as path from "node:path";
import { parseTypeScriptFile } from "../static/typescript.js";

// Pure comparison library for Project Legend δ-2 (verify-homeomorphism).
//
// The publishable claim §3.10 in MATHEMATICAL_CLAIMS.md is that
// there exists an approximate left adjoint G of the compile functor F,
// such that F ∘ G ≈ id_Code modulo an ε-tolerance. To make that claim
// quantitative we need to actually measure ε on real code: ingest a
// file (G), regenerate from the extracted intent (F), then compare.
//
// This module owns the *comparison* step. It is pure — no LLM call,
// no IO beyond reading two files — so it can be unit-tested
// exhaustively and so the cost-estimate / dry-run paths reuse the
// same math without ever paying for a dispatch.
//
// The γ-2 calibration on hash.ts and the Vibe-Reasoning calibration
// on 24 Python files surfaced one robust finding: LoC distance and
// behavior-aware distance disagree. A regenerated file with more
// docstrings reads "divergent" under raw line count but "ε-equivalent"
// under behavior. Conversely, a regenerated file with renamed
// functions reads "small LoC delta" but "structurally divergent".
// δ-2 therefore reports BOTH and lets the verdict folder decide.
//
// Behavior distance is intentionally not "do they compute the same
// outputs given the same inputs" (that would require test execution,
// which is a separate flow and far more expensive). Instead δ-2 uses
// **structural Jaccard over top-level declaration names** as a cheap
// proxy that catches renames, decomposition refactors, and missing
// exports. The proxy is honest about what it measures and pairs with
// the LoC metric to give a 2D verdict surface.

// ── Distance metrics ────────────────────────────────────────────────────────

export interface DistanceMetrics {
  /**
   * Line-based normalized delta. Symmetric: |a - b| / max(a, b, 1).
   * Bounded in [0, 1]. 0 = identical line count, 1 = max divergence
   * (one file empty, the other arbitrarily long).
   *
   * Cheap, language-agnostic, transparent. Subject to over-estimation
   * when the regenerated file adds docstrings or whitespace — pair
   * with structuralJaccard for a fuller picture.
   */
  locDistance: number;
  /**
   * Jaccard similarity over the SET of top-level declaration names
   * (functions, classes, exports). |A ∩ B| / |A ∪ B|. Bounded in
   * [0, 1]. 1 = identical declaration set, 0 = no overlap. Convention:
   * when both sets are empty, return 1 (vacuously identical).
   *
   * Catches renames (e.g. solve_max_fooling_set → max_fooling_set
   * scores 0) and decomposition refactors (4 funcs → 2 funcs drops
   * the score sharply). Does NOT capture behavioral equivalence —
   * a file whose function `f` does completely different things
   * would still score 1 if the name matches. The pair (LoC, Jaccard)
   * is the right read.
   */
  structuralJaccard: number;
  // Raw counts for transparency — surfaced in human / JSON output.
  originalLineCount: number;
  regenLineCount: number;
  originalDeclarations: string[];
  regenDeclarations: string[];
}

export type LanguageHint = "typescript" | "python" | "unknown";

/**
 * Top-level declaration extractor. Returns the list of public names
 * a downstream consumer would see — function names, class names,
 * exports. Used for the structural Jaccard.
 *
 * Note that for TypeScript we reuse the existing γ-4 parser, which
 * already produces an `exports: ExportRef[]` list. For Python we
 * regex-scan for `^def NAME(` / `^class NAME(` at column 0 — the
 * same v0 scope as the γ-4 Python parser.
 */
export function extractTopLevelDeclarations(
  source: string,
  language: LanguageHint,
  filePath = "<input>",
): string[] {
  if (language === "typescript") {
    const parsed = parseTypeScriptFile(filePath, source);
    // Exports are the public surface — use the export name (not the
    // local alias) so `export { foo as bar }` lands as "bar".
    return parsed.exports.map((e) => e.name).filter((n) => n !== "default").sort();
  }
  if (language === "python") {
    const names: string[] = [];
    const seen = new Set<string>();
    // Match `^def NAME(`, `^async def NAME(`, and `^class NAME(` /
    // `^class NAME:` at the beginning of a line. Python convention: a
    // single underscore prefix marks an implementation detail; we
    // still include them here because the Jaccard is comparing
    // structural decomposition, not the public-import surface. The
    // `async def` alternative is required for any modern Python
    // codebase (Ontology's own src/ has async functions); without it
    // the structural Jaccard silently under-counts coroutines and
    // reports false `divergent_structural` verdicts on files where
    // the regen renamed nothing.
    const re = /^(?:async\s+def|def|class)\s+(\w+)\s*[\(:]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names.sort();
  }
  // Unknown language — best-effort: surface nothing. Caller falls
  // back to LoC-only comparison.
  return [];
}

export function computeDistanceMetrics(
  original: string,
  regen: string,
  language: LanguageHint,
  filePath = "<input>",
): DistanceMetrics {
  const originalLines = original.split("\n");
  const regenLines = regen.split("\n");
  // Strip a single trailing empty line (the canonical end-of-file
  // newline) so a regen with a trailing newline doesn't show as
  // +1 LoC over an original without one.
  const originalLineCount =
    originalLines.length > 0 && originalLines[originalLines.length - 1] === ""
      ? originalLines.length - 1
      : originalLines.length;
  const regenLineCount =
    regenLines.length > 0 && regenLines[regenLines.length - 1] === ""
      ? regenLines.length - 1
      : regenLines.length;

  const locDistance =
    Math.abs(originalLineCount - regenLineCount) /
    Math.max(originalLineCount, regenLineCount, 1);

  const originalDecls = extractTopLevelDeclarations(original, language, filePath);
  const regenDecls = extractTopLevelDeclarations(regen, language, filePath);

  const setA = new Set(originalDecls);
  const setB = new Set(regenDecls);
  const intersection = new Set([...setA].filter((x) => setB.has(x))).size;
  const union = new Set([...setA, ...setB]).size;
  const structuralJaccard = union === 0 ? 1 : intersection / union;

  return {
    locDistance,
    structuralJaccard,
    originalLineCount,
    regenLineCount,
    originalDeclarations: originalDecls,
    regenDeclarations: regenDecls,
  };
}

// ── Verdict classification ──────────────────────────────────────────────────

export type HomeomorphismVerdict =
  | "epsilon_equivalent"
  | "divergent_loc"
  | "divergent_structural"
  | "divergent_both"
  | "unrecoverable";

export interface VerdictThresholds {
  /** LoC distance below this counts as "small". Default 0.3. */
  loc: number;
  /** Jaccard at or above this counts as "structurally similar". Default 0.5. */
  jaccard: number;
}

export const DEFAULT_THRESHOLDS: VerdictThresholds = {
  loc: 0.3,
  jaccard: 0.5,
};

/**
 * Folds the two metrics into a single verdict label given thresholds.
 * The label set is small on purpose: ε-equivalent (both pass),
 * divergent_loc (LoC over, structure ok), divergent_structural
 * (structure under, LoC ok), divergent_both (both fail). The
 * "unrecoverable" label is reserved for the case where compile-back
 * never produced an artifact at all (compile error) — callers
 * supply it directly via the result type and never invoke this
 * folder for that case.
 */
export function classifyVerdict(
  metrics: DistanceMetrics,
  thresholds: VerdictThresholds = DEFAULT_THRESHOLDS,
): Exclude<HomeomorphismVerdict, "unrecoverable"> {
  const locOk = metrics.locDistance < thresholds.loc;
  const structuralOk = metrics.structuralJaccard >= thresholds.jaccard;
  if (locOk && structuralOk) return "epsilon_equivalent";
  if (!locOk && structuralOk) return "divergent_loc";
  if (locOk && !structuralOk) return "divergent_structural";
  return "divergent_both";
}

// ── Per-node result + file IO helpers ───────────────────────────────────────

export interface VerificationUsage {
  /** Anthropic SDK input_tokens or equivalent. Undefined when the run wasn't a dispatch (cache hit, dry run). */
  promptTokens?: number;
  /** Anthropic SDK output_tokens or equivalent. */
  completionTokens?: number;
  totalTokens?: number;
  /** Approximate cost in USD computed from per-provider published rates. Undefined when the rate is unknown. */
  costUSD?: number;
  /** Whether the dispatch hit the deterministic-runId cache. When true, no fresh API spend happened on this node. */
  cached?: boolean;
}

export interface VerificationResult {
  nodeId: string;
  sourceFile: string;
  /** Absolute path to the regenerated artifact when compile-back succeeded. */
  regenPath?: string;
  /**
   * When false, compile-back failed and the verdict is "unrecoverable".
   * `failure` carries the reason; metrics is undefined. The original
   * file is still recorded for completeness.
   */
  ok: boolean;
  failure?: string;
  metrics?: DistanceMetrics;
  verdict: HomeomorphismVerdict;
  thresholds: VerdictThresholds;
  /** Token + approximate cost telemetry for the compile-back dispatch. Surfaced so the JSON report carries the per-node bill — Vibe-Reasoning γ-7 calibration tooling gap #1. */
  usage?: VerificationUsage;
}

export interface AggregateReport {
  rootDir: string;
  thresholds: VerdictThresholds;
  total: number;
  byVerdict: Record<HomeomorphismVerdict, number>;
  results: VerificationResult[];
  /** Aggregate usage across all nodes. Undefined when no dispatch happened (--cost-estimate, --dry-run cache-only). */
  totalUsage?: VerificationUsage;
  /**
   * Phase ε prework C: the six-axis matrix per node, populated when the
   * verify command runs with --matrix. Undefined for the legacy verdict-only
   * report shape. The matrix module (`src/runtime/legend/matrix.ts`) owns
   * the canonical mapping from `HomeomorphismVerdict` to the structural
   * axis state; other axes (contract, behavior, intent) are explicit
   * "not-measured" / "untested" / "not-reviewed" until their checkers ship.
   */
  matrix?: import("./matrix.js").PerNodeMatrix[];
  /**
   * Aggregate count of cells per axis state. Same axes and vocabularies
   * as `matrix[i].cell`. Undefined when `matrix` is undefined.
   */
  byAxis?: import("./matrix.js").ByAxis;
  /**
   * Phase ε prework D: count of nodes matching each required
   * intersection predicate from
   * `SELF_INGEST_HYPOTHESIS_2026-05-13.md` §6. Always carries the seven
   * required keys (with explicit zeros when nothing matched); the run
   * may append additional intersections discovered during the analysis.
   * Undefined when `matrix` is undefined.
   */
  byIntersection?: Record<string, number>;
  /**
   * Phase ε prework G: Pareto pivot — one row per (task, provider,
   * model) bucket with mean honesty + mean cost + a `paretoFrontier`
   * flag computed per task. Undefined when `matrix` is undefined.
   */
  paretoByTaskModel?: import("./pareto.js").TaskModelAgg[];
}

export function emptyVerdictCounts(): Record<HomeomorphismVerdict, number> {
  return {
    epsilon_equivalent: 0,
    divergent_loc: 0,
    divergent_structural: 0,
    divergent_both: 0,
    unrecoverable: 0,
  };
}

/**
 * Detect language hint from a source file's extension. Matches the
 * γ-4 dispatcher's classification so the verify reports use the
 * same language conventions everywhere.
 */
export function inferLanguageHint(filePath: string): LanguageHint {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".py") return "python";
  return "unknown";
}

/**
 * Read two files and compute the metrics — the common path for both
 * the verify CLI and any future automated harness. Returns null when
 * either file is unreadable so the caller can fold that into an
 * "unrecoverable" verdict cleanly.
 */
export function compareFiles(
  originalPath: string,
  regenPath: string,
): DistanceMetrics | null {
  try {
    const original = fs.readFileSync(originalPath, "utf-8");
    const regen = fs.readFileSync(regenPath, "utf-8");
    const language = inferLanguageHint(originalPath);
    return computeDistanceMetrics(original, regen, language, originalPath);
  } catch {
    return null;
  }
}
