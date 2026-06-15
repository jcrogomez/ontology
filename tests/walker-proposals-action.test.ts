// Tests for the walker proposal-review action helpers (Walker v2 PR-1).
//
// The TUI panel itself is pure-render (src/walker/layout/proposals-panel.tsx);
// these tests pin the action-layer wiring against a real fixture
// project. The panel keystrokes (j/k/a/r/d) just call these helpers
// and re-render with the result; if the helpers are right, the panel
// is right modulo Ink-level layout.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  loadProposalsForWalker,
  applyProposalFromWalker,
  rejectProposalFromWalker,
  summarizeProposalRow,
} from "../src/surfaces/walker/actions/proposals-from-walker.js";
import { listProposals, loadProposal } from "../src/kernel/core/proposals/persist.js";

describe("walker proposal-review actions (Walker v2 PR-1)", () => {
  let tempDir: string;
  let originalCwd: string;

  // The core apply/reject functions (createNode, readState) read from
  // process.cwd() rather than threading cwd through every helper — a
  // pre-existing assumption that's safe in CLI runs (each invocation
  // is its own process rooted in the project) but trips the
  // in-process walker actions when the test process is parked
  // elsewhere. We chdir into tempDir for the duration of each test
  // so the action helpers see a coherent project root.
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    // Build a node so subsequent propose calls have a valid parent.
    expect(runCli(tempDir, ["node", "create",
      "--level", "domain",
      "--kind", "entity",
      "--label", "Auctioneer",
      "--prompt", "Holds bid state for an open auction.",
    ]).status).toBe(0);
    // Two pending proposals: one to be applied, one to be rejected.
    expect(runCli(tempDir, ["propose", "node",
      "--parent", "node_0001",
      "--level", "artifact",
      "--kind", "artifact",
      "--label", "Bid validator",
      "--prompt", "Validate that a bid is monotonically increasing.",
    ]).status).toBe(0);
    expect(runCli(tempDir, ["propose", "node",
      "--parent", "node_0001",
      "--level", "artifact",
      "--kind", "artifact",
      "--label", "Reject-me",
      "--prompt", "An obvious bad idea.",
    ]).status).toBe(0);
    // Park the test process in the temp project so in-process helpers
    // that read from process.cwd() (createNode, readState) see the
    // right root. afterEach restores the original cwd.
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tempDir);
  });

  it("loadProposalsForWalker returns only pending proposals, sorted by createdAt", () => {
    const r = loadProposalsForWalker(tempDir);
    expect(r.ok).toBe(true);
    expect(r.pendingCount).toBe(2);
    expect(r.proposals.every((p) => p.status === "pending")).toBe(true);
    // Sorted oldest-first.
    expect(r.proposals[0].createdAt).toBeLessThanOrEqual(r.proposals[1].createdAt);
  });

  it("summarizeProposalRow includes the proposal id, kind, level, and label", () => {
    const r = loadProposalsForWalker(tempDir);
    const row = summarizeProposalRow(r.proposals[0]);
    expect(row).toContain(r.proposals[0].id);
    expect(row).toContain("node");
    expect(row).toContain("[artifact]");
    expect(row).toContain("Bid validator");
  });

  it("applyProposalFromWalker with dryRun does NOT mutate state", () => {
    const before = listProposals(tempDir).map((p) => p.status);
    const target = loadProposalsForWalker(tempDir).proposals[0];

    const r = applyProposalFromWalker(target.id, { dryRun: true, cwd: tempDir });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe("dry_run");

    // Proposal status unchanged.
    const after = listProposals(tempDir).map((p) => p.status);
    expect(after).toEqual(before);
    // No node landed.
    const nodes = fs.readdirSync(path.join(tempDir, ".ontology", "nodes"));
    expect(nodes.length).toBe(2); // canon + node_0001
  });

  it("applyProposalFromWalker without dryRun lands the mutation + transitions to applied", () => {
    const target = loadProposalsForWalker(tempDir).proposals[0];
    const r = applyProposalFromWalker(target.id, { cwd: tempDir });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe("applied");
    expect(r.createdId).toMatch(/^node_/);

    const persisted = loadProposal(target.id, tempDir);
    expect(persisted?.status).toBe("applied");

    // New node landed on disk — check via the createdId the helper
    // returned. The exact filename depends on the canon-node naming
    // convention so we look for any file whose id matches the
    // returned createdId.
    const nodesDir = path.join(tempDir, ".ontology", "nodes");
    const files = fs.readdirSync(nodesDir);
    const createdFile = files.find((f) => f.includes(r.createdId!));
    expect(createdFile).toBeDefined();
  });

  it("rejectProposalFromWalker transitions a pending proposal to rejected", () => {
    const proposals = loadProposalsForWalker(tempDir).proposals;
    const target = proposals[1]; // the "Reject-me" one
    const r = rejectProposalFromWalker(target.id, { cwd: tempDir });
    expect(r.ok).toBe(true);

    const persisted = loadProposal(target.id, tempDir);
    expect(persisted?.status).toBe("rejected");
  });

  it("applyProposalFromWalker against a non-pending proposal surfaces not_pending", () => {
    const target = loadProposalsForWalker(tempDir).proposals[1];
    // Reject it first to flip status.
    expect(rejectProposalFromWalker(target.id, { cwd: tempDir }).ok).toBe(true);
    // Now apply should fail with not_pending.
    const r = applyProposalFromWalker(target.id, { cwd: tempDir });
    expect(r.ok).toBe(false);
    expect(r.outcome).toBe("not_pending");
  });

  it("applyProposalFromWalker against a missing id surfaces not_found", () => {
    const r = applyProposalFromWalker("proposal_doesnotexist", { cwd: tempDir });
    expect(r.ok).toBe(false);
    expect(r.outcome).toBe("not_found");
  });

  it("loadProposalsForWalker returns 0 pending after apply + reject", () => {
    const proposals = loadProposalsForWalker(tempDir).proposals;
    expect(applyProposalFromWalker(proposals[0].id, { cwd: tempDir }).ok).toBe(true);
    expect(rejectProposalFromWalker(proposals[1].id, { cwd: tempDir }).ok).toBe(true);

    const after = loadProposalsForWalker(tempDir);
    expect(after.pendingCount).toBe(0);
    expect(after.proposals).toEqual([]);
  });
});
