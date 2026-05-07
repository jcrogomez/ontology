import { describe, it, expect } from "vitest";
import {
  listBranches,
  computeBranchFiber,
  computeBranchFiberFromArrays,
  computeAllFibers,
  describeCartesianLift,
} from "../../../src/runtime/fibration/index.js";
import type { FiberInput } from "../../../src/runtime/fibration/index.js";
import {
  OntologyNodeSchema,
  OntologyEdgeSchema,
  type OntologyNode,
  type OntologyEdge,
} from "../../../src/schemas/ontology.js";

// Build a minimal node by parsing through the schema. Using the parser keeps
// these fixtures honest: any future change to the schema (new required field,
// renamed coordinate) will surface immediately rather than silently bit-rot.
function makeNode(overrides: {
  id: string;
  branch?: string;
  abstraction?: OntologyNode["coordinates"]["abstraction"];
  manifestation?: OntologyNode["coordinates"]["manifestation"];
  kind?: OntologyNode["kind"];
  time?: number;
}): OntologyNode {
  return OntologyNodeSchema.parse({
    id: overrides.id,
    label: overrides.id,
    kind: overrides.kind ?? "rule",
    status: "valid",
    coordinates: {
      abstraction: overrides.abstraction ?? "domain",
      time: overrides.time ?? 0,
      branch: overrides.branch ?? "main",
      plane: "semantic",
      manifestation: overrides.manifestation ?? "intent",
    },
    inputs: [],
    prompt: { raw: "p", variables: {}, language: "en" },
    model: { ref: "mock" },
    processors: { pre: [], post: [] },
    context: { requires: [], provides: [], forbids: [], optional: [] },
    graph: { parentId: null, orbitOf: null },
    rules: [],
    technical: {},
    outputs: { files: [] },
    integrity: { hash: "hash", schemaVersion: "1.0" },
  });
}

function makeEdge(overrides: {
  edgeId: string;
  from: string;
  to: string;
  type?: OntologyEdge["type"];
  branch?: string;
}): OntologyEdge {
  return OntologyEdgeSchema.parse({
    edgeId: overrides.edgeId,
    from: overrides.from,
    to: overrides.to,
    type: overrides.type ?? "depends_on",
    branch: overrides.branch ?? "main",
    createdAt: "2025-01-01T00:00:00.000Z",
    createdByEventId: "evt_0001",
    integrity: { hash: "hash", schemaVersion: "1.0" },
  });
}

function makeInput(): FiberInput {
  // 4 nodes across two branches, plus an isolated branch-only node.
  const nodes: OntologyNode[] = [
    makeNode({ id: "node_main_a", branch: "main", time: 0 }),
    makeNode({ id: "node_main_b", branch: "main", time: 1 }),
    makeNode({ id: "node_feat_a", branch: "feature/x", time: 2 }),
    makeNode({ id: "node_feat_b", branch: "feature/x", time: 3 }),
    makeNode({ id: "node_other", branch: "experiment", time: 4 }),
  ];
  const edges: OntologyEdge[] = [
    // intra-main edge
    makeEdge({ edgeId: "edge_main", from: "node_main_a", to: "node_main_b" }),
    // intra-feature edge
    makeEdge({
      edgeId: "edge_feat",
      from: "node_feat_a",
      to: "node_feat_b",
      branch: "feature/x",
    }),
    // cross-branch edge: must NOT appear in any single fiber
    makeEdge({
      edgeId: "edge_cross",
      from: "node_main_a",
      to: "node_feat_a",
    }),
  ];
  return { nodes, edges };
}

describe("listBranches", () => {
  it("returns the unique sorted branches that appear on nodes", () => {
    const input = makeInput();
    expect(listBranches(input)).toEqual(["experiment", "feature/x", "main"]);
  });

  it("is deterministic regardless of node insertion order", () => {
    const input = makeInput();
    const reversed = { ...input, nodes: [...input.nodes].reverse() };
    expect(listBranches(reversed)).toEqual(listBranches(input));
  });

  it("returns an empty array on empty input", () => {
    expect(listBranches({ nodes: [], edges: [] })).toEqual([]);
  });

  it("collapses duplicates: a branch with N nodes appears once", () => {
    const input = makeInput();
    expect(listBranches(input).filter((b) => b === "main")).toHaveLength(1);
  });
});

