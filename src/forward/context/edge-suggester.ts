// Edge proposal suggester.
//
// Given a focal node and the set of `requires` tokens that the gluing
// pipeline could not satisfy from the current assembled context, this
// module searches the wider graph for nodes whose `provides` would
// resolve those tokens, and emits typed edge-proposal suggestions
// (one per (provider, edge-type) pair) that the user can hand to
// `onto propose link`.
//
// Honesty contract:
//
//   • This module never mutates the graph or the proposals store. It
//     returns suggestions as data; the user (or a future
//     `onto link --propose` flag) chooses to act.
//   • Suggestions are deterministic: sorted by (to, type), grouped per
//     provider, with the satisfied-tokens list itself sorted.
//   • Same-branch only. Cross-branch edges live in the future
//     branch-merge proposal flow, not here.
//   • Suggestions skip edges that already exist with the same (from,
//     to, type) tuple — re-suggesting an existing edge would be a
//     no-op and add UI noise.
//   • Suggestions skip the focal itself and skip providers whose
//     poset relationship with the focal would cause `validateEdgeDirection`
//     to reject the edge at link time. (For the two default edge types
//     — `depends_on` and `uses_token` — this is a no-op since both are
//     direction-agnostic, but the check keeps the contract honest if a
//     future caller asks for refinement-family suggestions.)
//
// The default edge-type set is `["depends_on", "uses_token"]`. Per the
// design discussion, both are emitted as parallel suggestions per
// provider so the user picks the semantic that matches their intent
// (generic dependency vs token-bearing edge) without having to think
// twice.

import type { OntologyEdge, OntologyNode } from "../../kernel/schemas/ontology.js";
import { validateEdgeDirection } from "../../kernel/graph/poset.js";

export type SuggestableEdgeType = "depends_on" | "uses_token";

export interface EdgeSuggestion {
  from: string;
  to: string;
  type: SuggestableEdgeType;
  /** Tokens this edge would bring into the focal's gluing pool. Sorted. */
  satisfies: string[];
  /** Human-readable rationale. Stable text; safe to include in JSON. */
  rationale: string;
}

export interface SuggestEdgesInput {
  focalNode: OntologyNode;
  /** Tokens the focal `requires` that the current gluing pool does not provide. */
  missingRequirements: ReadonlyArray<string>;
  /** Search universe (typically every node loaded from the project). */
  allNodes: ReadonlyArray<OntologyNode>;
  /** Existing edges (used to skip already-linked (from, to, type) tuples). */
  existingEdges: ReadonlyArray<OntologyEdge>;
  /**
   * Branch to consider. Suggestions are restricted to providers whose
   * `coordinates.branch` matches. Defaults to the focal's branch.
   */
  branch?: string;
  /**
   * Edge types to suggest per provider. Defaults to ["depends_on",
   * "uses_token"]. Constrained to the suggestable set so we never emit
   * a refinement-family suggestion that the poset would reject; if a
   * future caller wants those, they can extend the type union.
   */
  edgeTypes?: ReadonlyArray<SuggestableEdgeType>;
  /**
   * Cap suggestions per missing token. Helpful when one common token
   * is provided by dozens of nodes — listing all 60 would drown the UI.
   * Defaults to 5; pass `Infinity` to disable.
   */
  maxProvidersPerToken?: number;
}

const DEFAULT_EDGE_TYPES: ReadonlyArray<SuggestableEdgeType> = [
  "depends_on",
  "uses_token",
];

const DEFAULT_MAX_PROVIDERS_PER_TOKEN = 5;

export function suggestEdgeProposals(input: SuggestEdgesInput): EdgeSuggestion[] {
  const focal = input.focalNode;
  const branch = input.branch ?? focal.coordinates.branch;
  const edgeTypes = input.edgeTypes ?? DEFAULT_EDGE_TYPES;
  const cap = input.maxProvidersPerToken ?? DEFAULT_MAX_PROVIDERS_PER_TOKEN;

  // Pre-index existing edges from focal so the (to, type) skip is O(1).
  const existingFromFocal = new Set<string>();
  for (const e of input.existingEdges) {
    if (e.from === focal.id) existingFromFocal.add(`${e.to}::${e.type}`);
  }

  // Build {token → [providerNodeId, ...]} restricted to same-branch,
  // non-focal nodes. Keep the providers in input order so the cap
  // selection is deterministic relative to the on-disk node load order.
  const providersByToken = new Map<string, string[]>();
  const tokensProvidedBy = new Map<string, Set<string>>();
  const wantedTokens = new Set(input.missingRequirements);
  if (wantedTokens.size === 0) return [];

  for (const node of input.allNodes) {
    if (node.id === focal.id) continue;
    if (node.coordinates.branch !== branch) continue;
    for (const provided of node.context.provides) {
      const token = provided.key;
      if (!wantedTokens.has(token)) continue;
      // Track per-token providers (capped) and per-provider tokens
      // (uncapped) so we can group below.
      let bucket = providersByToken.get(token);
      if (!bucket) {
        bucket = [];
        providersByToken.set(token, bucket);
      }
      if (bucket.length < cap && !bucket.includes(node.id)) {
        bucket.push(node.id);
      }
      let tokens = tokensProvidedBy.get(node.id);
      if (!tokens) {
        tokens = new Set<string>();
        tokensProvidedBy.set(node.id, tokens);
      }
      tokens.add(token);
    }
  }

  // Collect the union of "candidate provider node ids" across every
  // missing token (after the per-token cap). Then for each provider,
  // emit one suggestion per requested edge type — provided that the
  // edge would survive the poset check and isn't already an edge.
  const providerIds = new Set<string>();
  for (const ids of providersByToken.values()) ids.forEach((id) => providerIds.add(id));

  const suggestions: EdgeSuggestion[] = [];
  for (const providerId of providerIds) {
    const providerNode = input.allNodes.find((n) => n.id === providerId);
    if (!providerNode) continue; // defensive — providers came from allNodes
    const tokens = Array.from(tokensProvidedBy.get(providerId) ?? []).sort();
    if (tokens.length === 0) continue;
    for (const edgeType of edgeTypes) {
      // Skip edges that already exist from focal with the same (to, type).
      if (existingFromFocal.has(`${providerId}::${edgeType}`)) continue;
      // Refuse edges the kernel would reject at link time. Both
      // current default types are direction-agnostic, but this keeps
      // the suggester correct for any future suggestable type.
      const direction = validateEdgeDirection({
        sourceLevel: focal.coordinates.abstraction,
        targetLevel: providerNode.coordinates.abstraction,
        edgeType,
      });
      if (!direction.ok) continue;
      suggestions.push({
        from: focal.id,
        to: providerId,
        type: edgeType,
        satisfies: tokens,
        rationale: rationaleFor(tokens, edgeType),
      });
    }
  }

  // Determinism: sort by (to, type) so two runs over the same project
  // produce byte-identical output.
  suggestions.sort((a, b) => {
    if (a.to !== b.to) return a.to < b.to ? -1 : 1;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });

  return suggestions;
}

function rationaleFor(tokens: ReadonlyArray<string>, edgeType: SuggestableEdgeType): string {
  const list = tokens.length === 1 ? tokens[0] : tokens.join(", ");
  const verb = edgeType === "depends_on" ? "depends on" : "uses tokens from";
  return `focal ${verb} provider that supplies: ${list}`;
}
