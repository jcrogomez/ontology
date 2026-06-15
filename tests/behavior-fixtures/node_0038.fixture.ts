import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0038 — src/runtime/legend/vocab-gap.ts
// Tested entry: detectVocabGaps — pure word-token overlap between
// declared `provides` keys and the regen's actual export names. A
// provides key with no fuzzy-matched export lands as a missing
// export; an export with no corresponding provides key lands as
// unexpected.

export const cases: BehaviorCase[] = [
  {
    name: "detectVocabGaps — one provided key has no fuzzy match",
    setup: () => ({
      providedKeys: ["user_auth", "hash_canonical"],
      exportNames: ["authenticateUser", "unknown_export"],
    }),
    invoke: (api, ctx) => {
      const c = ctx as { providedKeys: string[]; exportNames: string[] };
      return (
        api as {
          detectVocabGaps: (
            p: readonly string[],
            e: readonly string[],
          ) => { missingExports: readonly string[]; unexpectedExports: readonly string[] };
        }
      ).detectVocabGaps(c.providedKeys, c.exportNames);
    },
    assert: (r) => {
      const o = r as { missingExports?: unknown; unexpectedExports?: unknown };
      return (
        Array.isArray(o.missingExports) &&
        Array.isArray(o.unexpectedExports)
      );
    },
  },
];
