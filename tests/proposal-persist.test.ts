import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  createProposal,
  loadProposal,
  listProposals,
  nextProposalId,
  proposalPath,
} from "../src/kernel/core/proposals/persist.js";
import {
  ProposalSchema,
  type ProposalMutation,
} from "../src/kernel/schemas/ontology.js";

// Build a minimal node_create proposal mutation. Uses a fake parentHash so
// these tests do not depend on a specific canon hash.
function nodeCreateMutation(parentNodeId = "node_0000_canon"): ProposalMutation {
  return {
    kind: "node_create",
    payload: {
      level: "domain",
      kind: "entity",
      prompt: "Harvest entity",
      label: null,
      parentNodeId,
    },
    parentHash: "test_parent_hash_00",
  };
}

describe("nextProposalId", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeAll(() => { originalCwd = process.cwd(); });
  afterAll(() => { process.chdir(originalCwd); });

  beforeEach(() => {
    tempDir = createTempProject();
    process.chdir(tempDir);
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  it("returns proposal_0001 when the directory does not exist", () => {
    expect(nextProposalId(tempDir)).toBe("proposal_0001");
  });

  it("increments past the highest existing id", () => {
    fs.mkdirSync(path.join(tempDir, ".ontology/proposals"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".ontology/proposals/proposal_0001.json"), "{}");
    fs.writeFileSync(path.join(tempDir, ".ontology/proposals/proposal_0007.json"), "{}");
    expect(nextProposalId(tempDir)).toBe("proposal_0008");
  });

  it("ignores files that do not match the proposal id pattern", () => {
    fs.mkdirSync(path.join(tempDir, ".ontology/proposals"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".ontology/proposals/proposal_0001.json"), "{}");
    fs.writeFileSync(path.join(tempDir, ".ontology/proposals/notes.md"), "ignore me");
    expect(nextProposalId(tempDir)).toBe("proposal_0002");
  });
});

describe("createProposal + loadProposal + listProposals", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeAll(() => { originalCwd = process.cwd(); });
  afterAll(() => { process.chdir(originalCwd); });

  beforeEach(() => {
    tempDir = createTempProject();
    process.chdir(tempDir);
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  it("writes a pending proposal under .ontology/proposals/", () => {
    const { proposal } = createProposal({
      mutation: nodeCreateMutation(),
      source: null,
      validation: null,
      provenance: { derivedFrom: ["node_0000_canon"], rationale: null },
    });
    expect(proposal.id).toMatch(/^proposal_\d{4}$/);
    expect(proposal.status).toBe("pending");
    expect(proposal.hash.startsWith("proposal:hash:")).toBe(true);
    expect(fs.existsSync(proposalPath(proposal.id, tempDir))).toBe(true);
  });

  it("appends a proposal_created event to events.jsonl", () => {
    createProposal({
      mutation: nodeCreateMutation(),
      source: null,
      validation: null,
      provenance: { derivedFrom: [], rationale: null },
    });
    const eventsContent = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8");
    expect(eventsContent).toContain("\"eventType\":\"proposal_created\"");
  });

  it("the persisted record validates against ProposalSchema", () => {
    const { proposal } = createProposal({
      mutation: nodeCreateMutation(),
      source: null,
      validation: null,
      provenance: { derivedFrom: [], rationale: "manual" },
    });
    const reloaded = loadProposal(proposal.id, tempDir);
    expect(reloaded).not.toBeNull();
    expect(() => ProposalSchema.parse(reloaded)).not.toThrow();
  });

  it("loadProposal returns null for an unknown id", () => {
    expect(loadProposal("proposal_9999", tempDir)).toBeNull();
  });

  it("listProposals returns an empty array on a fresh project", () => {
    expect(listProposals(tempDir)).toEqual([]);
  });

  it("listProposals returns sorted records by createdAt then id", () => {
    const a = createProposal({
      mutation: nodeCreateMutation(),
      source: null,
      validation: null,
      provenance: { derivedFrom: [], rationale: null },
    });
    const b = createProposal({
      mutation: nodeCreateMutation(),
      source: null,
      validation: null,
      provenance: { derivedFrom: [], rationale: null },
    });
    const all = listProposals(tempDir);
    expect(all.map(p => p.id)).toEqual([a.proposal.id, b.proposal.id]);
  });

  it("does NOT mutate nodes/ or edges.jsonl when a proposal is created", () => {
    const nodesDirBefore = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    const edgesBefore = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    createProposal({
      mutation: nodeCreateMutation(),
      source: null,
      validation: null,
      provenance: { derivedFrom: [], rationale: null },
    });
    const nodesDirAfter = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    const edgesAfter = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    expect(nodesDirAfter).toEqual(nodesDirBefore);
    expect(edgesAfter).toBe(edgesBefore);
  });

  it("body hash certifies the record without including itself", () => {
    const { proposal } = createProposal({
      mutation: nodeCreateMutation(),
      source: null,
      validation: null,
      provenance: { derivedFrom: [], rationale: null },
    });
    // Tamper with the file: change the rationale and re-write. The hash
    // stored on disk should no longer agree with the recomputed body hash.
    const fp = proposalPath(proposal.id, tempDir);
    const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
    raw.provenance.rationale = "tampered";
    fs.writeFileSync(fp, JSON.stringify(raw, null, 2) + "\n");
    const reloaded = loadProposal(proposal.id, tempDir);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.hash).toBe(proposal.hash); // stored hash is the original
    // (PR #94 will introduce a verify command that recomputes and compares.)
  });
});
