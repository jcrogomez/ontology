// Parser for the walker's `:query` command tail.
//
// The CLI exposes the same shape via `onto query --kind X --has-incoming Y`.
// Inside the walker we reuse the `QueryShape` schema from the runtime layer
// but translate from the CLI-flavoured flag grammar. Only the most useful
// flags are wired here; other dimensions (plane, manifestation, status,
// branch, etc.) can be added without churning the action helper.

import type { QueryShape } from "../../runtime/query/types.js";

const FLAG_TO_FIELD: Record<string, "kind" | "abstraction" | "provides" | "requires" | "forbids" | "hasIncoming" | "hasOutgoing"> = {
  "--kind": "kind",
  "--abstraction": "abstraction",
  "--provides": "provides",
  "--requires": "requires",
  "--forbids": "forbids",
  "--has-incoming": "hasIncoming",
  "--has-outgoing": "hasOutgoing",
};

export type ParseQueryArgsResult =
  | { ok: true; shape: Partial<QueryShape> }
  | { ok: false; message: string };

export function parseQueryArgs(rest: string): ParseQueryArgsResult {
  const tokens = rest.trim() === "" ? [] : rest.trim().split(/\s+/);

  const shape: Record<string, unknown> = {};
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const field = FLAG_TO_FIELD[tok];
    if (!field) {
      return { ok: false, message: `unknown query flag: ${tok}` };
    }
    const v = tokens[i + 1];
    if (v === undefined || v.startsWith("--")) {
      return { ok: false, message: `${tok} requires a value` };
    }
    // Multi-value: comma-separated. Same convention as the CLI's --kind.
    const values = v.split(",").map(s => s.trim()).filter(Boolean);
    if (values.length === 0) {
      return { ok: false, message: `${tok} requires a non-empty value` };
    }
    // Field is plural-of-strings in the schema; merge with prior occurrences.
    const existing = (shape[field] as string[] | undefined) ?? [];
    shape[field] = [...existing, ...values];
    i += 2;
  }

  return { ok: true, shape: shape as Partial<QueryShape> };
}
