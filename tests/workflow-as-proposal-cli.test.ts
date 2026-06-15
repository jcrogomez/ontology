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

const ACCEPT_GRAPH_CONTRACT = {
  name: "minimal-accept-contract",
  description: "declares an output contract (intent) — no artefactLanguage, so the declaration stands alone (no measurement)",
  entry: "g1",
  provides: [{ key: "podcast_pipeline", signature: "(brief: string): Episode" }],
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
    // §3.6 provenance: the proposal's source points at the persisted
    // workflow run record (source stopped being null on 2026-06-09).
    expect(proposalFile.source).not.toBeNull();
    expect(proposalFile.source.kind).toBe("workflow_run");
    expect(proposalFile.source.workflowRunId).toBe(parsed.workflowRun.id);
    expect(proposalFile.provenance.rationale).toMatch(/workflow run "accept\.json"/);
  });

  it("persists a self-certifying workflow run record the proposal source references (§3.6 provenance)", async () => {
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
    expect(parsed.workflowRun.id).toMatch(/^wfrun_[0-9a-f]{8}$/);

    const recordPath = path.join(tempDir, ".ontology/runs", `${parsed.workflowRun.id}.json`);
    const record = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
    expect(record.result.verdict).toBe("accept");
    expect(record.result.stepCount).toBe(parsed.result.stepCount);
    expect(record.steps.length).toBe(parsed.result.trace.length);
    expect(record.graph.file).toBe("accept.json");
    expect(record.model.provider).toBe("mock");
    // No machine paths anywhere in the record (checkout-portable).
    expect(JSON.stringify(record)).not.toContain(tempDir);

    // The record self-certifies: recompute-and-compare the body hash.
    const { verifyWorkflowRunRecord, loadWorkflowRunRecord } = await import(
      "../src/kernel/core/runs/workflow-record.js"
    );
    const loaded = loadWorkflowRunRecord(parsed.workflowRun.id, tempDir);
    expect(loaded).not.toBeNull();
    expect(verifyWorkflowRunRecord(loaded!)).toBe(true);

    // The proposal's source carries the record's hashes verbatim.
    const proposalFile = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`),
        "utf-8",
      ),
    );
    expect(proposalFile.source.graphHash).toBe(record.graph.graphHash);
    expect(proposalFile.source.inputHash).toBe(record.inputHash);

    // `onto runs list` still works with a wfrun record in the same dir
    // (the run_ prefix filter keeps the two id spaces separate).
    const runsList = runCli(tempDir, ["runs", "list", "--json"]);
    expect(runsList.status).toBe(0);
  });

  it("edge proposals from update mode carry the same workflow-run source", () => {
    const focalId = createNode("focal");
    const depId = createNode("dep");
    writeGraph("edges.json", {
      ...ACCEPT_GRAPH,
      proposesEdges: [{ type: "depends_on", target: depId }],
    });
    const r = runCli(tempDir, [
      "workflow", "run", "edges.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--update-node", focalId,
      "--json",
    ]);
    const parsed = JSON.parse(r.stdout);
    const edgeFile = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, ".ontology/proposals", `${parsed.edgeProposals[0].id}.json`),
        "utf-8",
      ),
    );
    const nodeFile = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`),
        "utf-8",
      ),
    );
    expect(edgeFile.source.kind).toBe("workflow_run");
    expect(edgeFile.source.workflowRunId).toBe(parsed.workflowRun.id);
    expect(nodeFile.source.workflowRunId).toBe(parsed.workflowRun.id);
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
    expect(r.status).not.toBe(0); // failures must be visible to scripts/CI
  });

  it("refuses --as-proposal combined with --dry-run (placeholder output must not become a proposal)", () => {
    writeGraph("accept.json", ACCEPT_GRAPH);
    const r = runCli(tempDir, [
      "workflow", "run", "accept.json",
      "--input", "input.txt",
      "--dry-run",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/dry-run/);
    expect(r.status).not.toBe(0);
    // No junk proposal in the append-only sequence, no state mutation.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const files = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : [];
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(0);
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
    expect(r.status).not.toBe(0);
    // no proposal file written
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const files = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : [];
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });

  it("a declared output contract (O4) is inherited into the proposal payload", () => {
    writeGraph("contract.json", ACCEPT_GRAPH_CONTRACT);
    const r = runCli(tempDir, [
      "workflow", "run", "contract.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "action",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // No artefactLanguage → declaration stands alone (no measurement).
    expect(parsed.contractCheck.measured).toBe(false);
    expect(parsed.contractCheck.mismatches).toEqual([]);

    const proposalFile = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`),
        "utf-8",
      ),
    );
    expect(proposalFile.mutation.payload.provides).toEqual(["podcast_pipeline"]);
    expect(proposalFile.mutation.payload.provideSignatures).toEqual({
      podcast_pipeline: "(brief: string): Episode",
    });
  });

  it("the contract survives apply onto the created node (O3→O2 loop: node born with provides+signature)", () => {
    writeGraph("contract.json", ACCEPT_GRAPH_CONTRACT);
    const run = runCli(tempDir, [
      "workflow", "run", "contract.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "action",
      "--json",
    ]);
    const proposalId = JSON.parse(run.stdout).proposal.id;
    const apply = runCli(tempDir, ["proposal", "apply", proposalId, "--json"]);
    expect(apply.status).toBe(0);

    // Read the created node and confirm it carries the contract — which is
    // exactly what O2's identify-if-equal needs to reconcile re-provisions
    // downstream.
    const nodeId = JSON.parse(apply.stdout).mutation.createdEntityId;
    expect(nodeId).toMatch(/^node_/);
    const node = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/nodes", `${nodeId}.json`), "utf-8"),
    );
    expect(node.context.provides).toContainEqual({
      key: "podcast_pipeline",
      nodeType: "declared",
      signature: "(brief: string): Episode",
    });
  });

  // ── §3.6 mode 2 — refine: --update-node (node_update + proposesEdges) ─────

  const createNode = (prompt: string): string => {
    const r = runCli(tempDir, [
      "node", "create",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", prompt,
    ]);
    expect(r.status).toBe(0);
    const m = (r.stdout + r.stderr).match(/node_\d{4}/);
    expect(m).not.toBeNull();
    return m![0];
  };

  it("--update-node turns the artefact into a pending node_update proposal that applies onto the existing node", () => {
    const nodeId = createNode("old prompt to refine");
    writeGraph("contract.json", ACCEPT_GRAPH_CONTRACT);
    const r = runCli(tempDir, [
      "workflow", "run", "contract.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--update-node", nodeId,
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.proposal).toBeDefined();

    const proposalFile = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, ".ontology/proposals", `${parsed.proposal.id}.json`),
        "utf-8",
      ),
    );
    expect(proposalFile.mutation.kind).toBe("node_update");
    expect(proposalFile.mutation.payload.nodeId).toBe(nodeId);
    expect(proposalFile.mutation.payload.prompt).toBe(parsed.result.output);
    expect(proposalFile.mutation.payload.provides).toEqual(["podcast_pipeline"]);
    // Pinned to the target node's hash at proposal-creation time.
    const nodeBefore = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/nodes", `${nodeId}.json`), "utf-8"),
    );
    expect(proposalFile.mutation.nodeHash).toBe(nodeBefore.integrity.hash);

    const apply = runCli(tempDir, ["proposal", "apply", parsed.proposal.id, "--json"]);
    expect(apply.status).toBe(0);
    expect(JSON.parse(apply.stdout).mutation.createdEntityId).toBe(nodeId);

    // The node was refined in place: new prompt, contract with signature,
    // level/kind untouched.
    const node = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/nodes", `${nodeId}.json`), "utf-8"),
    );
    expect(node.prompt.raw).toBe(parsed.result.output);
    expect(node.coordinates.abstraction).toBe("domain");
    expect(node.context.provides).toContainEqual({
      key: "podcast_pipeline",
      nodeType: "declared",
      signature: "(brief: string): Episode",
    });
  });

  it("--update-node is mutually exclusive with the create-mode options", () => {
    const nodeId = createNode("target");
    writeGraph("accept.json", ACCEPT_GRAPH);
    const r = runCli(tempDir, [
      "workflow", "run", "accept.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--update-node", nodeId,
      "--proposal-level", "domain",
      "--json",
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/mutually exclusive/);
    expect(r.status).not.toBe(0);
  });

  it("a node_update proposal STALES when the target node mutates out-of-band (snapshot discipline)", () => {
    const nodeId = createNode("original");
    writeGraph("accept.json", ACCEPT_GRAPH);
    const run = runCli(tempDir, [
      "workflow", "run", "accept.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--update-node", nodeId,
      "--json",
    ]);
    const proposalId = JSON.parse(run.stdout).proposal.id;
    // Out-of-band mutation between propose and apply.
    expect(runCli(tempDir, ["node", "update", nodeId, "--prompt", "drifted"]).status).toBe(0);
    const apply = runCli(tempDir, ["proposal", "apply", proposalId, "--json"]);
    expect(apply.status).not.toBe(0);
    const parsed = JSON.parse(apply.stdout);
    expect(parsed.kind).toBe("stale");
    // The drifted prompt survives — the stale proposal never applied.
    const node = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/nodes", `${nodeId}.json`), "utf-8"),
    );
    expect(node.prompt.raw).toBe("drifted");
  });

  it("graph-declared proposesEdges become edge_create proposals in update mode, ordered edges-first", () => {
    const focalId = createNode("focal");
    const depId = createNode("dependency target");
    const graph = {
      ...ACCEPT_GRAPH,
      name: "with-edges",
      proposesEdges: [{ type: "depends_on", target: depId }],
    };
    writeGraph("edges.json", graph);
    const r = runCli(tempDir, [
      "workflow", "run", "edges.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--update-node", focalId,
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.edgeProposals).toHaveLength(1);
    const edgeFile = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, ".ontology/proposals", `${parsed.edgeProposals[0].id}.json`),
        "utf-8",
      ),
    );
    expect(edgeFile.mutation.kind).toBe("edge_create");
    expect(edgeFile.mutation.payload.from).toBe(focalId); // direction "out" default
    expect(edgeFile.mutation.payload.to).toBe(depId);
    expect(edgeFile.mutation.payload.type).toBe("depends_on");

    // The documented apply order works: edge first, then the update.
    expect(
      runCli(tempDir, ["proposal", "apply", parsed.edgeProposals[0].id, "--json"]).status,
    ).toBe(0);
    expect(
      runCli(tempDir, ["proposal", "apply", parsed.proposal.id, "--json"]).status,
    ).toBe(0);
  });

  it("applying the node_update FIRST stales the edge proposal (the documented hazard, pinned)", () => {
    const focalId = createNode("focal");
    const depId = createNode("dep");
    writeGraph("edges.json", {
      ...ACCEPT_GRAPH,
      proposesEdges: [{ type: "depends_on", target: depId }],
    });
    const r = runCli(tempDir, [
      "workflow", "run", "edges.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--update-node", focalId,
      "--json",
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(runCli(tempDir, ["proposal", "apply", parsed.proposal.id, "--json"]).status).toBe(0);
    const edgeApply = runCli(tempDir, ["proposal", "apply", parsed.edgeProposals[0].id, "--json"]);
    expect(edgeApply.status).not.toBe(0);
    expect(JSON.parse(edgeApply.stdout).kind).toBe("stale");
  });

  it("an invalid proposesEdges declaration creates NO proposals at all (validate-then-create)", () => {
    const focalId = createNode("focal");
    writeGraph("bad-edges.json", {
      ...ACCEPT_GRAPH,
      proposesEdges: [{ type: "not_a_real_edge_type", target: "node_9999" }],
    });
    const r = runCli(tempDir, [
      "workflow", "run", "bad-edges.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--update-node", focalId,
      "--json",
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/invalid edge type/);
    expect(r.status).not.toBe(0);
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const files = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : [];
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });

  it("create mode defers declared edges (no edge proposals; surfaced as a note)", () => {
    const depId = createNode("dep");
    writeGraph("create-edges.json", {
      ...ACCEPT_GRAPH,
      proposesEdges: [{ type: "depends_on", target: depId }],
    });
    const r = runCli(tempDir, [
      "workflow", "run", "create-edges.json",
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "entity",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.edgeProposals).toBeUndefined();
    expect(parsed.deferredProposedEdges).toHaveLength(1);
    // Only the node_create proposal exists.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const kinds = fs.readdirSync(proposalsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(proposalsDir, f), "utf-8")).mutation.kind);
    expect(kinds).toEqual(["node_create"]);
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
