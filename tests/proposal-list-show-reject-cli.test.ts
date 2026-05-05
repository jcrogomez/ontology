import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Helper: create a pending proposal and return its id.
function proposeNode(tempDir: string, prompt = "Test prompt"): string {
  const r = runCli(tempDir, [
    "propose", "node",
    "--level", "domain",
    "--kind", "entity",
    "--prompt", prompt,
    "--json",
  ]);
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout).proposal.id;
}

describe("onto proposal list", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("returns an empty list on a fresh project", () => {
    const r = runCli(tempDir, ["proposal", "list", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ proposals: [] });
  });

  it("lists existing proposals with id, status, kind, hash", () => {
    const id1 = proposeNode(tempDir, "first");
    const id2 = proposeNode(tempDir, "second");
    const r = runCli(tempDir, ["proposal", "list", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const ids = parsed.proposals.map((p: any) => p.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    for (const p of parsed.proposals) {
      expect(p.status).toBe("pending");
      expect(p.kind).toBe("node_create");
      expect(p.hash).toMatch(/^proposal:hash:/);
    }
  });

  it("--status filters the list", () => {
    proposeNode(tempDir, "first");
    proposeNode(tempDir, "second");
    const r = runCli(tempDir, ["proposal", "list", "--status", "rejected", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).proposals).toEqual([]);
  });

  it("rejects an invalid status filter", () => {
    const r = runCli(tempDir, ["proposal", "list", "--status", "imaginary"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid status");
  });

  it("human output uses the === ONTOLOGY ... === header convention", () => {
    proposeNode(tempDir);
    const r = runCli(tempDir, ["proposal", "list"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("=== ONTOLOGY PROPOSALS ===");
  });
});

describe("onto proposal show", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("returns the full record in --json", () => {
    const id = proposeNode(tempDir);
    const r = runCli(tempDir, ["proposal", "show", id, "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.id).toBe(id);
    expect(parsed.status).toBe("pending");
    expect(parsed.mutation.kind).toBe("node_create");
    expect(parsed.hash).toMatch(/^proposal:hash:/);
  });

  it("human output includes the mutation payload and parent hash", () => {
    const id = proposeNode(tempDir, "Harvest entity");
    const r = runCli(tempDir, ["proposal", "show", id]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`=== ONTOLOGY PROPOSAL ${id} ===`);
    expect(r.stdout).toContain("Mutation (node_create):");
    expect(r.stdout).toContain("Level:        domain");
    expect(r.stdout).toContain("Parent:       node_0000_canon");
    expect(r.stdout).toContain("Parent hash:");
    expect(r.stdout).toContain("(manual proposal — no model run)");
  });

  it("exits 1 when the id is unknown", () => {
    const r = runCli(tempDir, ["proposal", "show", "proposal_9999"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Proposal not found");
  });
});

describe("onto proposal reject", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("transitions a pending proposal to rejected and reports the new hash", () => {
    const id = proposeNode(tempDir);
    const beforeFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"));
    const r = runCli(tempDir, ["proposal", "reject", id, "--reason", "duplicate of existing node"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ONTOLOGY PROPOSAL REJECTED");
    expect(r.stdout).toContain("Status:      rejected");

    const afterFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"));
    expect(afterFile.status).toBe("rejected");
    expect(afterFile.hash).not.toBe(beforeFile.hash);
  });

  it("appends a proposal_rejected event with both old and new hashes in the payload", () => {
    const id = proposeNode(tempDir);
    const beforeFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"));
    const oldHash = beforeFile.hash;
    runCli(tempDir, ["proposal", "reject", id]);

    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8");
    const lines = events.trim().split("\n").map(l => JSON.parse(l));
    const rejected = lines.find(e => e.eventType === "proposal_rejected");
    expect(rejected).toBeDefined();
    expect(rejected.payload.proposalId).toBe(id);
    expect(rejected.payload.oldHash).toBe(oldHash);
    expect(rejected.payload.newHash).toMatch(/^proposal:hash:/);
    expect(rejected.payload.newHash).not.toBe(oldHash);
  });

  it("--json mode returns ok:true and the new hash", () => {
    const id = proposeNode(tempDir);
    const r = runCli(tempDir, ["proposal", "reject", id, "--reason", "test", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.proposal.status).toBe("rejected");
    expect(parsed.proposal.hash).toMatch(/^proposal:hash:/);
    expect(parsed.event.eventType).toBe("proposal_rejected");
  });

  it("refuses to reject an already-rejected proposal", () => {
    const id = proposeNode(tempDir);
    expect(runCli(tempDir, ["proposal", "reject", id]).status).toBe(0);
    const second = runCli(tempDir, ["proposal", "reject", id]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("cannot be rejected");
    expect(second.stderr).toContain("rejected");
  });

  it("exits 1 when the id is unknown", () => {
    const r = runCli(tempDir, ["proposal", "reject", "proposal_9999"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Proposal not found");
  });

  it("does NOT mutate nodes/ or edges.jsonl when rejecting", () => {
    const id = proposeNode(tempDir);
    const nodesBefore = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    const edgesBefore = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    runCli(tempDir, ["proposal", "reject", id]);
    const nodesAfter = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    const edgesAfter = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    expect(nodesAfter).toEqual(nodesBefore);
    expect(edgesAfter).toBe(edgesBefore);
  });

  it("validate still passes after a reject", () => {
    const id = proposeNode(tempDir);
    runCli(tempDir, ["proposal", "reject", id]);
    const v = runCli(tempDir, ["validate"]);
    expect(v.status).toBe(0);
  });
});
