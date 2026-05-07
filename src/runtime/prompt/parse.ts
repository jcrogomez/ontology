import type { PromptAST, PromptMarkers } from "./types.js";

// Pure prompt parser. Recognises three line-anchored markers:
//   @requires: token, token2
//   @provides: token
//   @expand: nodeId
// Tokens after the colon are comma-separated; whitespace around them is
// trimmed; empty tokens are dropped (so `@requires: ` is harmless).
//
// Markers must occupy their own line — strictly anchored, so prose like
// "we @require: foo" does not match. This is deliberate: a permissive
// parser would surface false positives in any prompt that happens to
// mention an @-word, and the marker syntax is supposed to be a structural
// declaration, not a stylistic flourish. Authors who want the literal
// string `@requires:` in the body can put it inside a fenced code block
// or indent it; the regex matches only `^\s*@<name>:` at the start of
// a line (after optional indentation).
//
// Determinism: each list preserves the order tokens appear in the prompt
// and de-duplicates with first-occurrence wins. Two prompts that differ
// only in whitespace produce the same markers; their bodies normalise to
// the same trimmed string.

const MARKER_LINE = /^[ \t]*@(requires|provides|expand)[ \t]*:[ \t]*(.*)$/;

export function parsePromptAST(raw: string): PromptAST {
  const requires: string[] = [];
  const provides: string[] = [];
  const expand: string[] = [];
  const seen = {
    requires: new Set<string>(),
    provides: new Set<string>(),
    expand: new Set<string>(),
  };

  const bodyLines: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const m = MARKER_LINE.exec(line);
    if (!m) {
      bodyLines.push(line);
      continue;
    }
    const tag = m[1] as keyof typeof seen;
    const tokens = m[2]
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const sink = tag === "requires" ? requires : tag === "provides" ? provides : expand;
    for (const t of tokens) {
      if (seen[tag].has(t)) continue;
      seen[tag].add(t);
      sink.push(t);
    }
    // The marker line is consumed; it does NOT appear in `body`.
  }

  const markers: PromptMarkers = { requires, provides, expand };
  return {
    raw,
    body: bodyLines.join("\n").trim(),
    markers,
  };
}

// Convenience: returns true iff the prompt declared at least one marker.
// Useful for dispatch heuristics ("only inject this provenance metadata
// when the author actually wrote markers"); not load-bearing.
export function hasMarkers(ast: PromptAST): boolean {
  return (
    ast.markers.requires.length > 0 ||
    ast.markers.provides.length > 0 ||
    ast.markers.expand.length > 0
  );
}
