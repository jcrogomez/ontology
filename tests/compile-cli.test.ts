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

  it("threads upstream refinement parents into the run's contextHash, leaf inherits non-null", () => {
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const runs = fs.readdirSync(path.join(tempDir, ".ontology/runs"))
      .map(f => JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/runs", f), "utf-8")));
    const byTarget = Object.fromEntries(runs.map((r: any) => [r.input.targetNodeId, r]));
    // canon has no refinement parent → contextHash stays null.
    expect(byTarget["node_0000_canon"].input.contextHash).toBeNull();
    // The domain (node_0001) refines canon → contextHash set, ctx:hash:<sha>.
    expect(byTarget["node_0001"].input.contextHash).toMatch(/^ctx:hash:[0-9a-f]{64}$/);
    // The leaf (node_0002) refines node_0001 → its contextHash is distinct
    // from node_0001's (the upstream content differs).
    expect(byTarget["node_0002"].input.contextHash).toMatch(/^ctx:hash:[0-9a-f]{64}$/);
    expect(byTarget["node_0002"].input.contextHash).not.toBe(byTarget["node_0001"].input.contextHash);
  });

  it("changing an upstream node's prompt invalidates the leaf's run id", () => {
    // First compile under the original chain. Capture the leaf's run id.
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const runsDir = path.join(tempDir, ".ontology/runs");
    const runsBefore = fs.readdirSync(runsDir).map(f => JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf-8")));
    const leafBefore = runsBefore.find((r: any) => r.input.targetNodeId === "node_0002");
    expect(leafBefore).toBeDefined();

    // Mutate the domain (node_0001) prompt on disk and recompile. With the
    // upstream contextHash now in play, the leaf's run id must change even
    // though node_0002's own prompt did not.
    const domainPath = path.join(tempDir, ".ontology/nodes/node_0001.json");
    const domain = JSON.parse(fs.readFileSync(domainPath, "utf-8"));
    domain.prompt.raw = "Greeting domain — RENAMED";
    fs.writeFileSync(domainPath, JSON.stringify(domain, null, 2));

    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const runsAfter = fs.readdirSync(runsDir).map(f => JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf-8")));
    const leafIdsAfter = runsAfter.filter((r: any) => r.input.targetNodeId === "node_0002").map((r: any) => r.id);
    // The original leaf run is still on disk (provenance never lies), and a
    // new run with a different id is added because the upstream changed.
    expect(leafIdsAfter).toContain(leafBefore.id);
    expect(leafIdsAfter.length).toBeGreaterThanOrEqual(2);
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

      // Two-phase commit (Project Legend calibration finding §0):
      // writeArtifactPending stages the bytes at a sibling tmp; parse
      // failure rolls the staging file back. No artifact at the final
      // path; no compilation_run event for the focal. The user can
      // still inspect the rejected text via the persisted run record
      // (provenance is preserved).
      const artifactPath = path.join(tmp2, ".ontology/artifacts/generated/node_0002.py");
      expect(fs.existsSync(artifactPath)).toBe(false);
      // No leftover staging file either.
      const generatedDir = path.join(tmp2, ".ontology/artifacts/generated");
      const stragglers = fs.existsSync(generatedDir)
        ? fs.readdirSync(generatedDir).filter((f) => f.startsWith("node_0002") && f.includes(".tmp."))
        : [];
      expect(stragglers).toEqual([]);
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

  it("compiles via per-node model.ref when --provider is omitted", () => {
    // No --provider means the per-node routing path: each node's
    // model.ref is resolved against .ontology/models/registry.json.
    // The default ref is "mock_default", which the bootstrap registry
    // resolves to (provider=mock, name=deterministic-mock-model).
    const r = runCli(tempDir, ["compile", "run", "node_0002", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.steps).toHaveLength(3);
    // Inspect the run records to confirm the resolved model name made
    // it onto disk — distinct from the explicit --provider mock path.
    const runs = fs.readdirSync(path.join(tempDir, ".ontology/runs"))
      .map(f => JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/runs", f), "utf-8")));
    const focalRun = runs.find((rr: any) => rr.input.targetNodeId === "node_0002");
    expect(focalRun).toBeDefined();
    expect(focalRun.model.provider).toBe("mock");
    expect(focalRun.model.model).toBe("deterministic-mock-model");
  });

  it("per-node and explicit --provider mock paths produce DISTINCT runIds (different model.model)", () => {
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const overrideRunIds = new Set(fs.readdirSync(path.join(tempDir, ".ontology/runs")));
    runCli(tempDir, ["compile", "run", "node_0002"]); // per-node path
    const allRunIds = new Set(fs.readdirSync(path.join(tempDir, ".ontology/runs")));
    // Per-node path added 3 fresh records; the override-path records are
    // still on disk (provenance: nothing is deleted across paths).
    expect(allRunIds.size).toBe(overrideRunIds.size + 3);
  });

  it("human mode shows 'per-node (model.ref)' when --provider is omitted", () => {
    const r = runCli(tempDir, ["compile", "run", "node_0002"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Provider:  per-node (model.ref)");
  });

  it("PromptAST: markers in the prompt are stripped from the dispatch surface", () => {
    // Mock identity returns the dispatch prompt verbatim. If the parser
    // works, the artifact is the BODY (markers stripped); the run record's
    // promptHash is over the RAW (markers included), so an identical body
    // with no markers produces a DIFFERENT runId — provenance preserved.
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      const promptWithMarkers = "@requires: ConfigToken\n@provides: Greeting\nprint(\"ok\")";
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact",
        "--kind", "artifact",
        "--manifestation", "code",
        "--language", "python",
        "--prompt", promptWithMarkers,
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);

      runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock"]);

      // Artifact = body only (markers stripped).
      const artifact = fs.readFileSync(path.join(tmp2, ".ontology/artifacts/generated/node_0002.py"), "utf-8");
      expect(artifact).toBe('print("ok")');

      // Persisted run records the body as output.text (mock identity over
      // the dispatch surface), and hashes the raw prompt as promptHash.
      const runs = fs.readdirSync(path.join(tmp2, ".ontology/runs"))
        .map(f => JSON.parse(fs.readFileSync(path.join(tmp2, ".ontology/runs", f), "utf-8")));
      const focalRun = runs.find((r: any) => r.input.targetNodeId === "node_0002");
      expect(focalRun).toBeDefined();
      expect(focalRun.output.text).toBe('print("ok")');
      // The hash includes the marker lines — so a prompt of just 'print("ok")'
      // would produce a different hash, even though the body is identical.
      expect(focalRun.input.promptHash).toMatch(/^prompt:hash:/);
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it.runIf(PYTHON_AVAILABLE)("--runtime-check passes when the artifact runs (mock identity, valid Python)", () => {
    // The leaf prompt is `print("hello world")` — runs cleanly under python3.
    const r = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock", "--runtime-check"]);
    expect(r.status).toBe(0);
    const artifact = fs.readFileSync(path.join(tempDir, ".ontology/artifacts/generated/node_0002.py"), "utf-8");
    expect(artifact).toBe('print("hello world")');
  });

  it.runIf(PYTHON_AVAILABLE)("--runtime-check rejects an artifact that parses but raises NameError", () => {
    // Mock identity returns the prompt verbatim. The prompt parses but
    // references an undefined symbol → python3 exits non-zero.
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact",
        "--kind", "artifact",
        "--manifestation", "code",
        "--language", "python",
        "--prompt", "undefined_symbol_42",  // parses, NameError at runtime
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
      const r = runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock", "--runtime-check"]);
      expect(r.status).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/runtime_failed|runtime failed/i);
      // Without --runtime-check, the same project should compile cleanly
      // (the artifact parses; the runtime check is what catches it).
      const r2 = runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock"]);
      expect(r2.status).toBe(0);
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it("intent gate aborts compile when the artifact violates a FORBID rule on the focal", () => {
    // The mock LLM returns the prompt verbatim for task=code_sketch. So if
    // the prompt contains a phrase that the focal's rules FORBID, the
    // artifact will too — and the validator should catch it before the
    // compile is allowed to claim success. This is the §1 gate in action.
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, [
        "node", "create",
        "--level", "artifact",
        "--kind", "artifact",
        "--manifestation", "code",
        "--language", "python",
        // The artifact's own prompt mentions a forbidden token — the mock
        // will echo it verbatim, the validator will catch it.
        "--prompt", "print('uses banned_phrase here')",
        "--rules", "FORBID: banned_phrase",
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
      const r = runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
      expect(r.status).toBe(1);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.reason).toBe("step_failed");
      expect(parsed.error).toContain("Intent validation failed");
      expect(parsed.error).toContain("banned_phrase");
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it("intent gate passes a clean compile and surfaces no violations", () => {
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, [
        "node", "create",
        "--level", "artifact",
        "--kind", "artifact",
        "--manifestation", "code",
        "--language", "python",
        "--prompt", "print('clean output')",
        "--rules", "FORBID: definitely_not_present",
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
      const r = runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(true);
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it.runIf(PYTHON_AVAILABLE)("--runtime-check honors --runtime-check-timeout-ms and reports timeouts as runtime_failed", () => {
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact",
        "--kind", "artifact",
        "--manifestation", "code",
        "--language", "python",
        "--prompt", "import time; time.sleep(60)",
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
      const r = runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock", "--runtime-check", "--runtime-check-timeout-ms", "300"]);
      expect(r.status).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/runtime_failed|timeout/i);
    } finally {
      cleanupTempProject(tmp2);
    }
  });
});
