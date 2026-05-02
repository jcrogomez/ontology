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
