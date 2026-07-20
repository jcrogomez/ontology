// s(c) — the cheap static "read" that routes intent extraction (P7).
//
// See docs/design/proposals/STOCHASTIC_FUNCTORS.md §P7 (adaptive
// conditioning of the stochastic extraction functor Ĝ). The extraction
// kernel today is UNCONDITIONED: ingest ships two fixed system prompts
// (EXTRACTION_SYSTEM_PROMPT / _PROSE, chosen by source-type only) and one
// model per run. This module computes a per-node routing signature from a
// pure AST read — no LLM, no IO beyond the caller handing us the file
// content — so a downstream conditioner can pick:
//
//   - promptProfile : WHICH extraction prompt/generator to use (the lever
//                     for the "re-expression" collapse mode — barrels,
//                     type surfaces, schemas, cli entrypoints).
//   - modelTier     : WHICH rung of the capability ladder (the lever for
//                     the "truncation" collapse mode — large multi-export
//                     modules that a small model emits as a short prefix).
//   - inheritContext: WHETHER to glue in neighbourhood intent at extract
//                     time (parent's why, siblings' contracts).
//
// HONESTY (do not overclaim). This is a HEURISTIC ROUTER, not a validated
// collapse predictor. The Phase ε finding is that the 22 zero-recall nodes
// average ~1200 tokens vs ~1120 for the rest — a near-tie — so raw length
// is NOT the separator; declaration KIND is. That is why routing keys off
// the structural classifier's shape/role, not off size alone. The
// thresholds below are PRE-CALIBRATION defaults; the P3 experiment
// (STOCHASTIC_FUNCTORS.md §6) fits them against the labelled collapse-22
// and reports AUC vs a length-only baseline. Until that run lands, treat
// `predictedMode` as a triage hint, not a claim.
//
// CIRCULARITY CAVEAT for inheritContext. Feeding neighbourhood intent into
// G can inflate F∘G≈id by letting the extractor parrot what it was handed
// (the §3.1 metric-circularity worry the Arm A0 control was built for).
// This module only FLAGS that inheritance would help; any pipeline that
// acts on the flag must ablation-control it (extract with vs without) and
// keep only the lift that survives, exactly as Arm A vs A0 did for AST
// grounding.
//
// Pure: deterministic, no IO, no LLM, no clock. `computeRoutingSignature`
// on the same (path, content) always returns the same signature.

import {
  classifySourceFile,
  type StructuralClassification,
  type StructuralShape,
  type SemanticRole,
  type SourceLanguage,
} from "./structural-classifier.js";

/** The two empirically-distinct collapse modes plus the safe majority. */
export type RoutingMode =
  /** Faithful/regenerable at the whole-module grain — the trustworthy core. */
  | "core"
  /** Large multi-export module a weak model emits as a truncated prefix.
   *  Lever: escalate the MODEL (capacity-bound). */
  | "truncation_risk"
  /** Ordinary-size module whose top-level declarations are types / barrels /
   *  const-maps / cli entrypoints, re-expressed under different names.
   *  Lever: escalate the PROMPT, not the model (NOT capacity-bound). */
  | "reexpression_risk";

/** Which extraction prompt/generator profile fits this file. Names a
 *  profile; wiring profiles to concrete generators is downstream
 *  (see PROMPT_GENERATORS.md). */
export type PromptProfile =
  | "code_generic"
  | "type_surface"
  | "barrel_reexport"
  | "schema"
  | "cli_imperative"
  | "prose_or_unknown";

/** Abstract rung of the capability ladder. Mapping tier → concrete model
 *  lives in the runtime registry (resolve-node-model.ts), not here, so
 *  s(c) stays pure and decoupled. */
export type ModelTier = "economy" | "standard" | "frontier";

export interface RoutingSignature {
  path: string;
  language: SourceLanguage;
  structuralShape: StructuralShape;
  semanticRole: SemanticRole;