describe("computeBranchFiber — fiber as induced subgraph", () => {
  it("includes only nodes whose coordinates.branch equals the requested branch", () => {
    const input = makeInput();
    const fiber = computeBranchFiber(input, "main");
    for (const node of fiber.nodes) {
      expect(node.coordinates.branch).toBe("main");
    }
    expect(fiber.nodes.map((n) => n.id).sort()).toEqual([
      "node_main_a",
      "node_main_b",
    ]);
  });

  it("fiber.nodes is a subset of input.nodes", () => {
    const input = makeInput();
    const fiber = computeBranchFiber(input, "main");
    const allIds = new Set(input.nodes.map((n) => n.id));
    for (const node of fiber.nodes) {
      expect(allIds.has(node.id)).toBe(true);
    }
  });

  it("edges in a fiber have BOTH endpoints in the fiber", () => {
    const input = makeInput();
    const mainFiber = computeBranchFiber(input, "main");
    const mainIds = new Set(mainFiber.nodes.map((n) => n.id));
    for (const edge of mainFiber.edges) {
      expect(mainIds.has(edge.from)).toBe(true);
      expect(mainIds.has(edge.to)).toBe(true);
    }
    // The cross-branch edge belongs to neither single-branch fiber.
    expect(mainFiber.edges.find((e) => e.edgeId === "edge_cross"))
      .toBeUndefined();
  });

  it("size mirrors the cardinalities of nodes and edges", () => {
    const input = makeInput();
    const fiber = computeBranchFiber(input, "feature/x");
    expect(fiber.size.nodes).toBe(fiber.nodes.length);
    expect(fiber.size.edges).toBe(fiber.edges.length);
    expect(fiber.size).toEqual({ nodes: 2, edges: 1 });
  });

  it("an unknown branch yields an empty fiber rather than throwing", () => {
    const input = makeInput();
    const fiber = computeBranchFiber(input, "does-not-exist");
    expect(fiber).toEqual({
      branch: "does-not-exist",
      nodes: [],
      edges: [],
      size: { nodes: 0, edges: 0 },
    });
  });

  it("does not filter edges by edge.branch — only by endpoint membership", () => {
    // The intra-feature edge is correctly tagged branch=feature/x. We assert
    // that even an edge mis-tagged as 'main' but connecting two feature nodes
    // would still belong to the feature fiber, because membership is
    // structural.
    const nodes = [
      makeNode({ id: "node_a", branch: "feature/x" }),
      makeNode({ id: "node_b", branch: "feature/x" }),
    ];
    const edges = [
      makeEdge({
        edgeId: "edge_x",
        from: "node_a",
        to: "node_b",
        branch: "main", // intentionally mis-tagged
      }),
    ];
    const fiber = computeBranchFiber({ nodes, edges }, "feature/x");
    expect(fiber.edges).toHaveLength(1);
  });

  it("computeBranchFiberFromArrays is equivalent to computeBranchFiber", () => {
    const input = makeInput();
    const a = computeBranchFiber(input, "main");
    const b = computeBranchFiberFromArrays(input.nodes, input.edges, "main");
    expect(b).toEqual(a);
  });
});

describe("computeAllFibers — partition property", () => {
  it("emits one fiber per branch, sorted", () => {
    const input = makeInput();
    const projection = computeAllFibers(input);
    expect(projection.branches).toEqual(["experiment", "feature/x", "main"]);
    expect(projection.fibers.map((f) => f.branch)).toEqual(
      projection.branches,
    );
  });

  it("the union of all fibers' nodes equals the input nodes (partition)", () => {
    const input = makeInput();
    const projection = computeAllFibers(input);
    const flat = projection.fibers.flatMap((f) => f.nodes);
    expect(flat).toHaveLength(input.nodes.length);
    expect(new Set(flat.map((n) => n.id))).toEqual(
      new Set(input.nodes.map((n) => n.id)),
    );
  });

  it("the fibers are pairwise disjoint on nodes", () => {
    const input = makeInput();
    const projection = computeAllFibers(input);
    for (let i = 0; i < projection.fibers.length; i++) {
      for (let j = i + 1; j < projection.fibers.length; j++) {
        const a = new Set(projection.fibers[i].nodes.map((n) => n.id));
        const b = projection.fibers[j].nodes.map((n) => n.id);
        for (const id of b) expect(a.has(id)).toBe(false);
      }
    }
  });

  it("cross-branch edges are dropped from the partition (sum of fiber edges <= total)", () => {
    const input = makeInput();
    const projection = computeAllFibers(input);
    const totalFiberEdges = projection.fibers.reduce(
      (acc, f) => acc + f.edges.length,
      0,
    );
    expect(totalFiberEdges).toBeLessThan(input.edges.length);
    expect(totalFiberEdges).toBe(2); // edge_main + edge_feat
  });
});

describe("describeCartesianLift", () => {
  it("changes only the branch coordinate; preserves kind / abstraction / manifestation / time / plane", () => {
    const node = makeNode({
      id: "node_x",
      branch: "main",
      kind: "rule",
      abstraction: "domain",
      manifestation: "intent",
      time: 7,
    });
    const lift = describeCartesianLift(node, "feature/y");

    expect(lift.source.branch).toBe("main");
    expect(lift.targetBranch).toBe("feature/y");
    expect(lift.proposed.coordinates.branch).toBe("feature/y");
    // base-invariant fields preserved
    expect(lift.proposed.coordinates.abstraction).toBe(
      node.coordinates.abstraction,
    );
    expect(lift.proposed.coordinates.manifestation).toBe(
      node.coordinates.manifestation,
    );
    expect(lift.proposed.coordinates.time).toBe(node.coordinates.time);
    expect(lift.proposed.coordinates.plane).toBe(node.coordinates.plane);
  });

  it("the proposal documents what is preserved", () => {
    const node = makeNode({ id: "node_y" });
    const lift = describeCartesianLift(node, "other");
    expect(lift.preserves).toEqual({
      kind: true,
      abstraction: true,
      manifestation: true,
    });
  });

  it("suggests a deterministic id of the form <sourceId>@<targetBranch>", () => {
    const node = makeNode({ id: "node_z", branch: "main" });
    const lift = describeCartesianLift(node, "feature/x");
    expect(lift.proposed.id).toBe("node_z@feature/x");
  });

  it("does not mutate the source node", () => {
    const node = makeNode({ id: "node_w", branch: "main" });
    const before = JSON.stringify(node);
    describeCartesianLift(node, "elsewhere");
    expect(JSON.stringify(node)).toBe(before);
  });
});
