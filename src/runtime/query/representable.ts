// Representable-functor matcher (Yoneda query engine).
//
// The Yoneda Lemma: a node X in the typed multigraph is fully determined,
// up to isomorphism, by its Hom-profile — the collection of morphisms (and
// property-shaped morphisms) that target and emanate from it. We expose
// this as a search primitive: given a shape (a partial Hom-profile), return
// every node whose actual Hom-profile satisfies the shape.
//
// All functions in this module are PURE. They take explicit `nodes` and
// `edges` arrays and return plain data; they do not read the filesystem,
// do not log, and do not mutate their inputs.

import type {
  OntologyEdge,
  OntologyNode,
} from "../../schemas/ontology.js";
import type { QueryShape } from "./types.js";

// Loads the (incoming, outgoing) edge type sets for a node id. We pre-build
// these once in `queryNodes` so a shape with edge filters does not pay
// O(nodes * edges) per match; here it's an internal helper that takes the
// already-built indexes.
interface EdgeTypeIndex {
  // node id -> set of edge types where the node is `to`
  readonly incoming: ReadonlyMap<string, ReadonlySet<OntologyEdge["type"]>>;
  // node id -> set of edge types where the node is `from`
  readonly outgoing: ReadonlyMap<string, ReadonlySet<OntologyEdge["type"]>>;
}

function buildEdgeTypeIndex(edges: readonly OntologyEdge[]): EdgeTypeIndex {
  const incoming = new Map<string, Set<OntologyEdge["type"]>>();
  const outgoing = new Map<string, Set<OntologyEdge["type"]>>();
  for (const e of edges) {
    let inSet = incoming.get(e.to);
    if (!inSet) { inSet = new Set(); incoming.set(e.to, inSet); }
    inSet.add(e.type);
    let outSet = outgoing.get(e.from);
    if (!outSet) { outSet = new Set(); outgoing.set(e.from, outSet); }
    outSet.add(e.type);
  }
  return { incoming, outgoing };
}

// Determines whether a single node matches a shape, given the precomputed
// edge-type index. This is the inner kernel of `matchesShape` and lets the
// public API stay zero-config (callers without an index can just call
// `matchesShape(node, shape, edges)` and we build the index per call).
function matchesShapeWithIndex(
  node: OntologyNode,
  shape: QueryShape,
  index: EdgeTypeIndex,
): boolean {
  // Disjunctive sets (any-of). An empty array is equivalent to undefined —
  // the shape simply doesn't constrain that dimension.
  if (shape.kind && shape.kind.length > 0 && !shape.kind.includes(node.kind)) {
    return false;
  }
  if (shape.abstraction && shape.abstraction.length > 0 && !shape.abstraction.includes(node.coordinates.abstraction)) {
    return false;
  }
  if (shape.plane && shape.plane.length > 0 && !shape.plane.includes(node.coordinates.plane)) {
    return false;
  }
  if (shape.manifestation && shape.manifestation.length > 0 && !shape.manifestation.includes(node.coordinates.manifestation)) {
    return false;
  }
  if (shape.status && shape.status.length > 0 && !shape.status.includes(node.status)) {
    return false;
  }

  // Branch: exact match.
  if (shape.branch !== undefined && node.coordinates.branch !== shape.branch) {
    return false;
  }

  // Hom-profile (conjunctive concept-id requirements). We project the
  // structured ContextContract entries to their identifying string the same
  // way the context-presheaf does, so a query and the context engine agree
  // on what "this node provides X" means.
  if (shape.provides && shape.provides.length > 0) {
    const providedKeys = new Set(node.context.provides.map(p => p.key));
    for (const concept of shape.provides) {
      if (!providedKeys.has(concept)) return false;
    }
  }
  if (shape.requires && shape.requires.length > 0) {
    const requiredSources = new Set(node.context.requires.map(r => r.source));
    for (const concept of shape.requires) {
      if (!requiredSources.has(concept)) return false;
    }
  }
  if (shape.forbids && shape.forbids.length > 0) {
    const forbiddenSources = new Set(node.context.forbids.map(f => f.source));
    for (const concept of shape.forbids) {
      if (!forbiddenSources.has(concept)) return false;
    }
  }

  // Edge existence (conjunctive). "hasIncoming: [refines, depends_on]" means
  // the node must have at least one inbound `refines` edge AND at least one
  // inbound `depends_on` edge. We do not require uniqueness or count.
  if (shape.hasIncoming && shape.hasIncoming.length > 0) {
    const inSet = index.incoming.get(node.id);
    if (!inSet) return false;
    for (const t of shape.hasIncoming) {
      if (!inSet.has(t)) return false;
    }
  }
  if (shape.hasOutgoing && shape.hasOutgoing.length > 0) {
    const outSet = index.outgoing.get(node.id);
    if (!outSet) return false;
    for (const t of shape.hasOutgoing) {
      if (!outSet.has(t)) return false;
    }
  }

  return true;
}

// Public single-node matcher. Builds the edge index lazily; for batch use,
// prefer `queryNodes`, which builds the index once.
export function matchesShape(
  node: OntologyNode,
  shape: QueryShape,
  edges: readonly OntologyEdge[],
): boolean {
  const index = buildEdgeTypeIndex(edges);
  return matchesShapeWithIndex(node, shape, index);
}

// Batch matcher. Returns every node whose Hom-profile satisfies `shape`,
// in deterministic id-sorted order so two runs over the same data produce
// the same output (independent of filesystem readdir order or caller
// insertion order).
export function queryNodes(
  nodes: readonly OntologyNode[],
  shape: QueryShape,
  edges: readonly OntologyEdge[],
): OntologyNode[] {
  const index = buildEdgeTypeIndex(edges);
  const matched: OntologyNode[] = [];
  for (const node of nodes) {
    if (matchesShapeWithIndex(node, shape, index)) {
      matched.push(node);
    }
  }
  matched.sort((a, b) => a.id.localeCompare(b.id));
  return matched;
}
