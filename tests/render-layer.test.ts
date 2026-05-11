import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  color,
  bold,
  dim,
  byLevel,
  byKind,
  byManifestation,
  byStatus,
  statusGlyph,
  stripAnsi,
  visibleWidth,
} from "../src/core/render/style.js";
import { box, kvLines } from "../src/core/render/box.js";
import { renderTable } from "../src/core/render/table.js";
import { resetColorCache, resetUnicodeCache, unicodeEnabled } from "../src/core/render/style.js";

let originalNoColor: string | undefined;
let originalForceColor: string | undefined;

let originalNoUnicode: string | undefined;
let originalTerm: string | undefined;

beforeEach(() => {
  originalNoColor = process.env.NO_COLOR;
  originalForceColor = process.env.FORCE_COLOR;
  originalNoUnicode = process.env.NO_UNICODE;
  originalTerm = process.env.TERM;
  process.env.FORCE_COLOR = "1"; // ensure ANSI even when test runner is non-TTY
  delete process.env.NO_COLOR;
  delete process.env.NO_UNICODE;
  // Leave TERM alone unless a specific test clears it.
  resetColorCache(); // invalidate memos so this case's env wins
  resetUnicodeCache();
});

afterEach(() => {
  if (originalNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = originalNoColor;
  if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = originalForceColor;
  if (originalNoUnicode === undefined) delete process.env.NO_UNICODE;
  else process.env.NO_UNICODE = originalNoUnicode;
  if (originalTerm === undefined) delete process.env.TERM;
  else process.env.TERM = originalTerm;
  resetColorCache();
  resetUnicodeCache();
});

describe("style.ts", () => {
  it("color() wraps with ANSI escapes when colors are enabled", () => {
    const out = color("hello", "red");
    expect(out).toContain("\x1b[31m");
    expect(out).toContain("\x1b[0m");
    expect(out).toContain("hello");
  });

  it("color() degrades to raw text when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    delete process.env.FORCE_COLOR;
    resetColorCache(); // invalidate the memo so the new env wins
    expect(color("hello", "red")).toBe("hello");
  });

  it("bold/dim wrap appropriately", () => {
    expect(bold("x")).toContain("\x1b[1m");
    expect(dim("x")).toContain("\x1b[2m");
  });

  it("byLevel/byKind/byManifestation/byStatus pick consistent colors", () => {
    expect(byLevel("domain")).toContain("\x1b[33m"); // yellow
    expect(byKind("function")).toContain("\x1b[32m"); // green
    expect(byManifestation("code")).toContain("\x1b[92m"); // greenBright
    expect(byStatus("valid")).toContain("\x1b[32m"); // green
  });

  it("byStatus accepts both NodeStatus and ProposalStatus", () => {
    expect(byStatus("draft")).toContain("\x1b[90m"); // gray
    expect(byStatus("pending")).toContain("\x1b[33m"); // yellow
    expect(byStatus("applied")).toContain("\x1b[32m"); // green
    expect(byStatus("staled")).toContain("\x1b[91m"); // redBright
    expect(byStatus("failed")).toContain("\x1b[31m"); // red
  });

  it("statusGlyph buckets statuses into ok/bad/warn/other", () => {
    expect(stripAnsi(statusGlyph("valid"))).toBe("●");
    expect(statusGlyph("valid")).toContain("\x1b[32m");
    expect(statusGlyph("failed")).toContain("\x1b[31m");
    expect(statusGlyph("draft")).toContain("\x1b[33m");
    expect(statusGlyph("frozen")).toContain("\x1b[32m"); // ok bucket
  });

  it("stripAnsi removes every escape sequence", () => {
    const colored = bold(color("hello", "red"));
    expect(stripAnsi(colored)).toBe("hello");
  });

  it("visibleWidth measures only visible characters", () => {
    expect(visibleWidth(bold(color("abc", "red")))).toBe(3);
    expect(visibleWidth("plain")).toBe(5);
  });
});

