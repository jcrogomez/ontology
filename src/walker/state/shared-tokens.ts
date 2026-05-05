// Shared-token computation: the visual proof of presheaf overlap (axiom 5).
//
// A token is a `requires.source` or `provides.key` string. For each token in the focal
// node we report the count of OTHER nodes in the local neighborhood that mention the
// same token in their requires or provides. The walker renders that count next to each
// token, and underlines the token when count > 0.
//
// v0 uses exact-token matching. Future v1+ may add case-insensitive / lemmatized matching
// behind an explicit opt-in.

import type { OntologyNode } from "../../schemas/ontology.js";
import type { FocalNeighborhood } from "./neighborhood.js";

export interface SharedTokenInfo {
  token: string;
  sharedWith: string[];   // node ids that contain the same token
}

// Returns one entry per requires.source on the focal node.
export function focalRequiresShared(neighborhood: FocalNeighborhood): SharedTokenInfo[] {
  return computeShared(neighborhood, neighborhood.focal.context.requires.map(r => r.source));
}

// Returns one entry per provides.key on the focal node.
export function focalProvidesShared(neighborhood: FocalNeighborhood): SharedTokenInfo[] {
  return computeShared(neighborhood, neighborhood.focal.context.provides.map(p => p.key));
}

function computeShared(neighborhood: FocalNeighborhood, focalTokens: string[]): SharedTokenInfo[] {
  const others = collectOtherNodes(neighborhood);
  return focalTokens.map(token => ({
    token,
    sharedWith: others
      .filter(n => nodeContainsToken(n, token))
      .map(n => n.id)
      .sort(),
  }));
}

function collectOtherNodes(neighborhood: FocalNeighborhood): OntologyNode[] {
  const seen = new Set<string>();
  const out: OntologyNode[] = [];
  const candidates = [
    ...neighborhood.pathToCanon,
    ...neighborhood.siblings,
    ...neighborhood.children,
    ...neighborhood.edgeNeighbors,
  ];
  for (const node of candidates) {
    if (node.id === neighborhood.focal.id) continue;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

function nodeContainsToken(node: OntologyNode, token: string): boolean {
  for (const r of node.context.requires) {
    if (r.source === token) return true;
  }
  for (const p of node.context.provides) {
    if (p.key === token) return true;
  }
  return false;
}
