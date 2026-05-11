// ANSI styling for non-Ink command output. Zero deps — pure escape codes.
//
// Design notes:
// - The walker (Ink) has its own coloring layer in `src/walker/theme/colors.ts`.
//   This module is the equivalent for plain-stdout commands (inspect, node show,
//   runs list, etc.) and reuses the same named-color palette so a "domain" node
//   looks the same yellow whether you see it in the walker or in `node show`.
// - Honors NO_COLOR (https://no-color.org) and isTTY: when colors are disabled
//   every helper degrades to the raw text. Tests rely on this.
// - --json output paths must NOT route through these helpers; the contract is
//   that --json is plain machine-readable text.

import type { z } from "zod";
import type {
  AbstractionLevelSchema,
  NodeKindSchema,
  ManifestationSchema,
  NodeStatusSchema,
  ProposalStatusSchema,
} from "../../schemas/ontology.js";

type AbstractionLevel = z.infer<typeof AbstractionLevelSchema>;
type NodeKind = z.infer<typeof NodeKindSchema>;
type Manifestation = z.infer<typeof ManifestationSchema>;
type NodeStatus = z.infer<typeof NodeStatusSchema>;
type ProposalStatus = z.infer<typeof ProposalStatusSchema>;
// Union covering everything `byStatus` / `statusGlyph` may receive — node
// records carry NodeStatus, proposal records carry ProposalStatus, and a
// few output paths (e.g. `proposal list`) emit both.
type AnyStatus = NodeStatus | ProposalStatus;

const ANSI: Record<string, string> = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
};

// Named-color palette. Names match the walker theme so output is consistent.
// Bright variants are explicit so callers can pick contrast deliberately.
const COLOR_CODES: Record<string, string> = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  redBright: "\x1b[91m",
  greenBright: "\x1b[92m",
  yellowBright: "\x1b[93m",
  blueBright: "\x1b[94m",
  magentaBright: "\x1b[95m",
  cyanBright: "\x1b[96m",
  whiteBright: "\x1b[97m",
};

export type NamedColor = keyof typeof COLOR_CODES;

// True when ANSI escapes should actually appear in the output. Honors NO_COLOR
// and the absence of a TTY. The result is memoised on first call so high-
// volume callers (e.g. an `events tail` over 1000 rows × 5 cells) do not
// pay an env-lookup + TTY syscall per cell. Tests that flip the underlying
// environment variables between cases must call `resetColorCache()` to
// invalidate the memo.
let cachedColorsEnabled: boolean | null = null;

export function colorsEnabled(): boolean {
  if (cachedColorsEnabled !== null) return cachedColorsEnabled;
  cachedColorsEnabled = computeColorsEnabled();
  return cachedColorsEnabled;
}

function computeColorsEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") {
    return false;
  }
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  return Boolean(process.stdout && process.stdout.isTTY);
}

// Invalidate the memo. Tests that toggle NO_COLOR / FORCE_COLOR between
// cases must call this so the next colorsEnabled() picks up the change.
// Production code never needs to call it.
export function resetColorCache(): void {
  cachedColorsEnabled = null;
}

function wrap(code: string, text: string): string {
  if (!colorsEnabled()) return text;
  return `${code}${text}${ANSI.reset}`;
}

export function color(text: string, name: NamedColor): string {
  const code = COLOR_CODES[name];
  if (!code) return text;
  return wrap(code, text);
}

export function bold(text: string): string {
  return wrap(ANSI.bold!, text);
}

export function dim(text: string): string {
  return wrap(ANSI.dim!, text);
}

export function italic(text: string): string {
  return wrap(ANSI.italic!, text);
}

export function underline(text: string): string {
  return wrap(ANSI.underline!, text);
}

// ---------------------------------------------------------------------------
// Semantic helpers: map domain types to consistent colors. The walker uses
// the same level palette in `theme/colors.ts`; keep them in sync.
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<AbstractionLevel, NamedColor> = {
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

const KIND_COLORS: Record<NodeKind, NamedColor> = {
  canon: "whiteBright",
  decision: "cyanBright",
  rule: "yellowBright",
  constraint: "redBright",
  definition: "blueBright",
  entity: "magentaBright",
  action: "greenBright",
  function: "green",
  asset: "magenta",
  view: "cyan",
  component: "blue",
  token: "gray",
  artifact: "whiteBright",
};

const MANIFESTATION_COLORS: Record<Manifestation, NamedColor> = {
  intent: "yellow",
  ast: "magenta",
  osl: "cyan",
  code: "greenBright",
  test: "blueBright",
  build: "white",
};

const STATUS_COLORS: Record<AnyStatus, NamedColor> = {
  // NodeStatus
  draft: "gray",
  valid: "green",
  invalid: "red",
  frozen: "blueBright",
  compiled: "greenBright",
  failed: "red",
  superseded: "yellow",
  // ProposalStatus
  pending: "yellow",
  applied: "green",
  rejected: "red",
  staled: "redBright",
};

export function byLevel(level: AbstractionLevel, text: string = level): string {
  return color(text, LEVEL_COLORS[level] ?? "white");
}

export function byKind(kind: NodeKind, text: string = kind): string {
  return color(text, KIND_COLORS[kind] ?? "white");
}

export function byManifestation(m: Manifestation, text: string = m): string {
  return color(text, MANIFESTATION_COLORS[m] ?? "white");
}

export function byStatus(s: AnyStatus, text: string = s): string {
  return color(text, STATUS_COLORS[s] ?? "white");
}

// Small status glyph — green dot for "good", red for "bad", yellow for
// "transitional", gray for everything else. Used in list rows to give a
// visual hint without taking a full column.
export function statusGlyph(s: AnyStatus): string {
  const ok: AnyStatus[] = ["valid", "compiled", "frozen", "applied"];
  const bad: AnyStatus[] = ["invalid", "rejected", "staled", "failed"];
  const warn: AnyStatus[] = ["draft", "pending", "superseded"];
  if (ok.includes(s)) return color("●", "green");
  if (bad.includes(s)) return color("●", "red");
  if (warn.includes(s)) return color("●", "yellow");
  return color("●", "gray");
}

// Strip every ANSI escape from a string. Useful for measuring visible width
// when laying out tables / boxes.
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function visibleWidth(s: string): number {
  return stripAnsi(s).length;
}
