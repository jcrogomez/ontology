import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0011 — src/runtime/context/gluing.ts
// Tested entry: glueFragments — pure merge over an array of context
// fragments. Empty input lands the documented warning branch
// ("No context fragments provided.") and a default `merged` shape.
// A regen that changes the warning text or restructures `merged`
// would diverge.

export const cases: BehaviorCase[] = [
  {
    name: "glueFragments — empty input yields warning-only result",
    setup: () => ({ fragments: [] }),
    invoke: (api, ctx) =>
      (
        api as { glueFragments: (f: readonly unknown[]) => unknown }
      ).glueFragments((ctx as { fragments: readonly unknown[] }).fragments),
    assert: (r) => {
      if (typeof r !== "object" || r === null) return false;
      const o = r as { ok?: unknown; warnings?: unknown };
      return (
        o.ok === true &&
        Array.isArray(o.warnings) &&
        (o.warnings as string[]).some((w) => /no context fragments/i.test(w))
      );
    },
  },
];
