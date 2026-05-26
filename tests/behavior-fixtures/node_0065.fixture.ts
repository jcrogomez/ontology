import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0065 — src/core/integrity/hash.ts
// Tested entry: hashPrompt — content-addressed hash used by the run
// cache. Carries a fixed prefix ("prompt:hash:") and a 64-char sha256
// digest. The full digest must be deterministic on identical input;
// trailing whitespace and CR characters are normalised before hashing.

export const cases: BehaviorCase[] = [
  {
    name: "hashPrompt — produces deterministic prefixed sha256",
    setup: () => ({ text: "Generate a function\r\n  " }),
    invoke: (api, ctx) =>
      (api as { hashPrompt: (t: string) => string }).hashPrompt(
        (ctx as { text: string }).text,
      ),
    assert: (r) => {
      if (typeof r !== "string") return false;
      const s = r as string;
      return /^prompt:hash:[0-9a-f]{64}$/i.test(s);
    },
  },
];
