import { describe, it, expect } from "vitest";
import {
  computeHierarchyMetrics,
  summariseFlatness,
  DEFAULT_CONTEXT_EDGE_TYPES,
  HIERARCHY_METRICS_SCHEMA_VERSION,
  type HierarchyMetricsInput,
} from "../src/kernel/graph/hierarchy-metrics.js";
import type {
  OntologyEdge,
  OntologyNode,
} from "../src/kernel/schemas/ontology.js";

// Lightweight node factory tailored to metric tests. Builds a valid
// OntologyNode with sensible defaults; callers override only the fields the
// metric under test cares about.
interface NodeOverrides {
  id: string;
  parentId?: string | null;
  branch?: string;
  abstraction?: OntologyNode["coordinates"]["abstraction"];
  kind?: OntologyNode["kind"];
  manifestation?: OntologyNode["coordinates"]["manifestation"];
  requires?: string[];
  provides?: string[];
  forbids?: string[];
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
      manifestation: o.manifestation ?? "intent",
    },
    inputs: [],
    prompt: {
      raw: "",
      variables: {},
      language: "es",
    },
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
      forbids: (o.forbids ?? []).map((source) => ({
        source,
        nodeType: "definition",
      })),
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

function edge(
  id: string,
  from: string,
  to: string,
  type: OntologyEdge["type"],
  branch = "main",
): OntologyEdge {
  return {
    edgeId: id,
    from,
    to,
    type,
    branch,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdByEventId: "evt_test",
    integrity: { hash: `h:${id}`, schemaVersion: "0.1.0" },
  } as OntologyEdge;
}

describe("computeHierarchyMetrics — topology and root detection", () => {
  it("handles an empty graph without dividing by zero", () => {
    const m = computeHierarchyMetrics({ nodes: [], edges: [] });
    expect(m.schemaVersion).toBe(HIERARCHY_METRICS_SCHEMA_VERSION);
    expect(m.topology.nodeCount).toBe(0);
    expect(m.topology.edgeCount).toBe(0);
    expect(m.topology.averageDepth).toBe(0);
    expect(m.edges.averagePerNode).toBe(0);
    expect(m.contracts.globalSatisfaction.ratio).toBe(0);
    expect(m.flatness.verdict).toBe("healthy");
    expect(m.rootDetection).toBe("missing");
  });

  it("auto-detects the unique parentless node as root", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({ id: "node_child", parentId: "node_canon" }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.rootDetection).toBe("auto");
    expect(m.rootNodeId).toBe("node_canon");
    expect(m.topology.maxDepth).toBe(1);
  });

  it("flags ambiguous root when multiple parentless nodes exist", () => {
    const nodes = [
      node({ id: "node_a", abstraction: "canon" }),
      node({ id: "node_b", abstraction: "canon" }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.rootDetection).toBe("ambiguous");
    expect(m.rootNodeId).toBeNull();
    expect(m.topology.maxDepth).toBe(0);
  });

  it("uses an explicit rootNodeId override when provided", () => {
    const nodes = [
      node({ id: "node_a", abstraction: "canon" }),
      node({ id: "node_b", abstraction: "canon" }),
      node({ id: "node_child", parentId: "node_a" }),
    ];
    const m = computeHierarchyMetrics({
      nodes,
      edges: [],
      rootNodeId: "node_a",
    });
    expect(m.rootDetection).toBe("explicit");
    expect(m.rootNodeId).toBe("node_a");
    expect(m.topology.depthDistribution[0]).toBe(1);
    expect(m.topology.depthDistribution[1]).toBe(1);
  });
});

