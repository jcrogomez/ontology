import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

const PYTHON_AVAILABLE = (() => {
  const r = spawnSync("python3", ["--version"], { encoding: "utf-8" });
  return !r.error && r.status === 0;
})();

// End-to-end coverage of `onto compile run <nodeId>`. The fixture builds a
// minimal canon -> domain -> code/python chain and verifies that compiling
// produces a working artifact on disk, that the audit chain (compilation_run
// events, persisted runs) is intact, and that re-running is a cache hit.

function setupHelloWorld(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greeting domain"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create",
    "--level", "artifact",
    "--kind", "artifact",
    "--manifestation", "code",
    "--language", "python",
    "--prompt", 'print("hello world")',
  ]).status).toBe(0);
  // node_0001 (domain) refines canon, node_0002 (artifact) refines node_0001
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
}

describe("onto compile run", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    setupHelloWorld(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("produces a working artifact at .ontology/artifacts/generated/<nodeId>.<ext>", () => {
    const r = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.focalArtifact.path).toBe(".ontology/artifacts/generated/node_0002.py");

    const artifactPath = path.join(tempDir, parsed.focalArtifact.path);
    expect(fs.existsSync(artifactPath)).toBe(true);
    const content = fs.readFileSync(artifactPath, "utf-8");
    expect(content).toBe('print("hello world")');
  });

  it("emits a compilation_run event per step", () => {
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8")
      .trim().split("\n").map(l => JSON.parse(l));
    const compileEvents = events.filter(e => e.eventType === "compilation_run");
    expect(compileEvents.length).toBe(3); // canon, domain, artifact
    // Each event ties an artifact path back to its node and run id.
    for (const e of compileEvents) {
      expect(e.payload.nodeId).toBeDefined();
      expect(e.payload.runId).toMatch(/^run_[0-9a-f]{8}$/);
      expect(e.payload.artifactRelativePath).toContain(".ontology/artifacts/generated");
    }
  });

  it("each step also produces a persisted run record", () => {
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const runs = fs.readdirSync(path.join(tempDir, ".ontology/runs"));
    expect(runs.length).toBe(3);
    expect(runs.every(f => /^run_[0-9a-f]{8}\.json$/.test(f))).toBe(true);
  });

  it("re-running the compile is a cache hit (no new run records)", () => {
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const before = fs.readdirSync(path.join(tempDir, ".ontology/runs")).sort();
    const r2 = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
    expect(r2.status).toBe(0);
    const parsed = JSON.parse(r2.stdout);
    // Every step is cached on the second run.
    expect(parsed.steps.every((s: any) => s.cached === true)).toBe(true);
    const after = fs.readdirSync(path.join(tempDir, ".ontology/runs")).sort();
    expect(after).toEqual(before);
  });

  it("the focal artifact is byte-identical to the focal node's prompt under the mock identity functor", () => {
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const artifact = fs.readFileSync(path.join(tempDir, ".ontology/artifacts/generated/node_0002.py"), "utf-8");
    const node = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    expect(artifact).toBe(node.prompt.raw);
  });

  it("strips a markdown fence from the dispatcher response when manifestation=code", () => {
    const fenced = 'Here you go:\n```python\nprint("from fence")\n```\nHope it helps!';
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact",
        "--kind", "artifact",
        "--manifestation", "code",
        "--language", "python",
        "--prompt", fenced,
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
      runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock"]);
      const artifact = fs.readFileSync(path.join(tmp2, ".ontology/artifacts/generated/node_0002.py"), "utf-8");
      // The mock returns the prompt verbatim; the extractor projects out the
      // fenced body. Provenance: the persisted run still carries the raw
      // fenced text — the projection lives between run.text and disk.
      expect(artifact).toBe('print("from fence")');
      const runs = fs.readdirSync(path.join(tmp2, ".ontology/runs"));
      const focalRun = runs.map(f => JSON.parse(fs.readFileSync(path.join(tmp2, ".ontology/runs", f), "utf-8")))
                           .find((r: any) => r.input.targetNodeId === "node_0002");
      expect(focalRun.output.text).toBe(fenced);
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it("the artifact extension follows the manifestation+language map", () => {
    // node_0001 has default manifestation=intent, no language → .txt
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0001.txt"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, ".ontology/artifacts/generated/node_0002.py"))).toBe(true);
  });

  it("validate still passes after compile", () => {
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    expect(runCli(tempDir, ["validate"]).status).toBe(0);
  });

  it("exits 1 with a clear message when the focal node does not exist", () => {
    const r = runCli(tempDir, ["compile", "run", "node_xxxxx"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Node not found");
  });

  it("rejects an unsupported provider", () => {
    const r = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "openai"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Unsupported provider");
  });

  it.runIf(PYTHON_AVAILABLE)("fails the compile when the artifact does not parse for the declared language", () => {
    // Build a fresh project where the leaf node's prompt is plain prose,
    // not python. With the mock provider (identity functor), the artifact
    // text equals the prompt, so the python parse-check must reject it.
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact",
        "--kind", "artifact",
        "--manifestation", "code",
        "--language", "python",
        "--prompt", "Here you go:\nIn this example, we've:",
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);

      const r = runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock"]);
      expect(r.status).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/validate_failed|python parse failed/i);

      // The artifact was written before validation (so the user can inspect),
      // but no compilation_run event was emitted for the focal step.
      const artifactPath = path.join(tmp2, ".ontology/artifacts/generated/node_0002.py");
      expect(fs.existsSync(artifactPath)).toBe(true);
      const events = fs.readFileSync(path.join(tmp2, ".ontology/events.jsonl"), "utf-8")
        .trim().split("\n").map(l => JSON.parse(l));
      const focalCompileEvent = events.find(e => e.eventType === "compilation_run" && e.payload.nodeId === "node_0002");
      expect(focalCompileEvent).toBeUndefined();
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it("prints the focal-marked step list in human mode", () => {
    const r = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("=== ONTOLOGY COMPILE ===");
    expect(r.stdout).toContain("Focal:     node_0002");
    expect(r.stdout).toContain("* "); // focal marker
    expect(r.stdout).toContain("Focal artifact:");
  });
});
