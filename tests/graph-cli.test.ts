import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Build a small fixture graph: canon ← refines ← node_0001 → depends_on → node_0002
function setupFixture(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "First domain"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Second domain"]).status).toBe(0);
  // node_0001 refines canon (upward, valid by poset)
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  // node_0001 depends_on node_0002 (sibling-ish, direction-agnostic edge)
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]).status).toBe(0);
}

describe("onto graph neighbors", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); setupFixture(tempDir); });
  afterEach(() => cleanupTempProject(tempDir));

  it("--json lists both incoming and outgoing neighbors by default", () => {
    const r = runCli(tempDir, ["graph", "neighbors", "node_0001", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.focal).toBe("node_0001");
    expect(parsed.neighbors.length).toBe(2);
    const neighborIds = new Set(parsed.neighbors.map((n: any) => n.nodeId));
    expect(neighborIds).toEqual(new Set(["node_0000_canon", "node_0002"]));
  });

  it("--direction out only surfaces outgoing edges", () => {
    const r = runCli(tempDir, ["graph", "neighbors", "node_0001", "--direction", "out", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.neighbors.every((n: any) => n.direction === "out")).toBe(true);
    expect(parsed.neighbors.length).toBe(2);
  });

  it("--type filters by edge type", () => {
    const r = runCli(tempDir, ["graph", "neighbors", "node_0001", "--type", "refines", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.neighbors.length).toBe(1);
    expect(parsed.neighbors[0].nodeId).toBe("node_0000_canon");
  });

  it("rejects an unknown --direction value", () => {
    const r = runCli(tempDir, ["graph", "neighbors", "node_0001", "--direction", "sideways"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid --direction");
  });

  it("rejects an unknown --type value", () => {
    const r = runCli(tempDir, ["graph", "neighbors", "node_0001", "--type", "fake_edge"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid edge type");
  });

  it("exits 1 when the focal node does not exist", () => {
    const r = runCli(tempDir, ["graph", "neighbors", "node_xxxxx"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Node not found");
  });

  it("human output uses the === ONTOLOGY ... === header", () => {
    const r = runCli(tempDir, ["graph", "neighbors", "node_0001"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("=== ONTOLOGY GRAPH NEIGHBORS ===");
  });
});

describe("onto graph path", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); setupFixture(tempDir); });
  afterEach(() => cleanupTempProject(tempDir));

  it("returns the directed path between two reachable nodes", () => {
    const r = runCli(tempDir, ["graph", "path", "node_0001", "node_0002", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.hops).toBe(1);
    expect(parsed.path[0].type).toBe("depends_on");
  });

  it("returns null path when no directed path exists (BFS does not walk reverse)", () => {
    // node_0002 has no outgoing edges; reaching node_0001 from it is impossible.
    const r = runCli(tempDir, ["graph", "path", "node_0002", "node_0001", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.path).toBeNull();
  });

  it("from === to returns an empty path", () => {
    const r = runCli(tempDir, ["graph", "path", "node_0001", "node_0001", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.path).toEqual([]);
    expect(parsed.hops).toBe(0);
  });

  it("--max-depth limits the BFS frontier", () => {
    const r = runCli(tempDir, ["graph", "path", "node_0001", "node_0002", "--max-depth", "0", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.path).toBeNull();
  });

  it("rejects an invalid --max-depth", () => {
    const r = runCli(tempDir, ["graph", "path", "node_0001", "node_0002", "--max-depth", "abc"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid --max-depth");
  });

  it("exits 1 when source or target node does not exist", () => {
    expect(runCli(tempDir, ["graph", "path", "node_x", "node_0002"]).status).toBe(1);
    expect(runCli(tempDir, ["graph", "path", "node_0001", "node_y"]).status).toBe(1);
  });
});

describe("onto graph subgraph", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); setupFixture(tempDir); });
  afterEach(() => cleanupTempProject(tempDir));

  it("--depth 1 returns the focal plus immediate neighbors", () => {
    const r = runCli(tempDir, ["graph", "subgraph", "node_0001", "--depth", "1", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(new Set(parsed.nodeIds)).toEqual(new Set(["node_0000_canon", "node_0001", "node_0002"]));
  });

  it("--depth 0 returns only the focal", () => {
    const r = runCli(tempDir, ["graph", "subgraph", "node_0001", "--depth", "0", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.nodeIds).toEqual(["node_0001"]);
    expect(parsed.edges).toEqual([]);
  });

  it("--type filter narrows neighborhood membership", () => {
    const r = runCli(tempDir, ["graph", "subgraph", "node_0001", "--depth", "1", "--type", "refines", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(new Set(parsed.nodeIds)).toEqual(new Set(["node_0000_canon", "node_0001"]));
  });

  it("rejects an invalid --depth value", () => {
    const r = runCli(tempDir, ["graph", "subgraph", "node_0001", "--depth", "-1"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid --depth");
  });

  it("does NOT mutate .ontology", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const stateBefore = fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8");
    runCli(tempDir, ["graph", "subgraph", "node_0001", "--depth", "2"]);
    const stateAfter = fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8");
    expect(stateAfter).toBe(stateBefore);
  });
});
