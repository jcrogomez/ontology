// Parser for the walker's `:graph view` command tail.
//
// Grammar (v0): an optional positional integer depth.
//
//     :graph view          → depth = 2 (default)
//     :graph view 3        → depth = 3
//     :graph view 0        → depth = 0 (focal only, no neighbors)
//
// We deliberately do NOT support `--depth N` flag form. The walker's
// command line is tight and a single positional integer is unambiguous;
// matching the CLI's `onto graph subgraph --depth <n>` flag form here
// would be over-engineering for one parameter.

const DEPTH_LOWER = 0;
const DEPTH_UPPER = 5;

export type ParseGraphViewArgsResult =
  | { ok: true; depth: number }
  | { ok: false; message: string };

export function parseGraphViewArgs(rest: string): ParseGraphViewArgsResult {
  const trimmed = rest.trim();
  if (trimmed === "") return { ok: true, depth: 2 };

  // Reject any non-integer first token so a flag-style typo gets a clear
  // error rather than NaN.
  if (!/^[0-9]+$/.test(trimmed)) {
    return { ok: false, message: `:graph view expects an integer depth (got "${trimmed}")` };
  }

  const depth = Number.parseInt(trimmed, 10);
  if (depth < DEPTH_LOWER || depth > DEPTH_UPPER) {
    // Cap depth at 5 — at higher values the walker panel becomes a
    // hairball that defeats the inspection-not-decoration goal. The CLI
    // surface (`onto graph subgraph`) is the right place for unbounded
    // exploration; the walker panel optimises for one focal cell.
    return {
      ok: false,
      message: `:graph view depth must be between ${DEPTH_LOWER} and ${DEPTH_UPPER} (got ${depth})`,
    };
  }
  return { ok: true, depth };
}
