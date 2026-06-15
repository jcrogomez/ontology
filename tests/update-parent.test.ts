import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  updateNodeParent,
  wouldCreateCycle,
} from "../src/kernel/core/nodes/update-parent.js";
import { createNode } from "../src/kernel/core/nodes/create-node.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";
import { readState } from "../src/kernel/core/state/state-store.js";

// Kernel-level coverage for the `node_update_parent` plasticity primitive
// (Hierarchizer §10 item 3). Sets up a small parent/child/grandchild
// chain via the kernel (createNode reads process.cwd(), so the test
// chdir's into the temp project first), then exercises the kernel
// function. The cycle-detection helper is tested in isolation against
// the same chain.

describe("updateNodeParent — kernel reparenting", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    // chdir BEFORE createNode — the kernel reads from process.cwd().
    process.chdir(tempDir);
    // Build canon → A → B → C, plus D as a sibling of A under canon.
    createNode({ level: "domain", kind: "entity", label: "A", prompt: "node A" });
    createNode({
      parentNodeId: "node_0001",
      level: "artifact", kind: "artifact", label: "B", prompt: "node B",
    });
    createNode({
      parentNodeId: "node_0002",
      level: "artifact", kind: "artifact", label: "C", prompt: "node C",
    });
    createNode({ level: "domain", kind: "entity", label: "D", prompt: "node D" });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tempDir);
  });

  // ── happy path ─────────────────────────────────────────────────────

  it("reparents a node, re-hashes it, and emits node_parent_updated", () => {
    const before = loadNodeById("node_0003", tempDir)!;
    expect(before.graph.parentId).toBe("node_0002");
    const beforeHash = before.integrity.hash;
    const stateBefore = readState(tempDir);

    const result = updateNodeParent({
      id: "node_0003",
      newParentNodeId: "node_0004",
      cwd: tempDir,
    });

    expect(result.node.graph.parentId).toBe("node_0004");
    expect(result.node.integrity.hash).not.toBe(beforeHash);
    expect(result.event.eventType).toBe("node_parent_updated");
    expect(result.event.payload).toMatchObject({
      nodeId: "node_0003",
      oldParentId: "node_0002",
      newParentId: "node_0004",
      oldHash: beforeHash,
      newHash: result.node.integrity.hash,
    });

    // State sequence advanced and node JSON on disk reflects the change.
    const stateAfter = readState(tempDir);
    expect(stateAfter.eventCount).toBe(stateBefore.eventCount + 1);
    expect(stateAfter.lastEventId).toBe(result.event.eventId);

    const reread = loadNodeById("node_0003", tempDir)!;
    expect(reread.graph.parentId).toBe("node_0004");
    expect(reread.integrity.hash).toBe(result.node.integrity.hash);
  });

  it("preserves every other field byte-identical (only graph.parentId changes)", () => {
    const before = loadNodeById("node_0003", tempDir)!;
    updateNodeParent({
      id: "node_0003",
      newParentNodeId: "node_0004",
      cwd: tempDir,
    });
    const after = loadNodeById("node_0003", tempDir)!;

    expect(after.label).toBe(before.label);
    expect(after.prompt).toEqual(before.prompt);
    expect(after.rules).toEqual(before.rules);
    expect(after.context).toEqual(before.context);
    expect(after.coordinates).toEqual(before.coordinates);
    expect(after.outputs).toEqual(before.outputs);
    expect(after.graph.children).toEqual(before.graph.children);
    expect(after.graph.depth).toBe(before.graph.depth);
  });

  it("folds eventMetadata into the event payload (e.g. sourceProposalId)", () => {
    const result = updateNodeParent({
      id: "node_0003",
      newParentNodeId: "node_0004",
      cwd: tempDir,
      eventMetadata: { sourceProposalId: "proposal_0042" },
    });
    expect(result.event.payload).toMatchObject({
      sourceProposalId: "proposal_0042",
      nodeId: "node_0003",
    });
  });

  // ── refusal paths ──────────────────────────────────────────────────

  it("throws when the node does not exist", () => {
    expect(() =>
      updateNodeParent({
        id: "node_9999",
        newParentNodeId: "node_0001",
        cwd: tempDir,
      }),
    ).toThrow(/Node not found: node_9999/);
  });

  it("throws when the new parent does not exist", () => {
    expect(() =>
      updateNodeParent({
        id: "node_0003",
        newParentNodeId: "node_9999",
        cwd: tempDir,
      }),
    ).toThrow(/New parent node not found: node_9999/);
  });

  it("throws on identity reparenting (node to itself)", () => {
    expect(() =>
      updateNodeParent({
        id: "node_0003",
        newParentNodeId: "node_0003",
        cwd: tempDir,
      }),
    ).toThrow(/Cannot reparent node node_0003 to itself/);
  });

  it("throws on no-op reparenting (already the parent)", () => {
    // node_0003's parent is already node_0002.
    expect(() =>
      updateNodeParent({
        id: "node_0003",
        newParentNodeId: "node_0002",
        cwd: tempDir,
      }),
    ).toThrow(/already a child of node_0002/);
  });

  it("throws when reparenting would create a cycle (parent under its descendant)", () => {
    // node_0002 is currently the parent of node_0003.
    // Reparenting node_0002 under node_0003 would close a cycle.
    expect(() =>
      updateNodeParent({
        id: "node_0002",
        newParentNodeId: "node_0003",
        cwd: tempDir,
      }),
    ).toThrow(/would create a cycle/);
  });

  it("does NOT mutate disk when validation fails (atomic-on-failure)", () => {
    const before = loadNodeById("node_0003", tempDir)!;
    const stateBefore = readState(tempDir);

    expect(() =>
      updateNodeParent({
        id: "node_0003",
        newParentNodeId: "node_9999",
        cwd: tempDir,
      }),
    ).toThrow();

    const after = loadNodeById("node_0003", tempDir)!;
    expect(after.integrity.hash).toBe(before.integrity.hash);
    expect(after.graph.parentId).toBe(before.graph.parentId);
    expect(readState(tempDir).eventCount).toBe(stateBefore.eventCount);
  });
});

