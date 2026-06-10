import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0047 — src/runtime/prompt/parse.ts
// Tested entries: parsePromptAST(raw), hasMarkers(ast) — the pure prompt
// parser. The cases pin line-anchoring (inline @-mentions stay prose),
// marker stripping from the body, first-occurrence de-duplication with
// empty-token dropping — exactly where a permissive regen parser would drift.

type Ast = {
  raw: string;
  body: string;
  markers: { requires: string[]; provides: string[]; expand: string[] };
};

type ParseApi = {
  parsePromptAST: (raw: string) => Ast;
  hasMarkers: (ast: Ast) => boolean;
};

export const cases: BehaviorCase[] = [
  {
    name: "parsePromptAST — line-anchored markers parsed and stripped from body",
    setup: () => ({
      raw: "@requires: tok_a, tok_b\n@provides: tok_c\nWrite the function.",
    }),
    invoke: (api, ctx) =>
      (api as ParseApi).parsePromptAST((ctx as { raw: string }).raw),
    assert: (r) => {
      const v = r as Ast;
      return (
        v.markers.requires.length === 2 &&
        v.markers.requires[0] === "tok_a" &&
        v.markers.provides[0] === "tok_c" &&
        v.body === "Write the function."
      );
    },
  },
  {
    name: "parsePromptAST — inline @requires mention stays prose, not a marker",
    setup: () => ({
      raw: "We honour @requires: foo in docs.\nSecond line.",
    }),
    invoke: (api, ctx) =>
      (api as ParseApi).parsePromptAST((ctx as { raw: string }).raw),
    assert: (r) => {
      const v = r as Ast;
      return (
        v.markers.requires.length === 0 &&
        v.body === "We honour @requires: foo in docs.\nSecond line."
      );
    },
  },
  {
    name: "parsePromptAST — duplicates and empty tokens collapse, first-occurrence order",
    setup: () => ({
      raw: "@provides: x, , y, x\n@provides: y, z\ndone",
    }),
    invoke: (api, ctx) =>
      (api as ParseApi).parsePromptAST((ctx as { raw: string }).raw),
    assert: (r) => {
      const v = r as Ast;
      return (
        v.markers.provides.length === 3 &&
        v.markers.provides[0] === "x" &&
        v.markers.provides[1] === "y" &&
        v.markers.provides[2] === "z"
      );
    },
  },
  {
    name: "hasMarkers — false for a marker-free AST",
    setup: () => ({
      ast: {
        raw: "plain prompt",
        body: "plain prompt",
        markers: { requires: [], provides: [], expand: [] },
      } as Ast,
    }),
    invoke: (api, ctx) =>
      (api as ParseApi).hasMarkers((ctx as { ast: Ast }).ast),
    assert: (r) => r === false,
  },
];
