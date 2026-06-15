// Walker action: run a Yoneda-shape query against the network, returning
// the matching nodes for in-TUI display.
//
// Wraps `queryNodes` from the representable-functor module (Bootstrap 0.9,
// PR #111). The walker normally focal-navigates one node at a time; this
// action lets the user enumerate the set of nodes that share a structural
// profile without leaving the TUI.

import { loadNodes, loadEdges } from "../../../kernel/core/project/load.js";
import { queryNodes } from "../../../laws/query/representable.js";
import { QueryShapeSchema, type QueryShape } from "../../../laws/query/types.js";
import type { OntologyNode } from "../../../kernel/schemas/ontology.js";

export interface QueryFromWalkerResult {
  ok: boolean;
  matches: OntologyNode[];
  message?: string;
}

export function queryFromWalker(shape: Partial<QueryShape>, cwd?: string): QueryFromWalkerResult {
  const parsed = QueryShapeSchema.safeParse(shape);
  if (!parsed.success) {
    return {
      ok: false,
      matches: [],
      message: parsed.error.errors
        .slice(0, 2)
        .map(e => `${e.path.join(".") || "shape"}: ${e.message}`)
        .join("; "),
    };
  }
  try {
    const nodes = loadNodes(cwd);
    const edges = loadEdges(cwd);
    const matches = queryNodes(nodes, parsed.data, edges);
    return { ok: true, matches };
  } catch (err: unknown) {
    return {
      ok: false,
      matches: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