describe("wouldCreateCycle — pure descendant walk", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    process.chdir(tempDir);
    createNode({ level: "domain", kind: "entity", label: "A", prompt: "A" });
    createNode({
      parentNodeId: "node_0001",
      level: "artifact", kind: "artifact", label: "B", prompt: "B",
    });
    createNode({
      parentNodeId: "node_0002",
      level: "artifact", kind: "artifact", label: "C", prompt: "C",
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tempDir);
  });

  it("returns true when the node would be reparented under itself", () => {
    expect(wouldCreateCycle("node_0002", "node_0002", tempDir)).toBe(true);
  });

  it("returns true when the new parent is a descendant of the node", () => {
    // node_0003 is a descendant of node_0002 via node_0002 → node_0003.
    // Reparenting node_0002 under node_0003 would close a cycle.
    expect(wouldCreateCycle("node_0002", "node_0003", tempDir)).toBe(true);
  });

  it("returns false when the new parent is unrelated", () => {
    // node_0001 is the (current) ancestor of node_0002. Reparenting
    // node_0003 under node_0001 is moving up — no cycle.
    expect(wouldCreateCycle("node_0003", "node_0001", tempDir)).toBe(false);
  });

  it("returns false when reparenting onto a sibling (no descendant relationship)", () => {
    // node_0001 and node_0002: node_0002 is the descendant. Reparenting
    // node_0002 onto a fresh sibling of node_0001 (canon) would be fine
    // — there's no canon-level reparent here, so we test with the only
    // canon-children setup we have: reparent node_0003 onto canon's own root.
    const root = readState(tempDir).rootNodeId!;
    expect(wouldCreateCycle("node_0003", root, tempDir)).toBe(false);
  });
});
