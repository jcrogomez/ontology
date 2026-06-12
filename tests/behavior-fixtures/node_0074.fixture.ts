import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0074 — src/core/render/box.ts
// Tested entries: box(content, options) and kvLines(pairs, options) —
// pure string renderers (ANSI/Unicode gating is env-memoised, so both
// sides see the same process state). A regen that botches the inner-
// width math, the title's "──" lead-in, the null→divider rule, or the
// key-column padding in kvLines would diverge here.

type Api = {
  box: (
    content: ReadonlyArray<string | null>,
    options?: { title?: string; footer?: string; minWidth?: number; padding?: number },
  ) => string;
  kvLines: (
    pairs: ReadonlyArray<[string, string]>,
    options?: { bold?: boolean },
  ) => string[];
};

export const cases: BehaviorCase[] = [
  {
    name: "box — plain box sizes to widest line, short lines padded",
    setup: () => ({ content: ["alpha", "longer line"] as Array<string | null> }),
    invoke: (api, ctx) =>
      (api as Api).box((ctx as { content: Array<string | null> }).content),
    assert: (r) =>
      typeof r === "string" &&
      r.split("\n").length === 4 &&
      r.includes("alpha") &&
      r.includes("longer line"),
  },
  {
    name: "box — null content line renders as a section divider, not an empty row",
    setup: () => ({
      content: ["top section", null, "bottom section"] as Array<string | null>,
    }),
    invoke: (api, ctx) =>
      (api as Api).box((ctx as { content: Array<string | null> }).content),
    assert: (r) =>
      typeof r === "string" &&
      r.split("\n").length === 5 &&
      r.includes("top section") &&
      r.includes("bottom section"),
  },
  {
    name: "box — title and footer widen the borders past the content width",
    setup: () => ({
      content: ["x"] as Array<string | null>,
      options: { title: "Node node_0001", footer: "2 edges" },
    }),
    invoke: (api, ctx) => {
      const { content, options } = ctx as {
        content: Array<string | null>;
        options: { title: string; footer: string };
      };
      return (api as Api).box(content, options);
    },
    assert: (r) =>
      typeof r === "string" &&
      r.split("\n").length === 3 &&
      r.includes("Node node_0001") &&
      r.includes("2 edges"),
  },
  {
    name: "kvLines — keys pad to the widest key so values align",
    setup: () => ({
      pairs: [
        ["id", "node_0042"],
        ["status", "valid"],
      ] as Array<[string, string]>,
      options: { bold: false },
    }),
    invoke: (api, ctx) => {
      const { pairs, options } = ctx as {
        pairs: Array<[string, string]>;
        options: { bold: boolean };
      };
      return (api as Api).kvLines(pairs, options);
    },
    assert: (r) =>
      Array.isArray(r) &&
      r.length === 2 &&
      r[0] === "id      node_0042" &&
      r[1] === "status  valid",
  },
];
