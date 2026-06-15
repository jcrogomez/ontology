// §3.9 validator port — closed-world parity (the last T1 gate).
//
// MATHEMATICAL_CLAIMS.md §3.9 graded the three-valued Ω predicate ALGEBRA as
// T1 but the VALIDATOR PORT as T2, with the named rigor improvement: "add a
// property test that evaluatePredicate(p, ctx) over the closed-world reduction
// agrees with a hand-rolled Boolean evaluator for the same p (parity contract
// for the validator's domain)". This file is that test.
//
// The claim, precisely: under a CLOSED-WORLD context — every token in the
// universe is either provided or denied, nothing is left open — the
// three-valued evaluator collapses to two-valued and agrees, predicate for
// predicate, with ordinary Boolean logic. That is what licenses the validator
// to expose a Boolean `result.ok` without lying: when the world is closed, the
// Ω machinery is provably the same function as a Boolean evaluator. We pin it
// EXHAUSTIVELY over a small universe (every closed world × a generated forest
// of raw predicate trees that exercise every evaluator branch), and we also
// pin the converse — that an OPEN world genuinely produces `unknown` — so the
// three-valuedness is real and not a Boolean algebra wearing an Ω costume.

import { describe, it, expect } from "vitest";
import {
  type Atom,
  type Predicate,
  type EvaluationContext,
  pTrue,
  pFalse,
  atomProvides,
  atomRequires,
  atomForbids,
  evaluatePredicate,
} from "../../../src/laws/topos/predicate.js";

// ── Oracle: a plain two-valued Boolean evaluator over a `provided` set. ──────
// Mirrors the intended closed-world semantics: provides/requires hold iff the
// token is provided; forbids holds iff the token is NOT provided.
function boolEvalAtom(atom: Atom, provided: ReadonlySet<string>): boolean {
  switch (atom.tag) {
    case "provides":
    case "requires":
      return provided.has(atom.token);
    case "forbids":
      return !provided.has(atom.token);
  }
}

function boolEval(p: Predicate, provided: ReadonlySet<string>): boolean {
  switch (p.tag) {
    case "true": return true;
    case "false": return false;
    case "atom": return boolEvalAtom(p.atom, provided);
    case "and": return boolEval(p.left, provided) && boolEval(p.right, provided);
    case "or": return boolEval(p.left, provided) || boolEval(p.right, provided);
    case "not": return !boolEval(p.inner, provided);
    case "implies": return !boolEval(p.antecedent, provided) || boolEval(p.consequent, provided);
  }
}

// ── Raw tree constructors (bypass the simplifying smart constructors so the ──
// evaluator's and/or/not/implies branches are exercised with real operands). ─
const rawAnd = (l: Predicate, r: Predicate): Predicate => ({ tag: "and", left: l, right: r });
const rawOr = (l: Predicate, r: Predicate): Predicate => ({ tag: "or", left: l, right: r });
const rawNot = (i: Predicate): Predicate => ({ tag: "not", inner: i });
const rawImplies = (a: Predicate, c: Predicate): Predicate => ({ tag: "implies", antecedent: a, consequent: c });

const UNIVERSE = ["a", "b", "c"];

// Leaves: every atom over the universe (all three tags) plus the constants.
const LEAVES: Predicate[] = [
  ...UNIVERSE.flatMap((t) => [atomProvides(t), atomRequires(t), atomForbids(t)]),
  pTrue,
  pFalse,
];

// Depth-2 forest: not(leaf) and every binary combinator over every ordered
// pair of leaves. Under a closed world each leaf is two-valued, so this
// exhausts every row of every operator's truth table.
function buildForest(): Predicate[] {
  const forest: Predicate[] = [...LEAVES];
  for (const p of LEAVES) forest.push(rawNot(p));
  for (const l of LEAVES) {
    for (const r of LEAVES) {
      forest.push(rawAnd(l, r), rawOr(l, r), rawImplies(l, r));
    }
  }
  // A few hand-built depth-3 nests for good measure (De Morgan shapes etc.).
  const A = atomProvides("a");
  const B = atomRequires("b");
  const C = atomForbids("c");
  forest.push(
    rawNot(rawAnd(A, B)),
    rawOr(rawNot(A), rawNot(B)),
    rawImplies(rawAnd(A, B), C),
    rawAnd(rawOr(A, C), rawImplies(B, A)),
  );
  return forest;
}

// Every closed world over the universe: `provided` ranges over all 2^|U|
// subsets; `denied` is its complement so NO token is left open.
function allClosedWorlds(): Array<{ provided: Set<string>; ctx: EvaluationContext }> {
  const worlds: Array<{ provided: Set<string>; ctx: EvaluationContext }> = [];
  const n = UNIVERSE.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const provided = new Set<string>();
    for (let i = 0; i < n; i++) if (mask & (1 << i)) provided.add(UNIVERSE[i]);
    const denied = new Set(UNIVERSE.filter((t) => !provided.has(t)));
    worlds.push({ provided, ctx: { providedTokens: provided, deniedTokens: denied } });
  }
  return worlds;
}

describe("§3.9 validator port — closed-world parity with Boolean logic", () => {
  const forest = buildForest();
  const worlds = allClosedWorlds();

  it(`exhaustive parity: evaluatePredicate == Boolean oracle on every (predicate × closed world)`, () => {
    let checks = 0;
    for (const p of forest) {
      for (const { provided, ctx } of worlds) {
        const omega = evaluatePredicate(p, ctx);
        const expected = boolEval(p, provided) ? "true" : "false";
        expect(omega).toBe(expected);
        checks++;
      }
    }
    // Guard that the loop actually ran a meaningful number of checks
    // (forest ~ 400 preds × 8 worlds), so a future refactor that empties
    // the forest can't make this test vacuously pass.
    expect(checks).toBeGreaterThan(3000);
  });

  it("closed-world evaluation NEVER yields 'unknown' (the reduction is total / two-valued)", () => {
    for (const p of forest) {
      for (const { ctx } of worlds) {
        expect(evaluatePredicate(p, ctx)).not.toBe("unknown");
      }
    }
  });

  it("open world genuinely yields 'unknown' — three-valuedness is real, not a Boolean costume", () => {
    // A token in neither set is open. The evaluator must distinguish this from
    // both true and false — otherwise Ω would just be a relabelled Bool and the
    // topos framing would be empty.
    const openCtx: EvaluationContext = { providedTokens: new Set(["a"]), deniedTokens: new Set(["b"]) };
    expect(evaluatePredicate(atomProvides("c"), openCtx)).toBe("unknown"); // c is open
    expect(evaluatePredicate(atomForbids("c"), openCtx)).toBe("unknown");
    // unknown propagates through compounds (Kleene), distinct from a forced bool
    expect(evaluatePredicate(rawAnd(atomProvides("a"), atomProvides("c")), openCtx)).toBe("unknown");
    // ...but a short-circuit still resolves: false ∧ unknown = false.
    expect(evaluatePredicate(rawAnd(atomForbids("a"), atomProvides("c")), openCtx)).toBe("false");
  });
});
