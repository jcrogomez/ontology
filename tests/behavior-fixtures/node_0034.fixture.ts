import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0034 — src/runtime/legend/static-summary.ts
// Tested entry: buildStaticSummary — pure projection from a
// classification result into the canonical static-extraction shape.
// A barrel re-export with one named symbol yields a `provides` list
// containing that symbol; a regen that drops the `provides` mapping
// or relabels `level` / `kind` would diverge.

interface ClassificationLike {
  path?: string;
  structuralShape: string;
  vocabulary: {
    exports: Array<{ name: string; kind: string }>;
    imports: Array<{ source: string; kind: string; names?: readonly string[] }>;
  };
  language?: string;
  semanticRole?: string;
}

export const cases: BehaviorCase[] = [
  {
    name: "buildStaticSummary — barrel with single named export",
    setup: () => ({
      filePath: "index.ts",
      classification: {
        path: "index.ts",
        language: "typescript",
        structuralShape: "barrel",
        semanticRole: "utility",
        vocabulary: {
          exports: [{ name: "foo", kind: "value" }],
          imports: [],
        },
      } satisfies ClassificationLike,
    }),
    invoke: (api, ctx) => {
      const c = ctx as { filePath: string; classification: ClassificationLike };
      return (
        api as {
          buildStaticSummary: (i: {
            filePath: string;
            classification: ClassificationLike;
          }) => { provides?: readonly string[]; level?: string };
        }
      ).buildStaticSummary({
        filePath: c.filePath,
        classification: c.classification,
      });
    },
    assert: (r) => {
      const o = r as { provides?: unknown };
      return (
        Array.isArray(o.provides) &&
        (o.provides as readonly string[]).includes("foo")
      );
    },
  },
];
