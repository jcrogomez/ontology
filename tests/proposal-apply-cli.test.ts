import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Helper: create a pending proposal targeting the canon and return its id.
function proposeNode(tempDir: string, prompt = "Harvest entity"): string {
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

function readState(tempDir: string) {
  return JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8"));
}

function readEvents(tempDir: string): any[] {
  const content = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8");
  return content.trim().split("\n").map(l => JSON.parse(l));
}

describe("onto proposal apply: happy path", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("translates a pending proposal into a real node and transitions to applied", () => {
    const id = proposeNode(tempDir);
    const stateBefore = readState(tempDir);
    expect(stateBefore.nodeCount).toBe(1); // only canon

    const r = runCli(tempDir, ["proposal", "apply", id]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ONTOLOGY PROPOSAL APPLIED");
    expect(r.stdout).toContain("Status:        applied");
    expect(r.stdout).toContain("Created node:  node_0001");

    const stateAfter = readState(tempDir);
    expect(stateAfter.nodeCount).toBe(2); // canon + the new one

    const proposalFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"));
    expect(proposalFile.status).toBe("applied");
    expect(proposalFile.hash).toMatch(/^proposal:hash:/);

    // The new node exists on disk and validate still passes.
    expect(fs.existsSync(path.join(tempDir, ".ontology/nodes/node_0001.json"))).toBe(true);
    expect(runCli(tempDir, ["validate"]).status).toBe(0);
  });

  it("appends BOTH a node_created and a proposal_applied event, in that order", () => {
    const id = proposeNode(tempDir);
    runCli(tempDir, ["proposal", "apply", id]);

    const events = readEvents(tempDir);
    const after = events.slice(events.findIndex(e => e.eventType === "proposal_created") + 1);
    const types = after.map(e => e.eventType);
    expect(types).toEqual(["node_created", "proposal_applied"]);

    const nodeCreated = events.find(e => e.eventType === "node_created");
    expect(nodeCreated.payload.sourceProposalId).toBe(id);

    const proposalApplied = events.find(e => e.eventType === "proposal_applied");
    expect(proposalApplied.payload.proposalId).toBe(id);
    expect(proposalApplied.payload.resultingNodeId).toBe("node_0001");
    expect(proposalApplied.payload.resultingEventId).toBe(nodeCreated.eventId);
    expect(proposalApplied.payload.oldHash).toMatch(/^proposal:hash:/);
    expect(proposalApplied.payload.newHash).toMatch(/^proposal:hash:/);
    expect(proposalApplied.payload.oldHash).not.toBe(proposalApplied.payload.newHash);
  });

  it("--json reports the resulting entity id and event ids", () => {
    const id = proposeNode(tempDir);
    const r = runCli(tempDir, ["proposal", "apply", id, "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.proposal.status).toBe("applied");
    expect(parsed.mutation.createdEntityId).toBe("node_0001");
    expect(parsed.mutation.eventType).toBe("node_created");
  });

  it("the new node carries the proposal-payload fields (level, kind, prompt, parent)", () => {
    const id = proposeNode(tempDir, "A specific intention text");
    runCli(tempDir, ["proposal", "apply", id]);
    const newNode = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0001.json"), "utf-8"));
    expect(newNode.coordinates.abstraction).toBe("domain");
    expect(newNode.kind).toBe("entity");
    expect(newNode.prompt.raw).toBe("A specific intention text");
    expect(newNode.graph.parentId).toBe("node_0000_canon");
  });
});

describe("onto proposal apply: stale path", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("transitions to staled when the parent hash diverges between create and apply", () => {
    const id = proposeNode(tempDir);

    // Tamper with the parent (canon) hash on disk to simulate the parent having
    // mutated out-of-band between proposal creation and the apply call. This
    // is the simplest reproducer of the stale path; in practice the divergence
    // would be triggered by a real mutation that re-hashes the parent.
    const canonPath = path.join(tempDir, ".ontology/nodes/node_0000_canon.json");
    const canon = JSON.parse(fs.readFileSync(canonPath, "utf-8"));
    canon.integrity.hash = "0000000000000000000000000000000000000000000000000000000000000000";
    fs.writeFileSync(canonPath, JSON.stringify(canon, null, 2));

    const r = runCli(tempDir, ["proposal", "apply", id]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("staled");
    expect(r.stderr).toContain("hash diverged");

    // The proposal status is now "staled" in the file.
    const proposalFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"));
    expect(proposalFile.status).toBe("staled");

    // No new node was created.
    expect(fs.existsSync(path.join(tempDir, ".ontology/nodes/node_0001.json"))).toBe(false);

    // A proposal_staled event was appended.
    const events = readEvents(tempDir);
    const staled = events.find(e => e.eventType === "proposal_staled");
    expect(staled).toBeDefined();
    expect(staled.payload.proposalId).toBe(id);
    expect(staled.payload.reason).toBe("parent_hash_diverged");
  });

  it("--json reports kind='stale' and surfaces the new staled status", () => {
    const id = proposeNode(tempDir);
    const canonPath = path.join(tempDir, ".ontology/nodes/node_0000_canon.json");
    const canon = JSON.parse(fs.readFileSync(canonPath, "utf-8"));
    canon.integrity.hash = "0000000000000000000000000000000000000000000000000000000000000000";
    fs.writeFileSync(canonPath, JSON.stringify(canon, null, 2));

    const r = runCli(tempDir, ["proposal", "apply", id, "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.kind).toBe("stale");
    expect(parsed.proposal.status).toBe("staled");
  });
});

describe("onto proposal apply: refusal modes", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("exits 1 with kind='not_found' for a missing id", () => {
    const r = runCli(tempDir, ["proposal", "apply", "proposal_9999", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).kind).toBe("not_found");
  });

  it("refuses to apply an already-rejected proposal", () => {
    const id = proposeNode(tempDir);
    expect(runCli(tempDir, ["proposal", "reject", id]).status).toBe(0);

    const r = runCli(tempDir, ["proposal", "apply", id, "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.kind).toBe("not_pending");
    expect(parsed.error).toContain("rejected");
  });

  it("refuses to re-apply an already-applied proposal", () => {
    const id = proposeNode(tempDir);
    expect(runCli(tempDir, ["proposal", "apply", id]).status).toBe(0);

    const r = runCli(tempDir, ["proposal", "apply", id, "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.kind).toBe("not_pending");
    expect(parsed.error).toContain("applied");
  });

  it("refuses when the parent node disappeared", () => {
    const id = proposeNode(tempDir);
    fs.unlinkSync(path.join(tempDir, ".ontology/nodes/node_0000_canon.json"));

    const r = runCli(tempDir, ["proposal", "apply", id, "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.kind).toBe("missing_parent");
  });
});

describe("onto proposal apply --dry-run", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("validates without writing anything when the proposal is appliable", () => {
    const id = proposeNode(tempDir);
    const stateBefore = readState(tempDir);
    const eventCountBefore = stateBefore.eventCount;

    const r = runCli(tempDir, ["proposal", "apply", id, "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dry-run");
    expect(r.stdout).toContain("would transition to applied");

    // Nothing changed on disk.
    const stateAfter = readState(tempDir);
    expect(stateAfter.eventCount).toBe(eventCountBefore);
    expect(stateAfter.nodeCount).toBe(stateBefore.nodeCount);
    const proposalFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"));
    expect(proposalFile.status).toBe("pending");
    expect(fs.existsSync(path.join(tempDir, ".ontology/nodes/node_0001.json"))).toBe(false);
  });

  it("reports stale in dry-run without transitioning the proposal", () => {
    const id = proposeNode(tempDir);
    // Tamper the parent hash to force stale.
    const canonPath = path.join(tempDir, ".ontology/nodes/node_0000_canon.json");
    const canon = JSON.parse(fs.readFileSync(canonPath, "utf-8"));
    canon.integrity.hash = "ff".repeat(32);
    fs.writeFileSync(canonPath, JSON.stringify(canon, null, 2));

    const r = runCli(tempDir, ["proposal", "apply", id, "--dry-run", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).kind).toBe("stale");

    // Critically, the proposal was NOT transitioned to staled in dry-run.
    const proposalFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"));
    expect(proposalFile.status).toBe("pending");
  });
});
