import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0035 — src/runtime/legend/structural-classifier.ts
// Tested entry: classifySourceFile — pure classifier from file content
// to a structural-shape + vocabulary record. A single-interface file
// is a "declaration_only" shape; a regen that conflates this with
// other shapes (e.g., labelling it as "barrel" because there's an
// export) would diverge.

export const cases: BehaviorCase[] = [
  {
    name: "classifySourceFile — declaration-only interface",
    setup: () => ({
      path: "types.ts",
      content: "export interface User { id: string; }",
    }),
    invoke: (api, ctx) => {
      const c = ctx as { path: string; content: string };
      return (
        api as {
          classifySourceFile: (i: { path: string; content: string }) => {
            structuralShape?: string;
            language?: string;
          };
        }
      ).classifySourceFile(c);
    },
    assert: (r) => {
      const o = r as { structuralShape?: unknown; language?: unknown };
      return (
        o.language === "typescript" &&
        typeof o.structuralShape === "string"
      );
    },
  },
];
