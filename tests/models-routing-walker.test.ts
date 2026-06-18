import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { modelsFromWalker, routeFromWalker } from "../src/surfaces/walker/actions/models-from-walker.js";
import { loadModelsRegistry } from "../src/kernel/core/project/load.js";

// Per-task model routing as surfaced/reconfigured from the Walker
// (REGEN_ORACLE_REFINE): `:models` reads the routing + catalog; `:route`
// governs the write. The Ink render is exercised by hand; these tests pin the
// action layer (read projection + governed write round-trip + validation).

describe("models routing (walker action)", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });
  afterEach(() => cleanupTempProject(tempDir));

  it(":models reads the catalog and shows every routable task unrouted by default", () => {
    const r = modelsFromWalker(tempDir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog.length).toBeGreaterThan(0);
    expect(r.catalog.some((m) => m.id === "mock_default")).toBe(true);
    // No routing configured after init → every task falls back to per-node ref.
    expect(r.routing.every((row) => row.modelId === null)).toBe(true);
    expect(r.routing.map((row) => row.task)).toContain("code_sketch");
  });

  it(":route points a task at a registered model, persists it, and resolves", () => {
    const set = routeFromWalker("code_sketch", "mock_default", tempDir);
    expect(set.ok).toBe(true);

    // Persisted to registry.json.
    expect(loadModelsRegistry(tempDir).routing).toEqual({ code_sketch: "mock_default" });

    // Reflected in the view, resolved to provider/model.
    const view = modelsFromWalker(tempDir);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const row = view.routing.find((x) => x.task === "code_sketch")!;
    expect(row).toMatchObject({ modelId: "mock_default", resolved: true, provider: "mock" });
  });

  it(":route <task> off clears the routing (falls back to per-node ref)", () => {
    routeFromWalker("code_sketch", "mock_default", tempDir);
    const cleared = routeFromWalker("code_sketch", null, tempDir);
    expect(cleared.ok).toBe(true);
    // Cleared entirely → registry has no routing key (byte-clean).
    expect(loadModelsRegistry(tempDir).routing).toBeUndefined();
  });

  it("rejects an unknown task", () => {
    const r = routeFromWalker("not_a_task", "mock_default", tempDir);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/unknown task/);
  });

  it("rejects routing to a model id that does not exist", () => {
    const r = routeFromWalker("code_sketch", "ghost-model", tempDir);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not found/);
    // Nothing was written.
    expect(loadModelsRegistry(tempDir).routing).toBeUndefined();
  });

  it("clearing an unrouted task is a no-op error (nothing to clear)", () => {
    const r = routeFromWalker("inspect", null, tempDir);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not routed/);
  });

  it("preserves the models array when only routing changes", () => {
    const before = loadModelsRegistry(tempDir).models;
    routeFromWalker("semantic_parse", "mock_default", tempDir);
    const after = loadModelsRegistry(tempDir);
    expect(after.models).toEqual(before);
    expect(after.routing).toEqual({ semantic_parse: "mock_default" });
  });
});