describe("box.ts", () => {
  it("renders a basic frame around content", () => {
    const out = box(["line one", "line two"]);
    const plain = stripAnsi(out);
    expect(plain).toContain("┌");
    expect(plain).toContain("┐");
    expect(plain).toContain("└");
    expect(plain).toContain("┘");
    expect(plain).toContain("line one");
    expect(plain).toContain("line two");
  });

  it("aligns colored cells correctly using visible width", () => {
    const out = box([bold("short"), color("longer line", "red")]);
    const lines = stripAnsi(out).split("\n");
    // top, content x 2, bottom
    expect(lines).toHaveLength(4);
    // every line should be the same visible width
    const widths = new Set(lines.map((l) => l.length));
    expect(widths.size).toBe(1);
  });

  it("renders a horizontal divider for null lines", () => {
    const out = box(["section A", null, "section B"]);
    const plain = stripAnsi(out);
    expect(plain).toContain("├");
    expect(plain).toContain("┤");
    // top + content A + divider + content B + bottom = 5
    expect(plain.split("\n")).toHaveLength(5);
  });

  it("embeds a title in the top border", () => {
    const out = box(["body"], { title: "MY CARD" });
    const plain = stripAnsi(out);
    expect(plain.split("\n")[0]).toContain("MY CARD");
  });

  it("uses Unicode borders even when colour is disabled (NO_COLOR alone is not a Unicode-disable signal)", () => {
    // This is the §3.8 contract: CI logs that strip ANSI escapes typically
    // still render Unicode just fine. The box helper should gate borders
    // on unicodeEnabled() — not colorsEnabled() — so NO_COLOR alone
    // preserves the readable shape.
    process.env.NO_COLOR = "1";
    delete process.env.FORCE_COLOR;
    resetColorCache();
    resetUnicodeCache();
    const out = box(["hello"]);
    const plain = stripAnsi(out);
    expect(plain).toContain("┌");
    expect(plain).toContain("┘");
    // And colour is suppressed inside the cell.
    expect(out).not.toContain("\x1b[");
  });

  it("falls back to ASCII frame when NO_UNICODE is set", () => {
    process.env.NO_UNICODE = "1";
    resetUnicodeCache();
    const out = box(["hello"]);
    const plain = stripAnsi(out);
    expect(plain).not.toContain("┌");
    expect(plain).toContain("+");
    expect(plain).toMatch(/\+-+\+/);
  });

  it("falls back to ASCII frame when TERM=dumb", () => {
    process.env.TERM = "dumb";
    resetUnicodeCache();
    const out = box(["hello"]);
    const plain = stripAnsi(out);
    expect(plain).not.toContain("┌");
    expect(plain).toContain("+");
  });

  it("kvLines pads keys so values align", () => {
    const lines = kvLines([
      ["short", "v1"],
      ["much longer key", "v2"],
    ]);
    expect(lines).toHaveLength(2);
    const stripped = lines.map(stripAnsi);
    // Both lines should have value at the same column.
    const v1Idx = stripped[0]!.indexOf("v1");
    const v2Idx = stripped[1]!.indexOf("v2");
    expect(v1Idx).toBe(v2Idx);
  });
});

describe("unicodeEnabled() — independent of colorsEnabled()", () => {
  it("defaults to true when no opt-out is set", () => {
    delete process.env.NO_UNICODE;
    delete process.env.TERM;
    resetUnicodeCache();
    expect(unicodeEnabled()).toBe(true);
  });

  it("returns false when NO_UNICODE is set", () => {
    process.env.NO_UNICODE = "1";
    resetUnicodeCache();
    expect(unicodeEnabled()).toBe(false);
  });

  it("returns false when TERM=dumb", () => {
    delete process.env.NO_UNICODE;
    process.env.TERM = "dumb";
    resetUnicodeCache();
    expect(unicodeEnabled()).toBe(false);
  });

  it("ignores NO_COLOR — Unicode and colour are independent signals", () => {
    process.env.NO_COLOR = "1";
    delete process.env.NO_UNICODE;
    resetColorCache();
    resetUnicodeCache();
    expect(unicodeEnabled()).toBe(true);
  });
});

describe("table.ts", () => {
  it("renders header, divider and rows", () => {
    const out = renderTable(
      [{ a: 1, b: "foo" }, { a: 22, b: "bar" }],
      [
        { header: "A", render: (r) => String((r as { a: number }).a) },
        { header: "B", render: (r) => (r as { b: string }).b },
      ],
    );
    const lines = stripAnsi(out).split("\n");
    expect(lines[0]).toMatch(/^A\s+B/);
    expect(lines[1]).toMatch(/─/); // divider
    expect(lines[2]).toMatch(/1\s+foo/);
    expect(lines[3]).toMatch(/22\s+bar/);
  });

  it("right-aligns columns when configured", () => {
    const out = renderTable(
      [{ n: 1 }, { n: 1234 }],
      [{ header: "N", render: (r) => String((r as { n: number }).n), align: "right" }],
    );
    const lines = stripAnsi(out).split("\n");
    // both data lines should end at the same column
    expect(lines[2]!.endsWith("1")).toBe(true);
    expect(lines[3]!.endsWith("1234")).toBe(true);
  });

  it("truncates cells that exceed maxWidth", () => {
    const out = renderTable(
      [{ s: "this is a long string that should be cut" }],
      [{ header: "S", render: (r) => (r as { s: string }).s, maxWidth: 10 }],
    );
    const lines = stripAnsi(out).split("\n");
    const dataRow = lines[2]!;
    expect(dataRow.length).toBeLessThanOrEqual(10);
    expect(dataRow).toContain("…");
  });

  it("resets color after truncating a colored cell", () => {
    // Cell opens a green attribute; the matching reset lies past the
    // truncation boundary. Without the fix, the ellipsis and the next
    // cell's gutter inherit the open color.
    const colored = "\x1b[32mreally long colored text\x1b[0m";
    const out = renderTable(
      [{ v: colored, next: "plain" }],
      [
        { header: "V", render: (r) => (r as { v: string }).v, maxWidth: 10 },
        { header: "N", render: (r) => (r as { next: string }).next },
      ],
    );
    const dataRow = out.split("\n")[2]!;
    // The truncated cell must end with a reset before the gutter spaces.
    const truncatedSegment = dataRow.split("\x1b[0m")[0]! + "\x1b[0m";
    expect(truncatedSegment).toMatch(/…\x1b\[0m$/);
  });

  it("aligns colored cells using visible width", () => {
    const out = renderTable(
      [{ k: "draft" }, { k: "valid" }],
      [
        {
          header: "Status",
          render: (r) => byStatus((r as { k: "draft" | "valid" }).k),
        },
      ],
    );
    const lines = stripAnsi(out).split("\n");
    // both rows should be the same visible width as the header column
    expect(lines[2]!.length).toBe(lines[3]!.length);
  });
});
