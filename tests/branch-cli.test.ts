import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Set up a two-branch fixture: canon plus two nodes on "main" and one node
// on "feature". State is mutated between creates so subsequent nodes pick
// up the new active branch (nodes inherit state.activeBranch on creation).
function setupTwoBranches(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "First on main"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Second on main"]).status).toBe(0);
  // node_0001 refines canon — keeps edges deterministic across CLI runs.
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);

  // Flip activeBranch directly on state.json — there is no CLI surface to
  // switch branches yet, so the test edits the durable record. This is the
  // same approach used by tests/cli-link.test.ts when it needs a non-main
  // active branch.
  const statePath = path.join(tempDir, ".ontology", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  state.activeBranch = "feature";
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Only on feature"]).status).toBe(0);
}

describe("onto branch list", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); setupTwoBranches(tempDir); });
  afterEach(() => cleanupTempProject(tempDir));

  it("--json reports every branch with its node count", () => {
    const r = runCli(tempDir, ["branch", "list", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // canon + 2 mains + 1 feature = 4 nodes total
    expect(parsed.totalNodes).toBe(4);
    // listBranches sorts lexicographically: feature, main
    expect(parsed.branches.map((b: any) => b.name)).toEqual(["feature", "main"]);
    const byName = new Map(parsed.branches.map((b: any) => [b.name, b.nodeCount]));
    expect(byName.get("main")).toBe(3); // canon + 2 created
    expect(byName.get("feature")).toBe(1);
  });

  it("human output includes the === ONTOLOGY BRANCHES === header and per-branch counts", () => {
    const r = runCli(tempDir, ["branch", "list"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("=== ONTOLOGY BRANCHES ===");
    expect(r.stdout).toMatch(/main\s+3 nodes/);
    expect(r.stdout).toMatch(/feature\s+1 node\b/);
  });

  it("on a fresh project (no nodes beyond canon) still lists the main branch", () => {
    const fresh = createTempProject();
    try {
      expect(runCli(fresh, ["init"]).status).toBe(0);
      const r = runCli(fresh, ["branch", "list", "--json"]);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.totalNodes).toBe(1);
      expect(parsed.branches).toEqual([{ name: "main", nodeCount: 1 }]);
    } finally {
      cleanupTempProject(fresh);
    }
  });
});

describe("onto branch fiber", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); setupTwoBranches(tempDir); });
  afterEach(() => cleanupTempProject(tempDir));

  it("--json returns only the nodes and edges belonging to the branch", () => {
    const r = runCli(tempDir, ["branch", "fiber", "main", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.branch).toBe("main");
    expect(parsed.size.nodes).toBe(3);
    // Edge node_0001 -> canon refines is intra-main; the feature node has
    // no edges so the fiber inherits all and only this one edge.
    expect(parsed.size.edges).toBe(1);
    expect(parsed.edges[0].type).toBe("refines");
    expect(parsed.nodes).toContain("node_0000_canon");
    expect(parsed.nodes).not.toContain("node_0003"); // feature node excluded
  });

  it("--json on the feature branch returns only the feature node and zero edges", () => {
    const r = runCli(tempDir, ["branch", "fiber", "feature", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.size.nodes).toBe(1);
    expect(parsed.size.edges).toBe(0);
    expect(parsed.nodes).toEqual(["node_0003"]);
  });

  it("exits 1 with a hint when the branch does not exist", () => {
    const r = runCli(tempDir, ["branch", "fiber", "ghost"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`No such branch: "ghost"`);
    expect(r.stderr).toContain("Known branches:");
    expect(r.stderr).toContain("main");
  });

  it("--json on an unknown branch returns ok:false", () => {
    const r = runCli(tempDir, ["branch", "fiber", "ghost", "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("ghost");
  });

  it("human output uses the === ONTOLOGY BRANCH FIBER === header", () => {
    const r = runCli(tempDir, ["branch", "fiber", "main"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("=== ONTOLOGY BRANCH FIBER ===");
    expect(r.stdout).toContain("Branch:   main");
  });
});
