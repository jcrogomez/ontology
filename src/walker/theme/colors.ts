// Walker theme: poset abstraction levels mapped to ink-supported colors.
//
// The 11 levels of AbstractionLevelSchema are projected to a hue progression so a user
// looking at the cell border can identify the focal node's level without reading text.
// See docs/design/surfaces/WALKER_INTERFACE.md section 3.

import type { AbstractionLevelSchema } from "../../schemas/ontology.js";
import type { z } from "zod";

export type AbstractionLevel = z.infer<typeof AbstractionLevelSchema>;

// Ink uses chalk underneath. These named colors are the ones that are reliably
// supported across terminals. Where a perfect hue (orange, lime) is unavailable
// we substitute the closest brutalist equivalent.
export const POSET_COLORS: Record<AbstractionLevel, string> = {
  canon: "white",
  project: "blue",
  target: "cyan",
  stack: "green",
  architecture: "greenBright",
  domain: "yellow",
  workflow: "yellowBright",
  interface: "magenta",
  unit: "red",
  token: "gray",
  artifact: "whiteBright",
};

// True if the current process can render ANSI color. Honors NO_COLOR (https://no-color.org)
// and the absence of a TTY when piped to a file or other non-interactive sink.
export function colorsEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") {
    return false;
  }
  return Boolean(process.stdout && process.stdout.isTTY);
}

// Textual fallback used when colors are disabled. The level name is bracketed so the
// hierarchy is still legible without ANSI. Brutalist: mean what you mean.
export function levelTag(level: AbstractionLevel): string {
  return `[${level.toUpperCase()}]`;
}
