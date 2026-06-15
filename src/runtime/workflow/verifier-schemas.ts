import { z } from "zod";
import type { VerifierSchemaName } from "../../kernel/schemas/workflow.js";

// Verifier output schemas registry (Phase ζ v0).
//
// Every workflow verifier node declares its output shape by naming
// one of the pre-registered schemas in this file. The executor
// validates the LLM response against the named schema before passing
// the parsed verdict to any branches_on predicate. Two shapes ship
// in v0:
//
//   - `simple-pass-fail`: minimal verdict; the predicate DSL can read
//     only `verdict`. Use this when "did it work?" is the only
//     question that drives branching.
//   - `with-severity`: extends `verdict` with a severity tier
//     (`minor` / `major`) and a free-form issues list. The IMO
//     verify-refine flow (spec §7 worked example) uses this so the
//     reject branch can fire on "10 steps of major issues".
//
// User-defined schemas via a registry are deferred to v1 — they
// would need a separate file to declare the field set the predicate
// parser can read, and the v0 grammar is restricted to the two
// fields shipped here.

// ── Schema shapes ───────────────────────────────────────────────────────────

export const SimplePassFailSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  reason: z.string().optional(),
});
export type SimplePassFailVerdict = z.infer<typeof SimplePassFailSchema>;

// `severity` and `issues` are intentionally lenient: a correct `pass`
// verdict has no severity to report and an empty issues list, and
// models routinely emit `{"verdict":"pass"}` alone. Requiring those
// fields made such a valid pass fail schema-parse, trip the retry, and
// then fall back to `fail/major` — silently flipping a pass to a fail
// (§4.2). `severity` is therefore optional (meaningful only on a fail)
// and `issues` defaults to `[]`.
export const WithSeveritySchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  severity: z.enum(["minor", "major"]).optional(),
  issues: z.array(z.string()).default([]),
});
export type WithSeverityVerdict = z.infer<typeof WithSeveritySchema>;

// Union of all v0 verifier verdicts. The executor narrows from the
// schema name to the concrete shape; callers (predicate evaluator,
// trace renderer) work against the broad shape with optional
// `severity` per the predicate evaluator's assumption.
export type VerifierVerdict = SimplePassFailVerdict | WithSeverityVerdict;

// ── Field-set introspection ─────────────────────────────────────────────────

/**
 * The set of verifier-output field names a predicate can legally
 * read for the given schema. Used by the predicate parser's static
 * validation step in graph-load to reject predicates that reference
 * a field absent from the source verifier's declared schema.
 */
export function verifierSchemaFields(name: VerifierSchemaName): Set<string> {
  switch (name) {
    case "simple-pass-fail":
      return new Set(["verdict"]);
    case "with-severity":
      return new Set(["verdict", "severity"]);
  }
}

/**
 * The full set of verdict "points" a schema can emit — the cartesian
 * product of its enumerable fields. Used by the graph loader's
 * branch-coverage lint to check that every point a verifier could
 * produce is matched by at least one outgoing predicate.
 */
export function verifierSchemaPoints(
  name: VerifierSchemaName,
): { verdict: string; severity?: string }[] {
  switch (name) {
    case "simple-pass-fail":
      return [{ verdict: "pass" }, { verdict: "fail" }];
    case "with-severity":
      // `severity` is OPTIONAL on `WithSeveritySchema` (see the note at
      // its definition): a bare `{"verdict":"pass"}` / `{"verdict":"fail"}`
      // is a valid, commonly-emitted point. Enumerate those severity-less
      // points alongside the severity-bearing ones, or a graph that
      // branches only on `severity == …` passes the coverage lint yet
      // dies at runtime with `no_matching_branch` the moment the model
      // returns a verdict with no severity. A bare point is matched by a
      // `verdict == …` predicate but NOT by a `severity == …` one
      // (`undefined !== "minor"`), so this enumeration is exactly the set
      // a predicate set must cover.
      return [
        { verdict: "pass" },
        { verdict: "fail" },
        { verdict: "pass", severity: "minor" },
        { verdict: "pass", severity: "major" },
        { verdict: "fail", severity: "minor" },
        { verdict: "fail", severity: "major" },
      ];
  }
}

/**
 * Parse a string (a Zod-validated LLM response payload) into a
 * verdict matching the named schema. Returns the parsed verdict on
 * success; throws Zod's error on shape mismatch.
 */
export function parseVerdict(
  name: VerifierSchemaName,
  raw: unknown,
): VerifierVerdict {
  switch (name) {
    case "simple-pass-fail":
      return SimplePassFailSchema.parse(raw);
    case "with-severity":
      return WithSeveritySchema.parse(raw);
  }
}

/**
 * Best-effort attempt to extract a JSON object from raw LLM text.
 * Verifier responses come back as text (the dispatcher does not
 * enforce JSON mode in v0) so we slice from the first `{` to the
 * matching `}` and try to parse. Returns null on any failure; the
 * caller folds null into the schema-parse-failed fallback verdict.
 */
export function extractJsonObject(text: string): unknown | null {
  // Find the first {…} block. Models sometimes wrap JSON in
  // ```json fences or surround it with prose; the simplest robust
  // strategy is "find the first {, find its matching }, parse the
  // slice." This will not handle JSON arrays (we don't ship a
  // verifier schema that emits a top-level array), so we don't
  // attempt to.
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