describe("computeHierarchyMetrics — depth and parent distribution", () => {
  // canon
  //  ├ a (depth 1)
  //  │  └ a1 (depth 2)
  //  │      └ a1a (depth 3)
  //  └ b (depth 1)
  const nodes = [
    node({ id: "node_canon", abstraction: "canon" }),
    node({ id: "node_a", parentId: "node_canon" }),
    node({ id: "node_b", parentId: "node_canon" }),
    node({ id: "node_a1", parentId: "node_a" }),
    node({ id: "node_a1a", parentId: "node_a1" }),
  ];

  it("computes maxDepth and average depth from the root", () => {
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.topology.maxDepth).toBe(3);
    // depths: canon=0, a=1, b=1, a1=2, a1a=3 → sum=7 / 5 = 1.4
    expect(m.topology.averageDepth).toBeCloseTo(7 / 5, 5);
    expect(m.topology.depthDistribution).toEqual({ 0: 1, 1: 2, 2: 1, 3: 1 });
  });

  it("counts direct children of the root", () => {
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.parents.directChildrenOfRoot).toBe(2);
    const canonEntry = m.parents.topByChildCount.find(
      (e) => e.nodeId === "node_canon",
    );
    expect(canonEntry?.childCount).toBe(2);
  });

  it("captures dangling parent pointers separately from parentless non-roots", () => {
    const ns = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({ id: "node_dangling", parentId: "node_missing" }),
      node({ id: "node_orphan", parentId: null }),
    ];
    // node_canon and node_orphan both have parentId === null, so we pin the
    // root explicitly — otherwise root detection would report "ambiguous"
    // and the parentless-non-root count would include node_canon itself.
    const m = computeHierarchyMetrics({
      nodes: ns,
      edges: [],
      rootNodeId: "node_canon",
    });
    expect(m.topology.danglingParentCount).toBe(1);
    expect(m.topology.parentlessNonRootCount).toBe(1);
    expect(m.topology.unreachableFromRootCount).toBe(2);
  });
});

describe("computeHierarchyMetrics — edges and isolation", () => {
  const nodes = [
    node({ id: "node_canon", abstraction: "canon" }),
    node({ id: "node_a", parentId: "node_canon" }),
    node({ id: "node_b", parentId: "node_canon" }),
    node({ id: "node_island", parentId: "node_canon" }),
  ];
  const edges = [
    edge("e1", "node_a", "node_b", "depends_on"),
    edge("e2", "node_b", "node_a", "uses_token"),
  ];

  it("counts edges by type and computes incidence sets", () => {
    const m = computeHierarchyMetrics({ nodes, edges });
    expect(m.edges.byType).toEqual({ depends_on: 1, uses_token: 1 });
    expect(m.edges.nodesWithOutgoing).toBe(2);
    expect(m.edges.nodesWithIncoming).toBe(2);
    // edges*2 / nodes = 2*2/4 = 1
    expect(m.edges.averagePerNode).toBe(1);
  });

  it("counts only graph-edgeless nodes as isolated", () => {
    const m = computeHierarchyMetrics({ nodes, edges });
    // canon and island have no graph edges; the parentId pointer alone does
    // not count toward "isolated" since the metric measures the typed
    // semantic edge fabric, not the parent hierarchy.
    expect(m.edges.isolatedNodeCount).toBe(2);
  });
});

