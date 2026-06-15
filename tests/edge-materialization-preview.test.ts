import { describe, it, expect } from "vitest";
import {
  planEdgeMaterialization,
  EDGE_MATERIALIZATION_SCHEMA_VERSION,
  type EdgeMaterializationPreviewInput,
} from "../src/kernel/graph/edge-materialization-preview.js";
import type {
  OntologyEdge,
  OntologyNode,
} from "../src/kernel/schemas/ontology.js";
import type { InferredEdge } from "../src/inverse/static/edges.js";

interface NodeOverrides {
  id: string;
  parentId?: string | null;
  branch?: string;
  abstraction?: OntologyNode["coordinates"]["abstraction"];
  kind?: OntologyNode["kind"];
  requires?: string[];
  provides?: string[];
  files?: string[];
}

function node(o: NodeOverrides): OntologyNode {
  return {
    id: o.id,
    label: o.id,
    kind: o.kind ?? "definition",
    status: "draft",
    coordinates: {
      abstraction: o.abstraction ?? "unit",
      time: 0,
      branch: o.branch ?? "main",
      plane: "semantic",
      manifestation: "intent",
    },
    inputs: [],
    prompt: { raw: "", variables: {}, language: "es" },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: {
      requires: (o.requires ?? []).map((source) => ({
        source,
        nodeType: "definition",
      })),
      provides: (o.provides ?? []).map((key) => ({
        key,
        nodeType: "definition",
      })),
      forbids: [],
      optional: [],
    },
    graph: {
      parentId: o.parentId === undefined ? null : o.parentId,
      orbitOf: null,
    },
    rules: [],
    technical: {},
    outputs: { files: o.files ?? [] },
    validation: { errors: [], warnings: [] },
    integrity: {
      frozen: false,
      hash: `hash:${o.id}`,
      schemaVersion: "0.1.0",
    },
  } as OntologyNode;
}

function existingEdge(
  id: string,
  from: string,
  to: string,
  type: OntologyEdge["type"],
): OntologyEdge {
  return {
    edgeId: id,
    from,
    to,
    type,
    branch: "main",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdByEventId: "evt_test",
    integrity: { hash: `h:${id}`, schemaVersion: "0.1.0" },
  } as OntologyEdge;
}

function inferred(
  from: string,
  to: string,
  type: InferredEdge["type"] = "depends_on",
  tokens: string[] = [],
): InferredEdge {
  return { fromFile: from, toFile: to, type, tokens };
}

// Tests use file paths verbatim — no real filesystem involved — so the
// identity function is sufficient as `relativize`.
const identity = (p: string) => p;

describe("planEdgeMaterialization — basic flow", () => {
  it("returns the schema-versioned envelope", () => {
    const out = planEdgeMaterialization({
      nodes: [],
      edges: [],
      inferredEdges: [],
      relativize: identity,
    });
    expect(out.schemaVersion).toBe(EDGE_MATERIALIZATION_SCHEMA_VERSION);
  });

  it("preview increases edgeCount by the number of resolved edges", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/a.ts"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/b.ts"],
      }),
    ];
    const out = planEdgeMaterialization({
      nodes,
      edges: [],
      inferredEdges: [inferred("src/a.ts", "src/b.ts", "depends_on")],
      relativize: identity,
    });
    expect(out.resolved).toHaveLength(1);
    expect(out.skipped).toHaveLength(0);
    expect(out.before.edgeCount).toBe(0);
    expect(out.after.edgeCount).toBe(1);
    expect(out.deltas.edgeCount).toBe(1);
  });

  it("brújula rises when an unsatisfied closed-world require gains a routed provider", () => {
    // node_a requires TokenB; node_b provides TokenB. Before the edge,
    // there is no path between them (no shared ancestor besides canon).
    // After the inferred `depends_on` lands the assembler walks the
    // edge and the require becomes context-reachable.
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/a.ts"],
        requires: ["TokenB"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/b.ts"],
        provides: ["TokenB"],
      }),
    ];
    const out = planEdgeMaterialization({
      nodes,
      edges: [],
      inferredEdges: [inferred("src/a.ts", "src/b.ts", "depends_on")],
      relativize: identity,
    });
    expect(out.before.closedWorldContextReachableSatisfactionRatio).toBe(0);
    expect(out.after.closedWorldContextReachableSatisfactionRatio).toBe(1);
    expect(
      out.deltas.closedWorldContextReachableSatisfactionRatio,
    ).toBeCloseTo(1, 5);
    expect(out.deltas.closedWorldGlobalSatisfactionRatio).toBe(0);
  });

  it("non-context edge types do not improve the brújula", () => {
    // `supersedes` is not in DEFAULT_CONTEXT_EDGE_TYPES, so even after
    // materialization the assembler would not walk it. This is a
    // regression guard against future changes that erode the
    // assembler-equivalence guarantee.
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/a.ts"],
        requires: ["TokenB"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/b.ts"],
        provides: ["TokenB"],
      }),
    ];
    // The static analyser only emits depends_on / uses_token, so a
    // `supersedes` inferred edge is synthetic for this test but the
    // module's contract is "any InferredEdge type". We assert that the
    // simulation behaves correctly for whatever type lands.
    const out = planEdgeMaterialization({
      nodes,
      edges: [],
      inferredEdges: [
        {
          fromFile: "src/a.ts",
          toFile: "src/b.ts",
          type: "supersedes" as InferredEdge["type"],
          tokens: [],
        },
      ],
      relativize: identity,
    });
    expect(out.resolved).toHaveLength(1);
    expect(out.after.edgeCount).toBe(1);
    // Edge exists but the assembler ignores its type → no improvement.
    expect(out.after.closedWorldContextReachableSatisfactionRatio).toBe(0);
  });
});

