// Unicode box-drawing helpers for "card" outputs (inspect, node show, runs
// show, proposal show). The point is to give detail-views a visible frame
// without losing line-by-line readability.
//
// Width is computed from the visible (ANSI-stripped) character count, so
// colored cells don't break alignment. ASCII fallback (NO_COLOR) keeps
// the same shape, just with a coarser look.

import { stripAnsi, visibleWidth, dim, bold, unicodeEnabled } from "./style.js";

const CHARS_UNICODE = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  cross: "┼",
  teeRight: "├",
  teeLeft: "┤",
  teeDown: "┬",
  teeUp: "┴",
};

const CHARS_ASCII = {
  topLeft: "+",
  topRight: "+",
  bottomLeft: "+",
  bottomRight: "+",
  horizontal: "-",
  vertical: "|",
  cross: "+",
  teeRight: "+",
  teeLeft: "+",
  teeDown: "+",
  teeUp: "+",
};

function chars(): typeof CHARS_UNICODE {
  // Gate on unicodeEnabled() rather than colorsEnabled(). The previous
  // shape conflated the two: CI logs running with NO_COLOR=1 lost the
  // Unicode borders even though their viewer renders them fine, and a
  // legitimate dumb-terminal opt-out had to use the colour switch as a
  // proxy. unicodeEnabled() has its own NO_UNICODE / TERM=dumb signals.
  return unicodeEnabled() ? CHARS_UNICODE : CHARS_ASCII;
}

export interface BoxOptions {
  // Title rendered in the top border, e.g. `── Node node_0001 ──`.
  // When omitted, the top border is plain.
  title?: string;
  // Footer rendered in the bottom border. Same idea as title.
  footer?: string;
  // Minimum total width including borders. The box always grows to fit the
  // widest content line.
  minWidth?: number;
  // Inner horizontal padding (default 1: a single space on either side of
  // each content line).
  padding?: number;
}

// Render a box around a list of content lines. Returns a single string with
// embedded newlines, no trailing newline. Caller is responsible for printing.
//
// Sections are separated by an explicit `null` line in `content`, which
// renders as a horizontal divider rather than an empty content row. This
// keeps detail views readable even when sections vary in size.
export function box(content: ReadonlyArray<string | null>, options: BoxOptions = {}): string {
  const c = chars();
  const padding = options.padding ?? 1;
  const padStr = " ".repeat(padding);

  const linesAsText = content.map((l) => (l === null ? null : l));
  const widestContent = Math.max(
    0,
    ...linesAsText.filter((l): l is string => l !== null).map(visibleWidth),
  );

  // Compute inner width (without borders/padding).
  const titleVisible = options.title ? visibleWidth(stripAnsi(options.title)) : 0;
  const footerVisible = options.footer ? visibleWidth(stripAnsi(options.footer)) : 0;
  const minBorderInner = Math.max(titleVisible, footerVisible) + 4; // " title ──" etc.
  const minBoxWidth = options.minWidth ?? 0;
  const innerWidth = Math.max(
    widestContent,
    minBorderInner,
    minBoxWidth - 2 - padding * 2,
  );
  const totalWidth = innerWidth + 2 + padding * 2; // borders + padding both sides

  // Top border. With title: `┌── title ──────┐`.
  const topBorder = (() => {
    if (!options.title) {
      return c.topLeft + c.horizontal.repeat(totalWidth - 2) + c.topRight;
    }
    const t = ` ${options.title} `;
    const dash = totalWidth - 2 - visibleWidth(t) - 2; // 2 for the leading "──"
    const left = c.topLeft + c.horizontal.repeat(2) + dim(t);
    const right = c.horizontal.repeat(Math.max(0, dash)) + c.topRight;
    return left + right;
  })();

  // Bottom border. Same idea as top.
  const bottomBorder = (() => {
    if (!options.footer) {
      return c.bottomLeft + c.horizontal.repeat(totalWidth - 2) + c.bottomRight;
    }
    const f = ` ${options.footer} `;
    const dash = totalWidth - 2 - visibleWidth(f) - 2;
    const left = c.bottomLeft + c.horizontal.repeat(2) + dim(f);
    const right = c.horizontal.repeat(Math.max(0, dash)) + c.bottomRight;
    return left + right;
  })();

  const divider = c.teeRight + c.horizontal.repeat(totalWidth - 2) + c.teeLeft;

  const rendered: string[] = [topBorder];
  for (const line of linesAsText) {
    if (line === null) {
      rendered.push(divider);
      continue;
    }
    const pad = innerWidth - visibleWidth(line);
    rendered.push(c.vertical + padStr + line + " ".repeat(Math.max(0, pad)) + padStr + c.vertical);
  }
  rendered.push(bottomBorder);
  return rendered.join("\n");
}

// Convenience: build a list of "key: value" lines as a section. The key column
// is padded to the widest key so values align vertically. Pass `bold: true`
// to render the keys bold (default true). Useful inside box content arrays.
export function kvLines(
  pairs: ReadonlyArray<[string, string]>,
  options: { bold?: boolean } = {},
): string[] {
  const widestKey = Math.max(0, ...pairs.map(([k]) => visibleWidth(k)));
  return pairs.map(([k, v]) => {
    const keyPad = widestKey - visibleWidth(k);
    const styledKey = options.bold === false ? k : bold(k);
    return `${styledKey}${" ".repeat(keyPad)}  ${v}`;
  });
}
