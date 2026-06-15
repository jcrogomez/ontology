// Pure ASCII / UTF-8 chart primitives for Project Legend reports.
//
// No deps, no IO, no state. Designed for inline embedding in markdown
// reports: the project's reports are read in browsers, IDEs, and the
// terminal — UTF-8 box-drawing characters render identically in all
// three. ANSI escapes are deliberately avoided.
//
// Functions are split by responsibility so each is unit-testable in
// isolation, and the renderer can mix-and-match the primitives.
//
// Phase ε prework H. SELF_INGEST_HYPOTHESIS_2026-05-13.md does not
// pre-register the chart vocabulary — these are presentation choices
// for the same numbers the hypothesis already pinned.

// Vertical-density blocks for sparklines (8 levels) and horizontal
// fillers for bars. Unicode block-drawing range is universally
// rendered in modern monospace fonts.
const BLOCKS_V = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
const BAR_FILL = "█";
const BAR_EMPTY = "░";

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Render a sparkline from a numeric series. The output has exactly
 * `values.length` characters, each picked from `BLOCKS_V` based on
 * the value's position in the local [min, max] range.
 *
 * Edge cases:
 *   - empty input → "" (no glyph, no spacing).
 *   - all-equal input → all middle-height blocks (`▄`).
 *   - any non-finite entry (NaN, Infinity) is treated as zero.
 */
export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return "";
  const finite = values.map((v) => (Number.isFinite(v) ? v : 0));
  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    // Flat series → pick a middle block so the line is visible.
    return BLOCKS_V[3].repeat(values.length);
  }
  const range = max - min;
  let out = "";
  for (const v of finite) {
    const t = (v - min) / range;
    let idx = Math.floor(t * BLOCKS_V.length);
    if (idx >= BLOCKS_V.length) idx = BLOCKS_V.length - 1;
    if (idx < 0) idx = 0;
    out += BLOCKS_V[idx];
  }
  return out;
}

/**
 * Render a horizontal bar for a value in [0, 1] at the given width.
 * `█` fill characters, `░` empty characters. NaN / out-of-range
 * values clamp into [0, 1] silently.
 *
 * Example: `bar(0.6, 10)` → `"██████░░░░"`.
 */
export function bar(value: number, width: number): string {
  if (width <= 0) return "";
  const fillN = Math.round(clamp01(value) * width);
  return BAR_FILL.repeat(fillN) + BAR_EMPTY.repeat(width - fillN);
}

/**
 * Render a horizontal bar where the value is a count out of a total.
 * Convenience wrapper over `bar` so callers don't have to divide
 * manually. `total = 0` collapses to an all-empty bar.
 */
export function barOutOf(count: number, total: number, width: number): string {
  if (total <= 0) return BAR_EMPTY.repeat(Math.max(0, width));
  return bar(count / total, width);
}

/**
 * Build a labeled list of horizontal bars. Each entry yields one
 * line: `label  ████░░░░  count`. Labels are right-padded to the
 * longest label width so bars start at the same column — the
 * markdown code block renders this as a clean stacked chart.
 *
 * `total` is the denominator for each bar; pass `Math.max(...counts)`
 * for a within-series scale, or the global sum for a fraction-of-total
 * scale.
 */
export function barChart(
  entries: ReadonlyArray<{ label: string; count: number }>,
  total: number,
  barWidth = 20,
): string {
  if (entries.length === 0) return "";
  let maxLabel = 0;
  for (const e of entries) {
    if (e.label.length > maxLabel) maxLabel = e.label.length;
  }
  const lines: string[] = [];
  for (const e of entries) {
    const labelPadded = e.label.padEnd(maxLabel, " ");
    lines.push(`${labelPadded}  ${barOutOf(e.count, total, barWidth)}  ${e.count}`);
  }
  return lines.join("\n");
}

/**
 * Render a histogram from a numeric series, bucketed into `nBuckets`
 * bins across [min, max]. Each bin's height is proportional to its
 * count and is rendered with vertical-density blocks (`BLOCKS_V`).
 *
 * Returns:
 *   - `bars`: a single line of `nBuckets` block characters.
 *   - `axis`: a label line showing the [min, max] range at the
 *      endpoints — useful as a markdown caption.
 *
 * Empty input returns empty strings.
 */
export function histogram(
  values: readonly number[],
  nBuckets = 10,
): { bars: string; axis: string; min: number; max: number; total: number } {
  if (values.length === 0 || nBuckets <= 0) {
    return { bars: "", axis: "", min: 0, max: 0, total: 0 };
  }
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { bars: "", axis: "", min: 0, max: 0, total: 0 };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Degenerate range — every value in the same bucket. Single block
  // at full height is the honest read.
  if (min === max) {
    const bars = BLOCKS_V[BLOCKS_V.length - 1].repeat(nBuckets);
    return {
      bars,
      axis: `${min.toFixed(2)}─${max.toFixed(2)}`,
      min,
      max,
      total: finite.length,
    };
  }
  const counts = new Array<number>(nBuckets).fill(0);
  const range = max - min;
  for (const v of finite) {
    let idx = Math.floor(((v - min) / range) * nBuckets);
    if (idx >= nBuckets) idx = nBuckets - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  }
  const peak = Math.max(...counts);
  const bars = counts
    .map((c) => {
      if (peak === 0) return BLOCKS_V[0];
      const t = c / peak;
      let idx = Math.floor(t * BLOCKS_V.length);
      if (idx >= BLOCKS_V.length) idx = BLOCKS_V.length - 1;
      if (idx < 0) idx = 0;
      return BLOCKS_V[idx];
    })
    .join("");
  const axis = `${min.toFixed(2)}─${max.toFixed(2)}`;
  return { bars, axis, min, max, total: finite.length };
}
