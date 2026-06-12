import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0075 — src/core/render/style.ts
// Tested entries: stripAnsi, visibleWidth, color, statusGlyph — pure
// string helpers (colorsEnabled is env-memoised, identical on both
// sides of the same process). A regen with a wrong ANSI regex, a
// width measured on raw .length instead of stripped length, or a
// statusGlyph bucket misassignment would diverge here.

type Api = {
  stripAnsi: (s: string) => string;
  visibleWidth: (s: string) => number;
  color: (text: string, name: string) => string;
  statusGlyph: (s: string) => string;
};

export const cases: BehaviorCase[] = [
  {
    name: "stripAnsi — removes color and style escapes, keeps the text",
    setup: () => ({ s: "\x1b[32mgreen\x1b[0m and \x1b[1;31mbold red\x1b[0m" }),
    invoke: (api, ctx) => (api as Api).stripAnsi((ctx as { s: string }).s),
    assert: (r) => r === "green and bold red",
  },
  {
    name: "visibleWidth — counts visible chars only, escapes excluded",
    setup: () => ({ s: "\x1b[90mnode_0042\x1b[0m" }),
    invoke: (api, ctx) => (api as Api).visibleWidth((ctx as { s: string }).s),
    assert: (r) => r === 9,
  },
  {
    name: "color — unknown color name returns the raw text unchanged",
    setup: () => ({ text: "hello", name: "not-a-color" }),
    invoke: (api, ctx) => {
      const { text, name } = ctx as { text: string; name: string };
      return (api as Api).color(text, name);
    },
    assert: (r) => r === "hello",
  },
  {
    name: "statusGlyph — every status maps to a dot glyph (bucket sweep)",
    setup: () => ({
      statuses: ["valid", "invalid", "pending", "compiled", "rejected", "draft"],
    }),
    invoke: (api, ctx) =>
      (ctx as { statuses: string[] }).statuses.map((s) =>
        (api as Api).statusGlyph(s),
      ),
    assert: (r) =>
      Array.isArray(r) &&
      r.length === 6 &&
      r.every((g) => typeof g === "string" && g.includes("●")),
  },
];
