import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Helper: bootstrap two nodes (canon + a domain child) suitable for an edge.
function setupTwoNodes(tempDir: string): { fromId: string; toId: string } {
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Domain entity"]).status).toBe(0);
  return { fromId: "node_0001", toId: "node_0000_canon" };
}

describe("onto propose link", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("creates a pending edge_create proposal that captures both endpoint hashes", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const r = runCli(tempDir, [
      "propose", "link",
      "--from", fromId,
      "--to", toId,
      "--type", "refines",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.proposal.mutationKind).toBe("edge_create");

    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`), "utf-8"),
    );
    expect(proposalFile.status).toBe("pending");
    expect(proposalFile.mutation.kind).toBe("edge_create");
    expect(proposalFile.mutation.payload.from).toBe(fromId);
    expect(proposalFile.mutation.payload.to).toBe(toId);
    expect(proposalFile.mutation.payload.type).toBe("refines");

    // Both endpoint hashes are pinned to the nodes' current state.
    const fromNode = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes", `${fromId}.json`), "utf-8"));
    const toNode = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes", `${toId}.json`), "utf-8"));
    expect(proposalFile.mutation.fromHash).toBe(fromNode.integrity.hash);
    expect(proposalFile.mutation.toHash).toBe(toNode.integrity.hash);
  });

  it("does NOT mutate edges.jsonl or nodes/", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const edgesBefore = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    const nodesBefore = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    runCli(tempDir, ["propose", "link", "--from", fromId, "--to", toId, "--type", "refines"]);
    const edgesAfter = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    const nodesAfter = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    expect(edgesAfter).toBe(edgesBefore);
    expect(nodesAfter).toEqual(nodesBefore);
  });

  it("rejects self-loops", () => {
    setupTwoNodes(tempDir);
    const r = runCli(tempDir, [
      "propose", "link",
      "--from", "node_0001",
      "--to", "node_0001",
      "--type", "documents",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Self-loops are not allowed");
  });

  it("rejects an inverted refinement edge (poset enforcement still active)", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    // Inverting: canon (higher abstraction) refines domain (lower) is invalid.
    const r = runCli(tempDir, [
      "propose", "link",
      "--from", toId,
      "--to", fromId,
      "--type", "refines",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("abstraction poset");
  });

  it("rejects unknown source / target nodes", () => {
    const r1 = runCli(tempDir, ["propose", "link", "--from", "node_xxx", "--to", "node_0000_canon", "--type", "documents"]);
    expect(r1.status).toBe(1);
    expect(r1.stderr).toContain("Source node not found");

    const r2 = runCli(tempDir, ["propose", "link", "--from", "node_0000_canon", "--to", "node_xxx", "--type", "documents"]);
    expect(r2.status).toBe(1);
    expect(r2.stderr).toContain("Target node not found");
  });

  it("rejects an invalid edge type", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const r = runCli(tempDir, ["propose", "link", "--from", fromId, "--to", toId, "--type", "fake_type"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid edge type");
  });

  it("--rationale lands in proposal.provenance", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const r = runCli(tempDir, [
      "propose", "link",
      "--from", fromId,
      "--to", toId,
      "--type", "refines",
      "--rationale", "domain refines canon",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const id = JSON.parse(r.stdout).proposal.id;
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"),
    );
    expect(proposalFile.provenance.rationale).toBe("domain refines canon");
    expect(proposalFile.provenance.derivedFrom).toEqual([fromId, toId]);
  });
});

describe("onto proposal show: edge_create payload rendering", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("renders the edge_create section with from / to / type / branch / hashes", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const create = runCli(tempDir, ["propose", "link", "--from", fromId, "--to", toId, "--type", "refines", "--json"]);
    expect(create.status).toBe(0);
    const id = JSON.parse(create.stdout).proposal.id;

    const show = runCli(tempDir, ["proposal", "show", id]);
    expect(show.status).toBe(0);
    expect(show.stdout).toContain("Mutation (edge_create):");
    expect(show.stdout).toContain(`From:         ${fromId}`);
    expect(show.stdout).toContain(`To:           ${toId}`);
    expect(show.stdout).toContain(`Type:         refines`);
    expect(show.stdout).toContain(`From hash:`);
    expect(show.stdout).toContain(`To hash:`);
  });
});

describe("onto proposal apply: edge_create lifecycle", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  function proposeEdge(tempDir: string, fromId: string, toId: string, type = "refines"): string {
    const r = runCli(tempDir, ["propose", "link", "--from", fromId, "--to", toId, "--type", type, "--json"]);
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout).proposal.id;
  }

  it("happy path: pending → applied creates a real edge with sourceProposalId provenance", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const pid = proposeEdge(tempDir, fromId, toId);

    const apply = runCli(tempDir, ["proposal", "apply", pid, "--json"]);
    expect(apply.status).toBe(0);
    const parsed = JSON.parse(apply.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.mutation.eventType).toBe("edge_created");
    expect(parsed.mutation.createdEntityId).toMatch(/^edge_[a-f0-9]{8}$/);

    // Edge is in edges.jsonl with the right shape.
    const edges = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8")
      .trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
    expect(edges.length).toBe(1);
    expect(edges[0].from).toBe(fromId);
    expect(edges[0].to).toBe(toId);
    expect(edges[0].type).toBe("refines");

    // The edge_created event carries sourceProposalId.
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8")
      .trim().split("\n").map(l => JSON.parse(l));
    const edgeCreated = events.find(e => e.eventType === "edge_created");
    expect(edgeCreated.payload.sourceProposalId).toBe(pid);

    // The proposal_applied event carries resultingEdgeId.
    const proposalApplied = events.find(e => e.eventType === "proposal_applied");
    expect(proposalApplied.payload.resultingEdgeId).toBe(edges[0].edgeId);

    // validate still passes after the lifecycle.
    expect(runCli(tempDir, ["validate"]).status).toBe(0);
  });

  it("stale path: tampering with the source node's hash transitions to staled", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const pid = proposeEdge(tempDir, fromId, toId);

    // Tamper with the source node's hash on disk. (Mirrors the technique used
    // by the node_create stale tests — simulates an out-of-band mutation.)
    const fromPath = path.join(tempDir, ".ontology/nodes", `${fromId}.json`);
    const fromNode = JSON.parse(fs.readFileSync(fromPath, "utf-8"));
    fromNode.integrity.hash = "ff".repeat(32);
    fs.writeFileSync(fromPath, JSON.stringify(fromNode, null, 2));

    const apply = runCli(tempDir, ["proposal", "apply", pid, "--json"]);
    expect(apply.status).toBe(1);
    const parsed = JSON.parse(apply.stdout);
    expect(parsed.kind).toBe("stale");
    expect(parsed.proposal.status).toBe("staled");

    // No edge created.
    const edges = fs.readFileSync(path.join(tempDir, ".ontology/edges.jsonl"), "utf-8");
    expect(edges.trim()).toBe("");

    // proposal_staled event carries the divergence detail.
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8")
      .trim().split("\n").map(l => JSON.parse(l));
    const staled = events.find(e => e.eventType === "proposal_staled");
    expect(staled.payload.reason).toBe("endpoint_hash_diverged");
    expect(staled.payload.fromNodeId).toBe(fromId);
    expect(staled.payload.toNodeId).toBe(toId);
  });

  it("stale path: tampering with the target node's hash also transitions to staled", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const pid = proposeEdge(tempDir, fromId, toId);

    const toPath = path.join(tempDir, ".ontology/nodes", `${toId}.json`);
    const toNode = JSON.parse(fs.readFileSync(toPath, "utf-8"));
    toNode.integrity.hash = "00".repeat(32);
    fs.writeFileSync(toPath, JSON.stringify(toNode, null, 2));

    const apply = runCli(tempDir, ["proposal", "apply", pid]);
    expect(apply.status).toBe(1);
    expect(apply.stderr).toContain("hash diverged");
  });

  it("--dry-run reports stale without transitioning the proposal", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const pid = proposeEdge(tempDir, fromId, toId);
    const fromPath = path.join(tempDir, ".ontology/nodes", `${fromId}.json`);
    const fromNode = JSON.parse(fs.readFileSync(fromPath, "utf-8"));
    fromNode.integrity.hash = "aa".repeat(32);
    fs.writeFileSync(fromPath, JSON.stringify(fromNode, null, 2));

    const apply = runCli(tempDir, ["proposal", "apply", pid, "--dry-run", "--json"]);
    expect(apply.status).toBe(1);
    expect(JSON.parse(apply.stdout).kind).toBe("stale");

    // The proposal is still pending; only a real apply transitions to staled.
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${pid}.json`), "utf-8"),
    );
    expect(proposalFile.status).toBe("pending");
  });

  it("missing endpoint: refuses with kind=missing_parent if either node was deleted", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    const pid = proposeEdge(tempDir, fromId, toId);

    fs.unlinkSync(path.join(tempDir, ".ontology/nodes", `${fromId}.json`));
    const apply = runCli(tempDir, ["proposal", "apply", pid, "--json"]);
    expect(apply.status).toBe(1);
    expect(JSON.parse(apply.stdout).kind).toBe("missing_parent");
  });

  it("duplicate edge: refuses with mutation_failed", () => {
    const { fromId, toId } = setupTwoNodes(tempDir);
    // Create the edge directly via node link first.
    expect(runCli(tempDir, ["node", "link", "--from", fromId, "--to", toId, "--type", "refines"]).status).toBe(0);
    // Now propose the same edge.
    const pid = proposeEdge(tempDir, fromId, toId);

    const apply = runCli(tempDir, ["proposal", "apply", pid, "--json"]);
    expect(apply.status).toBe(1);
    const parsed = JSON.parse(apply.stdout);
    expect(parsed.kind).toBe("mutation_failed");
    expect(parsed.error).toContain("Edge already exists");
  });
});
