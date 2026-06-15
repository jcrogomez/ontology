import { describe, it, expect } from "vitest";
import {
  computeFiberBy,
  computeBranchFiber,
  listBranches,
  pathProjection,
} from "../../../src/runtime/fibration/index.js";
import type { FiberInput } from "../../../src/runtime/fibration/index.js";
import {
  OntologyNodeSchema,
  OntologyEdgeSchema,
  type OntologyNode,
  type OntologyEdge,
} from "../../../src/kernel/schemas/ontology.js";

// Build a minimal node by parsing through the schema. Same fixture style
// as branch-fiber.test.ts so the two test files read consistently. Adds
// an optional `outputs` override so the pathProjection cases can supply
// concrete relative paths.
function makeNode(overrides: {
  id: string;
  branch?: string;
  abstraction?: OntologyNode["coordinates"]["abstraction"];
  manifestation?: OntologyNode["coordinates"]["manifestation"];
  kind?: OntologyNode["kind"];
  time?: number;
  outputFiles?: string[];
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
    outputs: { files: overrides.outputFiles ?? [] },
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

describe("computeFiberBy — generic projection", () => {
  it("returns one fiber per distinct projected label", () => {
    const nodes: OntologyNode[] = [
      makeNode({ id: "node_a", abstraction: "domain" }),
      makeNode({ id: "node_b", abstraction: "domain" }),
      makeNode({ id: "node_c", abstraction: "workflow" }),
      makeNode({ id: "node_d", abstraction: "unit" }),
    ];
    const input: FiberInput = { nodes, edges: [] };
    const fibers = computeFiberBy(input, (n) => n.coordinates.abstraction);
    expect(fibers.size).toBe(3);
    expect(fibers.get("domain")?.nodes.map((n) => n.id).sort()).toEqual(["node_a", "node_b"]);
    expect(fibers.get("workflow")?.nodes.map((n) => n.id)).toEqual(["node_c"]);
    expect(fibers.get("unit")?.nodes.map((n) => n.id)).toEqual(["node_d"]);
  });

  it("excludes nodes whose projection returns undefined", () => {
    const nodes = [
      makeNode({ id: "node_labelled_1", outputFiles: ["src/foo.ts"] }),
      makeNode({ id: "node_labelled_2", outputFiles: ["src/bar.ts"] }),
      makeNode({ id: "node_unlabelled_1" }), // no outputs.files → projection undefined
      makeNode({ id: "node_unlabelled_2", outputFiles: [""] }), // empty string → undefined
    ];
    const input: FiberInput = { nodes, edges: [] };
    const fibers = computeFiberBy(input, pathProjection);
    // Only the two well-formed paths produce labels; they share "src" as
    // their projected dirname.
    expect(fibers.size).toBe(1);
    expect(fibers.get("src")?.nodes.map((n) => n.id).sort()).toEqual(["node_labelled_1", "node_labelled_2"]);
  });

  it("drops cross-label edges from every fiber (induced subgraph)", () => {
    const nodes: OntologyNode[] = [
      makeNode({ id: "node_a", abstraction: "domain" }),
      makeNode({ id: "node_b", abstraction: "domain" }),
      makeNode({ id: "node_c", abstraction: "workflow" }),
    ];
    const edges: OntologyEdge[] = [
      makeEdge({ edgeId: "edge_intra_x", from: "node_a", to: "node_b" }),    // domain ↔ domain → kept
      makeEdge({ edgeId: "edge_cross_xy", from: "node_a", to: "node_c" }),   // domain ↔ module → dropped
      makeEdge({ edgeId: "edge_cross_yx", from: "node_c", to: "node_b" }),   // module ↔ domain → dropped
    ];
    const fibers = computeFiberBy({ nodes, edges }, (n) => n.coordinates.abstraction);
    expect(fibers.get("domain")?.edges.map((e) => e.edgeId)).toEqual(["edge_intra_x"]);
    expect(fibers.get("workflow")?.edges).toEqual([]);
  });

  it("partition property: sum of fiber.nodes.length === number of labelled nodes", () => {
    const nodes: OntologyNode[] = [
      makeNode({ id: "node_main_a", branch: "main" }),
      makeNode({ id: "node_main_b", branch: "main" }),
      makeNode({ id: "node_feat_a", branch: "feature/x" }),
      makeNode({ id: "node_feat_b", branch: "feature/x" }),
      makeNode({ id: "node_exp_a",  branch: "experiment" }),
    ];
    const fibers = computeFiberBy({ nodes, edges: [] }, (n) => n.coordinates.branch);
    let total = 0;
    for (const f of fibers.values()) total += f.nodes.length;
    expect(total).toBe(nodes.length);
  });

  it("matches computeBranchFiber under the canonical branch projection", () => {
    const nodes: OntologyNode[] = [
      makeNode({ id: "node_main_a", branch: "main" }),
      makeNode({ id: "node_main_b", branch: "main" }),
      makeNode({ id: "node_feat_a", branch: "feature/x" }),
      makeNode({ id: "node_feat_b", branch: "feature/x" }),
    ];
    const edges: OntologyEdge[] = [
      makeEdge({ edgeId: "edge_e_main",  from: "node_main_a",  to: "node_main_b" }),
      makeEdge({ edgeId: "edge_e_feat",  from: "node_feat_a",  to: "node_feat_b",  branch: "feature/x" }),
      makeEdge({ edgeId: "edge_e_cross", from: "node_main_a",  to: "node_feat_a" }),
    ];
    const input: FiberInput = { nodes, edges };
    const generic = computeFiberBy(input, (n) => n.coordinates.branch);

    for (const branch of listBranches(input)) {
      const direct = computeBranchFiber(input, branch);
      const fromGeneric = generic.get(branch)!;
      expect(fromGeneric.nodes.map((n) => n.id).sort()).toEqual(direct.nodes.map((n) => n.id).sort());
      expect(fromGeneric.edges.map((e) => e.edgeId).sort()).toEqual(direct.edges.map((e) => e.edgeId).sort());
      expect(fromGeneric.size).toEqual(direct.size);
    }
  });

  it("isolated nodes (no surviving edges) still get a fiber entry", () => {
    const nodes = [makeNode({ id: "node_solo", branch: "lonely" })];
    const fibers = computeFiberBy({ nodes, edges: [] }, (n) => n.coordinates.branch);
    expect(fibers.size).toBe(1);
    expect(fibers.get("lonely")?.nodes).toHaveLength(1);
    expect(fibers.get("lonely")?.edges).toHaveLength(0);
  });
});

describe("pathProjection", () => {
  it("returns the dirname of the first outputs.files entry", () => {
    const node = makeNode({ id: "node_art", outputFiles: ["src/runtime/foo.ts"] });
    expect(pathProjection(node)).toBe("src/runtime");
  });

  it("returns undefined when outputs.files is empty", () => {
    const node = makeNode({ id: "node_no_outputs" });
    expect(pathProjection(node)).toBeUndefined();
  });

  it("returns undefined when the first entry is an empty string", () => {
    const node = makeNode({ id: "node_empty_str", outputFiles: [""] });
    expect(pathProjection(node)).toBeUndefined();
  });

  it("uses POSIX dirname semantics regardless of slash style", () => {
    // The pathProjection contract says paths are stored forward-slash;
    // even on Windows hosts, dirname should return forward-slash output.
    const node = makeNode({ id: "node_deep", outputFiles: ["a/b/c/d.ts"] });
    expect(pathProjection(node)).toBe("a/b/c");
  });

  it("returns '.' for a file in the project root", () => {
    const node = makeNode({ id: "node_root_file", outputFiles: ["LICENSE"] });
    // path.posix.dirname("LICENSE") === "."
    expect(pathProjection(node)).toBe(".");
  });

  it("fibers by path: two files in the same directory share a label", () => {
    const nodes = [
      makeNode({ id: "node_a", outputFiles: ["src/runtime/a.ts"] }),
      makeNode({ id: "node_b", outputFiles: ["src/runtime/b.ts"] }),
      makeNode({ id: "node_c", outputFiles: ["src/commands/c.ts"] }),
    ];
    const fibers = computeFiberBy({ nodes, edges: [] }, pathProjection);
    expect(fibers.size).toBe(2);
    expect(fibers.get("src/runtime")?.nodes.map((n) => n.id).sort()).toEqual(["node_a", "node_b"]);
    expect(fibers.get("src/commands")?.nodes.map((n) => n.id)).toEqual(["node_c"]);
  });
});
