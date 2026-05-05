import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CLI_PATH = path.resolve(__dirname, "../src/cli.ts");

describe("Context Assembler CLI", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-test-"));
    // Run init to set up the network
    spawnSync("npx", ["tsx", CLI_PATH, "init"], { cwd: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestNodeAndEdge(dir: string): string {
    const createRes = spawnSync("npx", ["tsx", CLI_PATH, "node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Example"], { cwd: dir, encoding: "utf8" });
    const nodeIdMatch = createRes.stdout.match(/Node:\s+(node_[a-f0-9]+)/);
    const nodeId = nodeIdMatch ? nodeIdMatch[1] : "node_fail";
    spawnSync("npx", ["tsx", CLI_PATH, "node", "link", "--from", "node_0000_canon", "--to", nodeId, "--type", "documents"], { cwd: dir, encoding: "utf8" });
    return nodeId;
  }

  function getDirState(dir: string): string {
    const nodes = fs.readdirSync(path.join(dir, ".ontology/nodes")).sort().map(f => fs.readFileSync(path.join(dir, ".ontology/nodes", f), "utf8")).join("");
    const state = fs.readFileSync(path.join(dir, ".ontology/state.json"), "utf8");
    const edges = fs.readFileSync(path.join(dir, ".ontology/edges.jsonl"), "utf8");
    const events = fs.readFileSync(path.join(dir, ".ontology/events.jsonl"), "utf8");
    return nodes + state + edges + events;
  }

  it("context assemble default remains parent-path only", () => {
    const nodeId = createTestNodeAndEdge(tempDir);
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", nodeId], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("Edge Context:");
  });

  it("context assemble --include-edges includes edge context", () => {
    const nodeId = createTestNodeAndEdge(tempDir);
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", nodeId, "--include-edges"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Edge Context:");
    expect(result.stdout).toContain("Enabled: true");
    expect(result.stdout).toContain("Edges:   1");
  });

  it("context assemble --include-edges --json outputs parseable edgeContext", () => {
    const nodeId = createTestNodeAndEdge(tempDir);
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", nodeId, "--include-edges", "--json"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.context.edgeContext).toBeDefined();
    expect(parsed.context.edgeContext.edges.length).toBe(1);
  });

  it("context assemble --edge-types filters edge types", () => {
    const nodeId = createTestNodeAndEdge(tempDir);
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", nodeId, "--include-edges", "--edge-types", "tests"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Edges:   0");
  });

  it("context assemble rejects invalid edge type", () => {
    const nodeId = createTestNodeAndEdge(tempDir);
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", nodeId, "--include-edges", "--edge-types", "fake_type"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("✖ Invalid edge type: fake_type");
  });

  it("context assemble --include-edges does not mutate .ontology", () => {
    const nodeId = createTestNodeAndEdge(tempDir);
    const beforeState = getDirState(tempDir);

    spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", nodeId, "--include-edges"], { cwd: tempDir, encoding: "utf8" });

    const afterState = getDirState(tempDir);
    expect(beforeState).toStrictEqual(afterState);
  });

  it("onto context assemble node_0000_canon works", () => {
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", "node_0000_canon"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("=== ONTOLOGY CONTEXT PACKAGE ===");
    expect(result.stdout).toContain("Mode:    strict");
    expect(result.stdout).toContain("Branch:  main");
    expect(result.stdout).toContain("Target:  node_0000_canon");
    expect(result.stdout).toContain("Canon:");
    expect(result.stdout).toContain("Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction.");
    expect(result.stdout).toContain("Path:");
    expect(result.stdout).toContain("- node_0000_canon :: Ontology Mathematical Canon");
    expect(result.stdout).toContain("Constraints:");
    expect(result.stdout).toContain("1. Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction.");
    expect(result.stdout).toContain("Target Prompt:");
  });

  it("onto context assemble node_0000_canon --json outputs parseable JSON", () => {
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", "node_0000_canon", "--json"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty("context");
    expect(parsed.context).toHaveProperty("mode", "strict");
    expect(parsed.context).toHaveProperty("targetNodeId", "node_0000_canon");
    expect(parsed.context).toHaveProperty("canon");
    expect(parsed.context).toHaveProperty("constraints");
    expect(parsed.context).toHaveProperty("nodes");
  });

  it("onto context assemble missing node fails clearly", () => {
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", "missing_node"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Target node not found: missing_node");
  });

  it("onto context assemble node_0000_canon --mode compare fails clearly", () => {
    const result = spawnSync("npx", ["tsx", CLI_PATH, "context", "assemble", "node_0000_canon", "--mode", "compare"], { cwd: tempDir, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported context assembly mode: compare");
  });
});
