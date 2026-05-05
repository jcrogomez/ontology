import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { semanticLink } from "../src/runtime/context/semantic-linker.js";
import type { OntologyNode, OntologyEdge } from "../src/schemas/ontology.js";

// Build a minimal three-node project with an explicit edge between two of
// the children. Used by the tests below to verify that edge-awareness lets
// the linker see the neighbor's context, not just the parent path.
function setupGraph(cwd: string, focalContext: OntologyNode["context"], neighborContext: OntologyNode["context"], focalRules: string[] = []): void {
  fs.mkdirSync(path.join(cwd, ".ontology", "nodes"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".ontology", "models"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".ontology", "processors"), { recursive: true });

  const state = {
    initialized: true,
    schemaVersion: "1.0",
    projectName: "Test",
    rootNodeId: "node_0000_canon",
    activeBranch: "main",
    nodeCount: 3,
    edgeCount: 1,
    eventCount: 0,
    lastEventId: "evt_0000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(cwd, ".ontology/state.json"), JSON.stringify(state));
  fs.writeFileSync(path.join(cwd, ".ontology/events.jsonl"), "");
  fs.writeFileSync(path.join(cwd, ".ontology/models/registry.json"), JSON.stringify({ models: [] }));
  fs.writeFileSync(path.join(cwd, ".ontology/processors/registry.json"), JSON.stringify({ processors: [] }));

  const canon: OntologyNode = {
    id: "node_0000_canon",
    label: "Canon",
    kind: "canon",
    status: "valid",
    coordinates: { abstraction: "canon", branch: "main", time: 0, plane: "semantic", manifestation: "intent" },
    graph: { parentId: null, orbitOf: null },
    prompt: { raw: "Canon prompt", variables: {}, language: "en" },
    inputs: [{ type: "text", role: "mathematical_canon", value: "canon content" }],
    outputs: { files: [] },
    rules: ["1. Lower nodes refine higher nodes."],
    context: { provides: [], requires: [], forbids: [], optional: [] },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    technical: {},
    integrity: { hash: "h_canon", schemaVersion: "1.0" },
  } as OntologyNode;

  const focal: OntologyNode = {
    id: "node_0001_focal",
    label: "Focal",
    kind: "entity",
    status: "draft",
    coordinates: { abstraction: "domain", branch: "main", time: 1, plane: "semantic", manifestation: "intent" },
    graph: { parentId: "node_0000_canon", orbitOf: null },
    prompt: { raw: "Focal", variables: {}, language: "en" },
    inputs: [],
    outputs: { files: [] },
    rules: focalRules,
    context: focalContext,
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    technical: {},
    integrity: { hash: "h_focal", schemaVersion: "1.0" },
  } as OntologyNode;

  const neighbor: OntologyNode = {
    id: "node_0002_neighbor",
    label: "Neighbor",
    kind: "entity",
    status: "draft",
    coordinates: { abstraction: "domain", branch: "main", time: 2, plane: "semantic", manifestation: "intent" },
    graph: { parentId: "node_0000_canon", orbitOf: null },
    prompt: { raw: "Neighbor", variables: {}, language: "en" },
    inputs: [],
    outputs: { files: [] },
    rules: [],
    context: neighborContext,
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    technical: {},
    integrity: { hash: "h_neighbor", schemaVersion: "1.0" },
  } as OntologyNode;

  fs.writeFileSync(path.join(cwd, ".ontology/nodes/node_0000_canon.json"), JSON.stringify(canon));
  fs.writeFileSync(path.join(cwd, ".ontology/nodes/node_0001_focal.json"), JSON.stringify(focal));
  fs.writeFileSync(path.join(cwd, ".ontology/nodes/node_0002_neighbor.json"), JSON.stringify(neighbor));

  const edge: OntologyEdge = {
    edgeId: "edge_test01",
    from: "node_0001_focal",
    to: "node_0002_neighbor",
    type: "depends_on",
    branch: "main",
    createdAt: new Date().toISOString(),
    createdByEventId: "evt_0000",
    integrity: { hash: "h_edge", schemaVersion: "1.0" },
  };
  fs.writeFileSync(path.join(cwd, ".ontology/edges.jsonl"), JSON.stringify(edge) + "\n");
}

describe("semanticLink edge-awareness", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempProject();
  });

  afterEach(() => cleanupTempProject(cwd));

  it("default (no includeEdges) walks only the parent path; the neighbor is invisible to the linker", async () => {
    setupGraph(
      cwd,
      { provides: [], requires: [{ source: "stock_delta", nodeType: "definition" }], forbids: [], optional: [] },
      { provides: [{ key: "stock_delta", nodeType: "definition" }], requires: [], forbids: [], optional: [] },
    );

    const result = await semanticLink({
      targetNodeId: "node_0001_focal",
      candidate: { text: "anything", provider: "mock", model: "mock_default" },
      cwd,
    });

    // Without include-edges the neighbor is not in the context, so the focal's
    // requires has nothing satisfying it. gluing reports a missing_requirement.
    expect(result.contextNodeIds).toEqual(["node_0000_canon", "node_0001_focal"]);
    expect(result.ok).toBe(false);
    expect(result.conflicts.some((c: any) => c.type === "missing_requirement")).toBe(true);
    expect(result.edgeContext).toBeUndefined();
  });

  it("with includeEdges, the neighbor's `provides` satisfies the focal's `requires`", async () => {
    setupGraph(
      cwd,
      { provides: [], requires: [{ source: "stock_delta", nodeType: "definition" }], forbids: [], optional: [] },
      { provides: [{ key: "stock_delta", nodeType: "definition" }], requires: [], forbids: [], optional: [] },
    );

    const result = await semanticLink({
      targetNodeId: "node_0001_focal",
      candidate: { text: "anything", provider: "mock", model: "mock_default" },
      cwd,
      includeEdges: true,
    });

    expect(result.contextNodeIds).toContain("node_0002_neighbor");
    expect(result.conflicts).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.edgeContext).toBeDefined();
    expect(result.edgeContext?.edges.length).toBe(1);
    expect(result.edgeContext?.nodeIds).toContain("node_0002_neighbor");
  });

  it("a neighbor's `provides` triggers a focal `forbids` violation that the parent path alone would not catch", async () => {
    setupGraph(
      cwd,
      { provides: [], requires: [], forbids: [{ source: "harvest_quantity", nodeType: "definition" }], optional: [] },
      { provides: [{ key: "harvest_quantity", nodeType: "definition" }], requires: [], forbids: [], optional: [] },
    );

    // Without --include-edges the neighbor is invisible: the gluing only sees
    // the focal's forbids list and no provider, so no conflict fires.
    const without = await semanticLink({
      targetNodeId: "node_0001_focal",
      candidate: { text: "x", provider: "mock", model: "mock_default" },
      cwd,
    });
    expect(without.conflicts.some((c: any) => c.type === "forbidden_match")).toBe(false);

    // With --include-edges the neighbor's provides puts it in the gluing pool,
    // and the forbids check detects the violation.
    const withEdges = await semanticLink({
      targetNodeId: "node_0001_focal",
      candidate: { text: "x", provider: "mock", model: "mock_default" },
      cwd,
      includeEdges: true,
    });
    expect(withEdges.conflicts.some((c: any) => c.type === "forbidden_match")).toBe(true);
    expect(withEdges.ok).toBe(false);
  });

  it("edgeTypes filter narrows which neighbors join the gluing pool", async () => {
    setupGraph(
      cwd,
      { provides: [], requires: [{ source: "stock_delta", nodeType: "definition" }], forbids: [], optional: [] },
      { provides: [{ key: "stock_delta", nodeType: "definition" }], requires: [], forbids: [], optional: [] },
    );

    // The fixture's edge is `depends_on`. Filtering for a different type
    // excludes the neighbor, so the requires goes unsatisfied.
    const filtered = await semanticLink({
      targetNodeId: "node_0001_focal",
      candidate: { text: "x", provider: "mock", model: "mock_default" },
      cwd,
      includeEdges: true,
      edgeTypes: ["validates_against"],
    });
    expect(filtered.contextNodeIds).not.toContain("node_0002_neighbor");
    expect(filtered.conflicts.some((c: any) => c.type === "missing_requirement")).toBe(true);
  });

  it("FORBID literal-text constraint still fires after edge-awareness expands the neighborhood", async () => {
    setupGraph(
      cwd,
      { provides: [], requires: [], forbids: [], optional: [] },
      { provides: [], requires: [], forbids: [], optional: [] },
      ["FORBID: prohibited term"],
    );

    const result = await semanticLink({
      targetNodeId: "node_0001_focal",
      candidate: { text: "this contains a prohibited term in body", provider: "mock", model: "mock_default" },
      cwd,
      includeEdges: true,
    });
    expect(result.ok).toBe(false);
    expect(result.validation.violations).toContain("Forbidden phrase found: prohibited term");
  });

  it("rejects an unsupported provider with a clear runtime error instead of silently casting", async () => {
    setupGraph(cwd, { provides: [], requires: [], forbids: [], optional: [] }, { provides: [], requires: [], forbids: [], optional: [] });
    await expect(
      semanticLink({
        targetNodeId: "node_0001_focal",
        candidate: { text: "x", provider: "definitely_not_a_provider", model: "x" },
        cwd,
      }),
    ).rejects.toThrow(/Unsupported candidate provider/);
  });

  it("does NOT mutate .ontology when includeEdges is true", async () => {
    setupGraph(
      cwd,
      { provides: [], requires: [], forbids: [], optional: [] },
      { provides: [], requires: [], forbids: [], optional: [] },
    );

    const before = {
      state: fs.readFileSync(path.join(cwd, ".ontology/state.json"), "utf-8"),
      events: fs.readFileSync(path.join(cwd, ".ontology/events.jsonl"), "utf-8"),
      edges: fs.readFileSync(path.join(cwd, ".ontology/edges.jsonl"), "utf-8"),
      focal: fs.readFileSync(path.join(cwd, ".ontology/nodes/node_0001_focal.json"), "utf-8"),
    };

    await semanticLink({
      targetNodeId: "node_0001_focal",
      candidate: { text: "x", provider: "mock", model: "mock_default" },
      cwd,
      includeEdges: true,
    });

    expect(fs.readFileSync(path.join(cwd, ".ontology/state.json"), "utf-8")).toBe(before.state);
    expect(fs.readFileSync(path.join(cwd, ".ontology/events.jsonl"), "utf-8")).toBe(before.events);
    expect(fs.readFileSync(path.join(cwd, ".ontology/edges.jsonl"), "utf-8")).toBe(before.edges);
    expect(fs.readFileSync(path.join(cwd, ".ontology/nodes/node_0001_focal.json"), "utf-8")).toBe(before.focal);
  });
});
