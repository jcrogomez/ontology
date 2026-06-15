import { describe, it, expect } from "vitest";
import {
  planHierarchization,
  HIERARCHIZER_PLAN_SCHEMA_VERSION,
} from "../src/kernel/graph/hierarchizer.js";
import type { OntologyEdge, OntologyNode } from "../src/kernel/schemas/ontology.js";

interface NodeOverrides {
  id: string;
  parentId?: string | null;
  branch?: string;
  abstraction?: OntologyNode["coordinates"]["abstraction"];
  kind?: OntologyNode["kind"];
  requires?: string[];
  provides?: string[];
  files?: string[];
  label?: string;
}

function node(o: NodeOverrides): OntologyNode {
  return {
    id: o.id,
    label: o.label ?? o.id,
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

function edge(id: string, from: string, to: string, type: OntologyEdge["type"]): OntologyEdge {
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

describe("planHierarchization — flat graph with files", () => {
  // A canonical flat shape: every file node hangs directly off canon.
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
      files: ["src/runtime/legend/pareto.ts"],
    }),
    node({
      id: "node_d",
      parentId: "node_canon",
      files: ["src/commands/init.ts"],
    }),
  ];

  it("returns a stable plan envelope", () => {
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.schemaVersion).toBe(HIERARCHIZER_PLAN_SCHEMA_VERSION);
    expect(plan.rootNodeId).toBe("node_canon");
    expect(plan.branch).toBe("main");
  });

  it("creates directories for every needed prefix in top-down order", () => {
    const plan = planHierarchization({ nodes, edges: [] });
    const paths = plan.directoriesToCreate.map((d) => d.path);
    // Expect every prefix to appear: src, src/runtime, src/runtime/context,
    // src/runtime/legend, src/commands. Order: shallow first.
    expect(paths).toEqual([
      "src",
      "src/commands",
      "src/runtime",
      "src/runtime/context",
      "src/runtime/legend",
    ]);
  });

  it("assigns architecture/domain/workflow abstractions by depth", () => {
    const plan = planHierarchization({ nodes, edges: [] });
    const byPath = new Map(
      plan.directoriesToCreate.map((d) => [d.path, d.abstraction]),
    );
    expect(byPath.get("src")).toBe("architecture");
    expect(byPath.get("src/runtime")).toBe("domain");
    expect(byPath.get("src/commands")).toBe("domain");
    expect(byPath.get("src/runtime/context")).toBe("workflow");
    expect(byPath.get("src/runtime/legend")).toBe("workflow");
  });

  it("each directory provides one `path:<dir>` token", () => {
    const plan = planHierarchization({ nodes, edges: [] });
    const ctx = plan.directoriesToCreate.find(
      (d) => d.path === "src/runtime/context",
    );
    expect(ctx?.provides).toEqual(["path:src/runtime/context"]);
  });

  it("reparents every file node to its deepest containing directory", () => {
    const plan = planHierarchization({ nodes, edges: [] });
    const byNodeId = new Map(plan.reparentings.map((r) => [r.nodeId, r]));
    expect(byNodeId.get("node_a")?.newParentPath).toBe("src/runtime/context");
    expect(byNodeId.get("node_b")?.newParentPath).toBe("src/runtime/context");
    expect(byNodeId.get("node_c")?.newParentPath).toBe("src/runtime/legend");
    expect(byNodeId.get("node_d")?.newParentPath).toBe("src/commands");
  });

  it("after-snapshot shows lower directChildrenRatio and higher maxDepth", () => {
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.before.maxDepth).toBe(1);
    expect(plan.after.maxDepth).toBeGreaterThan(plan.before.maxDepth);
    expect(plan.after.nonRootDirectChildrenOfRootRatio).toBeLessThan(
      plan.before.nonRootDirectChildrenOfRootRatio,
    );
    expect(plan.after.directChildrenOfRoot).toBe(1); // only `src` left
  });

  it("after-snapshot leaves closedWorldContextReachableSatisfaction unchanged when there are no edges", () => {
    // The hierarchizer alone cannot move the brújula; only edges do.
    // This regression test pins that behaviour so callers do not over-claim.
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.after.closedWorldContextReachableSatisfactionRatio).toBe(
      plan.before.closedWorldContextReachableSatisfactionRatio,
    );
  });
});

describe("planHierarchization — reuse of existing directory nodes", () => {
  it("reuses an existing node that provides `path:<dir>`", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      // Existing directory node, hand-authored or carried over from a
      // prior hierarchize cycle. Carries the convention's provides key
      // but no outputs.files entry.
      node({
        id: "node_existing_ctx",
        parentId: "node_canon",
        abstraction: "workflow",
        kind: "component",
        label: "src/runtime/context",
        provides: ["path:src/runtime/context"],
      }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/runtime/context/assembler.ts"],
      }),
    ];
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.directoriesReused.map((d) => d.path)).toContain(
      "src/runtime/context",
    );
    const created = plan.directoriesToCreate.map((d) => d.path);
    expect(created).not.toContain("src/runtime/context");
    // The reparenting target points at the reused node id.
    const rep = plan.reparentings.find((r) => r.nodeId === "node_a");
    expect(rep?.newParentNodeId).toBe("node_existing_ctx");
  });

  it("does not duplicate when two would-be directories collide", () => {
    // Two files both contribute to `src/runtime`; only one create proposal.
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/runtime/a.ts"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/runtime/b.ts"],
      }),
    ];
    const plan = planHierarchization({ nodes, edges: [] });
    const created = plan.directoriesToCreate.filter(
      (d) => d.path === "src/runtime",
    );
    expect(created).toHaveLength(1);
  });
});

