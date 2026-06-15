// Auto-aligned table renderer for list-y outputs (node list, runs list,
// query, proposal list, events tail). Pure function, no side effects, no
// deps. Visible width (ANSI-stripped) is used for alignment so colored
// cells don't break columns.
//
// Style: minimalist. Header row in bold + dim divider beneath; rows are
// plain. No vertical separators by default — they add noise without
// information. Use `box` from `box.ts` if you want a framed table.

import { visibleWidth, bold, dim } from "./style.js";

export interface ColumnSpec {
  // Header label rendered above the column.
  header: string;
  // Render a single cell value. Cell strings may contain ANSI escapes;
  // alignment uses visibleWidth, not raw .length.
  render: (row: unknown, index: number) => string;
  // Default left-align. Right-align suits numeric columns.
  align?: "left" | "right";
  // Hard upper bound on visible column width. Long content gets truncated
  // with an ellipsis. Defaults to no limit.
  maxWidth?: number;
}

export interface TableOptions {
  // Two-space gutter between columns by default. Use 1 for compact, 4 for
  // airy. Visible chars only.
  gutter?: number;
  // Suppress the dim divider under the header (used in nested tables).
  noHeaderDivider?: boolean;
}

function truncateVisible(s: string, max: number): string {
  if (visibleWidth(s) <= max) return s;
  // Crude but safe: walk character by character measuring the visible
  // length. ANSI escape codes are passed through verbatim. Attach an
  // ellipsis at the boundary.
  let out = "";
  let visible = 0;
  let i = 0;
  let copiedAnsi = false;
  while (i < s.length && visible < max - 1) {
    if (s[i] === "\x1b") {
      // copy the whole escape sequence
      const m = s.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (m) {
        out += m[0];
        copiedAnsi = true;
        i += m[0].length;
        continue;
      }
    }
    out += s[i];
    visible++;
    i++;
  }
  // If we copied any escape, the matching reset may lie past the
  // truncation boundary — append \x1b[0m so the ellipsis and downstream
  // cells don't inherit the open color.
  return out + "…" + (copiedAnsi ? "\x1b[0m" : "");
}

function pad(text: string, totalVisibleWidth: number, align: "left" | "right"): string {
  const v = visibleWidth(text);
  if (v >= totalVisibleWidth) return text;
  const padding = " ".repeat(totalVisibleWidth - v);
  return align === "right" ? padding + text : text + padding;
}

export function renderTable<T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<ColumnSpec>,
  options: TableOptions = {},
): string {
  const gutter = " ".repeat(options.gutter ?? 2);

  // Materialize all cell strings up front so we can measure widths.
  const cells: string[][] = rows.map((row, i) =>
    columns.map((c) => c.render(row, i)),
  );

  // Compute column widths capped by maxWidth.
  const widths = columns.map((col, ci) => {
    const cellMax = Math.max(0, ...cells.map((r) => visibleWidth(r[ci] ?? "")));
    const headerW = visibleWidth(col.header);
    const natural = Math.max(cellMax, headerW);
    return col.maxWidth !== undefined ? Math.min(natural, col.maxWidth) : natural;
  });

  // Truncate over-wide cells to the cap.
  const truncated = cells.map((r) =>
    r.map((cell, ci) => {
      const cap = columns[ci]!.maxWidth;
      return cap !== undefined ? truncateVisible(cell, cap) : cell;
    }),
  );

  const headerLine = columns
    .map((c, ci) => bold(pad(c.header, widths[ci]!, c.align ?? "left")))
    .join(gutter);

  const lines: string[] = [headerLine];
  if (!options.noHeaderDivider) {
    const dividerSegments = widths.map((w) => "─".repeat(w));
    lines.push(dim(dividerSegments.join(gutter)));
  }

  for (const row of truncated) {
    const rowLine = row
      .map((cell, ci) => pad(cell, widths[ci]!, columns[ci]!.align ?? "left"))
      .join(gutter);
    lines.push(rowLine);
  }

  return lines.join("\n");
}
