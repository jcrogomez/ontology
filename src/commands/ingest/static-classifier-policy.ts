import type { StructuralClassification } from "../../runtime/legend/structural-classifier.js";

// Ingest-policy adapter for the Structural Semantic Classifier — the
// "ingest policy consumes facts" side of Project Legend's separation
// principle. The classifier (runtime/legend/structural-classifier.ts)
// produces typed structural facts about a single file. This module
// decides, given those facts and the operator-selected
// --static-classifier mode, whether ingest should:
//
//   - dispatch the file to the LLM via the normal semantic_parse
//     path (default), or
//   - bypass the LLM and synthesize a deterministic extraction via
//     buildStaticSummary (runtime/legend/static-summary.ts).
//
// Design principle (load-bearing):
//   - classifier produces facts (pure, no policy knowledge)
//   - ingest policy consumes facts (this module)
//   - extraction builder is pure (static-summary.ts)
//
// Conservatism (v0):
//   - Only `barrel` and `declaration_only` deflect to static_summary.
//   - Every other shape (schema_module, adapter_module, cli_module,
//     executable_module, component_module, test_module,
//     configuration_module, mixed_module, unknown) keeps the existing
//     semantic_parse path.
//   - schema_module specifically stays on the LLM because the
//     classifier's zod-detection predicate overfits — it catches
//     files that merely USE zod for runtime validation
//     (commands/ingest/index.ts, runtime/llm/ensemble.ts) alongside
//     files that ARE schemas. Until the predicate tightens, treating
//     schema_module as semantic_parse keeps the intent extraction
//     honest.
//   - test_module is not skipped. Ingest walkers already exclude the
//     common test paths upstream; a test file that nonetheless
//     reaches the policy gets the LLM treatment, same as a default
//     run.
//
// This shape set is conservative on purpose. The smoke-test
// distribution before this PR shipped showed only 7/128 files
// deflecting (3 barrels + 4 declaration-only) — small, but the
// absence of `mixed_module` and `unknown` in that perimeter is the
// load-bearing signal that the conservative deflection is safe.

export type StaticClassifierMode = "off" | "report-only" | "enabled";

export type IngestAction = "semantic_parse" | "static_summary";

/**
 * Decide whether a classified file should be dispatched to the LLM
 * via semantic_parse, or bypassed via a deterministic static
 * summary. The decision is governed by both the operator-selected
 * mode and the classifier's verdict — `off` and `report-only` always
 * return `semantic_parse` (report-only OBSERVES; it never
 * intervenes); only `enabled` may deflect.
 */
export function decideStaticClassifierIngestAction(
  classification: StructuralClassification | undefined,
  mode: StaticClassifierMode,
): IngestAction {
  if (mode !== "enabled") return "semantic_parse";
  if (classification === undefined) return "semantic_parse";
  switch (classification.structuralShape) {
    case "barrel":
    case "declaration_only":
      return "static_summary";
    case "schema_module":
    case "adapter_module":
    case "cli_module":
    case "executable_module":
    case "component_module":
    case "test_module":
    case "configuration_module":
    case "mixed_module":
    case "unknown":
      return "semantic_parse";
  }
}
