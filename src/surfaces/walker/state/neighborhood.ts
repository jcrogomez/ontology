// Neighborhood loader: assembles everything the walker needs to render a focal node.
// Pure: takes a cwd and a focalId, returns nodes / edges / siblings / children.
// No graphical concerns here.

import type { OntologyNode, OntologyEdge } from "../../../kernel/schemas/ontology.js";
import { loadNodeById, loadNodes, loadEdges } from "../../../kernel/core/project/load.js";

export interface FocalNeighborhood {
  focal: OntologyNode;
  pathToCanon: OntologyNode[];        // includes focal, ordered canon -> ... -> focal
  parent: OntologyNode | null;
  children: OntologyNode[];           // direct children (parentId === focal.id)
  siblings: OntologyNode[];           // nodes that share focal's parentId, excluding focal
  edgesOut: OntologyEdge[];           // edges with from === focal.id
  edgesIn: OntologyEdge[];            // edges with to === focal.id
  edgeNeighbors: OntologyNode[];      // nodes referenced by the edges, deduped
}

export function loadFocalNeighborhood(focalId: string, cwd: string = process.cwd()): FocalNeighborhood {
  const focal = loadNodeById(focalId, cwd);
  if (!focal) {
    throw new Error(`Node not found: ${focalId}`);
  }

  // Load all nodes once; the walker is interactive and will rerender many times so we
  // amortize disk reads up front. The dataset is bounded by the project size.
  const allNodes = loadNodes(cwd);
  const nodeById = new Map(allNodes.map(n => [n.id, n]));

  // Path to canon: walk parentId pointers. Stops on a null parent, a missing reference,
  // or a detected cycle (the seen set protects the interactive walker from spinning
  // forever if someone introduces a malformed parent loop).
  const pathReversed: OntologyNode[] = [focal];
  const seen = new Set<string>([focal.id]);
  let cursor: OntologyNode | null = focal;
  while (cursor.graph.parentId) {
    if (seen.has(cursor.graph.parentId)) break;
    const next = nodeById.get(cursor.graph.parentId);
    if (!next) break;
    seen.add(next.id);
    pathReversed.push(next);
    cursor = next;
  }
  const pathToCanon = pathReversed.reverse();

  const parent = focal.graph.parentId ? nodeById.get(focal.graph.parentId) ?? null : null;

  const children = allNodes.filter(n => n.graph.parentId === focal.id);
  const siblings = parent
    ? allNodes.filter(n => n.graph.parentId === parent.id && n.id !== focal.id)
    : [];

  let edges: OntologyEdge[] = [];
  try {
    edges = loadEdges(cwd);
  } catch {
    // Missing edges file is a valid empty state for fresh projects.
    edges = [];
  }
  const edgesOut = edges.filter(e => e.from === focal.id);
  const edgesIn = edges.filter(e => e.to === focal.id);
  const neighborIds = new Set<string>();
  for (const e of edgesOut) neighborIds.add(e.to);
  for (const e of edgesIn) neighborIds.add(e.from);
  const edgeNeighbors: OntologyNode[] = [];
  for (const id of neighborIds) {
    const n = nodeById.get(id);
    if (n) edgeNeighbors.push(n);
  }

  return {
    focal,
    pathToCanon,
    parent,
    children,
    siblings,
    edgesOut,
    edgesIn,
    edgeNeighbors,
  };
}
