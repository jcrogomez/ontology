import { loadEdges } from "../../core/project/load.js";
import type { OntologyEdge } from "../../schemas/ontology.js";

/**
 * Ensures deterministic ordering of edges by createdAt, then edgeId.
 */
function sortEdges(edges: OntologyEdge[]): OntologyEdge[] {
  return edges.sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return a.edgeId.localeCompare(b.edgeId);
  });
}

/**
 * Returns all outgoing edges from a specific node.
 */
export function getOutgoingEdges(nodeId: string): OntologyEdge[] {
  const edges = loadEdges();
  const filtered = edges.filter(edge => edge.from === nodeId);
  return sortEdges(filtered);
}

/**
 * Returns all incoming edges to a specific node.
 */
export function getIncomingEdges(nodeId: string): OntologyEdge[] {
  const edges = loadEdges();
  const filtered = edges.filter(edge => edge.to === nodeId);
  return sortEdges(filtered);
}

/**
 * Returns all edges of a specific type.
 */
export function getEdgesByType(type: OntologyEdge["type"]): OntologyEdge[] {
  const edges = loadEdges();
  const filtered = edges.filter(edge => edge.type === type);
  return sortEdges(filtered);
}

/**
 * Returns both incoming and outgoing edges for a specific node.
 */
export function getNeighbors(nodeId: string): {
  incoming: OntologyEdge[];
  outgoing: OntologyEdge[];
} {
  const edges = loadEdges();
  const incoming = sortEdges(edges.filter(edge => edge.to === nodeId));
  const outgoing = sortEdges(edges.filter(edge => edge.from === nodeId));

  return {
    incoming,
    outgoing
  };
}
