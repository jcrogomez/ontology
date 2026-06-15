// Unit tests for `suggestEdgeProposals`. The module is a pure function over
// OntologyNode + OntologyEdge values, so the tests build mock graphs inline
// rather than spinning up a temp project. We pin five contracts:
//
//   1. Per-token search finds providers in the same branch.
//   2. Cross-branch providers are excluded.
//   3. Already-existing edges from the focal with the same (to, type) tuple
//      are not re-suggested.
//   4. Per-token cap holds — a popular token doesn't drown the output.
//   5. Determinism — identical input twice yields identical output.

import { describe, it, expect } from "vitest";
import {
  suggestEdgeProposals,
  type EdgeSuggestion,
  type SuggestableEdgeType,
} from "../../../src/forward/context/edge-suggester.js";
import type { OntologyEdge, OntologyNode } from "../../../src/kernel/schemas/ontology.js";

function mkNode(id: string, opts: { branch?: string; provides?: string[]; abstraction?: OntologyNode["coordinates"]["abstraction"] } = {}): OntologyNode {
  return {
    id,
    label: id,
    kind: "entity",
    status: "valid",
    coordinates: {
      abstraction: opts.abstraction ?? "domain",
      branch: opts.branch ?? "main",
      time: 100,
      plane: "semantic",
      manifestation: "intent",
    },
    graph: { parentId: null, orbitOf: null },
    prompt: { raw: "", variables: {}, language: "es" },
    inputs: [],
    outputs: {},
    rules: [],
    context: {
      provides: (opts.provides ?? []).map((key) => ({ key, nodeType: "token" })),
      requires: [],
      forbids: [],
      optional: [],
    },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    technical: {},
    integrity: { hash: `hash:${id}`, schemaVersion: "1.0" },
  };
}

function mkEdge(from: string, to: string, type: OntologyEdge["type"]): OntologyEdge {
  return {
    edgeId: `edge:${from}-${to}-${type}`,
    from,
    to,
    type,
    branch: "main",
    createdAt: 0,
    integrity: { hash: `edge-hash:${from}-${to}-${type}`, schemaVersion: "1.0" },
  };
}

const focal = mkNode("focal", { provides: [] });

