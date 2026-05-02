import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { assembleContext } from "../src/runtime/context/assembler.js";
import { OntologyNode } from "../src/schemas/ontology.js";

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

    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0000_canon.json"), JSON.stringify(canonNode, null, 2));
    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0001_ancestor.json"), JSON.stringify(ancestorNode, null, 2));
    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", "node_0002_target.json"), JSON.stringify(targetNode, null, 2));
  });

  afterEach(() => {
    cleanupTempProject(cwd);
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

  it("does not mutate .ontology", () => {
    const preNodes = fs.readdirSync(path.join(cwd, ".ontology", "nodes"));
    const preState = fs.readFileSync(path.join(cwd, ".ontology", "state.json"), "utf-8");

    assembleContext({ targetNodeId: "node_0002_target", mode: "strict" }, cwd);

    const postNodes = fs.readdirSync(path.join(cwd, ".ontology", "nodes"));
    const postState = fs.readFileSync(path.join(cwd, ".ontology", "state.json"), "utf-8");

    expect(preNodes).toEqual(postNodes);
    expect(preState).toEqual(postState);
  });
});
