import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0055 — src/runtime/topos/omega.ts
// Tested entry: omegaAnd — pure three-valued logic conjunction over
// the subobject classifier Ω = { "true", "false", "unknown" }. The
// truth table is small enough to be exhaustively fixture-tested,
// which is exactly the v0 use-case for behavioural divergence.

type Omega = "true" | "false" | "unknown";

export const cases: BehaviorCase[] = [
  {
    name: "omegaAnd — true ∧ true = true",
    setup: () => ({ a: "true" as Omega, b: "true" as Omega }),
    invoke: (api, ctx) => {
      const c = ctx as { a: Omega; b: Omega };
      return (api as { omegaAnd: (a: Omega, b: Omega) => Omega }).omegaAnd(
        c.a,
        c.b,
      );
    },
    assert: (r) => r === "true",
  },
  {
    name: "omegaAnd — unknown ∧ true = unknown (LEM-respecting)",
    setup: () => ({ a: "unknown" as Omega, b: "true" as Omega }),
    invoke: (api, ctx) => {
      const c = ctx as { a: Omega; b: Omega };
      return (api as { omegaAnd: (a: Omega, b: Omega) => Omega }).omegaAnd(
        c.a,
        c.b,
      );
    },
    assert: (r) => r === "unknown",
  },
  {
    name: "omegaAnd — false ∧ anything = false (absorbing element)",
    setup: () => ({ a: "false" as Omega, b: "unknown" as Omega }),
    invoke: (api, ctx) => {
      const c = ctx as { a: Omega; b: Omega };
      return (api as { omegaAnd: (a: Omega, b: Omega) => Omega }).omegaAnd(
        c.a,
        c.b,
      );
    },
    assert: (r) => r === "false",
  },
];
