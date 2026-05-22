// Intent validator — ported onto the rule-as-predicate algebra in
// `runtime/topos/`.
//
// Before this port the function was an imperative cascade: walk three checks
// in order, mutate `ok`, `score`, and `violations` on the way through. The
// new shape lifts each check into a `Predicate` over a synthetic
// `EvaluationContext` and folds them with `allOf`. The high-level contract
// (`IntentValidationResult.{ok, score, violations, warnings}`) is preserved
// so existing callers — `commands/run/context.ts` and `semantic-linker.ts` —
// see no change.
//
// The port is not cosmetic. Three things actually move:
//
//   1. Validation is now a *single algebraic object* — the predicate built by
//      `compileValidationPredicate(input)` — rather than a procedure. That
//      object can be inspected, pretty-printed, or cached without re-running
//      the checks.
//   2. The verdict lives in Ω = {true, false, unknown} (see `topos/omega.ts`).
//      Closed-world callers see the legacy two-valued behaviour because
//      `buildEvaluationContext` classifies every synthetic token as either
//      provided or denied. The exposed `verdict: Omega` field lets future
//      callers opt into open-world reasoning.
//   3. The score / violation mapping is now a small per-rule registry instead
//      of being threaded through the control flow. Adding a fourth check is
//      one entry in `buildRules`, not another `if` block.

import type { ContextAssemblyOutput } from "./types.js";
import type { GluingResult } from "./gluing.js";
import type { LlmProvider } from "../llm/types.js";
import {
  type EvaluationContext,
  type Omega,
  type Predicate,
  allOf,
  atomForbids,
  atomRequires,
  evaluatePredicate,
} from "../topos/index.js";

// Synthetic tokens used to encode the validator's questions as atoms in the
// predicate algebra. They are namespaced under `__validator__:` so they
// cannot collide with any user-supplied requires/forbids token surfaced via
// the ontology graph.
const TOKEN_GLUING_OK = "__validator__:gluing_ok";
const TOKEN_CANDIDATE_NONEMPTY = "__validator__:candidate_nonempty";
const FORBID_PHRASE_PREFIX = "__validator__:forbid_phrase:";

const FORBID_CONSTRAINT_PREFIX = "FORBID: ";

export interface IntentValidationInput {
  assembled: ContextAssemblyOutput;
  glued: GluingResult;
  candidate: {
    text: string;
    provider: LlmProvider;
    model: string;
  };
  /**
   * When true, the EvaluationContext is built leniently: a forbid phrase
   * that does not syntactically appear in the candidate text is left
   * *unclassified* rather than asserted to be absent. The atom evaluator
   * then returns "unknown" for that rule and the verdict can fold to
   * "unknown" via the Heyting-algebra meet — which is exactly what
   * callers who want to distinguish "decisively rejected" from "could
   * not decide" need.
   *
   * Closed-world (default) preserves the legacy two-valued contract: every
   * forbid token is provided or denied, and verdict ∈ {"true","false"}.
   * The `ok` field is unchanged in both modes — `ok === (verdict ===
   * "true")` — so existing two-valued callers see no behaviour change.
   */
  openWorld?: boolean;
}

export interface IntentValidationResult {
  ok: boolean;
  score: number;
  violations: string[];
  warnings: string[];
  /**
   * Three-valued verdict from the underlying predicate evaluation. Under the
   * default closed-world build of the context this collapses to {true,
   * false} and `ok === (verdict === "true")`. Exposed so future callers can
   * distinguish "decisively rejected" from "could not decide".
   */
  verdict: Omega;
}

interface ValidationRule {
  /** Human-readable id, surfaced in unknown-warnings for traceability. */
  id: string;
  /** Predicate over the synthetic context; must evaluate to "true" to pass. */
  predicate: Predicate;
  /**
   * Score floor when the rule is decisively false. Preserves the legacy
   * calibration: 0.0 (gluing), 0.25 (empty), 0.5 (forbidden phrase).
   */
  failScore: number;
  /** Violation strings emitted when the rule is decisively false. */
  failViolations: () => string[];
}

function isCandidateNonEmpty(text: string): boolean {
  return !!text && text.trim().length > 0;
}

function extractForbiddenPhrases(constraints: readonly string[]): string[] {
  const phrases: string[] = [];
  for (const c of constraints) {
    if (!c.startsWith(FORBID_CONSTRAINT_PREFIX)) continue;
    phrases.push(c.substring(FORBID_CONSTRAINT_PREFIX.length).trim());
  }
  return phrases;
}

/**
 * Build the `EvaluationContext` that the validator's predicate runs
 * against. Two modes:
 *
 *   • Closed-world (default): every synthetic token is either provided or
 *     denied — there is no third state — which is what makes the
 *     validator's externally observable behaviour two-valued.
 *   • Open-world (`openWorld: true`): a forbid token whose phrase does
 *     not appear in the candidate text is left out of both sets, so the
 *     atom evaluator returns "unknown" instead of "true". The conjunction
 *     can then fold to "unknown", letting callers distinguish "phrase
 *     definitely absent in this artefact" from "phrase not seen, but
 *     unobservable channels exist". The structural truths (gluing_ok,
 *     candidate_nonempty) remain decidable in both modes.
 *
 * Exposed for tests and for callers that want to evaluate a custom predicate
 * against the same context as `validateIntent`.
 */
