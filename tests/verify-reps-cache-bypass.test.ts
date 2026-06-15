import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { createNode } from "../src/kernel/core/nodes/create-node.js";
import { verifyHomeomorphismCommand } from "../src/surfaces/commands/verify/homeomorphism.js";
import { getOntologyPaths } from "../src/kernel/core/project/paths.js";

// End-to-end integration test for the `--reps` cache-bypass fix
// (review §3 / commit 5d70f3b). The bug this test guards against:
// `verifyOne` was called N times with byte-identical options and the
// deterministic run-cache (computeRunId hashes input+model) returned
// rep 1's persisted text for every later rep. All N reps ended up
// identical, the aggregator folded N copies of the same value, and
// the variance-defang purpose of --reps could not surface.
//
// The fix folds a distinct per-rep token into the run-cache
// contextHash. This test confirms the binary actually does what the
// unit-tested helper promises: a `--reps 3` sweep produces three
// distinct persisted run records on disk, not one — closing the
// "tests pass but the integration doesn't" gap that the original bug
// exposed.
//
// Mock provider is used deliberately. For task=code_sketch the mock
// is the identity functor (returns the prompt verbatim), so all reps
// produce IDENTICAL output text. That is the strongest possible test
// of cache-bypass: if even an identity-output run produces three
// distinct runIds + three distinct persisted records, the cache-
// bypass machinery is mechanically working. (Variance defang itself
// is provider-dependent and out of scope here; this test pins the
// dispatcher path, not the LLM behaviour.)

describe("--reps cache-bypass — end-to-end integration", () => {
  let tempDir: string;
  let originalCwd: string;
  let sourcePath: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    process.chdir(tempDir);

    // A tiny TypeScript source file the node will "regenerate". The
    // mock provider's identity behavior means the regen text equals
    // the dispatched prompt verbatim; verify-homeomorphism still
    // computes the distance metrics, which is fine.
    sourcePath = path.join(tempDir, "fixture.ts");
    fs.writeFileSync(sourcePath, "export const foo = 42;\n", "utf-8");

    // Create the artifact node. `manifestation: "code"` + `language:
    // "typescript"` + `sourceFiles: [...]` are the three fields
    // verify-homeomorphism reads to know "what to regenerate against".
    createNode({
      level: "artifact",
      kind: "artifact",
      label: "Fixture",
      prompt: "export const foo = 42;",
      manifestation: "code",
      language: "typescript",
      sourceFiles: [sourcePath],
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tempDir);
  });

  function listRunIds(): string[] {
    const runsDir = getOntologyPaths(tempDir).runsDir;
    if (!fs.existsSync(runsDir)) return [];
    return fs
      .readdirSync(runsDir)
      .filter((f) => f.startsWith("run_") && f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  }

  it("--reps 1 (baseline) produces exactly one persisted run", async () => {
    expect(listRunIds()).toEqual([]);
    await verifyHomeomorphismCommand("node_0001", {
      provider: "mock",
      reps: 1,
      noLock: true,
      json: true,
    });
    expect(listRunIds()).toHaveLength(1);
  });

  it("--reps 3 produces THREE distinct persisted runs (cache-bypass active)", async () => {
    expect(listRunIds()).toEqual([]);
    await verifyHomeomorphismCommand("node_0001", {
      provider: "mock",
      reps: 3,
      aggregator: "median",
      noLock: true,
      json: true,
    });
    const runs = listRunIds();
    // The core assertion: three distinct records. Before the cache fix
    // this would have been one — every rep collapsed onto rep 1's id.
    expect(runs).toHaveLength(3);
    expect(new Set(runs).size).toBe(3);
  });

  it("--reps 3 — every persisted run has a distinct input.contextHash", async () => {
    await verifyHomeomorphismCommand("node_0001", {
      provider: "mock",
      reps: 3,
      noLock: true,
      json: true,
    });
    const runsDir = getOntologyPaths(tempDir).runsDir;
    const contextHashes = listRunIds().map((id) => {
      const r = JSON.parse(
        fs.readFileSync(path.join(runsDir, `${id}.json`), "utf-8"),
      ) as { input: { contextHash: string | null } };
      return r.input.contextHash;
    });
    // The rep-token fold lives in contextHash; distinct contextHashes
    // are the *mechanical* proof that the bypass token reached the
    // hasher. Null hashes (legacy single-draw runs with no upstream
    // and no grounding) would collide silently — so we also assert
    // non-null.
    for (const h of contextHashes) expect(h).not.toBeNull();
    expect(new Set(contextHashes).size).toBe(3);
  });

  it("the rep-token is the ONLY difference across reps (promptHash same, contextHash distinct)", async () => {
    await verifyHomeomorphismCommand("node_0001", {
      provider: "mock",
      reps: 3,
      noLock: true,
      json: true,
    });
    const runsDir = getOntologyPaths(tempDir).runsDir;
    const records = listRunIds().map(
      (id) =>
        JSON.parse(fs.readFileSync(path.join(runsDir, `${id}.json`), "utf-8")) as {
          input: {
            promptHash: string;
            contextHash: string | null;
            task: string;
          };
          model: { provider: string; model: string };
          output: { text: string };
        },
    );
    // Same promptHash across reps (the source of variance is the rep
    // token folded into contextHash, NOT the prompt body).
    const promptHashes = new Set(records.map((r) => r.input.promptHash));
    expect(promptHashes.size).toBe(1);
    // Same task across reps.
    const tasks = new Set(records.map((r) => r.input.task));
    expect(tasks.size).toBe(1);
    // Same model identity across reps.
    const models = new Set(records.map((r) => `${r.model.provider} ${r.model.model}`));
    expect(models.size).toBe(1);
    // Mock provider is the identity functor — same output text every rep.
    const outputs = new Set(records.map((r) => r.output.text));
    expect(outputs.size).toBe(1);
    // …but DISTINCT contextHashes — the bypass token did its job. This
    // is the precise mechanical assertion: the per-rep token reached
    // the run-input hasher and produced distinct cache keys despite
    // every other input being byte-identical.
    const ctxHashes = new Set(records.map((r) => r.input.contextHash));
    expect(ctxHashes.size).toBe(3);
  });

  it("--reps 2 with default median produces 2 distinct records (no even-N silent collapse)", async () => {
    // Even-N median synthesises a midpoint and emits a console.warn,
    // but the underlying cache-bypass still has to dispatch N times.
    await verifyHomeomorphismCommand("node_0001", {
      provider: "mock",
      reps: 2,
      noLock: true,
      json: true,
    });
    expect(listRunIds()).toHaveLength(2);
  });
});
