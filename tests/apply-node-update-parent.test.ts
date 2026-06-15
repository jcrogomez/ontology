import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { createNode } from "../src/kernel/core/nodes/create-node.js";
import { updateNode } from "../src/kernel/core/nodes/update-node.js";
import {
  applyProposal,
  createProposal,
} from "../src/kernel/core/proposals/persist.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";
import type { Proposal } from "../src/kernel/schemas/ontology.js";

// End-to-end coverage for the node_update_parent proposal lifecycle
// (Hierarchizer §10 item 3 — apply path). Mirrors the apply-edge-create
// pattern: dual-hash stale detection, missing-endpoint refusal, cycle/
// branch refusal at apply time, and the happy path that produces the
// kernel mutation event.

function createReparentProposal(args: {
  nodeId: string;
  newParentNodeId: string;
  nodeHash: string;
  newParentHash: string;
  cwd: string;
}): Proposal {
  const { proposal } = createProposal({
    mutation: {
      kind: "node_update_parent",
      payload: {
        nodeId: args.nodeId,
        newParentNodeId: args.newParentNodeId,
      },
      nodeHash: args.nodeHash,
      newParentHash: args.newParentHash,
    },
    source: null,
    validation: null,
    provenance: { derivedFrom: [], rationale: null },
    cwd: args.cwd,
  });
  return proposal;
}

describe("applyProposal — node_update_parent", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    process.chdir(tempDir);
    // canon → A → B → C, plus D sibling of A
    createNode({ level: "domain", kind: "entity", label: "A", prompt: "A" });
    createNode({
      parentNodeId: "node_0001",
      level: "artifact", kind: "artifact", label: "B", prompt: "B",
    });
    createNode({
      parentNodeId: "node_0002",
      level: "artifact", kind: "artifact", label: "C", prompt: "C",
    });
    createNode({ level: "domain", kind: "entity", label: "D", prompt: "D" });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tempDir);
  });

  // ── happy path ─────────────────────────────────────────────────────

  it("applies a valid reparent: node_0003 moves from node_0002 → node_0004", () => {
    const node = loadNodeById("node_0003", tempDir)!;
    const newParent = loadNodeById("node_0004", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0003",
      newParentNodeId: "node_0004",
      nodeHash: node.integrity.hash,
      newParentHash: newParent.integrity.hash,
      cwd: tempDir,
    });

    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.status).toBe("applied");
    expect(result.mutationEvent?.eventType).toBe("node_parent_updated");
    expect(result.createdEntityId).toBe("node_0003");

    const after = loadNodeById("node_0003", tempDir)!;
    expect(after.graph.parentId).toBe("node_0004");
  });

  it("threads sourceProposalId into the mutation event payload", () => {
    const node = loadNodeById("node_0003", tempDir)!;
    const newParent = loadNodeById("node_0004", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0003",
      newParentNodeId: "node_0004",
      nodeHash: node.integrity.hash,
      newParentHash: newParent.integrity.hash,
      cwd: tempDir,
    });
    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mutationEvent?.payload).toMatchObject({
      sourceProposalId: proposal.id,
      oldParentId: "node_0002",
      newParentId: "node_0004",
    });
  });

  // ── dry-run ────────────────────────────────────────────────────────

  it("dry-run validates without mutating", () => {
    const node = loadNodeById("node_0003", tempDir)!;
    const newParent = loadNodeById("node_0004", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0003",
      newParentNodeId: "node_0004",
      nodeHash: node.integrity.hash,
      newParentHash: newParent.integrity.hash,
      cwd: tempDir,
    });
    const result = applyProposal(proposal.id, { cwd: tempDir, dryRun: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dryRun).toBe(true);
    expect(result.mutationEvent).toBeNull();
    expect(loadNodeById("node_0003", tempDir)?.graph.parentId).toBe("node_0002");
  });

  // ── refusal paths ──────────────────────────────────────────────────

  it("refuses with kind='missing_parent' when the target node disappeared", () => {
    const newParent = loadNodeById("node_0004", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_9999",
      newParentNodeId: "node_0004",
      nodeHash: "sha256:deadbeef",
      newParentHash: newParent.integrity.hash,
      cwd: tempDir,
    });
    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("missing_parent");
    expect(result.message).toMatch(/Target node referenced by proposal/);
  });

  it("refuses with kind='missing_parent' when the new parent disappeared", () => {
    const node = loadNodeById("node_0003", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0003",
      newParentNodeId: "node_9999",
      nodeHash: node.integrity.hash,
      newParentHash: "sha256:deadbeef",
      cwd: tempDir,
    });
    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("missing_parent");
    expect(result.message).toMatch(/New parent node referenced by proposal/);
  });

  it("stales when the target node's hash diverges (out-of-band update)", () => {
    const node = loadNodeById("node_0003", tempDir)!;
    const newParent = loadNodeById("node_0004", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0003",
      newParentNodeId: "node_0004",
      nodeHash: node.integrity.hash,
      newParentHash: newParent.integrity.hash,
      cwd: tempDir,
    });
    // Out-of-band: rewrite the target's prompt. This re-hashes the node.
    updateNode({ id: "node_0003", prompt: "rewritten", cwd: tempDir });

    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("stale");
    expect(result.proposal?.status).toBe("staled");
    expect(loadNodeById("node_0003", tempDir)?.graph.parentId).toBe("node_0002");
  });

  it("stales when the new parent's hash diverges", () => {
    const node = loadNodeById("node_0003", tempDir)!;
    const newParent = loadNodeById("node_0004", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0003",
      newParentNodeId: "node_0004",
      nodeHash: node.integrity.hash,
      newParentHash: newParent.integrity.hash,
      cwd: tempDir,
    });
    updateNode({ id: "node_0004", prompt: "rewritten parent", cwd: tempDir });

    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("stale");
  });

  it("refuses with kind='mutation_failed' when applying would create a cycle", () => {
    // Reparent node_0002 (parent of node_0003) under node_0003 → cycle.
    const node = loadNodeById("node_0002", tempDir)!;
    const newParent = loadNodeById("node_0003", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0002",
      newParentNodeId: "node_0003",
      nodeHash: node.integrity.hash,
      newParentHash: newParent.integrity.hash,
      cwd: tempDir,
    });
    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("mutation_failed");
    expect(result.message).toMatch(/would create a cycle/);
  });

  it("refuses with kind='mutation_failed' on a no-op reparent (already the parent)", () => {
    const node = loadNodeById("node_0003", tempDir)!;
    const sameParent = loadNodeById("node_0002", tempDir)!;
    const proposal = createReparentProposal({
      nodeId: "node_0003",
      newParentNodeId: "node_0002",
      nodeHash: node.integrity.hash,
      newParentHash: sameParent.integrity.hash,
      cwd: tempDir,
    });
    const result = applyProposal(proposal.id, { cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("mutation_failed");
    expect(result.message).toMatch(/already a child/);
  });
});
