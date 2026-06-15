import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0091 — src/runtime/graph/poset.ts (second fixture from this file)
// Tested entry: posetIndex — pure ordinal mapping from an abstraction-
// level label ("domain", "project", "module", "artifact", …) to a
// fixed integer ordinal. A regen that reorders the poset (changes
// what "domain" maps to) would shift this number and diverge.

export const cases: BehaviorCase[] = [
  {
    name: "posetIndex — 'domain' maps to its canonical ordinal",
    setup: () => ({ level: "domain" }),
    invoke: (api, ctx) =>
      (api as { posetIndex: (l: string) => number }).posetIndex(
        (ctx as { level: string }).level,
      ),
    assert: (r) => typeof r === "number" && Number.isInteger(r),
  },
];
