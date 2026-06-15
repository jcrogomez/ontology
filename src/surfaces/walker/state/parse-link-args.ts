// Parser for the walker's `:link` command tail.
//
// Same flag grammar as `onto propose link`: --to <nodeId> --type <edgeType>.
// The focal node is always the source; an explicit --from is rejected so the
// walker semantics ("propose an edge from the focal cell") stay unambiguous.
// Optional --rationale captures the human-authored reason recorded in the
// proposal's provenance (matching the CLI flag).

export interface ParsedLinkArgs {
  to: string;
  type: string;
  rationale?: string;
}

export type ParseLinkArgsResult =
  | { ok: true; args: ParsedLinkArgs }
  | { ok: false; message: string };

export function parseLinkArgs(rest: string): ParseLinkArgsResult {
  const tokens = rest.trim() === "" ? [] : rest.trim().split(/\s+/);

  let to: string | undefined;
  let type: string | undefined;
  let rationale: string | undefined;

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (tok === "--to") {
      const v = tokens[i + 1];
      if (v === undefined || v.startsWith("--")) {
        return { ok: false, message: "--to requires a node id" };
      }
      to = v;
      i += 2;
      continue;
    }
    if (tok === "--type") {
      const v = tokens[i + 1];
      if (v === undefined || v.startsWith("--")) {
        return { ok: false, message: "--type requires an edge type" };
      }
      type = v;
      i += 2;
      continue;
    }
    if (tok === "--rationale") {
      // Rationale eats the rest of the line so the user can write a sentence
      // without quoting. `:link --to X --type refines --rationale because Y`
      // captures "because Y".
      rationale = tokens.slice(i + 1).join(" ").trim();
      if (rationale.length === 0) {
        return { ok: false, message: "--rationale requires a value" };
      }
      break;
    }
    if (tok === "--from") {
      return { ok: false, message: "--from is implicit (the focal node); drop it" };
    }
    return { ok: false, message: `unknown link flag: ${tok}` };
  }

  if (!to) return { ok: false, message: ":link requires --to <nodeId>" };
  if (!type) return { ok: false, message: ":link requires --type <edgeType>" };

  return { ok: true, args: { to, type, ...(rationale !== undefined && { rationale }) } };
}
