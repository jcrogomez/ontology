// Pure graph traversal helpers consumed by `onto graph` CLI commands and by
// future Walker v1 navigation primitives. All helpers are read-only and side
// effect free — they take an explicit `edges` array and node-id lookup, and
// return plain data structures.
//
// Edge orientation: edges are directed (axiom 1). A traversal can walk along
// edges in either direction; we surface this distinction explicitly.

import type { OntologyEdge } from "../schemas/ontology.js";

export type EdgeDirection = "in" | "out" | "both";

export interface NeighborEntry {
  edge: OntologyEdge;
  // The node id reached by traversing this edge from the focal id. For an
  // outgoing edge that's `edge.to`; for an incoming edge that's `edge.from`.
  neighborId: string;
  // Direction relative to the focal node.
  direction: "out" | "in";
}

// Returns the direct neighbors of `focalId` reachable along edges that:
//   - have a type in `edgeTypes` (when provided; otherwise any type)
//   - point in the requested direction (default both)
// The result is deduplicated by edge id. A self-loop would appear twice
// (once as in, once as out), but self-loops are rejected at link time.
export function getNeighbors(
  focalId: string,
  edges: OntologyEdge[],
  options: {
    direction?: EdgeDirection;
    edgeTypes?: OntologyEdge["type"][];
  } = {},
): NeighborEntry[] {
  const direction = options.direction ?? "both";
  const typeFilter = options.edgeTypes && options.edgeTypes.length > 0
    ? new Set<OntologyEdge["type"]>(options.edgeTypes)
    : null;

  const out: NeighborEntry[] = [];
  for (const edge of edges) {
    if (typeFilter && !typeFilter.has(edge.type)) continue;
    if ((direction === "out" || direction === "both") && edge.from === focalId) {
      out.push({ edge, neighborId: edge.to, direction: "out" });
    }
    if ((direction === "in" || direction === "both") && edge.to === focalId) {
      out.push({ edge, neighborId: edge.from, direction: "in" });
    }
  }
  return out;
}

// BFS over the directed graph, walking edges in their natural direction
// (from → to). Returns the shortest sequence of edges that connects
// `fromId` to `toId`, or null when no path exists within `maxDepth` hops.
//
// Direction policy: edges are walked from → to only (no reverse traversal).
// If a graph requires reverse walking, expose that as an explicit option in
// a follow-up; for now we keep the contract narrow so users do not have to
// reason about implicit edge inversion.
export function findShortestPath(
  fromId: string,
  toId: string,
  edges: OntologyEdge[],
  options: {
    edgeTypes?: OntologyEdge["type"][];
    maxDepth?: number;
  } = {},
): OntologyEdge[] | null {
  if (fromId === toId) return [];
  const maxDepth = options.maxDepth ?? 10;
  const typeFilter = options.edgeTypes && options.edgeTypes.length > 0
    ? new Set<OntologyEdge["type"]>(options.edgeTypes)
    : null;

  // Adjacency by source id (outgoing only) for BFS efficiency.
  const adj = new Map<string, OntologyEdge[]>();
  for (const edge of edges) {
    if (typeFilter && !typeFilter.has(edge.type)) continue;
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge);
  }

  // BFS frontier carries (nodeId, depth, predecessor edge for backtracking).
  const queue: Array<{ id: string; depth: number; prev: number | null }> = [
    { id: fromId, depth: 0, prev: null },
  ];
  const visited = new Set<string>([fromId]);
  // Parallel arrays let us reconstruct the path without extra allocations.
  const prevEdge: (OntologyEdge | null)[] = [null];
  const prevIdx: (number | null)[] = [null];
  // Map of nodeId → index in prevEdge/prevIdx. Set on first visit.
  const indexOf = new Map<string, number>();
  indexOf.set(fromId, 0);

  while (queue.length > 0) {
    const head = queue.shift()!;
    if (head.depth >= maxDepth) continue;
    const out = adj.get(head.id) ?? [];
    for (const edge of out) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      const idx = prevEdge.length;
      prevEdge.push(edge);
      prevIdx.push(indexOf.get(head.id) ?? null);
      indexOf.set(edge.to, idx);
      if (edge.to === toId) {
        // Reconstruct the path.
        const path: OntologyEdge[] = [];
        let cur: number | null = idx;
        while (cur !== null) {
          const e = prevEdge[cur];
          if (!e) break;
          path.unshift(e);
          cur = prevIdx[cur];
        }
        return path;
      }
      queue.push({ id: edge.to, depth: head.depth + 1, prev: idx });
    }
  }

  return null;
}

export interface SubgraphSlice {
  // Node ids reached within `depth` hops of the focal, including the focal.
  nodeIds: string[];
  // Edges that connect any two nodes inside the slice. A boundary edge
  // pointing OUT of the slice is excluded.
  edges: OntologyEdge[];
}

// Extracts an undirected (in OR out) k-hop neighborhood around `focalId`.
// Used by `onto graph subgraph` and by future Walker v1 expand views.
//
// The traversal is undirected by default because the question being asked is
// "what is in this node's local universe", not "where do its edges point".
// `edgeTypes` narrows which edges are considered for membership.
export function extractSubgraph(
  focalId: string,
  edges: OntologyEdge[],
  options: {
    depth?: number;
    edgeTypes?: OntologyEdge["type"][];
  } = {},
): SubgraphSlice {
  const depth = options.depth ?? 2;
  const typeFilter = options.edgeTypes && options.edgeTypes.length > 0
    ? new Set<OntologyEdge["type"]>(options.edgeTypes)
    : null;

  const filteredEdges = typeFilter ? edges.filter(e => typeFilter.has(e.type)) : edges;

  // Adjacency in both directions for BFS.
  const adj = new Map<string, string[]>();
  for (const edge of filteredEdges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
    if (!adj.has(edge.to)) adj.set(edge.to, []);
    adj.get(edge.to)!.push(edge.from);
  }

  const visited = new Set<string>([focalId]);
  let frontier: string[] = [focalId];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  // Keep only edges where BOTH endpoints are inside the slice. A user asking
  // for the 2-hop subgraph rooted at X expects to see edges among the
  // included nodes, not edges that wander off the boundary.
  const sliceEdges = filteredEdges.filter(e => visited.has(e.from) && visited.has(e.to));

  return {
    nodeIds: Array.from(visited).sort(),
    edges: sliceEdges,
  };
}
