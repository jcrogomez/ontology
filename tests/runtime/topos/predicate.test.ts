import { describe, it, expect } from "vitest";
import {
  type EvaluationContext,
  type Predicate,
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
} from "../../../src/laws/topos/predicate.js";

function ctx(provided: string[], denied: string[] = []): EvaluationContext {
  return {
    providedTokens: new Set(provided),
    deniedTokens: new Set(denied),
  };
}

describe("predicate atoms", () => {
  it("requires/provides are true when token is provided", () => {
    const c = ctx(["alpha"]);
    expect(evaluatePredicate(atomRequires("alpha"), c)).toBe("true");
    expect(evaluatePredicate(atomProvides("alpha"), c)).toBe("true");
  });

  it("requires/provides are false when token is denied", () => {
    const c = ctx([], ["alpha"]);
    expect(evaluatePredicate(atomRequires("alpha"), c)).toBe("false");
    expect(evaluatePredicate(atomProvides("alpha"), c)).toBe("false");
  });

  it("requires/provides are unknown when token is neither provided nor denied", () => {
    const c = ctx([], []);
    expect(evaluatePredicate(atomRequires("alpha"), c)).toBe("unknown");
    expect(evaluatePredicate(atomProvides("alpha"), c)).toBe("unknown");
  });

  it("forbids is true when token is denied (absent), false when provided", () => {
    expect(evaluatePredicate(atomForbids("alpha"), ctx([], ["alpha"]))).toBe("true");
    expect(evaluatePredicate(atomForbids("alpha"), ctx(["alpha"]))).toBe("false");
  });

  it("forbids is unknown when neither provided nor denied", () => {
    expect(evaluatePredicate(atomForbids("alpha"), ctx([], []))).toBe("unknown");
  });
});

describe("smart constructors simplify", () => {
  it("pAnd absorbs pTrue and short-circuits on pFalse", () => {
    expect(pAnd(pTrue, atomRequires("a"))).toEqual(atomRequires("a"));
    expect(pAnd(atomRequires("a"), pTrue)).toEqual(atomRequires("a"));
    expect(pAnd(pFalse, atomRequires("a"))).toEqual(pFalse);
    expect(pAnd(atomRequires("a"), pFalse)).toEqual(pFalse);
  });

  it("pOr absorbs pFalse and short-circuits on pTrue", () => {
    expect(pOr(pFalse, atomRequires("a"))).toEqual(atomRequires("a"));
    expect(pOr(atomRequires("a"), pFalse)).toEqual(atomRequires("a"));
    expect(pOr(pTrue, atomRequires("a"))).toEqual(pTrue);
    expect(pOr(atomRequires("a"), pTrue)).toEqual(pTrue);
  });

  it("pNot collapses double negation", () => {
    const p = atomRequires("a");
    expect(pNot(pNot(p))).toEqual(p);
    expect(pNot(pTrue)).toEqual(pFalse);
    expect(pNot(pFalse)).toEqual(pTrue);
  });

  it("pImplies handles edge cases", () => {
    expect(pImplies(pFalse, atomRequires("a"))).toEqual(pTrue);
    expect(pImplies(atomRequires("a"), pTrue)).toEqual(pTrue);
    expect(pImplies(pTrue, atomRequires("a"))).toEqual(atomRequires("a"));
  });

  it("allOf reduces empty input to pTrue (vacuous conjunction)", () => {
    expect(allOf([])).toEqual(pTrue);
  });

  it("anyOf reduces empty input to pFalse (vacuous disjunction)", () => {
    expect(anyOf([])).toEqual(pFalse);
  });
});

describe("compound evaluation", () => {
  it("conjunction of two satisfied requirements is true", () => {
    const p = pAnd(atomRequires("a"), atomRequires("b"));
    expect(evaluatePredicate(p, ctx(["a", "b"]))).toBe("true");
  });

  it("conjunction with one denied is false", () => {
    const p = pAnd(atomRequires("a"), atomRequires("b"));
    expect(evaluatePredicate(p, ctx(["a"], ["b"]))).toBe("false");
  });

  it("conjunction with one unknown propagates unknown", () => {
    const p = pAnd(atomRequires("a"), atomRequires("b"));
    expect(evaluatePredicate(p, ctx(["a"]))).toBe("unknown");
  });

  it("disjunction of two unknowns is unknown", () => {
    const p = pOr(atomRequires("a"), atomRequires("b"));
    expect(evaluatePredicate(p, ctx())).toBe("unknown");
  });

  it("disjunction is true if any branch is true", () => {
    const p = pOr(atomRequires("a"), atomRequires("b"));
    expect(evaluatePredicate(p, ctx(["a"], ["b"]))).toBe("true");
  });

  it("implies: true antecedent, false consequent → false", () => {
    const p = pImplies(atomRequires("a"), atomRequires("b"));
    expect(evaluatePredicate(p, ctx(["a"], ["b"]))).toBe("false");
  });

  it("implies: false antecedent → true regardless of consequent", () => {
    const p = pImplies(atomRequires("a"), atomRequires("b"));
    expect(evaluatePredicate(p, ctx([], ["a"]))).toBe("true");
  });

  it("not on a forbidden-but-provided atom returns true", () => {
    const p = pNot(atomForbids("a"));
    expect(evaluatePredicate(p, ctx(["a"]))).toBe("true");
  });

  it("allOf evaluates a list of requirements", () => {
    const p = allOf([atomRequires("a"), atomRequires("b"), atomForbids("c")]);
    expect(evaluatePredicate(p, ctx(["a", "b"], ["c"]))).toBe("true");
    expect(evaluatePredicate(p, ctx(["a", "b", "c"]))).toBe("false");
  });

  it("anyOf evaluates a list of alternatives", () => {
    const p = anyOf([atomRequires("a"), atomRequires("b")]);
    expect(evaluatePredicate(p, ctx(["b"]))).toBe("true");
    expect(evaluatePredicate(p, ctx([], ["a", "b"]))).toBe("false");
  });

  it("deeply nested predicates evaluate correctly", () => {
    // (a ∧ b) → (¬c ∨ d)
    const p: Predicate = pImplies(
      pAnd(atomRequires("a"), atomRequires("b")),
      pOr(pNot(atomForbids("c")), atomRequires("d")),
    );
    // a, b provided; c provided (so forbids(c) is false → ¬forbids(c) is true);
    // d unknown — but the pOr is already true.
    expect(evaluatePredicate(p, ctx(["a", "b", "c"]))).toBe("true");
  });
});