  // ── cheap features (all static) ──
  /** Top-level exports (declarations + named re-exports). */
  exportCount: number;
  /** All top-level symbols the classifier saw. */
  symbolCount: number;
  /** Exports that pass through from another module (`export { X } from …`). */
  reExportCount: number;
  /** Fraction of exports declared as `type` (vs `value`). 0 when no exports. */
  typeExportRatio: number;
  /** Cheap token proxy: ⌈chars / 4⌉. NOT a real tokenizer — an ordering
   *  device only. */
  tokenEstimate: number;

  // ── derived ──
  /** Kind-weighted complexity proxy H(c) (unbounded, ≥ 0). Combines export
   *  surface, symbol count, size, and kind diversity. Used for ordering /
   *  thresholding; components are documented, weights are pre-calibration. */
  complexity: number;
  predictedMode: RoutingMode;
  /** [0,1] — how strongly the signals agree on the predicted mode. */
  modeConfidence: number;

  // ── routing decisions (what a conditioner would act on) ──
  promptProfile: PromptProfile;
  modelTier: ModelTier;
  /** Would gluing in neighbourhood intent plausibly help? (Ablation-control
   *  before trusting — see header.) */
  inheritContext: boolean;

  /** Human-readable audit trail, mirroring StructuralClassification.reasons. */
  rationale: string[];
}

// ── Pre-calibration thresholds (to be fit against the collapse-22, P3). ──
// Exported so the calibration harness and tests can reference/override them
// rather than hard-coding magic numbers at call sites.
export const ROUTING_THRESHOLDS = {
  /** Export count at/above which an executable module risks tail-truncation. */
  exportManyForTruncation: 8,
  /** Token-estimate at/above which a module is "large" for truncation risk. */
  tokenLargeForTruncation: 2500,
  /** typeExportRatio at/above which a module reads as a type surface. */
  typeSurfaceRatio: 0.6,
} as const;

/** Structural shapes whose intent under-determines the surface form — the
 *  re-expression collapse family. Keyed off the validated classifier shape,
 *  not off size (the token near-tie says size is not the separator). */
const REEXPRESSION_SHAPES: ReadonlySet<StructuralShape> = new Set([
  "barrel",
  "declaration_only",
  "schema_module",
  "configuration_module",
  "adapter_module",
  "cli_module",
]);

const PARSEABLE: ReadonlySet<SourceLanguage> = new Set([
  "typescript",
  "tsx",
  "javascript",
  "jsx",
]);

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * s(c): compute the routing signature for a source file.
 *
 * Pass an existing `classification` to avoid re-parsing when the caller
 * already ran `classifySourceFile` (ingest does); otherwise it is computed.
 */
