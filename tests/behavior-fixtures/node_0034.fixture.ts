import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0034 — src/runtime/legend/static-summary.ts
// Tested entry: buildStaticSummary — pure projection from a
// classification result into the canonical static-extraction shape.
// A barrel's `provides` are the NAMED RE-EXPORTS only (entries whose
// vocabulary export carries `reExportedFrom`); a local declaration
// without that field contributes nothing. A regen that drops the
// reExportedFrom filter, the provides mapping, or the symbol-domain
// `requires` (Move 1b) would diverge here.
//
// 2026-06-10: original case modelled a barrel export WITHOUT
// reExportedFrom and expected it in provides — that drifted from the
// post-f7bce43 contract and surfaced the first time the full-identity
// smoke ran every fixture. Re-modelled against the real
// ClassificationVocabulary shape.

interface ClassificationLike {
  path?: string;
  structuralShape: string;
  vocabulary: {
    exports: Array<{
      name: string;
      kind: "value" | "type";
      reExportedFrom?: string;
      signature?: string;
    }>;
    imports: Array<{
      modulePath: string;
      kind: "value" | "type" | "namespace";
      symbols: readonly string[];
    }>;
  };
  language?: string;
  semanticRole?: string;
}

type BuildStaticSummaryApi = {
  buildStaticSummary: (i: {
    filePath: string;
    classification: ClassificationLike;
  }) => { provides?: readonly string[]; requires?: readonly string[] };
};

export const cases: BehaviorCase[] = [
  {
    name: "buildStaticSummary — barrel: named re-export lands in provides, local export does not",
    setup: () => ({
      filePath: "index.ts",
      classification: {
        path: "index.ts",
        language: "typescript",
        structuralShape: "barrel",
        semanticRole: "utility",
        vocabulary: {
          exports: [
            { name: "foo", kind: "value", reExportedFrom: "./foo.js" },
            { name: "localOnly", kind: "value" },
          ],
          imports: [],
        },
      } satisfies ClassificationLike,
    }),
    invoke: (api, ctx) => {
      const c = ctx as { filePath: string; classification: ClassificationLike };
      return (api as BuildStaticSummaryApi).buildStaticSummary({
        filePath: c.filePath,
        classification: c.classification,
      });
    },
    assert: (r) => {
      const o = r as { provides?: unknown };
      return (
        Array.isArray(o.provides) &&
        (o.provides as readonly string[]).includes("foo") &&
        !(o.provides as readonly string[]).includes("localOnly")
      );
    },
  },
  {
    name: "buildStaticSummary — barrel: requires carry imported SYMBOL names, not module paths (Move 1b)",
    setup: () => ({
      filePath: "index.ts",
      classification: {
        path: "index.ts",
        language: "typescript",
        structuralShape: "barrel",
        semanticRole: "utility",
        vocabulary: {
          exports: [{ name: "bar", kind: "value", reExportedFrom: "./bar.js" }],
          imports: [
            { modulePath: "./bar.js", kind: "value", symbols: ["bar"] },
          ],
        },
      } satisfies ClassificationLike,
    }),
    invoke: (api, ctx) => {
      const c = ctx as { filePath: string; classification: ClassificationLike };
      const out = (api as BuildStaticSummaryApi).buildStaticSummary({
        filePath: c.filePath,
        classification: c.classification,
      });
      return { provides: out.provides, requires: out.requires };
    },
    assert: (r) => {
      const o = r as { requires?: unknown };
      return (
        Array.isArray(o.requires) &&
        (o.requires as readonly string[]).includes("bar") &&
        !(o.requires as readonly string[]).includes("./bar.js")
      );
    },
  },
];
