import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { runFromWalker } from "../src/surfaces/walker/actions/run-from-walker.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";

// Tests the pure walker action — same approach as tests for proposeFromDraft.
// Spawning the actual TUI is out of scope (ink-testing-library does not
// replicate raw-mode timing well enough); this exercises the data path that
// the `:run` command flows through.

describe("runFromWalker", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("dispatches against the focal's assembled context with mock by default and persists the run", async () => {
    const focal = loadNodeById("node_0000_canon", tempDir)!;
    const result = await runFromWalker({ focal, cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runId).toMatch(/^run_[0-9a-f]{8}$/);
    expect(result.cached).toBe(false);
    expect(result.provider).toBe("mock");
    expect(result.responseText.length).toBeGreaterThan(0);

    const filePath = path.join(tempDir, ".ontology/runs", `${result.runId}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("a second invocation with identical inputs hits the cache and returns the same runId", async () => {
    const focal = loadNodeById("node_0000_canon", tempDir)!;
    const first = await runFromWalker({ focal, cwd: tempDir });
    const second = await runFromWalker({ focal, cwd: tempDir });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.runId).toBe(first.runId);
    expect(second.cached).toBe(true);
  });

  it("appends a run_persisted event to the temporal log", async () => {
    const focal = loadNodeById("node_0000_canon", tempDir)!;
    await runFromWalker({ focal, cwd: tempDir });
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8");
    expect(events).toContain("\"eventType\":\"run_persisted\"");
  });

  it("rejects an unsupported provider with a clear message (no dispatch)", async () => {
    const focal = loadNodeById("node_0000_canon", tempDir)!;
    const result = await runFromWalker({ focal, cwd: tempDir, provider: "openai" as any });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("unsupported provider");
  });

  it("does NOT mutate nodes/ or edges.jsonl (only events log + runs/)", async () => {
    const nodesBefore = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    const edgesBefore = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    const focal = loadNodeById("node_0000_canon", tempDir)!;
    await runFromWalker({ focal, cwd: tempDir });
    expect(fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort()).toEqual(nodesBefore);
    expect(fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8")).toBe(edgesBefore);
  });

  it("returns an error result (not throw) when the focal id was deleted between calls", async () => {
    // Create a child node, then take a snapshot of its OntologyNode in memory,
    // then delete the file from disk. runFromWalker should fail at
    // assembleContext (not throw) because the node's parent reference is now broken.
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "tmp"]);
    const focal = loadNodeById("node_0001", tempDir)!;
    fs.unlinkSync(path.join(tempDir, ".ontology/nodes/node_0001.json"));

    const result = await runFromWalker({ focal, cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.toLowerCase()).toContain("failed to assemble context");
  });

  it("populates the log with a breadcrumb per executed step on the happy path", async () => {
    const focal = loadNodeById("node_0000_canon", tempDir)!;
    const result = await runFromWalker({ focal, cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const messages = result.log.map((e) => e.message);
    // First-run path runs all four steps. Step labels follow the
    // "<step>: <detail>" convention used by every EffectWithLog wrapper
    // in this action.
    expect(messages.some((m) => m.startsWith("assembleContext: ok"))).toBe(true);
    expect(messages.some((m) => m.startsWith("cacheLookup: miss"))).toBe(true);
    expect(messages.some((m) => m.startsWith("dispatch[provider="))).toBe(true);
    expect(messages.some((m) => m.startsWith("createPersistedRun: ok"))).toBe(true);
    // No error-level entries on a happy run.
    expect(result.log.every((e) => e.level === "info")).toBe(true);
  });

  it("emits a cacheLookup: hit breadcrumb on the second invocation and skips dispatch", async () => {
    const focal = loadNodeById("node_0000_canon", tempDir)!;
    await runFromWalker({ focal, cwd: tempDir });
    const second = await runFromWalker({ focal, cwd: tempDir });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const messages = second.log.map((e) => e.message);
    expect(messages.some((m) => m.startsWith("cacheLookup: hit"))).toBe(true);
    // Cache short-circuits before dispatch, so no dispatch/persist
    // breadcrumbs should appear on a cache-hit run.
    expect(messages.some((m) => m.startsWith("dispatch["))).toBe(false);
    expect(messages.some((m) => m.startsWith("createPersistedRun:"))).toBe(false);
  });

  it("preserves the failing step's error breadcrumb when the run aborts", async () => {
    // Same fixture as the deleted-focal test above, but checking that the
    // diagnostic record contains a structured error entry the UI could
    // surface, rather than only the public message string.
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "tmp"]);
    const focal = loadNodeById("node_0001", tempDir)!;
    fs.unlinkSync(path.join(tempDir, ".ontology/nodes/node_0001.json"));
    const result = await runFromWalker({ focal, cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const errorEntries = result.log.filter((e) => e.level === "error");
    expect(errorEntries.length).toBeGreaterThan(0);
    expect(errorEntries[0]!.message).toContain("assembleContext: failed");
  });
});
