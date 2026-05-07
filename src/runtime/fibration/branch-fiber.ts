// Pure helpers that compute branch fibers over the typed Ontology graph.
//
// Mathematical model — Grothendieck fibration:
//   p: E → B
//     B = the linear temporal log of events (the base category).
//     E = events tagged with a branch label (the total category).
//     p forgets the branch label.
//   A *fiber* over a branch b is `p^{-1}(b)`: the subgraph of nodes and
//   edges that carry `coordinates.branch === b`. Edges are filtered to the
//   induced subgraph so the result is well-defined as a categorical
//   morphism collection: every morphism in the fiber starts and ends in
//   the fiber.
//   A *cartesian lift* of a base morphism `f: b → b'` at a node N is a
//   re-labelled node N' over b' that agrees with N on all base-invariant
//   data (kind, abstraction, manifestation, …). `describeCartesianLift`
//   produces the proposal *shape* — it does not mutate state or persist.
//
// All functions are read-only and side-effect free. They take plain data
// (nodes, edges) so callers can compose them without committing to any
// particular state-loading strategy.

import type { OntologyNode, OntologyEdge } from "../../schemas/ontology.js";
import type {
  BranchFiber,
  BranchProjection,
  CartesianLift,
  FiberInput,
} from "./types.js";

// Returns the unique branches that appear in `input.nodes`, sorted
// lexicographically. The sort is intentional: callers (CLI listings,
// tests, serialised proposals) want a deterministic order that does not
// depend on node insertion order or filesystem readdir() ordering.
//
// Edges are *not* consulted: a branch is defined by the existence of at
// least one node on it. An edge whose endpoints both live on a branch
// will already cause that branch's nodes to be present, and a branch
// with no nodes has no fiber to project to.
export function listBranches(input: FiberInput): string[] {
  const seen = new Set<string>();
  for (const node of input.nodes) {
    seen.add(node.coordinates.branch);
  }
  return Array.from(seen).sort();
}

// Computes the fiber over a single branch. The result is the induced
// subgraph: nodes filtered by `coordinates.branch`, edges filtered to
// those whose *both* endpoints survive the node filter.
//
// We do NOT filter edges by `edge.branch`. An edge's `branch` field
// records when/where the edge was authored, but membership in a fiber is
// a structural property: a morphism in the fiber `p^{-1}(b)` must have
// source and target inside that fiber. This is also the only filter
// criterion that guarantees the partition property tested below
// (`flatMap(f.nodes).length === input.nodes.length`).
//
// `branch` is treated as an opaque string; we do not normalise (no
// trimming, no case-folding) because branch names are exact identifiers
// elsewhere in the system.
export function computeBranchFiber(
  input: FiberInput,
  branch: string,
): BranchFiber {
  const nodes = input.nodes.filter((n) => n.coordinates.branch === branch);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = input.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
  );
  return {
    branch,
    nodes,
    edges,
    size: { nodes: nodes.length, edges: edges.length },
  };
}

// Computes every fiber that has at least one node, sorted by branch name.
//
// Partition property: `computeAllFibers(input).fibers.flatMap(f => f.nodes)`
// has length exactly `input.nodes.length`, because every node belongs to
// exactly one fiber (the one whose branch matches its `coordinates.branch`).
// Edges, by contrast, can be dropped (cross-branch edges have no fiber to
// belong to) — this is the read-only equivalent of "merging branches must
// reconcile cross-branch edges".
export function computeAllFibers(input: FiberInput): BranchProjection {
  const branches = listBranches(input);
  const fibers = branches.map((b) => computeBranchFiber(input, b));
  return { branches, fibers };
}

// Describes the cartesian lift of a node from its current branch to
// `targetBranch`. The proposal is a *shape*, not a side effect: no node is
// created, no event is emitted, no integrity hash is computed. Downstream
// callers (a future `onto branch lift` command, branch-aware compile, or
// the proposal pipeline) are responsible for materialising the lift into
// a real node.
//
// Suggested id: `<sourceId>@<targetBranch>`. The `@` separator is chosen
// because no current node id can contain it (`startsWith("node_")` and
// our generators produce only alphanumerics + underscores), so the lifted
// id is unambiguous and reversible. Callers may rewrite this when they
// materialise the proposal.
//
// Preservation contract: kind, abstraction, manifestation — and every other
// non-branch coordinate — are copied verbatim. Only `coordinates.branch`
// changes. This is the cartesian property: the lift is the *unique*
// morphism over `f: b → b'` that agrees with the source on the base.
export function describeCartesianLift(
  node: OntologyNode,
  targetBranch: string,
): CartesianLift {
  return {
    source: { node, branch: node.coordinates.branch },
    targetBranch,
    proposed: {
      id: `${node.id}@${targetBranch}`,
      coordinates: { ...node.coordinates, branch: targetBranch },
    },
    preserves: {
      kind: true,
      abstraction: true,
      manifestation: true,
    },
  };
}

// Convenience wrapper that bundles `computeBranchFiber` with the
// `OntologyEdge[]` and `OntologyNode[]` arguments callers will most often
// have on hand. Kept here (rather than inlined in callers) so the fibration
// API has a single entry point regardless of how the graph was loaded.
export function computeBranchFiberFromArrays(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  branch: string,
): BranchFiber {
  return computeBranchFiber({ nodes, edges }, branch);
}
