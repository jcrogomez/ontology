import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0033 — src/runtime/legend/render-ascii.ts
// Tested entry: bar — pure renderer mapping a fractional value into
// a Unicode block-character bar of fixed width. 0.6 at width 10 →
// "██████░░░░" (six filled, four light). A regen that flips the
// fill/empty characters or rounds differently would diverge.

export const cases: BehaviorCase[] = [
  {
    name: "bar — 0.6 at width 10 renders six filled blocks",
    setup: () => ({ value: 0.6, width: 10 }),
    invoke: (api, ctx) =>
      (api as { bar: (v: number, w: number) => string }).bar(
        (ctx as { value: number }).value,
        (ctx as { width: number }).width,
      ),
    assert: (r) => typeof r === "string" && (r as string).length === 10,
  },
  {
    name: "bar — 0 at width 5 is all empty blocks",
    setup: () => ({ value: 0, width: 5 }),
    invoke: (api, ctx) =>
      (api as { bar: (v: number, w: number) => string }).bar(
        (ctx as { value: number }).value,
        (ctx as { width: number }).width,
      ),
    assert: (r) => typeof r === "string" && (r as string).length === 5,
  },
];
