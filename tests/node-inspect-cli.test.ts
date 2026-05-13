import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto node inspect <nodeId>` — Project Legend δ-1.
//
// Uses the mock provider for the LLM dispatch so the CLI exercise
// hits zero API. The mock echoes the user prompt back; we verify
// that the cache flow records it on disk under `node.translator`,
// that the second call reads from the cache (no fresh dispatch),
// and that --regenerate forces a re-run.

describe("onto node inspect (δ-1)", () => {
  let tempDir: string;
  let nodeId: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    // Create a target node with prompt + provides so the inspector
    // has substantive content to summarize.
    const created = runCli(tempDir, [
      "node",
      "create",
      "--label",
      "Compute fooling set",
      "--kind",
      "rule",
      "--level",
      "artifact",
      "--prompt",
      "Implements a max-fooling-set finder over a permutation grid.",
      "--provides",
      "solve_max_fooling_set",
      "--rules",
      "REQUIRE: returns clique as list",
    ]);
    expect(created.status).toBe(0);
    // node create has no --json today; parse the human output for
    // the assigned node id.
    const match = created.stdout.match(/Node:\s+(node_\w+)/);
    expect(match).not.toBeNull();
    nodeId = match![1];
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("dispatches on first call and caches the result", () => {
    const r = runCli(tempDir, [
      "node",
      "inspect",
      nodeId,
      "--provider",
      "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      ok: boolean;
      nodeId: string;
      cached: boolean;
      translator: { text: string; model: string; provider: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.cached).toBe(false);
    expect(parsed.translator.provider).toBe("mock");
    expect(parsed.translator.text.length).toBeGreaterThan(0);

    // Cache should be on disk on the node JSON.
    const nodePath = path.join(tempDir, ".ontology", "nodes", `${nodeId}.json`);
    const persisted = JSON.parse(fs.readFileSync(nodePath, "utf-8")) as {
      translator?: { text: string; sourceHash: string };
    };
    expect(persisted.translator).toBeDefined();
    expect(persisted.translator!.text).toBe(parsed.translator.text);
    expect(persisted.translator!.sourceHash).toHaveLength(64);
  });

  it("returns the cached translator on the second call without re-dispatching", () => {
    // First call seeds the cache.
    runCli(tempDir, ["node", "inspect", nodeId, "--provider", "mock", "--json"]);

    // Mutate the cached text directly to a sentinel so we can tell
    // a fresh dispatch from a cache hit.
    const nodePath = path.join(tempDir, ".ontology", "nodes", `${nodeId}.json`);
    const node = JSON.parse(fs.readFileSync(nodePath, "utf-8")) as Record<
      string,
      unknown
    >;
    const tr = node.translator as Record<string, unknown>;
    tr.text = "SENTINEL CACHED VALUE";
    fs.writeFileSync(nodePath, JSON.stringify(node));

    const r = runCli(tempDir, [
      "node",
      "inspect",
      nodeId,
      "--provider",
      "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      cached: boolean;
      translator: { text: string };
    };
    expect(parsed.cached).toBe(true);
    expect(parsed.translator.text).toBe("SENTINEL CACHED VALUE");
  });

  it("--regenerate forces a fresh dispatch even when the cache is valid", () => {
    // First call seeds the cache.
    runCli(tempDir, ["node", "inspect", nodeId, "--provider", "mock", "--json"]);

    // Plant a sentinel that a cache-hit would surface.
    const nodePath = path.join(tempDir, ".ontology", "nodes", `${nodeId}.json`);
    const node = JSON.parse(fs.readFileSync(nodePath, "utf-8")) as Record<
      string,
      unknown
    >;
    const tr = node.translator as Record<string, unknown>;
    tr.text = "SENTINEL CACHED VALUE";
    fs.writeFileSync(nodePath, JSON.stringify(node));

    const r = runCli(tempDir, [
      "node",
      "inspect",
      nodeId,
      "--provider",
      "mock",
      "--regenerate",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      cached: boolean;
      translator: { text: string };
    };
    expect(parsed.cached).toBe(false);
    expect(parsed.translator.text).not.toBe("SENTINEL CACHED VALUE");
  });

  it("auto-invalidates the cache when the node's prompt changes", () => {
    runCli(tempDir, ["node", "inspect", nodeId, "--provider", "mock", "--json"]);

    // Plant a sentinel + change the prompt via node update — the
    // sourceHash mismatch should force a re-dispatch.
    const nodePath = path.join(tempDir, ".ontology", "nodes", `${nodeId}.json`);
    const node = JSON.parse(fs.readFileSync(nodePath, "utf-8")) as Record<
      string,
      unknown
    >;
    const tr = node.translator as Record<string, unknown>;
    tr.text = "SENTINEL CACHED VALUE";
    fs.writeFileSync(nodePath, JSON.stringify(node));

    const update = runCli(tempDir, [
      "node",
      "update",
      nodeId,
      "--prompt",
      "DIFFERENT prompt that changes the sourceHash.",
      "--json",
    ]);
    expect(update.status).toBe(0);

    const r = runCli(tempDir, [
      "node",
      "inspect",
      nodeId,
      "--provider",
      "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      cached: boolean;
      translator: { text: string };
    };
    expect(parsed.cached).toBe(false);
    expect(parsed.translator.text).not.toBe("SENTINEL CACHED VALUE");
  });

  it("rejects a missing node id with a clear error", () => {
    const r = runCli(tempDir, [
      "node",
      "inspect",
      "node_does_not_exist",
      "--provider",
      "mock",
      "--json",
    ]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Node not found");
  });

  it("rejects an unsupported provider before any dispatch", () => {
    const r = runCli(tempDir, [
      "node",
      "inspect",
      nodeId,
      "--provider",
      "gemini",
      "--json",
    ]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Unsupported provider");
  });
});
