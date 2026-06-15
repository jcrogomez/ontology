// First-class predicates over a node-in-context.
//
// A `Predicate` is a small expression tree built from atomic checks against
// an `EvaluationContext` (the set of tokens known to be provided / known to
// be denied). Internal nodes compose with the three-valued operators from
// `./omega.ts`. Two leaves call out for explanation:
//
//   • "requires" and "provides" reduce to the same atomic question — "is this
//     token in the providedTokens set?" The two tags are kept distinct only
//     to preserve the user's intent at compile time (and so that a future
//     translator could surface different diagnostics).
//   • "forbids" is the negation: it is true exactly when the token is NOT in
//     the providedTokens set. With the three-valued reading, `forbids T` is:
//       - "true"    if T is explicitly denied (in deniedTokens)
//       - "false"   if T is explicitly provided
//       - "unknown" otherwise (we can't yet tell whether some unseen neighbor
//         might still provide T)
//
// The closed-world assumption (deniedTokens covers everything not provided)
// collapses "unknown" away and recovers a Boolean evaluator.

import {
  type Omega,
  omegaAnd,
  omegaOr,
  omegaNot,
  omegaImplies,
} from "./omega.js";

// ── Atomic predicates ───────────────────────────────────────────────────────

export type Atom =
  | { tag: "provides"; token: string }
  | { tag: "requires"; token: string }
  | { tag: "forbids"; token: string };

// ── Predicate algebra ───────────────────────────────────────────────────────
//
// A discriminated union so both the evaluator and any future pretty-printer /
// optimiser can pattern-match exhaustively without a visitor pattern.

export type Predicate =
  | { tag: "atom"; atom: Atom }
  | { tag: "and"; left: Predicate; right: Predicate }
  | { tag: "or"; left: Predicate; right: Predicate }
  | { tag: "not"; inner: Predicate }
  | { tag: "implies"; antecedent: Predicate; consequent: Predicate }
  | { tag: "true" }
  | { tag: "false" };

// ── Smart constructors ──────────────────────────────────────────────────────

export const pTrue: Predicate = { tag: "true" };
export const pFalse: Predicate = { tag: "false" };

export function atomProvides(token: string): Predicate {
  return { tag: "atom", atom: { tag: "provides", token } };
}

export function atomRequires(token: string): Predicate {
  return { tag: "atom", atom: { tag: "requires", token } };
}

export function atomForbids(token: string): Predicate {
  return { tag: "atom", atom: { tag: "forbids", token } };
}

export function pAnd(left: Predicate, right: Predicate): Predicate {
  // Identity / annihilator simplifications keep the compiled tree small for
  // common compileNodeRules outputs (e.g. a node with no `requires` should
  // reduce to `pTrue`, not a forest of `and(true, true, ...)`).
  if (left.tag === "true") return right;
  if (right.tag === "true") return left;
  if (left.tag === "false" || right.tag === "false") return pFalse;
  return { tag: "and", left, right };
}

export function pOr(left: Predicate, right: Predicate): Predicate {
  if (left.tag === "false") return right;
  if (right.tag === "false") return left;
  if (left.tag === "true" || right.tag === "true") return pTrue;
  return { tag: "or", left, right };
}

export function pNot(inner: Predicate): Predicate {
  if (inner.tag === "true") return pFalse;
  if (inner.tag === "false") return pTrue;
  if (inner.tag === "not") return inner.inner; // double negation — exact for Ω
  return { tag: "not", inner };
}

export function pImplies(antecedent: Predicate, consequent: Predicate): Predicate {
  if (antecedent.tag === "false") return pTrue; // ⊥ → anything is ⊤
  if (consequent.tag === "true") return pTrue;  // anything → ⊤ is ⊤
  if (antecedent.tag === "true") return consequent;
  return { tag: "implies", antecedent, consequent };
}

/**
 * Conjunction over a list. Returns `pTrue` for empty input — the vacuous
 * conjunction is true, matching the empty-`requires` case in compileNodeRules.
 */
export function allOf(predicates: ReadonlyArray<Predicate>): Predicate {
  return predicates.reduce<Predicate>((acc, p) => pAnd(acc, p), pTrue);
}

/**
 * Disjunction over a list. Returns `pFalse` for empty input — the vacuous
 * disjunction is false. Useful when synthesising "at least one of these
 * tokens must be provided" rules.
 */
export function anyOf(predicates: ReadonlyArray<Predicate>): Predicate {
  return predicates.reduce<Predicate>((acc, p) => pOr(acc, p), pFalse);
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export interface EvaluationContext {
  /** Tokens explicitly known to be provided in the focal node's neighborhood. */
  providedTokens: ReadonlySet<string>;
  /**
   * Tokens explicitly known NOT to be provided (the closed-world set). Tokens
   * present in neither `providedTokens` nor `deniedTokens` evaluate to
   * "unknown". Callers operating under a closed-world assumption should pass
   * the complement of `providedTokens` here.
   */
  deniedTokens: ReadonlySet<string>;
}

function evaluateAtom(atom: Atom, ctx: EvaluationContext): Omega {
  const { token } = atom;
  switch (atom.tag) {
    case "provides":
    case "requires": {
      // Both decompose to "is this token in scope?". Keeping them as separate
      // tags lets diagnostics differentiate, but their semantics agree.
      if (ctx.providedTokens.has(token)) return "true";
      if (ctx.deniedTokens.has(token)) return "false";
      return "unknown";
    }
    case "forbids": {
      // "Forbidden token must not be provided" — true when explicitly denied,
      // false when explicitly provided, unknown otherwise.
      if (ctx.providedTokens.has(token)) return "false";
      if (ctx.deniedTokens.has(token)) return "true";
      return "unknown";
    }
  }
}

/**
 * Evaluate a predicate against a context, returning a three-valued Omega.
 *
 * Recursion is structural and total — every `Predicate` shape is handled and
 * every recursive call descends to a strict subterm, so termination is
 * guaranteed for any finite predicate tree.
 */
export function evaluatePredicate(p: Predicate, ctx: EvaluationContext): Omega {
  switch (p.tag) {
    case "true": return "true";
    case "false": return "false";
    case "atom": return evaluateAtom(p.atom, ctx);
    case "and": return omegaAnd(evaluatePredicate(p.left, ctx), evaluatePredicate(p.right, ctx));
    case "or": return omegaOr(evaluatePredicate(p.left, ctx), evaluatePredicate(p.right, ctx));
    case "not": return omegaNot(evaluatePredicate(p.inner, ctx));
    case "implies":
      return omegaImplies(
        evaluatePredicate(p.antecedent, ctx),
        evaluatePredicate(p.consequent, ctx),
      );
  }
}