describe("computeHierarchyMetrics — requires/provides satisfaction", () => {
  it("global satisfaction succeeds when a provider exists in the same branch", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["TokenA"],
      }),
      node({
        id: "node_provider",
        parentId: "node_canon",
        provides: ["TokenA"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.globalSatisfaction.satisfied).toBe(1);
    expect(m.contracts.globalSatisfaction.unsatisfied).toBe(0);
    expect(m.contracts.globalSatisfaction.ratio).toBe(1);
  });

  it("global satisfaction respects branch boundaries", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        branch: "main",
        requires: ["TokenA"],
      }),
      node({
        id: "node_provider",
        parentId: "node_canon",
        branch: "feature/x",
        provides: ["TokenA"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.globalSatisfaction.satisfied).toBe(0);
    expect(m.contracts.globalSatisfaction.unsatisfied).toBe(1);
    expect(m.contracts.globalSatisfaction.topUnsatisfied[0]).toEqual({
      source: "TokenA",
      consumers: 1,
    });
  });

  it("context-reachable satisfaction succeeds via ancestor path", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon", provides: ["RootToken"] }),
      node({
        id: "node_layer",
        parentId: "node_canon",
        provides: ["LayerToken"],
      }),
      node({
        id: "node_leaf",
        parentId: "node_layer",
        requires: ["RootToken", "LayerToken"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.contextReachableSatisfaction.satisfied).toBe(2);
    expect(m.contracts.contextReachableSatisfaction.unsatisfied).toBe(0);
  });

  it("context-reachable satisfaction succeeds via context-relevant edge", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["TokenA"],
      }),
      node({
        id: "node_provider",
        parentId: "node_canon",
        provides: ["TokenA"],
      }),
    ];
    // depends_on is in DEFAULT_CONTEXT_EDGE_TYPES; the assembler would
    // glue the provider into the consumer's context.
    expect(DEFAULT_CONTEXT_EDGE_TYPES).toContain("depends_on");
    const edges = [edge("e1", "node_consumer", "node_provider", "depends_on")];
    const m = computeHierarchyMetrics({ nodes, edges });
    expect(m.contracts.contextReachableSatisfaction.satisfied).toBe(1);
    expect(m.contracts.globalSatisfaction.satisfied).toBe(1);
  });

  it("non-context edges do not satisfy context-reachable, but still satisfy global", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["TokenA"],
      }),
      node({
        id: "node_provider",
        parentId: "node_canon",
        provides: ["TokenA"],
      }),
    ];
    // `supersedes` is NOT in the assembler's default context edge types.
    expect(DEFAULT_CONTEXT_EDGE_TYPES).not.toContain("supersedes");
    const edges = [edge("e1", "node_consumer", "node_provider", "supersedes")];
    const m = computeHierarchyMetrics({ nodes, edges });
    expect(m.contracts.contextReachableSatisfaction.satisfied).toBe(0);
    expect(m.contracts.contextReachableSatisfaction.unsatisfied).toBe(1);
    // Global still sees the provider; the gap between the two ratios is
    // the diagnostic signal the report exists to surface.
    expect(m.contracts.globalSatisfaction.satisfied).toBe(1);
  });

  it("groups unsatisfied requires by source for the top-N rollup", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        requires: ["MissingX", "MissingY"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        requires: ["MissingX"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    const top = m.contracts.globalSatisfaction.topUnsatisfied;
    expect(top[0]).toEqual({ source: "MissingX", consumers: 2 });
    expect(top[1]).toEqual({ source: "MissingY", consumers: 1 });
  });
});

describe("computeHierarchyMetrics — path fibers", () => {
  it("buckets nodes by outputs.files[0] dirname and computes average depth", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/runtime/context/assembler.ts"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/runtime/context/types.ts"],
      }),
      node({
        id: "node_c",
        parentId: "node_canon",
        files: ["src/walker/state/neighborhood.ts"],
      }),
      node({ id: "node_d", parentId: "node_canon" }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.pathFibers.bucketCount).toBe(2);
    expect(m.pathFibers.nodesWithoutFile).toBe(2); // canon + node_d
    const buckets = new Map(
      m.pathFibers.topBuckets.map((b) => [b.bucket, b]),
    );
    expect(buckets.get("src/runtime/context")?.nodeCount).toBe(2);
    expect(buckets.get("src/walker/state")?.nodeCount).toBe(1);
    expect(buckets.get("src/runtime/context")?.averageDepth).toBeCloseTo(1, 5);
  });
});

