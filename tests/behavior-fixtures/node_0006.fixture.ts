import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0006 — src/runtime/compile/post/runtime-check.ts
// Tested entry: clamp(n, lo, hi) — pure numeric helper exported from
// the module. A regen that re-derives the wrong ordering of min/max
// or drops the bounds would diverge here.

export const cases: BehaviorCase[] = [
  {
    name: "clamp — value within range passes through",
    setup: () => ({ n: 150, lo: 100, hi: 200 }),
    invoke: (api, ctx) =>
      (api as { clamp: (n: number, lo: number, hi: number) => number }).clamp(
        (ctx as { n: number }).n,
        (ctx as { lo: number }).lo,
        (ctx as { hi: number }).hi,
      ),
    assert: (r) => r === 150,
  },
  {
    name: "clamp — overshoots floor to lo",
    setup: () => ({ n: 50, lo: 100, hi: 200 }),
    invoke: (api, ctx) =>
      (api as { clamp: (n: number, lo: number, hi: number) => number }).clamp(
        (ctx as { n: number }).n,
        (ctx as { lo: number }).lo,
        (ctx as { hi: number }).hi,
      ),
    assert: (r) => r === 100,
  },
];
