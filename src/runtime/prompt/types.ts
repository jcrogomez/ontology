// PromptAST — structural rewrite-rule view of a prompt.
//
// Axiom 2: "Prompts act as rewrite rules that expand subgraphs." Today
// `node.prompt.raw` is stored as plain text and dispatched verbatim. The
// AST lifts the prompt into a structural representation: a body (the
// dispatch surface) plus typed markers that name the contract the prompt
// expresses (what tokens it requires, what tokens it claims to provide,
// which other nodes' outputs it wants to expand).
//
// Markers are line-anchored declarations the author writes directly in
// the prompt, e.g.:
//
//     @requires: ConfigFormat, EnvironmentFlags
//     Now compose a config loader that reads from disk.
//     @provides: LoadedConfig
//
// Parsing strips the marker lines from the body so the model receives only
// the prose the author intended. The persisted run records both the raw
// prompt (axiom 9 — provenance) and the AST's marker payload, so an
// auditor can later check whether the author's stated contract matched
// the node's `context.requires/provides` declarations.
//
// This is the *minimal* AST: enough to materialise axiom 2 in code and
// give the compiler structured material to dispatch with. Future PRs may
// extend it (template variables, conditional sections, etc.) — they
// should be additive on this shape.

export interface PromptAST {
  // The prompt as the author wrote it, untouched. Always equal to the
  // node's stored `prompt.raw`. Kept on the AST so downstream consumers
  // (run persistence, hashing, debug surfaces) need not reach back to the
  // node.
  readonly raw: string;
  // The dispatch surface: `raw` with marker lines removed and surrounding
  // whitespace trimmed. This is what the model actually sees.
  readonly body: string;
  // Typed markers parsed from the prompt. Each list is the de-duplicated,
  // order-preserving union of every matching marker line in the prompt.
  readonly markers: PromptMarkers;
}

export interface PromptMarkers {
  // Tokens the prompt declares it needs in scope. Cross-checkable against
  // `node.context.requires`; the parser does NOT enforce that match — that
  // is a hardening pass on top of this PR.
  readonly requires: readonly string[];
  // Tokens the prompt claims to make available to downstream consumers.
  // Cross-checkable against `node.context.provides`.
  readonly provides: readonly string[];
  // Node ids whose compiled output the author wants to inline as expansion
  // points. The compiler today threads ALL direct refinement parents into
  // the system prompt; `@expand` is the schema slot that lets a future
  // version pick a subset (or include non-refinement upstreams).
  readonly expand: readonly string[];
}
