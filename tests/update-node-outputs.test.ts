import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { createNode } from "../src/kernel/core/nodes/create-node.js";
import { updateNode } from "../src/kernel/core/nodes/update-node.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";
import { readState } from "../src/kernel/core/state/state-store.js";

// Coverage for updateNode's `outputsFiles` option — the governed re-point of
// a node's compiled output files (used by the source-tree path migration).
// It must replace outputs.files, re-hash, emit node_updated, and leave the
// contract (provides) and every other field byte-identical.

describe("updateNode — outputsFiles re-point", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    process.chdir(tempDir);
    createNode({
      level: "artifact",
      kind: "artifact",
      label: "mover",
      prompt: "a node whose output file moves",
      provides: ["doThing"],
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tempDir);
  });

  it("replaces outputs.files, re-hashes, emits node_updated, preserves the contract", () => {
    const before = loadNodeById("node_0001", tempDir)!;
    const beforeHash = before.integrity.hash;
    const beforeProvides = JSON.stringify(before.context.provides);
    const stateBefore = readState(tempDir);

    const { node, event } = updateNode({
      id: "node_0001",
      outputsFiles: ["src/forward/compile/mover.ts"],
      cwd: tempDir,
      eventMetadata: { source: "path-migration" },
    });

    expect(node.outputs.files).toEqual(["src/forward/compile/mover.ts"]);
    expect(node.integrity.hash).not.toBe(beforeHash);
    // contract + label untouched
    expect(JSON.stringify(node.context.provides)).toBe(beforeProvides);
    expect(node.label).toBe("mover");
    // governed: a node_updated event with old/new hashes + the source tag
    expect(event.eventType).toBe("node_updated");
    expect(event.payload.oldHash).toBe(beforeHash);
    expect(event.payload.newHash).toBe(node.integrity.hash);
    expect(event.payload.source).toBe("path-migration");
    expect(readState(tempDir).eventCount).toBe(stateBefore.eventCount + 1);

    // persisted to disk
    expect(loadNodeById("node_0001", tempDir)!.outputs.files).toEqual([
      "src/forward/compile/mover.ts",
    ]);
  });

  it("preserves outputs.files when outputsFiles is omitted", () => {
    const before = loadNodeById("node_0001", tempDir)!;
    updateNode({ id: "node_0001", label: "renamed", cwd: tempDir });
    const after = loadNodeById("node_0001", tempDir)!;
    expect(after.outputs.files).toEqual(before.outputs.files);
  });
});
