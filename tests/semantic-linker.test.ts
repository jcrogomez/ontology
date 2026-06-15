import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { semanticLink } from "../src/runtime/context/semantic-linker.js";
import { OntologyNode } from "../src/kernel/schemas/ontology.js";

describe("Semantic Linker", () => {
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
      coordinates: { abstraction: "canon", branch: "main", time: 100, plane: "semantic", manifestation: "intent" },
      graph: { parentId: null, orbitOf: null },
      prompt: { raw: "Bootstrap the ontology.", variables: {}, language: "es" },
      inputs: [
        { type: "text", role: "mathematical_canon", value: "Canon content here" }
      ],
      outputs: {},
      rules: ["1. The system is a directed graph."],
      context: { provides: [], requires: [], forbids: [], optional: [] },
      model: { ref: "mock_default" },
      processors: { pre: [], post: [] },
      technical: {},
      integrity: { hash: "hash1", schemaVersion: "1.0" }
    };

    const targetNode: OntologyNode = {
      id: "node_0001_target",
      label: "Target node",
      kind: "entity",
      status: "valid",
      coordinates: { abstraction: "target", branch: "main", time: 101, plane: "semantic", manifestation: "intent" },
      graph: { parentId: "node_0000_canon", orbitOf: null },
      prompt: { raw: "Implement the feature.", variables: {}, language: "es" },
      inputs: [],
      outputs: {},
      rules: ["FORBID: prohibited term"],
      context: { provides: [], requires: [], forbids: [], optional: [] },
      model: { ref: "mock_default" },
      processors: { pre: [], post: [] },
      technical: {},
      integrity: { hash: "hash2", schemaVersion: "1.0" }
    };

    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", `${canonNode.id}.json`), JSON.stringify(canonNode));
    fs.writeFileSync(path.join(cwd, ".ontology", "nodes", `${targetNode.id}.json`), JSON.stringify(targetNode));
  });

  afterEach(() => {
    cleanupTempProject(cwd);
  });

  it("semanticLink accepts clean candidate for canon context", async () => {
    const result = await semanticLink({
      targetNodeId: "node_0001_target",
      candidate: {
        text: "This is a clean candidate text.",
        provider: "mock",
        model: "mock-model"
      },
      cwd
    });

    expect(result.ok).toBe(true);
    expect(result.validation.ok).toBe(true);
    expect(result.validation.violations).toHaveLength(0);
  });

  it("semanticLink rejects missing node", async () => {
    await expect(semanticLink({
      targetNodeId: "node_0002_missing",
      candidate: {
        text: "This will not be evaluated.",
        provider: "mock",
        model: "mock-model"
      },
      cwd
    })).rejects.toThrow(/Target node not found/);
  });

  it("semanticLink rejects candidate violating FORBID constraint", async () => {
    const result = await semanticLink({
      targetNodeId: "node_0001_target",
      candidate: {
        text: "This text contains a prohibited term which violates rules.",
        provider: "mock",
        model: "mock-model"
      },
      cwd
    });

    expect(result.ok).toBe(false);
    expect(result.validation.ok).toBe(false);
    expect(result.validation.violations).toContain("Forbidden phrase found: prohibited term");
  });

  it("semanticLink returns context node ids", async () => {
    const result = await semanticLink({
      targetNodeId: "node_0001_target",
      candidate: {
        text: "Good candidate.",
        provider: "mock",
        model: "mock-model"
      },
      cwd
    });

    expect(result.contextNodeIds).toEqual(["node_0000_canon", "node_0001_target"]);
  });

  it("semanticLink does not mutate .ontology", async () => {
    const stateBefore = fs.readFileSync(path.join(cwd, ".ontology", "state.json"), "utf8");
    const canonBefore = fs.readFileSync(path.join(cwd, ".ontology", "nodes", "node_0000_canon.json"), "utf8");

    await semanticLink({
      targetNodeId: "node_0001_target",
      candidate: {
        text: "A completely valid text.",
        provider: "mock",
        model: "mock-model"
      },
      cwd
    });

    const stateAfter = fs.readFileSync(path.join(cwd, ".ontology", "state.json"), "utf8");
    const canonAfter = fs.readFileSync(path.join(cwd, ".ontology", "nodes", "node_0000_canon.json"), "utf8");

    expect(stateBefore).toEqual(stateAfter);
    expect(canonBefore).toEqual(canonAfter);
  });
});
