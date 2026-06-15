import { describe, it, expect } from "vitest";
import {
  evaluateReadiness,
  evaluateReadinessFromMetrics,
  READINESS_REPORT_SCHEMA_VERSION,
  READINESS_THRESHOLDS,
  type ReadinessRuleId,
} from "../src/kernel/graph/readiness.js";
import { computeHierarchyMetrics } from "../src/kernel/graph/hierarchy-metrics.js";
import type {
  OntologyEdge,
  OntologyNode,
} from "../src/kernel/schemas/ontology.js";

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

function edge(
  id: string,
  from: string,
  to: string,
  type: OntologyEdge["type"] = "depends_on",
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

// Helper to build a "flat" snapshot of N file nodes hanging off canon
// — the shape the gate is meant to flag.
function buildFlatGraph(args: {
  n: number;
  withEdges?: boolean;
  withRequires?: boolean;
}): { nodes: OntologyNode[]; edges: OntologyEdge[] } {
  const nodes: OntologyNode[] = [node({ id: "node_canon", abstraction: "canon" })];
  for (let i = 0; i < args.n; i++) {
    nodes.push(
      node({
        id: `node_${String(i).padStart(4, "0")}`,
        parentId: "node_canon",
        files: [`src/f${i}.ts`],
        requires: args.withRequires ? [`Token${(i + 1) % args.n}`] : [],
        provides: [`Token${i}`],
      }),
    );
  }
  const edges: OntologyEdge[] = [];
  if (args.withEdges) {
    for (let i = 0; i < args.n - 1; i++) {
      edges.push(
        edge(
          `e_${i}`,
          `node_${String(i).padStart(4, "0")}`,
          `node_${String((i + 1) % args.n).padStart(4, "0")}`,
        ),
      );
    }
  }
  return { nodes, edges };
}

describe("evaluateReadiness — envelope", () => {
  it("returns schema-versioned report", () => {
    const report = evaluateReadiness({ nodes: [], edges: [] });
    expect(report.schemaVersion).toBe(READINESS_REPORT_SCHEMA_VERSION);
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("populates the snapshot block from computed metrics", () => {
    const { nodes, edges } = buildFlatGraph({ n: 3, withEdges: false });
    const report = evaluateReadiness({ nodes, edges });
    expect(report.snapshot.nodeCount).toBe(4); // canon + 3
    expect(report.snapshot.edgeCount).toBe(0);
    expect(report.snapshot.verdict).toBeDefined();
  });
});

describe("evaluateReadiness — rule: nodes_without_edges", () => {
  it("fires when nodeCount > 50 and edgeCount === 0", () => {
    const { nodes, edges } = buildFlatGraph({ n: 60 });
    const report = evaluateReadiness({ nodes, edges });
    const finding = report.findings.find(
      (f) => f.ruleId === "nodes_without_edges",
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("fail");
    expect(finding?.signals.nodeCount).toBe(61);
    expect(finding?.signals.edgeCount).toBe(0);
    expect(finding?.remedy).toContain("infer-edges");
  });

  it("does not fire when nodeCount <= threshold", () => {
    // Threshold is 50 nodes; 30 sibling files + canon stays below.
    const { nodes, edges } = buildFlatGraph({ n: 30 });
    const report = evaluateReadiness({ nodes, edges });
    expect(
      report.findings.find((f) => f.ruleId === "nodes_without_edges"),
    ).toBeUndefined();
  });

  it("does not fire when edges exist", () => {
    const { nodes, edges } = buildFlatGraph({ n: 60, withEdges: true });
    const report = evaluateReadiness({ nodes, edges });
    expect(
      report.findings.find((f) => f.ruleId === "nodes_without_edges"),
    ).toBeUndefined();
  });
});

describe("evaluateReadiness — rule: global_satisfied_unreachable", () => {
  it("fires when global=1.0 but reach < 0.7", () => {
    // 4 nodes that require each other but no edges — global ratio
    // hits 1.0 (every Token has a provider), reach is 0 (canon does
    // not provide anything; no edges to walk).
    const { nodes, edges } = buildFlatGraph({
      n: 4,
      withEdges: false,
      withRequires: true,
    });
    const report = evaluateReadiness({ nodes, edges });
    const finding = report.findings.find(
      (f) => f.ruleId === "global_satisfied_unreachable",
    );
    expect(finding).toBeDefined();
    expect(finding?.signals.closedWorldGlobalSatisfactionRatio).toBe(1);
    expect(
      finding?.signals.closedWorldContextReachableSatisfactionRatio,
    ).toBeLessThan(0.7);
  });

  it("does not fire when reach >= 0.7", () => {
    // Adding context-relevant edges between consumers and providers
    // brings the reach ratio to 1.0.
    const { nodes, edges } = buildFlatGraph({
      n: 4,
      withEdges: true,
      withRequires: true,
    });
    const report = evaluateReadiness({ nodes, edges });
    expect(
      report.findings.find(
        (f) => f.ruleId === "global_satisfied_unreachable",
      ),
    ).toBeUndefined();
  });

  it("does not fire on an empty-contract graph (false-positive guard)", () => {
    // No requires at all → closedWorldRequireCount is 0 → rule is
    // not applicable. Without this guard a 0/0 ratio would trip.
    const { nodes, edges } = buildFlatGraph({
      n: 3,
      withEdges: false,
      withRequires: false,
    });
    const report = evaluateReadiness({ nodes, edges });
    expect(
      report.findings.find(
        (f) => f.ruleId === "global_satisfied_unreachable",
      ),
    ).toBeUndefined();
  });
});

describe("evaluateReadiness — rule: topologically_flat", () => {
  it("fires when directChildrenRatio >= 0.8 and nodeCount > 5", () => {
    const { nodes, edges } = buildFlatGraph({ n: 10 });
    const report = evaluateReadiness({ nodes, edges });
    const finding = report.findings.find(
      (f) => f.ruleId === "topologically_flat",
    );
    expect(finding).toBeDefined();
    expect(finding?.signals.nonRootDirectChildrenOfRootRatio).toBe(1);
    expect(finding?.remedy).toContain("hierarchize");
  });

  it("does not fire on small graphs (false-positive guard)", () => {
    // 3 sibling files + canon = 4 nodes. Even with 100% direct-child
    // ratio, the rule's `nodeCount > 5` guard keeps this from firing.
    const { nodes, edges } = buildFlatGraph({ n: 3 });
    const report = evaluateReadiness({ nodes, edges });
    expect(
      report.findings.find((f) => f.ruleId === "topologically_flat"),
    ).toBeUndefined();
  });
});

describe("evaluateReadiness — composite behaviours", () => {
  it("fires all three rules on a canonical flat-bag-of-children snapshot", () => {
    // Mirrors the gamma archived snapshot: many file nodes, zero edges,
    // requires reach providers via global match but routing is empty.
    const { nodes, edges } = buildFlatGraph({
      n: 60,
      withEdges: false,
      withRequires: true,
    });
    const report = evaluateReadiness({ nodes, edges });
    const tripped: ReadinessRuleId[] = report.findings.map((f) => f.ruleId);
    expect(tripped).toContain("nodes_without_edges");
    expect(tripped).toContain("global_satisfied_unreachable");
    expect(tripped).toContain("topologically_flat");
    expect(report.ok).toBe(false);
  });

  it("findings are sorted by ruleId for stable output", () => {
    const { nodes, edges } = buildFlatGraph({
      n: 60,
      withRequires: true,
    });
    const report = evaluateReadiness({ nodes, edges });
    const ids = report.findings.map((f) => f.ruleId);
    expect(ids).toEqual([...ids].sort());
  });

  it("ok=true and empty findings on a healthy hierarchical graph", () => {
    // Two-deep hierarchy with edges and small node count — nothing
    // should fire.
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({ id: "node_l1a", parentId: "node_canon" }),
      node({ id: "node_l1b", parentId: "node_canon" }),
      node({ id: "node_l2a", parentId: "node_l1a" }),
      node({ id: "node_l2b", parentId: "node_l1a" }),
    ];
    const edges = [edge("e1", "node_l2a", "node_l2b")];
    const report = evaluateReadiness({ nodes, edges });
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });
});

describe("evaluateReadiness — threshold overrides", () => {
  it("honours a custom minNodesForEdgeFabric threshold", () => {
    // 10 nodes, zero edges. Default threshold (50) is silent; lowering
    // to 5 should fire the rule.
    const { nodes, edges } = buildFlatGraph({ n: 10 });
    const defaultReport = evaluateReadiness({ nodes, edges });
    expect(
      defaultReport.findings.find(
        (f) => f.ruleId === "nodes_without_edges",
      ),
    ).toBeUndefined();
    const tightReport = evaluateReadiness({
      nodes,
      edges,
      thresholds: { minNodesForEdgeFabric: 5 },
    });
    expect(
      tightReport.findings.find(
        (f) => f.ruleId === "nodes_without_edges",
      ),
    ).toBeDefined();
  });

  it("honours a custom minClosedWorldReachableRatio threshold", () => {
    // Build a graph where reach == 0.5. Default target (0.7) trips,
    // a target of 0.3 stays silent.
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
      node({
        id: "node_c",
        parentId: "node_canon",
        files: ["src/c.ts"],
        requires: ["TokenD"],
      }),
      node({
        id: "node_d",
        parentId: "node_canon",
        files: ["src/d.ts"],
        provides: ["TokenD"],
      }),
    ];
    // One edge: a→b is reachable, c→d is not → ratio 0.5.
    const edges = [edge("e1", "node_a", "node_b")];
    const strict = evaluateReadiness({ nodes, edges });
    expect(
      strict.findings.find(
        (f) => f.ruleId === "global_satisfied_unreachable",
      ),
    ).toBeDefined();
    const lenient = evaluateReadiness({
      nodes,
      edges,
      thresholds: { minClosedWorldReachableRatio: 0.3 },
    });
    expect(
      lenient.findings.find(
        (f) => f.ruleId === "global_satisfied_unreachable",
      ),
    ).toBeUndefined();
  });
});

describe("evaluateReadiness — determinism", () => {
  it("identical output across permuted inputs", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      ...Array.from({ length: 60 }, (_, i) =>
        node({
          id: `node_${String(i).padStart(4, "0")}`,
          parentId: "node_canon",
          files: [`src/f${i}.ts`],
          requires: [`Token${(i + 1) % 60}`],
          provides: [`Token${i}`],
        }),
      ),
    ];
    const r1 = evaluateReadiness({ nodes, edges: [] });
    const r2 = evaluateReadiness({
      nodes: [...nodes].reverse(),
      edges: [],
    });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("evaluateReadinessFromMetrics — symmetry", () => {
  it("produces the same report when fed pre-computed metrics", () => {
    const { nodes, edges } = buildFlatGraph({ n: 60, withRequires: true });
    const fromInputs = evaluateReadiness({ nodes, edges });
    const metrics = computeHierarchyMetrics({ nodes, edges });
    const fromMetrics = evaluateReadinessFromMetrics(metrics);
    expect(JSON.stringify(fromInputs)).toBe(JSON.stringify(fromMetrics));
  });
});

describe("READINESS_THRESHOLDS", () => {
  it("ships the documented baseline values", () => {
    expect(READINESS_THRESHOLDS.minNodesForEdgeFabric).toBe(50);
    expect(READINESS_THRESHOLDS.minClosedWorldReachableRatio).toBeCloseTo(
      0.7,
      5,
    );
    expect(READINESS_THRESHOLDS.flatDirectRatio).toBeCloseTo(0.8, 5);
    expect(READINESS_THRESHOLDS.flatMinNodeCount).toBe(5);
  });
});
