// compileNodeRules — lift a node's declarative `requires` / `provides` /
// `forbids` arrays into a single composed predicate over its neighborhood.
//
// Why a separate module from predicate.ts: the predicate algebra is independent
// of any particular schema. This file is the bridge from "a node as written by
// a human" to a Predicate tree. Keeping it isolated means a future schema
// change (e.g. adding `optional` or `if/then` clauses) only touches this file.
//
// Semantics matrix (for a single declaration):
//
//   declares          → predicate                      → fails when…
//   ──────────        ──────────────────────────       ──────────────────
//   requires: T       requires(T)                       T not in scope
//   forbids:  T       forbids(T)                        T in scope
//   provides: T       (no clause; provides is an
//                      assertion the caller already
//                      folded into providedTokens)
//
// The full compiled predicate is a conjunction:
//
//     ∧_{r ∈ requires} requires(r)   ∧   ∧_{f ∈ forbids} forbids(f)
//
// `provides` declarations on the focal node are intentionally NOT injected
// into the predicate tree. Per the spec, the caller is responsible for adding
// the focal's `provides` to `providedTokens` BEFORE calling `compileNodeRules`.
// This keeps the compiler a pure mapping over the neighborhood: it never
// rewrites the context, and double-counting cannot happen.
//
// Empty arrays are handled implicitly by `allOf`, which returns `pTrue` for
// an empty list — a node with no constraints trivially passes.

import {
  type Predicate,
  atomRequires,
  atomForbids,
  allOf,
} from "./predicate.js";

export interface CompileNeighborhood {
  /** Tokens visible to the node (caller must already include focal `provides`). */
  providedTokens: ReadonlySet<string>;
  /**
   * Optional explicit denial set. When omitted, evaluation will treat any
   * unseen token as "unknown" — fine for partial-graph reasoning. When the
   * caller wants closed-world Boolean parity with `glueFragments`, they can
   * pass the complement (every token they consider classified-but-absent).
   */
  deniedTokens?: ReadonlySet<string>;
}

export interface CompilableNode {
  requires?: string[];
  provides?: string[];
  forbids?: string[];
}

/**
 * Compile a node's rule declarations into a single predicate. The returned
 * predicate, evaluated against a context that already folds the focal node's
 * `provides` into `providedTokens`, reproduces the accept/reject decision of
 * `glueFragments` on the same neighborhood (modulo three-valued "unknown"
 * cases that classical gluing cannot express).
 *
 * Note: `neighborhood` is currently used only as the schema-typing carrier —
 * the predicate itself is independent of which tokens are *actually* in
 * scope; that lookup happens at evaluation time. We keep the parameter for
 * API symmetry with future compilers that may want to specialise over the
 * known-token set (e.g. partial evaluation).
 */
export function compileNodeRules(
  node: CompilableNode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  neighborhood: CompileNeighborhood,
): Predicate {
  // De-duplicate within each declaration array. A user writing
  // `requires: ["X", "X"]` produces a redundant clause, and `allOf` would
  // happily nest it; collapsing here keeps the tree minimal.
  const requires = Array.from(new Set(node.requires ?? []));
  const forbids = Array.from(new Set(node.forbids ?? []));

  const requiresClauses = requires.map(atomRequires);
  const forbidsClauses = forbids.map(atomForbids);

  return allOf([...requiresClauses, ...forbidsClauses]);
}
