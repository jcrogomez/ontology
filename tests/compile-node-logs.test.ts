// Targeted tests for the EffectWithLog refactor of compileNode.
// The existing compile-cli tests assert behavior end-to-end. These tests
// cover the new diagnostic surface: logs are populated on success AND on
// failure, with the expected breadcrumbs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { compileNode } from "../src/forward/compile/compile-node.js";
import { loadNodeById, loadModelsRegistry } from "../src/kernel/core/project/load.js";

function buildHelloWorldFixture(tempDir: string) {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create",
    "--level", "artifact",
    "--kind", "artifact",
    "--manifestation", "code",
    "--language", "python",
    "--prompt", 'print("ok")',
  ]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
}

describe("compileNode — EffectWithLog diagnostic logs", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
    buildHelloWorldFixture(tempDir);
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("populates `logs` on a successful compile (every sub-step contributes)", async () => {
    const focal = loadNodeById("node_0002", tempDir);
    expect(focal).not.toBeNull();
    if (!focal) return;
    const registry = loadModelsRegistry(tempDir);
    const r = await compileNode({
      node: focal,
      provider: "mock",
      cwd: tempDir,
      registry,
    });
    expect(r.ok).toBe(true);
    expect(r.logs.length).toBeGreaterThan(5);
    const messages = r.logs.map((l) => l.message);
    expect(messages.join("\n")).toMatch(/resolveModel/);
    expect(messages.join("\n")).toMatch(/buildPrelude/);
    expect(messages.join("\n")).toMatch(/checkCache/);
    expect(messages.join("\n")).toMatch(/writeArtifact/);
    expect(messages.join("\n")).toMatch(/emitEvent/);
  });

  it("populates `logs` on failure too — diagnostic survives the rejection (axiom 9 spirit)", async () => {
    // Build a focal whose model.ref does not resolve. The pipeline halts
    // at resolveModel; the prelude logs preceding the failure (and the
    // failure log itself) are still returned.
    const focal = loadNodeById("node_0002", tempDir);
    expect(focal).not.toBeNull();
    if (!focal) return;
    // No `provider` override, an empty registry → ref_not_found.
    const r = await compileNode({
      node: focal,
      cwd: tempDir,
      registry: { models: [] },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("model_ref_unresolved");
    expect(r.logs.length).toBeGreaterThan(0);
    // The failure log carries an `error` level entry.
    expect(r.logs.some((l) => l.level === "error")).toBe(true);
  });

  it("logs differ between cache hit and cache miss for the same focal", async () => {
    const focal = loadNodeById("node_0002", tempDir);
    expect(focal).not.toBeNull();
    if (!focal) return;
    const registry = loadModelsRegistry(tempDir);
    const r1 = await compileNode({ node: focal, provider: "mock", cwd: tempDir, registry });
    const r2 = await compileNode({ node: focal, provider: "mock", cwd: tempDir, registry });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const allMessages2 = r2.logs.map((l) => l.message).join("\n");
    expect(allMessages2).toMatch(/checkCache: hit/);
    expect(allMessages2).toMatch(/dispatch: skipped \(cache hit\)/);
  });

  it("`onto compile run` JSON output does NOT serialise logs by default (kept internal for now)", () => {
    // A future PR may surface logs through `--verbose`; the default JSON
    // shape stays narrow so existing consumers don't see new keys.
    const r = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // `steps[i]` mirrors CompilePlanStepResult, not CompileNodeResult — we
    // explicitly verify the legacy shape has no `logs` leak. (compile-cli
    // tests pin everything else.)
    for (const s of parsed.steps) {
      expect("logs" in s).toBe(false);
    }
  });
});
