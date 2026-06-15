import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0076 — src/core/render/table.ts
// Tested entry: renderTable(rows, columns, options) — pure auto-
// aligned table renderer (bold/dim are env-memoised, same on both
// sides). A regen that pads on raw .length instead of visible width,
// truncates without the ellipsis, mixes up left/right alignment, or
// drops the header divider would diverge here.

type ColumnSpec = {
  header: string;
  render: (row: unknown, index: number) => string;
  align?: "left" | "right";
  maxWidth?: number;
};
type Api = {
  renderTable: (
    rows: ReadonlyArray<unknown>,
    columns: ReadonlyArray<ColumnSpec>,
    options?: { gutter?: number; noHeaderDivider?: boolean },
  ) => string;
};

export const cases: BehaviorCase[] = [
  {
    name: "renderTable — columns pad to widest cell with two-space gutter",
    setup: () => ({
      rows: [
        { id: "node_0001", label: "kernel" },
        { id: "node_0042", label: "longer label here" },
      ],
    }),
    invoke: (api, ctx) =>
      (api as Api).renderTable(
        (ctx as { rows: Array<{ id: string; label: string }> }).rows,
        [
          { header: "ID", render: (r) => (r as { id: string }).id },
          { header: "LABEL", render: (r) => (r as { label: string }).label },
        ],
      ),
    assert: (r) =>
      typeof r === "string" &&
      r.split("\n").length === 4 &&
      r.includes("node_0042  longer label here"),
  },
  {
    name: "renderTable — maxWidth truncates over-wide cells with an ellipsis",
    setup: () => ({
      rows: [{ text: "abcdefghijklmnop" }],
    }),
    invoke: (api, ctx) =>
      (api as Api).renderTable(
        (ctx as { rows: Array<{ text: string }> }).rows,
        [
          {
            header: "T",
            render: (r) => (r as { text: string }).text,
            maxWidth: 8,
          },
        ],
        { noHeaderDivider: true },
      ),
    assert: (r) => {
      if (typeof r !== "string") return false;
      const lines = r.split("\n");
      return lines.length === 2 && lines[1] === "abcdefg…";
    },
  },
  {
    name: "renderTable — right-aligned numeric column pads on the left",
    setup: () => ({
      rows: [{ n: "7" }, { n: "1234" }],
    }),
    invoke: (api, ctx) =>
      (api as Api).renderTable(
        (ctx as { rows: Array<{ n: string }> }).rows,
        [
          {
            header: "TOKENS",
            render: (r) => (r as { n: string }).n,
            align: "right",
          },
        ],
        { noHeaderDivider: true },
      ),
    assert: (r) => {
      if (typeof r !== "string") return false;
      const lines = r.split("\n");
      return lines.length === 3 && lines[1] === "     7" && lines[2] === "  1234";
    },
  },
  {
    name: "renderTable — zero rows renders header plus divider only",
    setup: () => ({ rows: [] as unknown[] }),
    invoke: (api, ctx) =>
      (api as Api).renderTable((ctx as { rows: unknown[] }).rows, [
        { header: "ID", render: () => "" },
        { header: "STATUS", render: () => "" },
      ]),
    assert: (r) => typeof r === "string" && r.split("\n").length === 2,
  },
];
