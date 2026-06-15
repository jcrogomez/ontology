import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { assembleContext } from "../src/forward/context/assembler.js";
import { OntologyNode, OntologyEdge } from "../src/kernel/schemas/ontology.js";

describe("Context Assembler", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempProject();
    fs.mkdirSync(path.join(cwd, ".ontology", "nodes"), { recursive: true });
    fs.mkdirSync(path.join(cwd, ".ontology", "models"), { recursive: true });
    fs.mkdirSync(path.join(cwd, ".ontology", "processors"), { recursive: true });

    const state = {
      initialized: true,
      schemaVersion: "1.0",
      projectName: "Test Project",
      rootNodeId: "node_0000_canon",
      activeBranch: "main",
      nodeCount: 3,
      edgeCount: 0,
      eventCount: 0,
      lastEventId: "evt_0000",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(cwd, ".ontology", "state.json"), JSON.stringify(state));
    fs.writeFileSync(path.join(cwd, ".ontology", "events.jsonl"), "");
    fs.writeFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "");
    fs.writeFileSync(path.join(cwd, ".ontology", "models", "registry.json"), JSON.stringify({ models: [] }));
    fs.writeFileSync(path.join(cwd, ".ontology", "processors", "registry.json"), JSON.stringify({ processors: [] }));

    const canonNode: OntologyNode = {
      id: "node_0000_canon",
      label: "Ontology Mathematical Canon",
      kind: "canon",
      status: "valid",
      coordinates: {
        abstraction: "canon",
        time: 0,
        branch: "main",
        plane: "semantic",
        manifestation: "intent"
      },
      inputs: [{ type: "text", value: "Root mathematical canon", role: "mathematical_canon" }],
      prompt: { raw: "Canon prompt", variables: {}, language: "en" },
      model: { ref: "mock" },
      processors: { pre: [], post: [] },
      context: { requires: [], forbids: [], optional: [] },
      graph: { parentId: null, orbitOf: null },
      rules: ["1. Everything is a node."],
      technical: {},
      outputs: {},
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    const ancestorNode: OntologyNode = {
      id: "node_0001_ancestor",
      label: "Ancestor Node",
      kind: "rule",
      status: "valid",
      coordinates: {
        abstraction: "architecture",
        time: 1,
        branch: "main",
        plane: "semantic",
        manifestation: "intent"
      },
      inputs: [],
      prompt: { raw: "Ancestor prompt", variables: {}, language: "en" },
      model: { ref: "mock" },
      processors: { pre: [], post: [] },
      context: { requires: [], forbids: [], optional: [] },
      graph: { parentId: "node_0000_canon", orbitOf: null },
      rules: ["1. Rules must be followed."],
      technical: {},
      outputs: {},
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    const targetNode: OntologyNode = {
      id: "node_0002_target",
      label: "Target Node",
      kind: "component",
      status: "draft",
      coordinates: {
        abstraction: "unit",
        time: 2,
        branch: "main",
        plane: "semantic",
        manifestation: "intent"
      },
      inputs: [],
      prompt: { raw: "Target prompt", variables: {}, language: "en" },
      model: { ref: "mock" },
      processors: { pre: [], post: [] },
      context: { requires: [], forbids: [], optional: [] },
      graph: { parentId: "node_0001_ancestor", orbitOf: null },
      rules: [],
      technical: {},
      outputs: {},
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    const neighborNode1: OntologyNode = {
      id: "node_0003_neighbor_valid",
      label: "Neighbor Valid",
      kind: "component",
      status: "valid",
      coordinates: {
        abstraction: "unit",
        time: 3,
        branch: "main",
        plane: "semantic",
        manifestation: "intent"
      },
      inputs: [],
      prompt: { raw: "Neighbor prompt", variables: {}, language: "en" },
      model: { ref: "mock" },
      processors: { pre: [], post: [] },
      context: { requires: [], forbids: [], optional: [] },
      graph: { parentId: "node_0000_canon", orbitOf: null },
      rules: ["Neighbor valid rule"],
      technical: {},
      outputs: {},
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    const neighborNode2: OntologyNode = {
      id: "node_0004_neighbor_mismatch",
      label: "Neighbor Mismatch",
      kind: "component",
      status: "valid",
      coordinates: {
        abstraction: "unit",
        time: 4,
        branch: "dev",
        plane: "semantic",
        manifestation: "intent"
      },
      inputs: [],
      prompt: { raw: "Neighbor mismatch prompt", variables: {}, language: "en" },
      model: { ref: "mock" },
      processors: { pre: [], post: [] },
      context: { requires: [], forbids: [], optional: [] },
      graph: { parentId: "node_0000_canon", orbitOf: null },
      rules: ["Neighbor mismatch rule"],
      technical: {},
      outputs: {},
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    const edge1: OntologyEdge = {
      edgeId: "edge_0001",
      from: "node_0002_target",
      to: "node_0003_neighbor_valid",
      type: "depends_on",
      branch: "main",
      createdAt: new Date().toISOString(),
      createdByEventId: "evt_0000",
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    const edge2: OntologyEdge = {
      edgeId: "edge_0002",
      from: "node_0001_ancestor",
      to: "node_0004_neighbor_mismatch",
      type: "validates_against",
      branch: "main",
      createdAt: new Date().toISOString(),
      createdByEventId: "evt_0000",
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    const edge3: OntologyEdge = {
      edgeId: "edge_0003",
      from: "node_0002_target",
      to: "node_0003_neighbor_valid",
      type: "inherits_from", // Not in default allowed edges
      branch: "main",
      createdAt: new Date().toISOString(),
      createdByEventId: "evt_0000",
      integrity: { hash: "hash", schemaVersion: "1.0" }
    };

    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0000_canon.json"), JSON.stringify(canonNode, null, 2));
    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0001_ancestor.json"), JSON.stringify(ancestorNode, null, 2));
    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0002_target.json"), JSON.stringify(targetNode, null, 2));
    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0003_neighbor_valid.json"), JSON.stringify(neighborNode1, null, 2));
    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0004_neighbor_mismatch.json"), JSON.stringify(neighborNode2, null, 2));
    fs.writeFileSync(path.join(cwd, ".ontology", "edges.jsonl"), [edge1, edge2, edge3].map(e => JSON.stringify(e)).join("\n"));
  });

  afterEach(() => {
    cleanupTempProject(cwd);
  });

  it("default assembler remains parent-path only", () => {
    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    expect(result.edgeContext).toBeUndefined();
    expect(result.warnings).toBeUndefined();
    expect(result.nodes).toHaveLength(3); // canon, ancestor, target
  });

  it("includeEdges includes allowed neighbor nodes", () => {
    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict", includeEdges: true }, cwd);
    expect(result.edgeContext).toBeDefined();
    expect(result.edgeContext?.nodeIds).toContain("node_0003_neighbor_valid");
    expect(result.nodes.map(n => n.id)).toContain("node_0003_neighbor_valid");
    expect(result.constraints).toContain("Neighbor valid rule");
    expect(result.edgeContext?.edges.map(e => e.edgeId)).toContain("edge_0001");
  });

  it("includeEdges respects edgeTypes filter", () => {
    const result = assembleContext({
      targetNodeId: "node_0002_target",
      mode: "strict",
      includeEdges: true,
      edgeTypes: ["inherits_from"]
    }, cwd);

    expect(result.edgeContext?.edges.map(e => e.edgeId)).toContain("edge_0003");
    expect(result.edgeContext?.nodeIds).toContain("node_0003_neighbor_valid");
    expect(result.nodes.map(n => n.id)).toContain("node_0003_neighbor_valid");
  });

  it("includeEdges does not duplicate nodes", () => {
    // Modify edge1 to connect ancestor and target (both already in context)
    const edgePath = path.join(cwd, ".ontology", "edges.jsonl");
    const edges = fs.readFileSync(edgePath, "utf-8").split("\n").map(l => JSON.parse(l));
    edges[0].from = "node_0001_ancestor";
    edges[0].to = "node_0002_target";
    fs.writeFileSync(edgePath, edges.map(e => JSON.stringify(e)).join("\n"));

    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict", includeEdges: true }, cwd);

    const nodeIds = result.nodes.map(n => n.id);
    const uniqueNodeIds = new Set(nodeIds);
    expect(nodeIds.length).toBe(uniqueNodeIds.size);
    // Even though the edge connects nodes in context, it shouldn't duplicate them in the nodes array
  });

  it("includeEdges ignores branch-mismatched neighbors with warning", () => {
    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict", includeEdges: true }, cwd);

    expect(result.warnings).toContain("Ignored neighbor node node_0004_neighbor_mismatch due to branch mismatch");
    expect(result.edgeContext?.nodeIds).not.toContain("node_0004_neighbor_mismatch");
    expect(result.nodes.map(n => n.id)).not.toContain("node_0004_neighbor_mismatch");
    expect(result.edgeContext?.edges.map(e => e.edgeId)).not.toContain("edge_0002");
  });

  it("assembles context for canon node", () => {
    const result = assembleContext({ targetNodeId: "node_0000_canon", mode: "strict" }, cwd);
    expect(result.mode).toBe("strict");
    expect(result.targetNodeId).toBe("node_0000_canon");
    expect(result.branch).toBe("main");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("node_0000_canon");
    expect(result.canon).toBe("Everything is a node.");
    expect(result.constraints).toEqual(["Everything is a node."]);
    expect(result.prompt).toContain("Canon:\nEverything is a node.");
    expect(result.prompt).toContain("Target Prompt:\nCanon prompt");
    expect(result.prompt).toContain("- node_0000_canon :: Ontology Mathematical Canon");
  });

  it("assembles context for canon node using fallback mathematical_canon input when rules are empty", () => {
    const canonPath = path.join(cwd, ".ontology", "nodes", "node_0000_canon.json");
    const canonNode = JSON.parse(fs.readFileSync(canonPath, "utf-8"));
    canonNode.rules = [];
    fs.writeFileSync(canonPath, JSON.stringify(canonNode, null, 2));

    const result = assembleContext({ targetNodeId: "node_0000_canon", mode: "strict" }, cwd);
    expect(result.canon).toBe("Root mathematical canon");
    expect(result.prompt).toContain("Canon:\nRoot mathematical canon");
  });

  it("assembles context for child node", () => {
    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    expect(result.mode).toBe("strict");
    expect(result.targetNodeId).toBe("node_0002_target");
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0].id).toBe("node_0000_canon");
    expect(result.nodes[1].id).toBe("node_0001_ancestor");
    expect(result.nodes[2].id).toBe("node_0002_target");
    expect(result.canon).toBe("Everything is a node.");
    expect(result.constraints).toEqual(["Everything is a node.", "Rules must be followed."]);
    expect(result.prompt).toContain("Target: node_0002_target");
    expect(result.prompt).toContain("- node_0000_canon :: Ontology Mathematical Canon");
    expect(result.prompt).toContain("- node_0001_ancestor :: Ancestor Node");
    expect(result.prompt).toContain("- node_0002_target :: Target Node");
    expect(result.prompt).toContain("Target Prompt:\nTarget prompt");
  });

  it("emits a Contract section with structured requires/provides/forbids for nodes that have them", () => {
    // Patch the target node to carry a real contract so the assembler has
    // something to surface to the LLM beyond the prose `rules`.
    const targetPath = path.join(cwd, ".ontology", "nodes", "node_0002_target.json");
    const target = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    target.context = {
      requires: [{ source: "habit_logs_jsonl", nodeType: "rule" }],
      provides: [{ key: "log_endpoint", nodeType: "rule" }],
      forbids: [{ source: "deploys_as_service", nodeType: "rule" }],
      optional: [],
    };
    fs.writeFileSync(targetPath, JSON.stringify(target));

    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    expect(result.prompt).toContain("Contract (structured intent");
    // Target node is marked with [target] so the LLM knows whose contract it owns.
    expect(result.prompt).toContain("- node_0002_target [target]:");
    expect(result.prompt).toContain("provides: log_endpoint");
    expect(result.prompt).toContain("requires: habit_logs_jsonl");
    expect(result.prompt).toContain("forbids:  deploys_as_service");
  });

  it("skips the Contract section entirely when no node in the path has structured intent", () => {
    // Default fixture has empty requires/provides/forbids on every node.
    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    expect(result.prompt).not.toContain("Contract (structured intent");
    // γ-7 mandatory-exports block also omitted when there are no provides.
    expect(result.prompt).not.toContain("MANDATORY EXPORTS");
  });

  it("emits a MANDATORY EXPORTS block for the focal when it has provides (γ-7)", () => {
    // Vibe-Reasoning calibration showed that LLMs were renaming
    // captured provides (e.g. solve_max_fooling_set → max_fooling_set)
    // because "provides:" in the contract section read as a hint, not
    // an enforced constraint. The γ-7 fix surfaces the focal's
    // provides as a separate directive block.
    const targetPath = path.join(cwd, ".ontology", "nodes", "node_0002_target.json");
    const target = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    target.context = {
      requires: [],
      provides: [
        { key: "solve_max_fooling_set", nodeType: "rule" },
        { key: "is_conflict", nodeType: "rule" },
      ],
      forbids: [],
      optional: [],
    };
    fs.writeFileSync(targetPath, JSON.stringify(target));

    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    expect(result.prompt).toContain("MANDATORY EXPORTS");
    expect(result.prompt).toContain("preserving the exact spelling");
    expect(result.prompt).toContain("- solve_max_fooling_set");
    expect(result.prompt).toContain("- is_conflict");
  });

  it("MANDATORY EXPORTS block uses ONLY the focal's provides, not ancestors'", () => {
    // The directive language is targeted at the node being generated.
    // Surfacing ancestor exports as "mandatory" would mis-instruct the
    // LLM to re-emit them.
    const ancestorPath = path.join(cwd, ".ontology", "nodes", "node_0001_ancestor.json");
    const ancestor = JSON.parse(fs.readFileSync(ancestorPath, "utf-8"));
    ancestor.context = {
      requires: [],
      provides: [{ key: "ancestor_only_token", nodeType: "rule" }],
      forbids: [],
      optional: [],
    };
    fs.writeFileSync(ancestorPath, JSON.stringify(ancestor));

    const targetPath = path.join(cwd, ".ontology", "nodes", "node_0002_target.json");
    const target = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    target.context = {
      requires: [],
      provides: [{ key: "focal_token", nodeType: "rule" }],
      forbids: [],
      optional: [],
    };
    fs.writeFileSync(targetPath, JSON.stringify(target));

    const result = assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    // The MANDATORY block lists only focal_token; ancestor_only_token
    // still appears in the shared Contract section but not the
    // mandatory directive.
    expect(result.prompt).toContain("MANDATORY EXPORTS");
    const mandatoryBlockStart = result.prompt.indexOf("MANDATORY EXPORTS");
    const mandatoryBlockEnd = result.prompt.indexOf("\n\n", mandatoryBlockStart);
    const mandatoryBlock = result.prompt.slice(mandatoryBlockStart, mandatoryBlockEnd);
    expect(mandatoryBlock).toContain("- focal_token");
    expect(mandatoryBlock).not.toContain("ancestor_only_token");
  });

  it("fails when target node does not exist", () => {
    expect(() => {
      assembleContext({ targetNodeId: "node_missing", mode: "strict" }, cwd);
    }).toThrow("Target node not found: node_missing");
  });

  it("fails when parent ancestor does not exist", () => {
    // Delete ancestor node to simulate missing ancestor
    fs.unlinkSync(path.join(cwd, ".ontology", "nodes", "node_0001_ancestor.json"));

    expect(() => {
      assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    }).toThrow("Missing ancestor node: node_0001_ancestor required by node_0002_target");
  });

  it("fails on branch mismatch", () => {
    // Modify target node to be on "dev" branch
    const targetPath = path.join(cwd, ".ontology", "nodes", "node_0002_target.json");
    const targetNode = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    targetNode.coordinates.branch = "dev";
    fs.writeFileSync(targetPath, JSON.stringify(targetNode, null, 2));

    expect(() => {
      assembleContext({ targetNodeId: "node_0002_target", branch: "main", mode: "strict" }, cwd);
    }).toThrow("Branch mismatch for node node_0002_target: expected main, received dev");
  });

  it("fails on unsupported mode", () => {
    expect(() => {
      assembleContext({ targetNodeId: "node_0000_canon", mode: "compare" }, cwd);
    }).toThrow("Unsupported context assembly mode: compare");
  });

  it("fails when context path does not terminate at root node", () => {
    // Make ancestor point to null but not be the root canon node
    const ancestorPath = path.join(cwd, ".ontology", "nodes", "node_0001_ancestor.json");
    const ancestorNode = JSON.parse(fs.readFileSync(ancestorPath, "utf-8"));
    ancestorNode.graph.parentId = null;
    fs.writeFileSync(ancestorPath, JSON.stringify(ancestorNode, null, 2));

    expect(() => {
      assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);
    }).toThrow("Context path does not terminate at root node: expected node_0000_canon, received node_0001_ancestor");
  });

  it("includeEdges does not mutate .ontology", () => {
    const preNodes = fs.readdirSync(path.join(cwd, ".ontology", "nodes"));
    const preState = fs.readFileSync(path.join(cwd, ".ontology", "state.json"), "utf-8");
    const preEdges = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8");

    assembleContext({ targetNodeId: "node_0002_target", mode: "strict", includeEdges: true }, cwd);

    const postNodes = fs.readdirSync(path.join(cwd, ".ontology", "nodes"));
    const postState = fs.readFileSync(path.join(cwd, ".ontology", "state.json"), "utf-8");
    const postEdges = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8");

    expect(preNodes).toEqual(postNodes);
    expect(preState).toEqual(postState);
    expect(preEdges).toEqual(postEdges);
  });
});
