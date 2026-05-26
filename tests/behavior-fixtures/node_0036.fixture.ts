import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0036 — src/runtime/legend/translator.ts
// Tested entry: computeTranslatorSourceHash — pure sha256 over a
// canonical projection of the node's translator-relevant fields. The
// hash MUST be deterministic for identical input, and MUST differ
// when any of the projected fields differ. Both sides on identical
// input produce the same digest.

interface NodeLike {
  id: string;
  prompt: { raw: string };
  context: {
    provides: Array<{ key: string }>;
    requires: readonly unknown[];
    forbids: readonly unknown[];
  };
  rules: readonly string[];
  literal: boolean;
}

export const cases: BehaviorCase[] = [
  {
    name: "computeTranslatorSourceHash — deterministic digest",
    setup: () => ({
      node: {
        id: "n1",
        prompt: { raw: "Generate a function" },
        context: {
          provides: [{ key: "auth" }],
          requires: [],
          forbids: [],
        },
        rules: ["REQUIRE: no logs"],
        literal: false,
      } satisfies NodeLike,
    }),
    invoke: (api, ctx) =>
      (
        api as { computeTranslatorSourceHash: (n: NodeLike) => string }
      ).computeTranslatorSourceHash((ctx as { node: NodeLike }).node),
    assert: (r) =>
      typeof r === "string" &&
      /^[0-9a-f]{64}$/i.test(r) /* sha256 hex digest */,
  },
];
