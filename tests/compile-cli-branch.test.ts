import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// `onto compile run --branch <name>` restricts the plan to the
// Grothendieck fiber over `<name>`. Build a two-branch fixture and check:
//   • a happy compile on the focal's branch
//   • a missing-branch error
//   • a focal-off-branch error
//   • a no-flag compile is unchanged

function setupTwoBranchFixture(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  // Two artifacts on main: a domain entity that refines canon, and a
  // python artifact that refines the domain. node_0001 + node_0002 on main.
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Main domain"]).status).toBe(0);
  expect(runCli(tempDir, [
    "node", "create",
    "--level", "artifact",
    "--kind", "artifact",
    "--manifestation", "code",
    "--language", "python",
    "--prompt", 'print("from main")',
  ]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);

  // Flip activeBranch and add one feature-side artifact. Cross-branch
  // edges are not created by the CLI, so the fiber over "feature" is
  // a singleton — the focal alone, no upstream chain.
  const statePath = path.join(tempDir, ".ontology", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  state.activeBranch = "feature";
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  expect(runCli(tempDir, [
    "node", "create",
    "--level", "artifact",
    "--kind", "artifact",
    "--manifestation", "code",
    "--language", "python",
    "--prompt", 'print("from feature")',
  ]).status).toBe(0);
}

describe("onto compile run --branch", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    setupTwoBranchFixture(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("compiles a focal on its own branch — plan walks only intra-branch edges", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--branch", "main",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    // The main fiber's closure for node_0002 is {node_0000_canon, node_0001, node_0002}
    // — no feature-side leakage even though node_0003 exists.
    const ids = parsed.steps.map((s: { nodeId: string }) => s.nodeId);
    expect(ids).toContain("node_0002");
    expect(ids).toContain("node_0001");
    expect(ids).not.toContain("node_0003");
  });

  it("exits 1 with focal_off_branch when the focal does not live on --branch", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--branch", "feature",
      "--json",
    ]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("focal_off_branch");
    expect(parsed.error).toContain("node_0002");
    expect(parsed.error).toContain("main");
    expect(parsed.error).toContain("feature");
  });

  it("exits 1 with missing_branch when --branch refers to an unknown name", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--branch", "ghost",
      "--json",
    ]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("missing_branch");
    expect(parsed.error).toContain("ghost");
    expect(parsed.error).toContain("Known branches");
  });

  it("the no-flag compile is unchanged — every edge participates as before", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    // Same canonical chain reaches the leaf as with --branch main, because
    // the fixture only has main-side edges between these nodes.
    expect(parsed.steps.map((s: { nodeId: string }) => s.nodeId)).toContain("node_0001");
  });

  it("human output surfaces the Branch line when --branch is used", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--branch", "main",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Branch:    main");
  });
});
