import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import * as path from "node:path";
import * as fs from "node:fs";

// Import core load functions directly for unit testing
import { loadState, loadEvents, loadEdges, loadModelsRegistry, loadProcessorsRegistry } from "../src/core/project/load.js";

describe("Core Project Loaders", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Initialize standard valid project
    runCli(tmpDir, ["init"]);
  });

  afterEach(() => {
    cleanupTempProject(tmpDir);
  });

  it("loadState should load and parse state.json after init", () => {
    const state = loadState(tmpDir);
    expect(state).toHaveProperty("initialized", true);
    expect(state.nodeCount).toBeGreaterThan(0);
    expect(state.rootNodeId).toBe("node_0000_canon");
  });

  it("loadEvents should load initial system event", () => {
    const events = loadEvents(tmpDir);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].eventType).toBe("system_init");
  });

  it("loadEdges should load empty array immediately after init", () => {
    const edges = loadEdges(tmpDir);
    expect(Array.isArray(edges)).toBe(true);
    expect(edges.length).toBe(0);
  });

  it("loadModelsRegistry should load models array", () => {
    const registry = loadModelsRegistry(tmpDir);
    expect(Array.isArray(registry.models)).toBe(true);
    expect(registry.models.length).toBeGreaterThan(0);
  });

  it("loadProcessorsRegistry should load processors array", () => {
    const registry = loadProcessorsRegistry(tmpDir);
    expect(Array.isArray(registry.processors)).toBe(true);
    expect(registry.processors.length).toBeGreaterThan(0);
  });

  it("loaders should throw an explicit error when files are missing", () => {
    // Delete events.jsonl manually
    fs.unlinkSync(path.join(tmpDir, ".ontology", "events.jsonl"));

    expect(() => loadEvents(tmpDir)).toThrow("Missing required file: .ontology/events.jsonl");
  });
});
