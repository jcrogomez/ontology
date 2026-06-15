// Public surface for the rule-as-predicate algebra.
//
// This module is purely additive: it does not replace `intent-validator.ts`
// or `gluing.ts`. It provides a more general layer that those modules could
// be ported onto in a follow-up PR.
//
// Typical usage:
//
//     import {
//       compileNodeRules,
//       evaluatePredicate,
//       type EvaluationContext,
//     } from "ontology/runtime/topos";
//
//     const provided = new Set([...neighborhoodTokens, ...focal.provides]);
//     const denied = new Set<string>(); // partial-graph: leave empty
//     const predicate = compileNodeRules(focal, { providedTokens: provided });
//     const verdict = evaluatePredicate(predicate, {
//       providedTokens: provided,
//       deniedTokens: denied,
//     });
//     if (verdict === "true") { /* accept */ }
//     if (verdict === "false") { /* reject */ }
//     if (verdict === "unknown") { /* recommend: warn but don't fail */ }

export {
  type Omega,
  omegaAnd,
  omegaOr,
  omegaNot,
  omegaImplies,
} from "./omega.js";

export {
  type Atom,
  type Predicate,
  type EvaluationContext,
  pTrue,
  pFalse,
  atomProvides,
  atomRequires,
  atomForbids,
  pAnd,
  pOr,
  pNot,
  pImplies,
  allOf,
  anyOf,
  evaluatePredicate,
} from "./predicate.js";

export {
  type CompilableNode,
  type CompileNeighborhood,
  compileNodeRules,
} from "./rule-compiler.js";
