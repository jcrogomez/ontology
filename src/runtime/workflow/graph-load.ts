import * as fs from "node:fs";
import {
  WorkflowGraphSchema,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowEdge,
} from "../../schemas/workflow.js";
import {
  parsePredicate,
  validatePredicateAgainstSchema,
  type PredicateAst,
} from "./predicate-parser.js";

// Workflow graph loader (Phase ζ v0).
//
// Loads a workflow graph from a JSON file, runs the zod schema
// validation, then layers structural checks that cannot be expressed
// in zod alone:
//   - every edge endpoint refers to an existing node
//   - every node id is unique
//   - the entry node is reachable (trivially — it IS the entry)
//   - generator nodes have exactly one outgoing `feeds` edge
//   - verifier nodes have ≥ 1 outgoing `branches_on` edge and zero
//     `feeds` edges
//   - terminal nodes have zero outgoing edges
//   - every `branches_on` predicate parses, and every field it reads
//     is declared by the source verifier's schema
//
// Predicates are parsed once, here, and the resulting AST is cached
// on a returned `LoadedGraph` so the executor does not re-parse them
// at every visit. Parse errors surface at load time with a
// node-and-edge-anchored message so a misconfigured workflow fails
// fast — a runtime parse error would be much harder to debug from a
// trace.

export interface LoadedGraph {
  graph: WorkflowGraph;
  /** Map nodeId → node, for O(1) lookup during execution. */
  nodesById: Map<string, WorkflowNode>;
  /** Map nodeId → outgoing edges in declaration order. */
  outgoingByNodeId: Map<string, WorkflowEdge[]>;
  /**
   * Map "<from>__<to>__<index>" → parsed predicate AST. Keyed by
   * source/target plus the edge's position within the source's
   * outgoing list so duplicates (a node with two branches_on to the
   * same target with different predicates) stay distinguishable.
   */
  predicateAstByEdge: Map<string, PredicateAst>;
}

export function edgePredicateKey(from: string, to: string, index: number): string {
  return `${from}__${to}__${index}`;
}

// ── Load from disk ──────────────────────────────────────────────────────────

export function loadWorkflowGraphFromFile(absolutePath: string): LoadedGraph {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  } catch (err) {
    throw new Error(
      `failed to read or parse workflow graph from "${absolutePath}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return loadWorkflowGraph(raw);
}

// ── Load from in-memory object ──────────────────────────────────────────────

export function loadWorkflowGraph(raw: unknown): LoadedGraph {
  const parsed = WorkflowGraphSchema.safeParse(raw);
  if (!parsed.success) {
    // Surface the first issue with its path; zod's full report is
    // available via the issues list for callers that want it.
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") ?? "<root>";
    throw new Error(
      `workflow graph schema validation failed at "${path}": ${
        first?.message ?? "unknown"
      }`,
    );
  }
  const graph = parsed.data;

  // Build the indices and run structural checks in one pass.
  const nodesById = new Map<string, WorkflowNode>();
  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) {
      throw new Error(`duplicate node id "${node.id}" in workflow graph`);
    }
    nodesById.set(node.id, node);
  }

  const outgoingByNodeId = new Map<string, WorkflowEdge[]>();
  for (const edge of graph.edges) {
    if (!nodesById.has(edge.from)) {
      throw new Error(
        `edge references unknown source node "${edge.from}" → "${edge.to}"`,
      );
    }
    if (!nodesById.has(edge.to)) {
      throw new Error(
        `edge references unknown target node "${edge.from}" → "${edge.to}"`,
      );
    }
    const list = outgoingByNodeId.get(edge.from) ?? [];
    list.push(edge);
    outgoingByNodeId.set(edge.from, list);
  }

  // Structural rules per node kind.
  for (const node of graph.nodes) {
    const outgoing = outgoingByNodeId.get(node.id) ?? [];
    if (node.kind === "generator") {
      const feeds = outgoing.filter((e) => e.type === "feeds");
      const branches = outgoing.filter((e) => e.type === "branches_on");
      if (feeds.length !== 1) {
        throw new Error(
          `generator node "${node.id}" must have exactly one outgoing "feeds" edge (found ${feeds.length})`,
        );
      }
      if (branches.length > 0) {
        throw new Error(
          `generator node "${node.id}" must not have outgoing "branches_on" edges`,
        );
      }
    } else if (node.kind === "verifier") {
      const feeds = outgoing.filter((e) => e.type === "feeds");
      const branches = outgoing.filter((e) => e.type === "branches_on");
      if (feeds.length > 0) {
        throw new Error(
          `verifier node "${node.id}" must not have outgoing "feeds" edges (use branches_on)`,
        );
      }
      if (branches.length < 1) {
        throw new Error(
          `verifier node "${node.id}" must have at least one outgoing "branches_on" edge`,
        );
      }
    } else {
      // terminal
      if (outgoing.length > 0) {
        throw new Error(
          `terminal node "${node.id}" must have no outgoing edges (found ${outgoing.length})`,
        );
      }
    }
  }

  // Parse + statically validate every branches_on predicate against
  // the source verifier's schema. Predicate parse errors and field
  // mismatches are caught here so a misconfigured graph fails at
  // load time, not at the moment the runtime first walks the branch.
  const predicateAstByEdge = new Map<string, PredicateAst>();
  for (const [from, edges] of outgoingByNodeId) {
    edges.forEach((edge, idx) => {
      if (edge.type !== "branches_on") return;
      const sourceNode = nodesById.get(from);
      // sourceNode must exist (we built the map above) and must be a
      // verifier (structural check above ensures non-verifiers have
      // no branches_on edges). Defensive narrow:
      if (!sourceNode || sourceNode.kind !== "verifier" || !sourceNode.verifierSchema) {
        throw new Error(
          `internal: branches_on edge from "${from}" has no verifier source schema — graph validation invariant violated`,
        );
      }
      let ast: PredicateAst;
      try {
        ast = parsePredicate(edge.predicate);
      } catch (err) {
        throw new Error(
          `predicate parse failed on edge ${from} → ${edge.to} (predicate "${edge.predicate}"): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      const unknown = validatePredicateAgainstSchema(
        ast,
        sourceNode.verifierSchema,
      );
      if (unknown.length > 0) {
        throw new Error(
          `predicate on edge ${from} → ${edge.to} references field(s) not declared by verifier schema "${sourceNode.verifierSchema}": ${unknown.join(", ")}`,
        );
      }
      predicateAstByEdge.set(edgePredicateKey(from, edge.to, idx), ast);
    });
  }

  return {
    graph,
    nodesById,
    outgoingByNodeId,
    predicateAstByEdge,
  };
}