describe("planHierarchization — skipped buckets", () => {
  it("skips nodes without outputs.files[0] with a warning entry", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({ id: "node_no_file", parentId: "node_canon" }),
      node({
        id: "node_with_file",
        parentId: "node_canon",
        files: ["src/foo.ts"],
      }),
    ];
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.skipped.noOutputFile).toContain("node_no_file");
    expect(plan.reparentings.find((r) => r.nodeId === "node_no_file")).toBeUndefined();
  });

  it("does not reparent root-level files (dirname === '.')", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_root_cfg",
        parentId: "node_canon",
        files: ["package.json"],
      }),
    ];
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.skipped.rootLevelFiles).toContain("node_root_cfg");
    expect(plan.directoriesToCreate).toHaveLength(0);
    expect(plan.reparentings).toHaveLength(0);
  });

  it("flags ambiguous files (two nodes claiming the same outputs.files[0])", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/foo.ts"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/foo.ts"],
      }),
    ];
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.skipped.ambiguousFile).toEqual([
      { file: "src/foo.ts", nodeIds: ["node_a", "node_b"] },
    ]);
    // Only the lexicographically smallest id is kept (node_a).
    expect(plan.reparentings.map((r) => r.nodeId)).toEqual(["node_a"]);
  });

  it("refuses to override a deeply-nested existing parent", () => {
    // node_consumer already lives under node_holder (not canon, not a
    // directory node we would create) — leave it alone.
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({ id: "node_holder", parentId: "node_canon" }),
      node({
        id: "node_consumer",
        parentId: "node_holder",
        files: ["src/runtime/foo.ts"],
      }),
    ];
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.skipped.alreadyDeepNested).toEqual([
      { nodeId: "node_consumer", currentParentId: "node_holder" },
    ]);
    expect(plan.reparentings).toHaveLength(0);
  });
});

describe("planHierarchization — proposal capability", () => {
  it("declares both kinds applicable now that node_update_parent shipped (schema 1.2)", () => {
    const nodes = [node({ id: "node_canon", abstraction: "canon" })];
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.proposalCapability.canCreateDirectories).toBe(true);
    expect(plan.proposalCapability.canReparentExistingNodes).toBe(true);
    expect(plan.proposalCapability.blockedBy).toEqual([]);
  });
});

describe("planHierarchization — determinism", () => {
  it("produces identical output under input permutation", () => {
    const baseNodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/runtime/context/types.ts"],
      }),
      node({
        id: "node_b",
        parentId: "node_canon",
        files: ["src/runtime/context/assembler.ts"],
      }),
      node({
        id: "node_c",
        parentId: "node_canon",
        files: ["src/commands/init.ts"],
      }),
    ];
    const baseEdges = [edge("e1", "node_a", "node_b", "depends_on")];
    const p1 = planHierarchization({ nodes: baseNodes, edges: baseEdges });
    const p2 = planHierarchization({
      nodes: [...baseNodes].reverse(),
      edges: [...baseEdges].reverse(),
    });
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
  });
});

describe("planHierarchization — integration with metrics", () => {
  it("after-snapshot reflects added directory nodes in node count", () => {
    const nodes = [
      node({ id: "node_canon", abstraction: "canon" }),
      node({
        id: "node_a",
        parentId: "node_canon",
        files: ["src/runtime/context/assembler.ts"],
      }),
    ];
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.after.nodeCount).toBe(
      plan.before.nodeCount + plan.directoriesToCreate.length,
    );
  });

  it("after-snapshot lowers verdict from flat once enough depth is added", () => {
    // 10 sibling files in three sub-directories: enough to be `flat` before
    // and to leave canon-direct count = 1 (only `src`) after.
    const nodes = [node({ id: "node_canon", abstraction: "canon" })];
    for (let i = 0; i < 4; i++) {
      nodes.push(
        node({
          id: `node_ctx_${i}`,
          parentId: "node_canon",
          files: [`src/runtime/context/f${i}.ts`],
        }),
      );
    }
    for (let i = 0; i < 4; i++) {
      nodes.push(
        node({
          id: `node_cmd_${i}`,
          parentId: "node_canon",
          files: [`src/commands/c${i}.ts`],
        }),
      );
    }
    for (let i = 0; i < 2; i++) {
      nodes.push(
        node({
          id: `node_core_${i}`,
          parentId: "node_canon",
          files: [`src/core/k${i}.ts`],
        }),
      );
    }
    const plan = planHierarchization({ nodes, edges: [] });
    expect(plan.before.verdict).toBe("flat");
    // Once flatness is fixed, the residual symptom becomes the lack of
    // edges — verdict ought to drop to one of the non-flat states.
    expect(plan.after.verdict).not.toBe("flat");
  });
});