export function buildEvaluationContext(input: IntentValidationInput): EvaluationContext {
  const provided = new Set<string>();
  const denied = new Set<string>();
  const openWorld = input.openWorld === true;

  // Phase ε edge-materialization follow-up. The gluing pipeline UNIONS
  // requires/provides across every fragment in the assembled context
  // (focal + ancestors + edge neighbours when includeEdges:true). For an
  // ingest-derived contract — every node carries the external imports
  // its source file pulled in (`fs`, `crypto`, `zod`, …) — the
  // closed-world gluing always fails because no ontology node can ever
  // provide an external module. The brújula already classifies those as
  // `open_world` requires (schema 1.1); this matches that policy at the
  // gluing layer when the caller opts in via openWorld. The relaxation
  // applies only to `missing_requirement` conflicts; other gluing
  // failure modes (e.g. duplicate definitions, unsatisfiable contracts)
  // still fail the rule unconditionally because they are not external-
  // dependency cases.
  const onlyMissingRequirementConflicts =
    !input.glued.ok &&
    input.glued.conflicts.length > 0 &&
    input.glued.conflicts.every((c) => c.type === "missing_requirement");

  if (input.glued.ok || (openWorld && onlyMissingRequirementConflicts)) {
    provided.add(TOKEN_GLUING_OK);
  } else {
    denied.add(TOKEN_GLUING_OK);
  }

  if (isCandidateNonEmpty(input.candidate.text)) provided.add(TOKEN_CANDIDATE_NONEMPTY);
  else denied.add(TOKEN_CANDIDATE_NONEMPTY);

  for (const phrase of extractForbiddenPhrases(input.assembled.constraints)) {
    const token = FORBID_PHRASE_PREFIX + phrase;
    // A phrase token is "provided" iff the phrase appears in the candidate
    // text. The validator predicate uses `atomForbids` over these tokens, so
    // "provided" → predicate is false (phrase present) and "denied" →
    // predicate is true (phrase absent). In open-world mode the absent
    // branch leaves the token unclassified — the atom evaluator returns
    // "unknown" and the conjunction folds accordingly.
    if (input.candidate.text.includes(phrase)) {
      provided.add(token);
    } else if (!openWorld) {
      denied.add(token);
    }
    // else: open-world + phrase absent → token stays unclassified.
  }

  return { providedTokens: provided, deniedTokens: denied };
}

/**
 * Compile the validator's three-rule registry. Returns both the conjunction
 * predicate (for clients that just want a verdict) and the per-rule list (so
 * scores and violation messages can be attributed to the failing rule).
 */
export function compileValidationPredicate(input: IntentValidationInput): {
  predicate: Predicate;
  rules: ValidationRule[];
} {
  const rules: ValidationRule[] = [
    {
      id: "gluing_ok",
      predicate: atomRequires(TOKEN_GLUING_OK),
      failScore: 0.0,
      failViolations: () =>
        input.glued.conflicts.map(
          (c) => `Gluing conflict: ${c.type} - ${c.message}`,
        ),
    },
    {
      id: "candidate_nonempty",
      predicate: atomRequires(TOKEN_CANDIDATE_NONEMPTY),
      failScore: 0.25,
      failViolations: () => ["empty_candidate"],
    },
  ];

  for (const phrase of extractForbiddenPhrases(input.assembled.constraints)) {
    rules.push({
      id: `forbid:${phrase}`,
      predicate: atomForbids(FORBID_PHRASE_PREFIX + phrase),
      failScore: 0.5,
      failViolations: () => [`Forbidden phrase found: ${phrase}`],
    });
  }

  return { predicate: allOf(rules.map((r) => r.predicate)), rules };
}

export function validateIntent(input: IntentValidationInput): IntentValidationResult {
  const ctx = buildEvaluationContext(input);
  const { predicate, rules } = compileValidationPredicate(input);

  const violations: string[] = [];
  const warnings: string[] = [...input.glued.warnings];
  // When openWorld is on and the gluing only failed on
  // `missing_requirement` conflicts, those are now downgraded to
  // warnings (so the operator still sees them) and the gluing_ok rule
  // evaluates true via buildEvaluationContext above. Without this the
  // conflict messages would silently disappear from the report.
  if (
    input.openWorld === true &&
    !input.glued.ok &&
    input.glued.conflicts.length > 0 &&
    input.glued.conflicts.every((c) => c.type === "missing_requirement")
  ) {
    for (const c of input.glued.conflicts) {
      warnings.push(
        `Open-world tolerated gluing conflict: ${c.type} - ${c.message}`,
      );
    }
  }
  let score = 1.0;

  for (const rule of rules) {
    const verdict = evaluatePredicate(rule.predicate, ctx);
    if (verdict === "false") {
      score = Math.min(score, rule.failScore);
      violations.push(...rule.failViolations());
    } else if (verdict === "unknown") {
      // In closed-world mode no rule should land here; if one does, the
      // safe default is to surface it as a warning rather than mutate
      // `ok`. This keeps the high-level contract two-valued while still
      // making the three-valued evaluator's verdict observable.
      warnings.push(`Undecided validator rule: ${rule.id}`);
    }
  }

  const verdict = evaluatePredicate(predicate, ctx);

  return {
    ok: verdict === "true",
    score,
    violations,
    warnings,
    verdict,
  };
}
