import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0028 — src/runtime/legend/frontier-tagger.ts
// Tested entry: tagFile — pure path-and-content classifier. A schemas/
// directory path with no contents lands in the schema-driven bucket
// purely from the path heuristic; a regen that reorders the tag
// vocabulary or drops the path rule would diverge.

interface TagResult {
  filePath: string;
  attrs: readonly string[];
  reasons: readonly string[];
}

export const cases: BehaviorCase[] = [
  {
    name: "tagFile — schemas/ path → schema-driven, path-only signal",
    setup: () => ({ filePath: "/src/schemas/ontology.ts" }),
    invoke: (api, ctx) =>
      (
        api as {
          tagFile: (p: string, c?: string) => TagResult;
        }
      ).tagFile((ctx as { filePath: string }).filePath, undefined),
    assert: (r) => {
      const o = r as TagResult;
      return (
        Array.isArray(o.attrs) &&
        o.attrs.includes("schema-driven")
      );
    },
  },
];
