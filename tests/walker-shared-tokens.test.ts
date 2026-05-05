import { describe, it, expect } from "vitest";
import {
  focalRequiresShared,
  focalProvidesShared,
} from "../src/walker/state/shared-tokens.js";
import type { OntologyNode } from "../src/schemas/ontology.js";
import type { FocalNeighborhood } from "../src/walker/state/neighborhood.js";

function nodeWithContext(id: string, ctx: { requires?: string[]; provides?: string[] }): OntologyNode {
  return {
    id,
    label: id,
    kind: "definition",
    status: "draft",
    coordinates: { abstraction: "domain", time: 0, branch: "main", plane: "semantic", manifestation: "intent" },
    inputs: [],
    prompt: { raw: "", language: "en", variables: {} },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: {
      requires: (ctx.requires ?? []).map(s => ({ source: s, nodeType: "definition" })),
      provides: (ctx.provides ?? []).map(k => ({ key: k, nodeType: "definition" })),
      forbids: [],
      optional: [],
    },
    graph: { parentId: null, orbitOf: null },
    rules: [],
    technical: {},
    outputs: { files: [] },
    validation: { errors: [], warnings: [] },
    integrity: { frozen: false, hash: "h", schemaVersion: "0.1.0" },
  } as OntologyNode;
}

function neighborhood(focal: OntologyNode, others: OntologyNode[]): FocalNeighborhood {
  return {
    focal,
    pathToCanon: [focal],
    parent: null,
    children: [],
    siblings: others,
    edgesOut: [],
    edgesIn: [],
    edgeNeighbors: [],
  };
}

describe("walker shared-token computation (presheaf overlap)", () => {
  it("marks a focal requires token as shared when another node provides the same key", () => {
    const focal = nodeWithContext("node_focal", { requires: ["harvest_quantity"] });
    const sibling = nodeWithContext("node_sibling", { provides: ["harvest_quantity"] });
    const result = focalRequiresShared(neighborhood(focal, [sibling]));
    expect(result).toEqual([
      { token: "harvest_quantity", sharedWith: ["node_sibling"] },
    ]);
  });

  it("marks a focal requires token as shared when another node also requires it", () => {
    const focal = nodeWithContext("node_focal", { requires: ["harvest_quantity"] });
    const other = nodeWithContext("node_other", { requires: ["harvest_quantity"] });
    const result = focalRequiresShared(neighborhood(focal, [other]));
    expect(result[0].sharedWith).toEqual(["node_other"]);
  });

  it("returns empty sharedWith when no other node mentions the token", () => {
    const focal = nodeWithContext("node_focal", { requires: ["unique_token"] });
    const other = nodeWithContext("node_other", { provides: ["something_else"] });
    const result = focalRequiresShared(neighborhood(focal, [other]));
    expect(result).toEqual([
      { token: "unique_token", sharedWith: [] },
    ]);
  });

  it("focalProvidesShared works symmetrically: provides token shared with neighbors", () => {
    const focal = nodeWithContext("node_focal", { provides: ["stock_delta"] });
    const consumer = nodeWithContext("node_consumer", { requires: ["stock_delta"] });
    const result = focalProvidesShared(neighborhood(focal, [consumer]));
    expect(result[0].sharedWith).toEqual(["node_consumer"]);
  });

  it("returns one result entry per focal token, preserving order", () => {
    const focal = nodeWithContext("node_focal", {
      requires: ["alpha", "beta", "gamma"],
    });
    const other = nodeWithContext("node_other", { provides: ["beta"] });
    const result = focalRequiresShared(neighborhood(focal, [other]));
    expect(result.map(r => r.token)).toEqual(["alpha", "beta", "gamma"]);
    expect(result[0].sharedWith).toEqual([]);
    expect(result[1].sharedWith).toEqual(["node_other"]);
    expect(result[2].sharedWith).toEqual([]);
  });

  it("dedupes nodes that appear in multiple neighborhood buckets", () => {
    const focal = nodeWithContext("node_focal", { requires: ["t"] });
    const dup = nodeWithContext("node_dup", { provides: ["t"] });
    // Same node in two buckets (siblings AND children would happen for malformed inputs;
    // the neighborhood loader produces unique sets but the helper must not trust that.)
    const nb: FocalNeighborhood = {
      focal,
      pathToCanon: [focal],
      parent: null,
      children: [dup],
      siblings: [dup],
      edgesOut: [],
      edgesIn: [],
      edgeNeighbors: [dup],
    };
    const result = focalRequiresShared(nb);
    expect(result[0].sharedWith).toEqual(["node_dup"]);
  });
});