describe("planEdgeMaterialization — skip taxonomy", () => {
  const baseNodes = [
    node({ id: "node_canon", abstraction: "canon" }),
    node({
      id: "node_a",
      parentId: "node_canon",
      files: ["src/a.ts"],
    }),
    node({
      id: "node_b",
      parentId: "node_canon",
      files: ["src/b.ts"],
    }),
  ];

  it("skips edges whose `from` endpoint has no matching node", () => {
    const out = planEdgeMaterialization({
      nodes: baseNodes,
      edges: [],
      inferredEdges: [inferred("src/missing.ts", "src/b.ts")],
      relativize: identity,
    });
    expect(out.resolved).toHaveLength(0);
    expect(out.skipped[0]?.reason).toBe("from_node_missing");
  });

  it("skips edges whose `to` endpoint has no matching node", () => {
    const out = planEdgeMaterialization({
      nodes: baseNodes,
      edges: [],
      inferredEdges: [inferred("src/a.ts", "src/missing.ts")],
      relativize: identity,
    });
    expect(out.resolved).toHaveLength(0);
    expect(out.skipped[0]?.reason).toBe("to_node_missing");
  });

  it("skips edges that already exist in the persisted edge set", () => {
    const out = planEdgeMaterialization({
      nodes: baseNodes,
      edges: [existingEdge("e1", "node_a", "node_b", "depends_on")],
      inferredEdges: [inferred("src/a.ts", "src/b.ts", "depends_on")],
      relativize: identity,
    });
    expect(out.resolved).toHaveLength(0);
    expect(out.skipped[0]?.reason).toBe("edge_already_exists");
    expect(out.deltas.edgeCount).toBe(0);
  });

  it("skips a duplicate inferred entry that resolves to the same triple", () => {
    const out = planEdgeMaterialization({
      nodes: baseNodes,
      edges: [],
      inferredEdges: [
        inferred("src/a.ts", "src/b.ts", "depends_on"),
        inferred("src/a.ts", "src/b.ts", "depends_on"),
      ],
      relativize: identity,
    });
    expect(out.resolved).toHaveLength(1);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]?.reason).toBe("edge_already_exists");
  });

  it("skips cross-branch edges", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/a.ts"],
        branch: "main",
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/b.ts"],
        branch: "feature/x",
      }),
    ];
    const out = planEdgeMaterialization({
      nodes,
      edges: [],
      inferredEdges: [inferred("src/a.ts", "src/b.ts")],
      relativize: identity,
    });
    expect(out.resolved).toHaveLength(0);
    expect(out.skipped[0]?.reason).toBe("cross_branch");
  });

  it("skips self-loops (both endpoints resolve to the same node)", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_self",
        parentId: "node_canon",
        files: ["src/self.ts"],
      }),
    ];
    const out = planEdgeMaterialization({
      nodes,
      edges: [],
      inferredEdges: [inferred("src/self.ts", "src/self.ts")],
      relativize: identity,
    });
    expect(out.skipped[0]?.reason).toBe("self_loop");
  });
});

describe("planEdgeMaterialization — relativize hook", () => {
  it("applies the caller-provided relativize before lookup", () => {
    // The caller's `relativize` strips a `/abs/` prefix so the static
    // analyser's absolute-path outputs line up with the node files.
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/a.ts"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/b.ts"],
      }),
    ];
    const out = planEdgeMaterialization({
      nodes,
      edges: [],
      inferredEdges: [
        inferred("/abs/src/a.ts", "/abs/src/b.ts", "depends_on"),
      ],
      relativize: (p) => p.replace(/^\/abs\//, ""),
    });
    expect(out.resolved).toHaveLength(1);
    expect(out.resolved[0]?.fromFile).toBe("src/a.ts");
    expect(out.resolved[0]?.toFile).toBe("src/b.ts");
  });
});

describe("planEdgeMaterialization — determinism", () => {
  it("produces identical output under permuted input", () => {
    const base: EdgeMaterializationPreviewInput = {
      nodes: [
        node({ id: "node_canon", abstraction: "canon" }),
        node({
          id: "node_a",
          parentId: "node_canon",
          files: ["src/a.ts"],
          requires: ["X"],
        }),
        node({
          id: "node_b",
          parentId: "node_canon",
          files: ["src/b.ts"],
          provides: ["X"],
        }),
        node({
          id: "node_c",
          parentId: "node_canon",
          files: ["src/c.ts"],
          provides: ["Y"],
        }),
      ],
      edges: [],
      inferredEdges: [
        inferred("src/a.ts", "src/b.ts", "depends_on"),
        inferred("src/a.ts", "src/c.ts", "uses_token"),
        inferred("src/b.ts", "src/c.ts", "depends_on"),
      ],
      relativize: identity,
    };
    const a = planEdgeMaterialization(base);
    const b = planEdgeMaterialization({
      ...base,
      nodes: [...base.nodes].reverse(),
      inferredEdges: [...base.inferredEdges].reverse(),
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