describe("computeHierarchyMetrics — flatness verdict", () => {
  it("flags a graph where >80% of non-root nodes hang directly off root", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      ...Array.from({ length: 10 }, (_, i) =>
        node({ id: `node_c${i}`, parentId: "node_canon" }),
      ),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.flatness.verdict).toBe("flat");
    expect(m.flatness.nonRootDirectChildrenOfRootRatio).toBeCloseTo(1, 5);
    expect(m.flatness.maxDepth).toBe(1);
  });

  it("a deeper graph with edges is reported as healthy", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({ id: "node_l1a", parentId: "node_canon" }),
      node({ id: "node_l1b", parentId: "node_canon" }),
      node({ id: "node_l2a", parentId: "node_l1a" }),
      node({ id: "node_l2b", parentId: "node_l1a" }),
      node({ id: "node_l3a", parentId: "node_l2a" }),
    ];
    const edges = [
      edge("e1", "node_l1a", "node_l1b", "depends_on"),
      edge("e2", "node_l2a", "node_l2b", "uses_token"),
      edge("e3", "node_l3a", "node_l1b", "documents"),
    ];
    const m = computeHierarchyMetrics({ nodes, edges });
    expect(m.flatness.verdict).toBe("healthy");
    expect(m.flatness.maxDepth).toBeGreaterThanOrEqual(3);
  });

  it("flags edge_starved when many contract tokens but no edges", () => {
    // 30 contract tokens across 6 nodes, edges/node = 0.
    const layer = (id: string, parent: string, idx: number) =>
      node({
        id,
        parentId: parent,
        requires: [`r_${idx}_a`, `r_${idx}_b`],
        provides: [`p_${idx}_a`, `p_${idx}_b`, `p_${idx}_c`],
      });
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      layer("node_l1", "node_canon", 1),
      layer("node_l2", "node_l1", 2),
      layer("node_l3", "node_l2", 3),
      layer("node_l4", "node_l3", 4),
      layer("node_l5", "node_l4", 5),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.flatness.contractTokenCount).toBeGreaterThan(20);
    expect(m.flatness.verdict).toBe("edge_starved");
  });

  it("flags hierarchy_starved when many nodes but maxDepth <= 2", () => {
    // 12 nodes, structure: canon → 4 children → 1 grandchild each.
    // Children-of-root = 4; nonRoot = 11; ratio = 4/11 ≈ 0.36 (not flat).
    // Depth = 2. Few contract tokens so edge_starved doesn't trigger.
    const nodes = [node({ id: "node_canon", abstraction: "canon" })];
    for (let i = 0; i < 4; i++) {
      nodes.push(node({ id: `node_l1_${i}`, parentId: "node_canon" }));
    }
    for (let i = 0; i < 4; i++) {
      nodes.push(
        node({ id: `node_l2_${i}_a`, parentId: `node_l1_${i}` }),
        node({ id: `node_l2_${i}_b`, parentId: `node_l1_${i}` }),
      );
    }
    // Need >10 nodes for hierarchy_starved to trip; this graph has 13.
    // Also need verdict not to flip to flat — confirm ratio < 0.8.
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.flatness.nonRootDirectChildrenOfRootRatio).toBeLessThan(0.8);
    expect(m.flatness.maxDepth).toBe(2);
    expect(m.flatness.verdict).toBe("hierarchy_starved");
  });
});

describe("computeHierarchyMetrics — determinism", () => {
  it("produces identical output across re-runs with permuted input order", () => {
    const base: HierarchyMetricsInput = {
      nodes: [
        node({ id: "node_canon", abstraction: "canon" }),
        node({ id: "node_a", parentId: "node_canon", provides: ["X"] }),
        node({
          id: "node_b",
          parentId: "node_a",
          requires: ["X", "Y"],
          files: ["src/foo/bar.ts"],
        }),
        node({ id: "node_c", parentId: "node_canon", files: ["src/baz.ts"] }),
      ],
      edges: [
        edge("e1", "node_b", "node_a", "depends_on"),
        edge("e2", "node_c", "node_a", "uses_token"),
      ],
    };
    const m1 = computeHierarchyMetrics(base);
    const reversed: HierarchyMetricsInput = {
      nodes: [...base.nodes].reverse(),
      edges: [...base.edges].reverse(),
    };
    const m2 = computeHierarchyMetrics(reversed);
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });
});

