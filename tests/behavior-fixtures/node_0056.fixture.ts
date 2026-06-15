import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0056 — src/runtime/topos/predicate.ts
// Tested entries: evaluatePredicate(p, ctx) and the pNot smart constructor.
// The cases pin the three-valued atom semantics (provided/denied/unseen),
// the forbids inversion, Kleene and/or propagation of "unknown", and the
// double-negation collapse — places where a regen could quietly collapse Ω
// back to Boolean or flip the forbids polarity.

type Predicate =
  | { tag: "atom"; atom: { tag: string; token: string } }
  | { tag: "and" | "or"; left: Predicate; right: Predicate }
  | { tag: "not"; inner: Predicate }
  | { tag: "true" }
  | { tag: "false" };

type Ctx = { providedTokens: ReadonlySet<string>; deniedTokens: ReadonlySet<string> };

type PredicateApi = {
  evaluatePredicate: (p: Predicate, ctx: Ctx) => string;
  pNot: (inner: Predicate) => Predicate;
};

const requiresAtom = (token: string): Predicate => ({
  tag: "atom",
  atom: { tag: "requires", token },
});
const forbidsAtom = (token: string): Predicate => ({
  tag: "atom",
  atom: { tag: "forbids", token },
});

export const cases: BehaviorCase[] = [
  {
    name: "evaluatePredicate — requires atom is three-valued: provided/denied/unseen",
    setup: () => ({ provided: ["tok_in"], denied: ["tok_out"] }),
    invoke: (api, ctx) => {
      const c = ctx as { provided: string[]; denied: string[] };
      const evalCtx: Ctx = {
        providedTokens: new Set(c.provided),
        deniedTokens: new Set(c.denied),
      };
      const ev = (api as PredicateApi).evaluatePredicate;
      return [
        ev(requiresAtom("tok_in"), evalCtx),
        ev(requiresAtom("tok_out"), evalCtx),
        ev(requiresAtom("tok_unseen"), evalCtx),
      ];
    },
    assert: (r) => {
      const v = r as string[];
      return v[0] === "true" && v[1] === "false" && v[2] === "unknown";
    },
  },
  {
    name: "evaluatePredicate — forbids inverts: provided→false, denied→true",
    setup: () => ({ provided: ["tok_in"], denied: ["tok_out"] }),
    invoke: (api, ctx) => {
      const c = ctx as { provided: string[]; denied: string[] };
      const evalCtx: Ctx = {
        providedTokens: new Set(c.provided),
        deniedTokens: new Set(c.denied),
      };
      const ev = (api as PredicateApi).evaluatePredicate;
      return [ev(forbidsAtom("tok_in"), evalCtx), ev(forbidsAtom("tok_out"), evalCtx)];
    },
    assert: (r) => {
      const v = r as string[];
      return v[0] === "false" && v[1] === "true";
    },
  },
  {
    name: "evaluatePredicate — Kleene and/or with an unknown operand",
    setup: () => ({ provided: ["tok_in"], denied: [] as string[] }),
    invoke: (api, ctx) => {
      const c = ctx as { provided: string[]; denied: string[] };
      const evalCtx: Ctx = {
        providedTokens: new Set(c.provided),
        deniedTokens: new Set(c.denied),
      };
      const t = requiresAtom("tok_in"); // → "true"
      const u = requiresAtom("tok_unseen"); // → "unknown"
      const ev = (api as PredicateApi).evaluatePredicate;
      return {
        and: ev({ tag: "and", left: t, right: u }, evalCtx),
        or: ev({ tag: "or", left: t, right: u }, evalCtx),
      };
    },
    assert: (r) => {
      const v = r as { and: string; or: string };
      return v.and === "unknown" && v.or === "true";
    },
  },
  {
    name: "pNot — double negation collapses, constants flip",
    setup: () => ({ token: "tok_x" }),
    invoke: (api, ctx) => {
      const atom = requiresAtom((ctx as { token: string }).token);
      const not = (api as PredicateApi).pNot;
      return [not({ tag: "not", inner: atom }), not({ tag: "true" })];
    },
    assert: (r) => {
      const v = r as Predicate[];
      return v[0].tag === "atom" && v[1].tag === "false";
    },
  },
];