export function computeRoutingSignature(input: {
  path: string;
  content: string;
  classification?: StructuralClassification;
}): RoutingSignature {
  const classification =
    input.classification ??
    classifySourceFile({ path: input.path, content: input.content });

  const { language, structuralShape, semanticRole, signals, vocabulary } =
    classification;

  const exportsVocab = vocabulary?.exports ?? [];
  const exportCount = exportsVocab.length || (signals.exportCount ?? 0);
  const reExportCount =
    exportsVocab.filter((e) => e.reExportedFrom !== undefined).length ||
    (signals.reExportCount ?? 0);
  const symbolCount = signals.symbolCount ?? exportCount;
  const typeExports = exportsVocab.filter((e) => e.kind === "type").length;
  const typeExportRatio =
    exportsVocab.length > 0 ? typeExports / exportsVocab.length : 0;
  const tokenEstimate = estimateTokens(input.content);

  // Kind-weighted complexity proxy H(c). Deliberately NOT length-only:
  // export surface and kind diversity dominate, size is a minor term.
  // Weights are pre-calibration (see ROUTING_THRESHOLDS note).
  const kindDiversity =
    (signals.hasFunctions ? 1 : 0) +
    (signals.hasTypeDeclarations || signals.hasInterfaces ? 1 : 0) +
    (signals.hasClasses ? 1 : 0) +
    (signals.hasZodSchema ? 1 : 0) +
    (reExportCount > 0 ? 1 : 0);
  const complexity =
    2 * exportCount +
    1 * symbolCount +
    tokenEstimate / 500 +
    1.5 * kindDiversity;

  const rationale: string[] = [
    `shape=${structuralShape}`,
    `role=${semanticRole}`,
    `exports=${exportCount} (type ${(typeExportRatio * 100).toFixed(0)}%, re-export ${reExportCount})`,
    `~tokens=${tokenEstimate}`,
  ];

  // ── Mode prediction (deterministic, documented) ──
  const looksReexpression =
    REEXPRESSION_SHAPES.has(structuralShape) ||
    signals.hasOnlyReExports === true ||
    signals.hasCliEntrypoint === true ||
    (typeExportRatio >= ROUTING_THRESHOLDS.typeSurfaceRatio &&
      signals.hasFunctions !== true);

  const looksTruncation =
    (structuralShape === "executable_module" ||
      structuralShape === "mixed_module" ||
      structuralShape === "component_module") &&
    exportCount >= ROUTING_THRESHOLDS.exportManyForTruncation &&
    tokenEstimate >= ROUTING_THRESHOLDS.tokenLargeForTruncation;

  let predictedMode: RoutingMode;
  let modeConfidence: number;
  if (!PARSEABLE.has(language)) {
    // json / markdown / unknown — extract via the prose profile; we have no
    // AST signal, so confidence is low and we do not guess a collapse mode.
    predictedMode = "reexpression_risk";
    modeConfidence = 0.3;
    rationale.push("non-parseable language → prose profile, low confidence");
  } else if (looksReexpression) {
    predictedMode = "reexpression_risk";
    // Confidence is higher when the classifier is confident AND the shape is
    // squarely in the re-expression family.
    modeConfidence = REEXPRESSION_SHAPES.has(structuralShape)
      ? Math.max(0.6, classification.confidence)
      : 0.55;
    rationale.push("intent under-determines surface → escalate PROMPT, keep model economy");
  } else if (looksTruncation) {
    predictedMode = "truncation_risk";
    modeConfidence = Math.min(
      0.9,
      0.5 + exportCount / 40 + tokenEstimate / 20000,
    );
    rationale.push("large multi-export executable → escalate MODEL (capacity-bound)");
  } else {
    predictedMode = "core";
    modeConfidence = Math.max(0.5, classification.confidence);
    rationale.push("plain surface → core, economy model, generic prompt");
  }

  // ── Prompt profile ──
  let promptProfile: PromptProfile;
  if (!PARSEABLE.has(language)) {
    promptProfile = "prose_or_unknown";
  } else if (structuralShape === "barrel" || signals.hasOnlyReExports === true) {
    promptProfile = "barrel_reexport";
  } else if (structuralShape === "schema_module" || signals.hasZodSchema === true) {
    promptProfile = "schema";
  } else if (structuralShape === "cli_module" || signals.hasCliEntrypoint === true) {
    promptProfile = "cli_imperative";
  } else if (
    structuralShape === "declaration_only" ||
    (typeExportRatio >= ROUTING_THRESHOLDS.typeSurfaceRatio &&
      signals.hasFunctions !== true)
  ) {
    promptProfile = "type_surface";
  } else {
    promptProfile = "code_generic";
  }

  // ── Model tier ──
  // Encodes the empirical finding: re-expression is NOT capacity-bound
  // (token near-tie), so keep it economy and spend the lever on the prompt;
  // truncation IS capacity-bound, so route it up.
  const modelTier: ModelTier =
    predictedMode === "truncation_risk"
      ? "frontier"
      : predictedMode === "core"
        ? "economy"
        : "economy"; // reexpression → economy on purpose (prompt is the lever)

  // ── Inherit context? ──
  // True when there are upstream structural deps whose intent would inform
  // extraction, or when the module's identity IS its re-exports (a barrel).
  const inheritContext =
    (signals.hasImports === true && (signals.importCount ?? 0) > 0) ||
    signals.hasOnlyReExports === true;
  if (inheritContext) {
    rationale.push("has upstream deps → inheriting neighbourhood intent may help (ABLATE for circularity)");
  }

  return {
    path: input.path,
    language,
    structuralShape,
    semanticRole,
    exportCount,
    symbolCount,
    reExportCount,
    typeExportRatio,
    tokenEstimate,
    complexity,
    predictedMode,
    modeConfidence,
    promptProfile,
    modelTier,
    inheritContext,
    rationale,
  };
}