describe("computeHierarchyMetrics — require classification (schema 1.1)", () => {
  it("classifies a symbol with a same-branch provider as internal_symbol", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["TokenA"],
      }),
      node({
        id: "node_provider",
        parentId: "node_canon",
        provides: ["TokenA"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.closedWorldRequireCount).toBe(1);
    expect(m.contracts.openWorldRequireCount).toBe(0);
    expect(m.contracts.internalPathMismatchRequireCount).toBe(0);
    expect(m.contracts.unknownRequireCount).toBe(0);
    // Globally satisfied — provider exists in the branch.
    expect(m.contracts.closedWorldGlobalSatisfaction.satisfied).toBe(1);
    // Not reachable — no parent path between consumer and provider, no
    // context-relevant edges.
    expect(m.contracts.closedWorldContextReachableSatisfaction.satisfied).toBe(
      0,
    );
    expect(
      m.contracts.closedWorldContextReachableSatisfaction.unsatisfied,
    ).toBe(1);
    expect(m.contracts.topClosedWorldUnreachableRequires[0]).toEqual({
      source: "TokenA",
      consumers: 1,
    });
  });

  it("internal_symbol reachable via ancestor counts as reachable", () => {
    const nodes = [
      node({
        id: "node_canon",
        abstraction: "canon",
        provides: ["TokenA"],
      }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["TokenA"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.closedWorldContextReachableSatisfaction.satisfied).toBe(
      1,
    );
    expect(m.contracts.topClosedWorldUnreachableRequires).toEqual([]);
  });

  it("internal_symbol reachable via context-relevant edge counts as reachable", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["TokenA"],
      }),
      node({
        id: "node_provider",
        parentId: "node_canon",
        provides: ["TokenA"],
      }),
    ];
    const m = computeHierarchyMetrics({
      nodes,
      edges: [edge("e1", "node_consumer", "node_provider", "depends_on")],
    });
    expect(m.contracts.closedWorldContextReachableSatisfaction.satisfied).toBe(
      1,
    );
  });

  it("classifies stdlib and bare npm names as open_world", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["fs", "path", "zod", "node:crypto", "@scope/utils"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.openWorldRequireCount).toBe(5);
    expect(m.contracts.closedWorldRequireCount).toBe(0);
    expect(m.contracts.unknownRequireCount).toBe(0);
    const sources = m.contracts.topOpenWorldRequires.map((e) => e.source);
    expect(sources).toContain("fs");
    expect(sources).toContain("path");
    expect(sources).toContain("zod");
    expect(sources).toContain("node:crypto");
    expect(sources).toContain("@scope/utils");
  });

  it("classifies a relative require that resolves to a sibling file as path_mismatch with resolvedNodeId", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        files: ["src/commands/foo.ts"],
        requires: ["../runtime/bar.ts"],
      }),
      node({
        id: "node_bar",
        parentId: "node_canon",
        files: ["src/runtime/bar.ts"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.internalPathMismatchRequireCount).toBe(1);
    expect(m.contracts.openWorldRequireCount).toBe(0);
    expect(m.contracts.topInternalPathVocabMismatches[0]).toEqual({
      source: "../runtime/bar.ts",
      consumers: 1,
      resolvedNodeId: "node_bar",
    });
  });

  it("resolves a `.js` require against a `.ts` provider (TS import convention)", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        files: ["src/commands/foo.ts"],
        requires: ["../core/errors.js"],
      }),
      node({
        id: "node_errors",
        parentId: "node_canon",
        files: ["src/core/errors.ts"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    const mismatch = m.contracts.topInternalPathVocabMismatches.find(
      (e) => e.source === "../core/errors.js",
    );
    expect(mismatch?.resolvedNodeId).toBe("node_errors");
  });

  it("flags a path-shaped require with no matching file as unresolved path_mismatch", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        files: ["src/commands/foo.ts"],
        requires: ["../wherever/missing.ts"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.internalPathMismatchRequireCount).toBe(1);
    expect(m.contracts.topInternalPathVocabMismatches[0]).toEqual({
      source: "../wherever/missing.ts",
      consumers: 1,
      resolvedNodeId: null,
    });
  });

  it("classifies a PascalCase symbol with no provider as unknown, not open_world", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        requires: ["OntologyEdge"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.unknownRequireCount).toBe(1);
    expect(m.contracts.openWorldRequireCount).toBe(0);
    expect(m.contracts.internalPathMismatchRequireCount).toBe(0);
  });

  it("internal_symbol wins over path-shape when both apply", () => {
    // Someone literally registered a path string as a provides.key.
    // Classification rule 1 wins: it is `internal_symbol`, not
    // `internal_path_vocab_mismatch`.
    const nodes = [
      node({
        id: "node_canon",
        abstraction: "canon",
        provides: ["../core/errors.js"],
      }),
      node({
        id: "node_consumer",
        parentId: "node_canon",
        files: ["src/commands/foo.ts"],
        requires: ["../core/errors.js"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.closedWorldRequireCount).toBe(1);
    expect(m.contracts.internalPathMismatchRequireCount).toBe(0);
  });

  it("groups path mismatches by source and surfaces the resolved id when consistent", () => {
    // Two consumers in the same directory both reach the same target file.
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_c1",
        parentId: "node_canon",
        files: ["src/commands/a.ts"],
        requires: ["../core/errors.js"],
      }),
      node({
        id: "node_c2",
        parentId: "node_canon",
        files: ["src/commands/b.ts"],
        requires: ["../core/errors.js"],
      }),
      node({
        id: "node_errors",
        parentId: "node_canon",
        files: ["src/core/errors.ts"],
      }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    expect(m.contracts.internalPathMismatchRequireCount).toBe(2);
    expect(m.contracts.topInternalPathVocabMismatches[0]).toEqual({
      source: "../core/errors.js",
      consumers: 2,
      resolvedNodeId: "node_errors",
    });
  });

  it("classification + closed-world tallies are deterministic under input permutation", () => {
    const base = {
      nodes: [
        node({ id: "node_canon", abstraction: "canon" }),
        node({
          id: "node_consumer1",
          parentId: "node_canon",
          requires: ["TokenA", "fs", "../foo.ts", "OntologyEdge"],
        }),
        node({
          id: "node_consumer2",
          parentId: "node_canon",
          files: ["src/commands/b.ts"],
          requires: ["TokenA", "fs", "../foo.ts", "OntologyEdge"],
        }),
        node({
          id: "node_provider",
          parentId: "node_canon",
          provides: ["TokenA"],
        }),
        node({
          id: "node_foo",
          parentId: "node_canon",
          files: ["src/foo.ts"],
        }),
      ],
      edges: [],
    };
    const m1 = computeHierarchyMetrics(base);
    const m2 = computeHierarchyMetrics({
      nodes: [...base.nodes].reverse(),
      edges: [...base.edges].reverse(),
    });
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
    expect(m1.contracts.closedWorldRequireCount).toBe(2);
    expect(m1.contracts.openWorldRequireCount).toBe(2);
    expect(m1.contracts.internalPathMismatchRequireCount).toBe(2);
    expect(m1.contracts.unknownRequireCount).toBe(2);
  });
});

describe("summariseFlatness", () => {
  it("renders a single-line punchline with the verdict and key signals", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({ id: "node_a", parentId: "node_canon" }),
    ];
    const m = computeHierarchyMetrics({ nodes, edges: [] });
    const line = summariseFlatness(m);
    expect(line).toContain("verdict=healthy");
    expect(line).toContain("nodes=2");
    expect(line).toContain("edges=0");
    expect(line).toContain("maxDepth=1");
  });
});
