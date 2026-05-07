import { describe, it, expect } from "vitest";
import { matchesShape, queryNodes } from "../../../src/runtime/query/representable";
import type { OntologyEdge, OntologyNode } from "../../../src/schemas/ontology";
import type { QueryShape } from "../../../src/runtime/query/types";

// Builds a minimal OntologyNode that satisfies the schema typing without
// the test having to spell out every default. Identical pattern to the one
// used in tests/context-presheaf.test.ts.
function makeNode(overrides: Partial<OntologyNode> = {}): OntologyNode {
  return {
    id: "node_0001",
    label: "Test Node",
    kind: "decision",
    status: "draft",
    coordinates: {
      abstraction: "project",
      time: 1,
      branch: "main",
      plane: "semantic",
      manifestation: "intent",
    },
    inputs: [],
    prompt: { variables: {}, language: "es" },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: { provides: [], requires: [], forbids: [], optional: [] },
    graph: { parentId: null, orbitOf: null },
    rules: [],
    technical: {},
    outputs: { files: [] },
    validation: { errors: [], warnings: [] },
    integrity: { frozen: false, hash: "h", schemaVersion: "0.1.0" },
    ...overrides,
  };
}

function makeEdge(
  edgeId: string,
  from: string,
  to: string,
  type: OntologyEdge["type"],
): OntologyEdge {
  return {
    edgeId,
    from,
    to,
    type,
    branch: "main",
    createdAt: "2025-01-01T00:00:00Z",
    createdByEventId: "evt_0",
    integrity: { hash: "h", schemaVersion: "0.1.0" },
  };
}

