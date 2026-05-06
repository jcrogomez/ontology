import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

describe("onto compile plan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("returns a single-step plan for a node with no dependencies (canon by itself)", () => {
    const r = runCli(tempDir, ["compile", "plan", "node_0000_canon", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.focal).toBe("node_0000_canon");
    expect(parsed.steps).toEqual([{ nodeId: "node_0000_canon", dependsOn: [] }]);
  });

  it("orders dependencies before dependents", () => {
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "A"]);
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "B"]);
    // B depends_on A
    runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "depends_on"]);

    const r = runCli(tempDir, ["compile", "plan", "node_0002", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.steps.map((s: any) => s.nodeId)).toEqual(["node_0001", "node_0002"]);
  });

  it("human output marks the focal with * and lists steps numbered", () => {
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "A"]);
    runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);

    const r = runCli(tempDir, ["compile", "plan", "node_0001"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("=== ONTOLOGY COMPILE PLAN ===");
    expect(r.stdout).toContain("* "); // focal marker
    expect(r.stdout).toContain("1. node_0000_canon");
    expect(r.stdout).toContain("2. node_0001");
  });

  it("exits 1 when the focal node does not exist", () => {
    const r = runCli(tempDir, ["compile", "plan", "node_xxxxx"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Node not found");
  });

  it("does NOT mutate .ontology", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const before = fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8");
    runCli(tempDir, ["compile", "plan", "node_0000_canon"]);
    const after = fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8");
    expect(before).toBe(after);
  });
});
