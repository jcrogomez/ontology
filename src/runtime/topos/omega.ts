// Three-valued subobject classifier Ω for the rule algebra.
//
// In an elementary topos the subobject classifier Ω is the object such that
// subobjects of any X are in bijection with maps X → Ω. Classically Ω = {⊤, ⊥}
// (Boolean), but constructively / in many sheaf topoi Ω carries more truth
// values. Here we adopt three values to model partial knowledge of a graph:
//
//   "true"    — the predicate is supported by the current evidence
//   "false"   — the predicate is contradicted by the current evidence
//   "unknown" — the evidence is insufficient to decide either way
//
// The operators below form a Kleene-style strong three-valued logic that is
// monotone wrt information: refining "unknown" → "true" or "unknown" → "false"
// can only refine a compound result in the same direction (it never flips a
// definite verdict). Concretely:
//
//   • "false" dominates `and` (if any conjunct is false the conjunction is)
//   • "true"  dominates `or`  (if any disjunct  is true  the disjunction is)
//   • otherwise "unknown" propagates
//
// `omegaImplies(a, b) := omegaOr(omegaNot(a), b)` matches the Kleene reading
// of material implication and agrees with classical → on the {true, false}
// slice. We do NOT use the intuitionistic Heyting implication of Ω-as-frame
// here; the goal is a useful operational logic for the validator, not a
// fully constructive internal language. The doc spells this out.

export type Omega = "true" | "false" | "unknown";

/**
 * Conjunction. "false" dominates; otherwise "unknown" propagates; else "true".
 *
 * Truth table:
 *   T ∧ T = T    T ∧ F = F    T ∧ U = U
 *   F ∧ T = F    F ∧ F = F    F ∧ U = F
 *   U ∧ T = U    U ∧ F = F    U ∧ U = U
 */
export function omegaAnd(a: Omega, b: Omega): Omega {
  if (a === "false" || b === "false") return "false";
  if (a === "unknown" || b === "unknown") return "unknown";
  return "true";
}

/**
 * Disjunction. "true" dominates; otherwise "unknown" propagates; else "false".
 *
 * Truth table:
 *   T ∨ T = T    T ∨ F = T    T ∨ U = T
 *   F ∨ T = T    F ∨ F = F    F ∨ U = U
 *   U ∨ T = T    U ∨ F = U    U ∨ U = U
 */
export function omegaOr(a: Omega, b: Omega): Omega {
  if (a === "true" || b === "true") return "true";
  if (a === "unknown" || b === "unknown") return "unknown";
  return "false";
}

/**
 * Negation. "unknown" is a fixed point — refusing to commit means we still
 * cannot commit to its negation either.
 */
export function omegaNot(a: Omega): Omega {
  if (a === "true") return "false";
  if (a === "false") return "true";
  return "unknown";
}

/**
 * Material implication, defined classically as ¬a ∨ b. Agrees with → on the
 * Boolean slice; "unknown" propagates wherever neither side is decisive.
 */
export function omegaImplies(a: Omega, b: Omega): Omega {
  return omegaOr(omegaNot(a), b);
}