describe("matchesShape", () => {
  it("empty shape matches every node (Yoneda identity)", () => {
    const node = makeNode();
    expect(matchesShape(node, {}, [])).toBe(true);
  });

  it("kind set is disjunctive (any-of)", () => {
    const node = makeNode({ kind: "rule" });
    expect(matchesShape(node, { kind: ["rule", "decision"] }, [])).toBe(true);
    expect(matchesShape(node, { kind: ["entity"] }, [])).toBe(false);
  });

  it("abstraction / plane / manifestation / status filter as any-of sets", () => {
    const node = makeNode({
      coordinates: { abstraction: "domain", time: 0, branch: "main", plane: "data", manifestation: "code" },
      status: "compiled",
    });
    expect(matchesShape(node, { abstraction: ["domain"] }, [])).toBe(true);
    expect(matchesShape(node, { abstraction: ["target"] }, [])).toBe(false);
    expect(matchesShape(node, { plane: ["data", "semantic"] }, [])).toBe(true);
    expect(matchesShape(node, { manifestation: ["code"] }, [])).toBe(true);
    expect(matchesShape(node, { status: ["draft"] }, [])).toBe(false);
  });

  it("branch is exact-match", () => {
    const node = makeNode({
      coordinates: { abstraction: "project", time: 1, branch: "feature/x", plane: "semantic", manifestation: "intent" },
    });
    expect(matchesShape(node, { branch: "feature/x" }, [])).toBe(true);
    expect(matchesShape(node, { branch: "main" }, [])).toBe(false);
  });

  it("provides / requires / forbids are conjunctive (all-of)", () => {
    const node = makeNode({
      context: {
        provides: [
          { key: "db_access", nodeType: "domain" },
          { key: "spec", nodeType: "interface" },
        ],
        requires: [{ source: "auth_token", nodeType: "security" }],
        forbids: [{ source: "legacy_api", nodeType: "interface" }],
        optional: [],
      },
    });
    expect(matchesShape(node, { provides: ["db_access"] }, [])).toBe(true);
    expect(matchesShape(node, { provides: ["db_access", "spec"] }, [])).toBe(true);
    // Conjunctive: missing one required key -> reject.
    expect(matchesShape(node, { provides: ["db_access", "missing"] }, [])).toBe(false);
    expect(matchesShape(node, { requires: ["auth_token"] }, [])).toBe(true);
    expect(matchesShape(node, { requires: ["nope"] }, [])).toBe(false);
    expect(matchesShape(node, { forbids: ["legacy_api"] }, [])).toBe(true);
    expect(matchesShape(node, { forbids: ["legacy_api", "x"] }, [])).toBe(false);
  });

  it("hasIncoming requires at least one inbound edge of EACH listed type", () => {
    const node = makeNode({ id: "node_0010" });
    const edges: OntologyEdge[] = [
      makeEdge("edge_a", "node_0001", "node_0010", "refines"),
      makeEdge("edge_b", "node_0002", "node_0010", "depends_on"),
    ];
    expect(matchesShape(node, { hasIncoming: ["refines"] }, edges)).toBe(true);
    expect(matchesShape(node, { hasIncoming: ["refines", "depends_on"] }, edges)).toBe(true);
    expect(matchesShape(node, { hasIncoming: ["refines", "implements"] }, edges)).toBe(false);
  });

  it("hasOutgoing requires at least one outbound edge of EACH listed type", () => {
    const node = makeNode({ id: "node_0010" });
    const edges: OntologyEdge[] = [
      makeEdge("edge_a", "node_0010", "node_0001", "depends_on"),
      makeEdge("edge_b", "node_0010", "node_0002", "uses_token"),
    ];
    expect(matchesShape(node, { hasOutgoing: ["depends_on"] }, edges)).toBe(true);
    expect(matchesShape(node, { hasOutgoing: ["depends_on", "uses_token"] }, edges)).toBe(true);
    expect(matchesShape(node, { hasOutgoing: ["refines"] }, edges)).toBe(false);
  });

  it("nodes with zero edges fail any hasIncoming/hasOutgoing constraint", () => {
    const node = makeNode({ id: "node_0010" });
    expect(matchesShape(node, { hasIncoming: ["refines"] }, [])).toBe(false);
    expect(matchesShape(node, { hasOutgoing: ["depends_on"] }, [])).toBe(false);
  });

  it("AND across fields: every present constraint must be satisfied", () => {
    const node = makeNode({
      id: "node_0010",
      kind: "rule",
      status: "valid",
      context: {
        provides: [{ key: "spec", nodeType: "domain" }],
        requires: [],
        forbids: [],
        optional: [],
      },
    });
    const edges: OntologyEdge[] = [makeEdge("edge_a", "node_0001", "node_0010", "refines")];
    const fullShape: QueryShape = {
      kind: ["rule"],
      status: ["valid"],
      provides: ["spec"],
      hasIncoming: ["refines"],
    };
    expect(matchesShape(node, fullShape, edges)).toBe(true);
    // Flip one field -> reject.
    expect(matchesShape(node, { ...fullShape, status: ["draft"] }, edges)).toBe(false);
  });
});

describe("queryNodes", () => {
  it("returns matches deterministically sorted by id", () => {
    const a = makeNode({ id: "node_0009", kind: "rule" });
    const b = makeNode({ id: "node_0001", kind: "rule" });
    const c = makeNode({ id: "node_0005", kind: "decision" });
    const result = queryNodes([a, b, c], { kind: ["rule"] }, []);
    expect(result.map(n => n.id)).toEqual(["node_0001", "node_0009"]);
  });

  it("empty shape returns every node, still sorted", () => {
    const a = makeNode({ id: "node_z" });
    const b = makeNode({ id: "node_a" });
    const result = queryNodes([a, b], {}, []);
    expect(result.map(n => n.id)).toEqual(["node_a", "node_z"]);
  });

  it("does not mutate the input arrays", () => {
    const a = makeNode({ id: "node_b" });
    const b = makeNode({ id: "node_a" });
    const nodes = [a, b];
    const beforeOrder = nodes.map(n => n.id);
    queryNodes(nodes, {}, []);
    expect(nodes.map(n => n.id)).toEqual(beforeOrder);
  });
});
