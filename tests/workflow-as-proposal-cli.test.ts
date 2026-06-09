import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// O3 (docs/legend/CONTEXT_GLUING_REGIMES.md) — `onto workflow run --as-proposal`
// closes the execution→intent loop: an accepted workflow's final artefact
// becomes a pending node_create proposal over the existing proposal substrate.
// Nothing mutates the graph here; `onto proposal apply` is the human-gated step.

const ACCEPT_GRAPH = {
  name: "minimal-accept",
  description: "entry generator feeds straight into an accept terminal",
  entry: "g1",
  nodes: [
    { id: "g1", kind: "generator", prompt: "Echo the input: ${INPUT}" },
    { id: "t", kind: "terminal", terminalVerdict: "accept" },
  ],
  edges: [{ from: "g1", to: "t", type: "feeds" }],
};

const REJECT_GRAPH = {
  name: "minimal-reject",
  description: "entry generator feeds straight into a reject terminal",
  entry: "g1",
  nodes: [
    { id: "g1", kind: "generator", prompt: "Echo the input: ${INPUT}" },
    { id: "t", kind: "terminal", terminalVerdict: "reject" },
  ],
  edges: [{ from: "g1", to: "t", type: "feeds" }],
};

describe("onto workflow run --as-proposal (O3)", () => {
  let tempDir: string;

  const writeGraph = (name: string, graph: unknown): string => {
    const p = path.join(tempDir, name);
    fs.writeFileSync(p, JSON.stringify(graph));
    return p;
  };

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    fs.writeFileSync(path.join(tempDir, "input.txt"), "seed problem statement");
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("an accepted workflow's artefact becomes a pending node_create proposal", () => {
    writeGraph("accept.json", ACCEPT_GRAPH);
    const r = runCli(tempDir, [
      "workflow", "run", "accept.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.verdict).toBe("accept");
    expect(parsed.proposal).toBeDefined();
    expect(parsed.proposal.id).toMatch(/^proposal_\d{4}$/);
    expect(parsed.proposal.status).toBe("pending");

    const proposalFile = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`),
        "utf-8",
      ),
    );
    // The final artefact becomes the proposed node's prompt.
    expect(proposalFile.mutation.kind).toBe("node_create");
    expect(proposalFile.mutation.payload.prompt).toBe(parsed.result.output);
    expect(proposalFile.mutation.payload.prompt.length).toBeGreaterThan(0);
    expect(proposalFile.mutation.payload.level).toBe("domain");
    expect(proposalFile.mutation.payload.kind).toBe("entity");
    // Workflows do not persist a run record yet → source is null; provenance
    // carries a default workflow-run rationale.
    expect(proposalFile.source).toBeNull();
    expect(proposalFile.provenance.rationale).toMatch(/workflow run "accept\.json"/);
  });

  it("the proposal applies into a real node (end-to-end loop closes)", () => {
    writeGraph("accept.json", ACCEPT_GRAPH);
    const run = runCli(tempDir, [
      "workflow", "run", "accept.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    const proposalId = JSON.parse(run.stdout).proposal.id;
    const apply = runCli(tempDir, ["proposal", "apply", proposalId, "--json"]);
    expect(apply.status).toBe(0);
    const applied = JSON.parse(apply.stdout);
    expect(applied.ok).toBe(true);
  });

  it("rejects --as-proposal without a valid --proposal-level", () => {
    writeGraph("accept.json", ACCEPT_GRAPH);
    const r = runCli(tempDir, [
      "workflow", "run", "accept.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-kind", "entity",
      "--json",
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/proposal-level/);
  });

  it("refuses to propose from a REJECTED workflow", () => {
    writeGraph("reject.json", REJECT_GRAPH);
    const r = runCli(tempDir, [
      "workflow", "run", "reject.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/accepted workflow/);
    // no proposal file written
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const files = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : [];
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });

  it("without --as-proposal, a run creates no proposal (default unchanged)", () => {
    writeGraph("accept.json", ACCEPT_GRAPH);
    const r = runCli(tempDir, [
      "workflow", "run", "accept.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.proposal).toBeUndefined();
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const files = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : [];
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });
});
