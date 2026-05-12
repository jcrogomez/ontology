import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Post-β-1 review blockers (§4.1 atomic write + §4.2 clobber gate from
// the 2026-05-12 milestone review). The --target path lands artifacts
// on the user's real source tree, so two extra safety properties matter
// beyond the existing tests in compile-cli-target.test.ts:
//
//   1. Atomic write: a successful run leaves no `.tmp.<pid>` siblings
//      next to the target. (The crash-survival property — pre-existing
//      content survives a partial write — is exercised at the unit
//      level in artifact-writer.test.ts.)
//   2. Clobber gate: --target refuses to overwrite an existing file
//      unless --force is also passed. The compile fails with
//      reason="target_exists" before any bytes are written.

function setupHelloWorld(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create",
    "--level", "artifact", "--kind", "artifact",
    "--manifestation", "code", "--language", "python",
    "--prompt", 'print("hello world")',
  ]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
}

describe("onto compile run --target safety", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    setupHelloWorld(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("leaves no .tmp.<pid> sibling after a successful --target write", () => {
    const targetDir = path.join(tempDir, "out");
    fs.mkdirSync(targetDir);
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "out/hello.py",
    ]);
    expect(r.status).toBe(0);
    const siblings = fs.readdirSync(targetDir);
    expect(siblings).toContain("hello.py");
    // No leftover atomic-write temp files.
    expect(siblings.filter((f) => f.includes(".tmp."))).toEqual([]);
  });

  it("refuses to overwrite an existing target without --force (reason=target_exists)", () => {
    const targetPath = path.join(tempDir, "existing.py");
    fs.writeFileSync(targetPath, "# original user code\n");
    const before = fs.readFileSync(targetPath, "utf-8");

    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "existing.py",
      "--json",
    ]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("step_failed");
    // The user-facing message names the path and points to --force.
    expect(parsed.error).toContain("existing.py");
    expect(parsed.error).toContain("--force");
    // The underlying step reason is the typed `target_exists` code.
    const focalStep = parsed.completedSteps.find((s: any) => s.nodeId === "node_0002");
    expect(focalStep).toBeDefined();
    expect(focalStep.status).toBe("failed");
    expect(focalStep.reason).toContain("target_exists");

    // Crucially: the user's file is unchanged.
    const after = fs.readFileSync(targetPath, "utf-8");
    expect(after).toBe(before);
  });

  it("--force opts in to overwrite an existing target", () => {
    const targetPath = path.join(tempDir, "existing.py");
    fs.writeFileSync(targetPath, "# original\n");
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "existing.py",
      "--force",
    ]);
    expect(r.status).toBe(0);
    expect(fs.readFileSync(targetPath, "utf-8")).toBe('print("hello world")');
  });

  it("--target on a non-existent path writes without --force (default-deny only protects existing files)", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--target", "fresh/path/hello.py",
    ]);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, "fresh/path/hello.py"))).toBe(true);
  });

  it("--force without --target is rejected (no silent foot-gun)", () => {
    const r = runCli(tempDir, [
      "compile", "run", "node_0002",
      "--provider", "mock",
      "--force",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--force has no effect without --target");
  });
});
