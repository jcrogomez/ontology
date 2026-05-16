import * as path from "node:path";
import { z } from "zod";
import {
  AbstractionLevelSchema,
  ManifestationSchema,
  NodeKindSchema,
} from "../../schemas/ontology.js";
import type { StructuralClassification } from "./structural-classifier.js";

// Static-summary extraction — Project Legend Phase ε prework C.
//
// Pure, deterministic substitute for an LLM extraction. Consumed by
// `onto ingest --static-classifier enabled` whenever the structural
// classifier confidently identifies a shape whose intent the
// extraction prompt would produce verbatim anyway — barrels and
// declaration-only modules in this conservative v0.
//
// The output mirrors the ExtractionResultSchema contract from
// commands/ingest/index.ts so the downstream proposal flow,
// γ-6 edge resolution, and γ-7 compile-back gate consume static
// summaries indistinguishably from LLM extractions.
//
// Design principle: a static summary is ALWAYS valid and intent-
// faithful for the shapes it covers. It is never speculative — every
// shape routed here has a confidence ≥0.85 verdict from the
// structural classifier AND a structurally-derivable intent
// (re-export aggregation, type-only declarations). The routing
// decision lives at the ingest-policy layer
// (commands/ingest/static-classifier-policy.ts); this module is the
// pure builder side of "classifier produces facts, ingest policy
// consumes facts".

// Mirror of ExtractionResult from src/commands/ingest/index.ts.
// Duplicated locally to keep this module free of cyclic imports with
// the command layer. If you change one, change the other.
//
// Locally-inferred unions for type safety inside this module. The
// Zod gate at the proposal layer (ExtractionResultSchema) is the
// real contract; these aliases just keep the switch statement below
// honest at compile time.
type AbstractionLevel = z.infer<typeof AbstractionLevelSchema>;
type Manifestation = z.infer<typeof ManifestationSchema>;
type NodeKind = z.infer<typeof NodeKindSchema>;

export interface StaticExtractionResult {
  label: string;
  level: AbstractionLevel;
  kind: NodeKind;
  manifestation?: Manifestation;
  language?: string;
  prompt: string;
  requires?: string[];
  provides?: string[];
  forbids?: string[];
  rules?: string[];
}

// The conservative v0 shape set this builder supports. Routing must
// never send any other shape here; passing one throws loudly.
export type StaticSummaryShape = "barrel" | "declaration_only";

// Normalise the classifier's SourceLanguage to the language hint
// downstream consumers expect (matches `guessLanguageHint` in
// commands/ingest/index.ts). `tsx` collapses to "typescript" because
// the language enum at the ingest layer is the broader "what
// compiler would emit this" label.
function normalisedLanguage(classification: StructuralClassification): string {
  switch (classification.language) {
    case "typescript":
    case "tsx":
      return "typescript";
    case "javascript":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "markdown":
      return "markdown";
    default:
      return "unknown";
  }
}

/**
 * Build a deterministic ExtractionResult for a file whose shape the
 * classifier resolved to one of the static_summary-eligible kinds
 * (barrel, declaration_only).
 *
 * Contract: this function is total over the eligible shapes only.
 * Callers MUST gate via the ingest-policy adapter first
 * (decideStaticClassifierIngestAction). Calling with any other shape
 * throws — better a loud crash than a silent semantic drift.
 */
export function buildStaticSummary(input: {
  filePath: string;
  classification: StructuralClassification;
}): StaticExtractionResult {
  const { classification } = input;
  const base = path.basename(input.filePath);
  const language = normalisedLanguage(classification);

  switch (classification.structuralShape) {
    case "barrel": {
      const reExportCount = classification.signals.reExportCount ?? 0;
      const reExportClause =
        reExportCount > 0
          ? `${reExportCount} re-export${reExportCount === 1 ? "" : "s"}`
          : "re-exports only";
      return {
        label: truncateLabel(`barrel: ${base}`),
        level: "artifact",
        kind: "artifact",
        manifestation: "code",
        language,
        prompt:
          `Barrel module: re-exports public symbols from sibling modules under the ` +
          `same directory and exposes a stable module boundary for callers. The file ` +
          `has no runtime declarations of its own (${reExportClause}, no local ` +
          `functions, classes, or const declarations). Its sole responsibility is ` +
          `to decouple importers from the internal file layout of the directory.`,
        requires: [],
        provides: [],
        forbids: ["runtime side effects in the barrel itself"],
        rules: [
          "REQUIRE: every export is a re-export from a sibling file; no local declarations",
        ],
      };
    }
    case "declaration_only": {
      return {
        label: truncateLabel(`types: ${base}`),
        level: "artifact",
        kind: "definition",
        manifestation: "code",
        language,
        prompt:
          `Type / interface declaration module. The file contains only type-level ` +
          `declarations (interfaces, type aliases) — no runtime functions, classes, ` +
          `or const declarations. Importers consume these declarations at compile time; ` +
          `the file emits no runtime code and has no observable side effects at run time.`,
        requires: [],
        provides: [],
        forbids: ["runtime side effects", "value-level declarations"],
        rules: [
          "REQUIRE: file contains only type-level declarations (interface, type alias)",
        ],
      };
    }
    default:
      // Routing already filters these out, but guard at the type
      // boundary so a future widening of the policy adapter surfaces
      // here loudly rather than producing a wrong extraction.
      throw new Error(
        `buildStaticSummary called with unsupported shape '${classification.structuralShape}'. ` +
          `Route via decideStaticClassifierIngestAction first; only 'barrel' and 'declaration_only' are eligible.`,
      );
  }
}

// ExtractionResultSchema caps label at 256 chars. Filenames in the
// wild can exceed that (generated bundles, deeply mangled names).
// Truncate with an ellipsis marker so the proposal still validates.
function truncateLabel(raw: string): string {
  const MAX = 256;
  if (raw.length <= MAX) return raw;
  return raw.slice(0, MAX - 1) + "…";
}
