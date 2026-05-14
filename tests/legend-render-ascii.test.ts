import { describe, it, expect } from "vitest";
import {
  bar,
  barChart,
  barOutOf,
  histogram,
  sparkline,
} from "../src/runtime/legend/render-ascii.js";

describe("render-ascii — sparkline", () => {
  it("returns empty string for empty input", () => {
    expect(sparkline([])).toBe("");
  });

  it("emits one glyph per input value", () => {
    const out = sparkline([1, 2, 3, 4, 5]);
    expect(out.length).toBe(5);
  });

  it("renders flat series with middle-height blocks", () => {
    const out = sparkline([3, 3, 3, 3]);
    // Flat → all same character, visible (not the bottommost block).
    expect(new Set(out).size).toBe(1);
    expect(out).toContain("▄");
  });

  it("monotonically increasing series ends at the tallest block", () => {
    const out = sparkline([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out.slice(-1)).toBe("█");
  });

  it("treats NaN as zero", () => {
    const out = sparkline([1, Number.NaN, 3, 5]);
    expect(out.length).toBe(4);
    // The NaN entry should sit at the bottom of the rendered scale.
    expect(out[1]).toBe("▁");
  });
});

describe("render-ascii — bar", () => {
  it("returns empty string for zero width", () => {
    expect(bar(0.5, 0)).toBe("");
  });

  it("fills proportionally to the value", () => {
    expect(bar(0, 10)).toBe("░".repeat(10));
    expect(bar(1, 10)).toBe("█".repeat(10));
    expect(bar(0.5, 10)).toBe("█".repeat(5) + "░".repeat(5));
  });

  it("clamps values outside [0, 1]", () => {
    expect(bar(1.5, 4)).toBe("████");
    expect(bar(-0.3, 4)).toBe("░░░░");
  });

  it("rounds, not floors, to the nearest cell", () => {
    // 0.55 of 10 → 5.5 → rounds to 6
    expect(bar(0.55, 10)).toBe("██████░░░░");
  });
});

describe("render-ascii — barOutOf", () => {
  it("handles total=0 as an all-empty bar", () => {
    expect(barOutOf(3, 0, 5)).toBe("░░░░░");
  });

  it("renders count / total as a bar", () => {
    expect(barOutOf(2, 10, 10)).toBe("██░░░░░░░░");
  });
});

describe("render-ascii — barChart", () => {
  it("returns empty string for empty input", () => {
    expect(barChart([], 0)).toBe("");
  });

  it("right-pads labels to a uniform column", () => {
    const out = barChart(
      [
        { label: "short", count: 1 },
        { label: "muchlonger", count: 2 },
      ],
      2,
      4,
    );
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    // Each line should have the same label-column width before the
    // bar starts. Find the position of the first █ char and confirm
    // it's the same in both lines.
    const idxA = lines[0].indexOf("█");
    const idxB = lines[1].indexOf("█");
    // line 0 has count=1 so could be all empty bar; in that case fall
    // back to detecting the bar start glyph (either █ or ░).
    const startA = idxA >= 0 ? idxA : lines[0].indexOf("░");
    const startB = idxB >= 0 ? idxB : lines[1].indexOf("░");
    expect(startA).toBe(startB);
  });

  it("includes the count after the bar", () => {
    const out = barChart([{ label: "ε-equiv", count: 7 }], 10, 5);
    expect(out).toMatch(/  7$/);
  });
});

describe("render-ascii — histogram", () => {
  it("returns empties for empty input", () => {
    const h = histogram([], 10);
    expect(h.bars).toBe("");
    expect(h.axis).toBe("");
    expect(h.total).toBe(0);
  });

  it("filters non-finite values from the histogram", () => {
    const h = histogram([0.1, 0.2, Number.NaN, Number.POSITIVE_INFINITY, 0.5], 5);
    expect(h.total).toBe(3);
  });

  it("emits one glyph per bucket", () => {
    const values = Array.from({ length: 100 }, (_, i) => i / 100);
    const h = histogram(values, 10);
    expect(h.bars.length).toBe(10);
  });

  it("axis line names min and max with two decimals", () => {
    const h = histogram([0.1, 0.5, 0.9], 5);
    expect(h.axis).toMatch(/0\.10─0\.90/);
  });

  it("degenerate range (all-equal values) collapses to a full bar", () => {
    const h = histogram([0.5, 0.5, 0.5], 4);
    expect(h.bars).toBe("█".repeat(4));
    expect(h.min).toBe(0.5);
    expect(h.max).toBe(0.5);
  });

  it("monotonic data with a peak yields the tallest block at that bucket", () => {
    // Pile all values into the last bucket.
    const values = [0, 0.1, 0.95, 0.96, 0.97, 0.98, 0.99];
    const h = histogram(values, 10);
    // Last bucket should be the peak → top-block character.
    expect(h.bars.slice(-1)).toBe("█");
    // First bucket has one value → strictly shorter than the peak.
    expect(h.bars[0]).not.toBe("█");
  });
});
