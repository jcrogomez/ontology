import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto compile run-batch` (Project Legend Phase β-1).
// The batch command walks multiple focals in one invocation, reusing
// the per-run persisted cache so shared upstream walks compile once and
// then short-circuit on cache hits.

function setupTwoArtifacts(tempDir: string): void {
  // canon (auto) ← domain ← leaf1 (code/python)
  //                       ← leaf2 (code/python)
  // Two artifact-bearing leaves share the domain parent. A batch over
  // both leaves should walk the upstream once across the two plans.
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Shared domain"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create",
    "--level", "artifact",
    "--kind", "artifact",
    "--manifestation", "code",
    "--language", "python",
    "--prompt", 'print("leaf one")',
  ]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create",
    "--level", "artifact",
    "--kind", "artifact",
    "--manifestation", "code",
    "--language", "python",
    "--prompt", 'print("leaf two")',
  ]).status).toBe(0);
  // node_0001 (domain) refines canon
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  // node_0002 (leaf1) refines node_0001
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
  // node_0003 (leaf2) refines node_0001
  expect(runCli(tempDir, ["node", "link", "--from", "node_0003", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
}

describe("onto compile run-batch", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    setupTwoArtifacts(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("compiles both artifacts under --all-artifacts and writes both files", () => {
    const r = runCli(tempDir, [
      "compile", "run-batch",
      "--all-artifacts",
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.focalCount).toBe(2);
    expect(parsed.okCount).toBe(2);
    expect(parsed.failedCount).toBe(0);

    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0002.py"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0003.py"))).toBe(true);
  });

  it("the second focal sees a cache hit on the shared upstream", () => {
    const r = runCli(tempDir, [
      "compile", "run-batch",
      "--all-artifacts",
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // The second focal in id order is node_0003. Its plan walks the same
    // canon + domain upstream that the first focal already compiled, so
    // those two steps must be cache hits.
    const second = parsed.results.find((x: any) => x.focalId === "node_0003");
    expect(second).toBeDefined();
    expect(second.steps).toBe(3); // canon + domain + leaf2
    expect(second.cacheHits).toBeGreaterThanOrEqual(2); // canon + domain shared with leaf1
  });

  it("only the unique upstream runs are persisted (no duplicates from shared parents)", () => {
    runCli(tempDir, ["compile", "run-batch", "--all-artifacts", "--provider", "mock"]);
    const runs = fs.readdirSync(path.join(tempDir, ".ontology/runs"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/runs", f), "utf-8")));
    // 4 distinct runs: canon (1) + domain (1) + leaf1 (1) + leaf2 (1).
    // If the cache were not shared we would see 6 (canon ×2, domain ×2).
    expect(runs.length).toBe(4);
    const byTarget = runs.reduce<Record<string, number>>((acc, r) => {
      acc[r.input.targetNodeId] = (acc[r.input.targetNodeId] ?? 0) + 1;
      return acc;
    }, {});
    expect(byTarget["node_0000_canon"]).toBe(1);
    expect(byTarget["node_0001"]).toBe(1);
    expect(byTarget["node_0002"]).toBe(1);
    expect(byTarget["node_0003"]).toBe(1);
  });

  it("compiles a specific subset under --nodes", () => {
    const r = runCli(tempDir, [
      "compile", "run-batch",
      "--nodes", "node_0002",
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.focalCount).toBe(1);
    expect(parsed.okCount).toBe(1);
    expect(parsed.results[0].focalId).toBe("node_0002");
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0002.py"))).toBe(true);
    // leaf2 was not in the batch and has no artifact.
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0003.py"))).toBe(false);
  });

  it("rejects an unknown id under --nodes with a clear message", () => {
    const r = runCli(tempDir, [
      "compile", "run-batch",
      "--nodes", "node_0002,node_xxxxx",
      "--provider", "mock",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Unknown node id");
    expect(r.stderr).toContain("node_xxxxx");
  });

  it("rejects when both --all-artifacts and --nodes are passed", () => {
    const r = runCli(tempDir, [
      "compile", "run-batch",
      "--all-artifacts",
      "--nodes", "node_0002",
      "--provider", "mock",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("mutually exclusive");
  });

  it("rejects when neither --all-artifacts nor --nodes is passed", () => {
    const r = runCli(tempDir, [
      "compile", "run-batch",
      "--provider", "mock",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("requires --all-artifacts or --nodes");
  });

  it("reports per-focal failure but continues the batch (exit 0 on partial)", () => {
    // Build a third leaf whose prompt is invalid python under the mock
    // identity functor: parse-check will reject it. The batch should
    // report ok=2 / failed=1, and the two passing artifacts must still
    // be on disk.
    expect(runCli(tempDir, ["node", "create",
      "--level", "artifact",
      "--kind", "artifact",
      "--manifestation", "code",
      "--language", "python",
      "--prompt", "Not valid python at all because of the prose",
    ]).status).toBe(0);
    runCli(tempDir, ["node", "link", "--from", "node_0004", "--to", "node_0001", "--type", "refines"]);

    const r = runCli(tempDir, [
      "compile", "run-batch",
      "--all-artifacts",
      "--provider", "mock",
      "--json",
    ]);
    // Partial success — overall ok is true, exit 0.
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.focalCount).toBe(3);
    expect(parsed.okCount).toBe(2);
    expect(parsed.failedCount).toBe(1);
    const failed = parsed.results.find((x: any) => !x.ok);
    expect(failed.focalId).toBe("node_0004");
    expect(failed.reason).toBe("step_failed");
  });

  it("exits 1 only when every focal failed", () => {
    // Replace both leaves with prose-not-python and rebuild a fresh batch.
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact", "--kind", "artifact",
        "--manifestation", "code", "--language", "python",
        "--prompt", "Not python prose.",
      ]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact", "--kind", "artifact",
        "--manifestation", "code", "--language", "python",
        "--prompt", "Also not python prose.",
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0003", "--to", "node_0001", "--type", "refines"]);

      const r = runCli(tmp2, [
        "compile", "run-batch",
        "--all-artifacts",
        "--provider", "mock",
        "--json",
      ]);
      expect(r.status).toBe(1);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.okCount).toBe(0);
      expect(parsed.failedCount).toBe(2);
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it("--all-artifacts on a project with zero code nodes reports an empty batch (exit 0)", () => {
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "just prose"]).status).toBe(0);

      const r = runCli(tmp2, [
        "compile", "run-batch",
        "--all-artifacts",
        "--provider", "mock",
        "--json",
      ]);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.focalCount).toBe(0);
    } finally {
      cleanupTempProject(tmp2);
    }
  });
});
