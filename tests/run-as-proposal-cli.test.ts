import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// PR #95 — --as-proposal closes the loop: a model run becomes a typed
// candidate mutation with full source provenance back to its runId.

describe("onto run prompt --as-proposal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("creates a proposal whose source.runId points at the persisted run", () => {
    const r = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "Design a harvest entity",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.persisted).toBeDefined();
    expect(parsed.proposal).toBeDefined();
    expect(parsed.proposal.id).toMatch(/^proposal_\d{4}$/);
    expect(parsed.proposal.status).toBe("pending");

    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`), "utf-8"),
    );
    expect(proposalFile.source).not.toBeNull();
    expect(proposalFile.source.runId).toBe(parsed.persisted.runId);
    expect(proposalFile.source.provider).toBe("mock");
    expect(proposalFile.source.contextHash).toBeNull();
    expect(proposalFile.source.promptHash).toMatch(/^prompt:hash:/);
  });

  it("the model's response becomes the new node's prompt content", () => {
    const r = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "Hello",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`), "utf-8"),
    );
    expect(proposalFile.mutation.payload.prompt).toBe(parsed.response.text);
    // mock adapter wraps the input as "[mock:<task>] <input>"
    expect(proposalFile.mutation.payload.prompt).toContain("[mock:semantic_parse] Hello");
  });

  it("auto-implies --persist (no need to pass it explicitly)", () => {
    const r = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "auto-persist test",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.persisted).toBeDefined();
    expect(parsed.persisted.runId).toMatch(/^run_[0-9a-f]{8}$/);
    expect(fs.existsSync(path.join(tempDir, ".ontology/runs", `${parsed.persisted.runId}.json`))).toBe(true);
  });

  it("rejects --as-proposal without --proposal-level", () => {
    const r = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "x",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-kind", "entity",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--as-proposal requires --proposal-level");
  });

  it("rejects --as-proposal with an invalid level", () => {
    const r = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "x",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "imaginary",
      "--proposal-kind", "entity",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid --proposal-level");
  });

  it("--proposal-rationale lands in the proposal provenance", () => {
    const r = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "Hello",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--proposal-rationale", "captured from a model run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const id = JSON.parse(r.stdout).proposal.id;
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"),
    );
    expect(proposalFile.provenance.rationale).toBe("captured from a model run");
  });
});

describe("onto run context --as-proposal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("default proposal parent is the focal node, not the canon", () => {
    // Create an intermediate domain node so we can run context against it.
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Inventory"]);
    // node_0001 is the new domain node.
    const r = runCli(tempDir, [
      "run", "context", "node_0001",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "workflow",
      "--proposal-kind", "action",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`), "utf-8"),
    );
    expect(proposalFile.mutation.payload.parentNodeId).toBe("node_0001");
  });

  it("context-aware source.contextHash is populated and matches the run's", () => {
    const r = runCli(tempDir, [
      "run", "context", "node_0000_canon",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const runFile = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/runs", `${parsed.persisted.runId}.json`), "utf-8"));
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`), "utf-8"),
    );
    expect(proposalFile.source.contextHash).toMatch(/^ctx:hash:/);
    expect(proposalFile.source.contextHash).toBe(runFile.input.contextHash);
  });

  it("--validate is reflected in the proposal validation snapshot", () => {
    const r = runCli(tempDir, [
      "run", "context", "node_0000_canon",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--validate",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const id = JSON.parse(r.stdout).proposal.id;
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"),
    );
    expect(proposalFile.validation).not.toBeNull();
    expect(typeof proposalFile.validation.ok).toBe("boolean");
    expect(typeof proposalFile.validation.score).toBe("number");
  });

  it("--proposal-parent overrides the default focal-node parent", () => {
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Inventory"]);
    const r = runCli(tempDir, [
      "run", "context", "node_0001",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "workflow",
      "--proposal-kind", "action",
      "--proposal-parent", "node_0000_canon",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const id = JSON.parse(r.stdout).proposal.id;
    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8"),
    );
    expect(proposalFile.mutation.payload.parentNodeId).toBe("node_0000_canon");
  });
});

describe("--as-proposal end-to-end audit chain (run → proposal → apply → node)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("a run-driven proposal can be applied and the resulting node carries provenance back to the run", () => {
    const propose = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "Design a harvest entity",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    expect(propose.status).toBe(0);
    const proposalId = JSON.parse(propose.stdout).proposal.id;
    const runId = JSON.parse(propose.stdout).persisted.runId;

    const apply = runCli(tempDir, ["proposal", "apply", proposalId, "--json"]);
    expect(apply.status).toBe(0);
    const applyParsed = JSON.parse(apply.stdout);
    expect(applyParsed.ok).toBe(true);
    expect(applyParsed.mutation.createdEntityId).toBe("node_0001");

    // Inspect the events log: the chain is run_persisted → proposal_created
    // → node_created → proposal_applied. Every step links to the next one.
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8")
      .trim().split("\n").map(l => JSON.parse(l));
    const runPersisted = events.find(e => e.eventType === "run_persisted");
    const proposalCreated = events.find(e => e.eventType === "proposal_created");
    const nodeCreated = events.find(e => e.eventType === "node_created" && e.payload.sourceProposalId);
    const proposalApplied = events.find(e => e.eventType === "proposal_applied");

    expect(runPersisted?.payload.runId).toBe(runId);
    expect(proposalCreated?.payload.proposalId).toBe(proposalId);
    expect(proposalCreated?.payload.runId).toBe(runId);
    expect(nodeCreated?.payload.sourceProposalId).toBe(proposalId);
    expect(proposalApplied?.payload.proposalId).toBe(proposalId);
    expect(proposalApplied?.payload.resultingNodeId).toBe("node_0001");

    // validate still passes after the full lifecycle.
    expect(runCli(tempDir, ["validate"]).status).toBe(0);
  });
});
