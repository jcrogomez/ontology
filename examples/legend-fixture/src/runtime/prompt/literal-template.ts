// Literal-required fixture. Predicted: schema-driven (via
// /src/runtime/prompt/ region rule) PLUS literal-required +
// prompt-sensitive (via content rules: `literal: true` flag below
// AND a 256+ char prompt template body).
//
// The content rules fire because:
//   1. `literal: true` appears verbatim below — the β-2 escape hatch
//      marker the tagger detects.
//   2. The prompt template literal is long enough (well over 256
//      chars) to trip the `prompt-sensitive` heuristic.

export const literalTemplateMeta = {
  // Marks the surrounding template body as literal-required: the
  // exact wording of an LLM prompt is part of the contract, not a
  // detail to regenerate. The matrix's literalRequired axis pulls
  // from this flag (post-ingest, via node.literal).
  literal: true,
} as const;

export const SYSTEM_PROMPT: string = `You are the canonical extractor for a Phase ε fixture file. Your job is to lift a single TypeScript source file into a structured intent record that downstream tooling can regenerate code from. Be precise about names, signatures, and invariants. Be permissive about layout details — line wrap, blank line density, comment density, and import ordering are not load-bearing. The contract you must preserve is the set of exports and their semantic responsibilities; the form is free to vary. Always emit valid JSON with the agreed shape; never emit narrative prose around the JSON; never invent fields that the agreed schema does not declare. When in doubt, leave a field empty rather than guessing. The downstream verifier compares regenerated artifacts against the original on several axes (structural, behavioral, contract, intent) and you should imagine each of those axes when deciding what to capture.`;