describe("suggestEdgeProposals", () => {
  it("emits one suggestion per (provider, edge-type) pair, grouping satisfied tokens", () => {
    const providerA = mkNode("nodeA", { provides: ["token1"] });
    const suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["token1"],
      allNodes: [focal, providerA],
      existingEdges: [],
    });
    // Two edge types per provider × one provider = 2 suggestions.
    expect(suggestions).toHaveLength(2);
    const types = suggestions.map((s) => s.type).sort();
    expect(types).toEqual(["depends_on", "uses_token"]);
    for (const s of suggestions) {
      expect(s.from).toBe("focal");
      expect(s.to).toBe("nodeA");
      expect(s.satisfies).toEqual(["token1"]);
    }
  });

  it("groups multiple satisfied tokens under a single provider", () => {
    const providerA = mkNode("nodeA", { provides: ["alpha", "beta"] });
    const suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["alpha", "beta"],
      allNodes: [focal, providerA],
      existingEdges: [],
    });
    // Still 2 suggestions (one per type), each carrying both tokens.
    expect(suggestions).toHaveLength(2);
    for (const s of suggestions) {
      expect(s.satisfies).toEqual(["alpha", "beta"]); // sorted
    }
  });

  it("excludes providers on a different branch", () => {
    const sameBranch = mkNode("nodeA", { provides: ["token1"], branch: "main" });
    const otherBranch = mkNode("nodeB", { provides: ["token1"], branch: "feature/x" });
    const suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["token1"],
      allNodes: [focal, sameBranch, otherBranch],
      existingEdges: [],
    });
    expect(new Set(suggestions.map((s) => s.to))).toEqual(new Set(["nodeA"]));
  });

  it("skips suggestions whose (to, type) tuple already exists from the focal", () => {
    const providerA = mkNode("nodeA", { provides: ["token1"] });
    const suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["token1"],
      allNodes: [focal, providerA],
      existingEdges: [mkEdge("focal", "nodeA", "depends_on")],
    });
    // depends_on is already present → only uses_token is suggested.
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.type).toBe("uses_token");
  });

  it("dedup index is built unconditionally — empty existingEdges does not bypass the filter", () => {
    // Regression pin: a previous code shape gated the index build on
    // `existingEdges.length > 0`, which meant callers passing [] would
    // skip the dedup branch even if they later expected it to run. The
    // current code uses an unconditional for-of, so an empty array
    // produces the same outcome as a populated one with no overlap.
    const providerA = mkNode("nodeA", { provides: ["token1"] });
    const withEmpty = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["token1"],
      allNodes: [focal, providerA],
      existingEdges: [],
    });
    const withUnrelated = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["token1"],
      allNodes: [focal, providerA],
      // An edge that doesn't collide with any (to, type) we'd suggest
      // must produce exactly the same suggestion set as the empty case.
      existingEdges: [mkEdge("focal", "nodeXYZ", "depends_on")],
    });
    expect(withEmpty).toEqual(withUnrelated);
    expect(withEmpty.map((s) => s.type).sort()).toEqual(["depends_on", "uses_token"]);
  });

  it("respects maxProvidersPerToken — caps a popular token's provider list", () => {
    const providers = Array.from({ length: 10 }, (_, i) =>
      mkNode(`node${String(i).padStart(2, "0")}`, { provides: ["popular"] }),
    );
    const suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["popular"],
      allNodes: [focal, ...providers],
      existingEdges: [],
      maxProvidersPerToken: 3,
    });
    // 3 providers × 2 edge types each = 6 suggestions.
    expect(suggestions).toHaveLength(6);
    // The cap selects providers in iteration order (matches on-disk node
    // load order). With our mkNode helper that's `node00`, `node01`, `node02`.
    const tos = new Set(suggestions.map((s) => s.to));
    expect(tos).toEqual(new Set(["node00", "node01", "node02"]));
  });

  it("returns the empty array when there are no missing requirements", () => {
    const providerA = mkNode("nodeA", { provides: ["token1"] });
    const suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: [],
      allNodes: [focal, providerA],
      existingEdges: [],
    });
    expect(suggestions).toEqual([]);
  });

  it("respects an explicit edge-type list", () => {
    const providerA = mkNode("nodeA", { provides: ["token1"] });
    const onlyDependsOn: SuggestableEdgeType[] = ["depends_on"];
    const suggestions = suggestEdgeProposals({
      focalNode: focal,
      missingRequirements: ["token1"],
      allNodes: [focal, providerA],
      existingEdges: [],
      edgeTypes: onlyDependsOn,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.type).toBe("depends_on");
  });

  it("is deterministic — two runs over identical input yield byte-equal output", () => {
    const providers = [
      mkNode("nodeC", { provides: ["alpha"] }),
      mkNode("nodeA", { provides: ["alpha"] }),
      mkNode("nodeB", { provides: ["beta"] }),
    ];
    const input = {
      focalNode: focal,
      missingRequirements: ["alpha", "beta"],
      allNodes: [focal, ...providers],
      existingEdges: [] as OntologyEdge[],
    };
    const a = suggestEdgeProposals(input);
    const b = suggestEdgeProposals(input);
    expect(a).toEqual(b);
    // And the (to, type) ordering is stable: sorted by `to` then `type`.
    const keys = a.map((s: EdgeSuggestion) => `${s.to}::${s.type}`);
    const sortedKeys = [...keys].sort();
    expect(keys).toEqual(sortedKeys);
  });

  it("does not suggest the focal itself even if its own provides happen to match", () => {
    const focalWithProvides = mkNode("focal", { provides: ["token1"] });
    const suggestions = suggestEdgeProposals({
      focalNode: focalWithProvides,
      missingRequirements: ["token1"],
      allNodes: [focalWithProvides],
      existingEdges: [],
    });
    // Self-loops are not suggested.
    expect(suggestions).toEqual([]);
  });
});
