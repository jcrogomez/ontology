import { describe, expect, it, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { runCli } from "./helpers/run-cli.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { saveDraft } from "../src/kernel/core/drafts/persist.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";
import { proposeUpdateFromDraft } from "../src/surfaces/walker/actions/propose-from-draft.js";
import { verifyFromWalker } from "../src/surfaces/walker/actions/verify-from-walker.js";
import { workflowFromWalker } from "../src/surfaces/walker/actions/workflow-from-walker.js";
import { parseWorkflowArgs } from "../src/surfaces/walker/state/parse-workflow-args.js";

// Walker v1.5 — the three additions that close the TUI's scope gaps:
// :propose-update (draft → node_update on the focal), :verify (round-trip
// verdict vs the last compile, pure), :workflow (Phase ζ from the TUI,
// optionally proposing onto the focal via the shared §3.6 path).

const cwds: string[] = [];

afterEach(() => {
  while (cwds.length > 0) cleanupTempProject(cwds.pop()!);
});

function setupProject(): string {
  const cwd = createTempProject();
  cwds.push(cwd);
  expect(runCli(cwd, ["init"]).status).toBe(0);
  return cwd;
}

function createNode(cwd: string, prompt: string): string {
  const r = runCli(cwd, [
    "node", "create", "--level", "domain", "--kind", "entity", "--prompt", prompt,
  ]);
  expect(r.status).toBe(0);
  return (r.stdout + r.stderr).match(/node_\d{4}/)![0];
}

describe("proposeUpdateFromDraft (:propose-update)", () => {
  it("turns the focal's draft into a node_update proposal that applies in place", () => {
    const cwd = setupProject();
    const id = createNode(cwd, "original prompt");
    saveDraft({ focalNodeId: id, draftPrompt: "refined prompt", cwd });

    const focal = loadNodeById(id, cwd)!;
    const result = proposeUpdateFromDraft({ focal, cwd });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proposal = JSON.parse(
      fs.readFileSync(path.join(cwd, ".ontology/proposals", `${result.proposalId}.json`), "utf-8"),
    );
    expect(proposal.mutation.kind).toBe("node_update");
    expect(proposal.mutation.payload.nodeId).toBe(id);
    expect(proposal.mutation.payload.prompt).toBe("refined prompt");
    expect(proposal.mutation.nodeHash).toBe(focal.integrity.hash);

    // Applies in place: same node, new prompt, draft cleared.
    expect(runCli(cwd, ["proposal", "apply", result.proposalId, "--json"]).status).toBe(0);
    expect(loadNodeById(id, cwd)!.prompt.raw).toBe("refined prompt");
    expect(fs.existsSync(path.join(cwd, ".ontology/work/drafts", `${id}.json`))).toBe(false);
  });

  it("is honest when there is no draft", () => {
    const cwd = setupProject();
    const id = createNode(cwd, "x");
    const result = proposeUpdateFromDraft({ focal: loadNodeById(id, cwd)!, cwd });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/no draft/);
  });
});

describe("verifyFromWalker (:verify)", () => {
  it("is honest when the focal has no ingested source or no compiled artifact", () => {
    const cwd = setupProject();
    const id = createNode(cwd, "no source");
    const noSource = verifyFromWalker(loadNodeById(id, cwd)!, cwd);
    expect(noSource.ok).toBe(false);
    if (!noSource.ok) expect(noSource.message).toMatch(/outputs\.files/);

    // Give it a source but no artifact → the other honest branch.
    fs.writeFileSync(path.join(cwd, "src.ts"), "export const a = 1;\n");
    const nodePath = path.join(cwd, ".ontology/nodes", `${id}.json`);
    const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
    node.outputs.files = ["src.ts"];
    fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
    const noArtifact = verifyFromWalker(loadNodeById(id, cwd)!, cwd);
    expect(noArtifact.ok).toBe(false);
    if (!noArtifact.ok) expect(noArtifact.message).toMatch(/:compile first/);
  });

  it("computes the dual-distance verdict against the last compiled artifact (pure, no dispatch)", () => {
    const cwd = setupProject();
    const id = createNode(cwd, "verifiable");
    const source = "export function double(a: number) { return a * 2; }\n";
    fs.writeFileSync(path.join(cwd, "src.ts"), source);
    const nodePath = path.join(cwd, ".ontology/nodes", `${id}.json`);
    const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
    node.outputs.files = ["src.ts"];
    fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
    // Identical "last compile" → ε-equivalent.
    const genDir = path.join(cwd, ".ontology/artifacts/generated");
    fs.mkdirSync(genDir, { recursive: true });
    fs.writeFileSync(path.join(genDir, `${id}.ts`), source);

    const result = verifyFromWalker(loadNodeById(id, cwd)!, cwd);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe("epsilon_equivalent");
    expect(result.metrics.structuralJaccard).toBe(1);
    expect(result.language).toBe("typescript"); // inferred from the .ts extension

    // A divergent artifact flips the verdict — the metric is real.
    fs.writeFileSync(path.join(genDir, `${id}.ts`), "export const somethingElse = 1;\n");
    const divergent = verifyFromWalker(loadNodeById(id, cwd)!, cwd);
    expect(divergent.ok).toBe(true);
    if (divergent.ok) expect(divergent.verdict).not.toBe("epsilon_equivalent");
  });
});

describe("parseWorkflowArgs (:workflow)", () => {
  it("parses graph + input + provider + flags in any order", () => {
    const r = parseWorkflowArgs(" graph.json --input in.txt ollama --model llama3.2:3b --propose-update");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args).toEqual({
      graphFile: "graph.json",
      inputFile: "in.txt",
      provider: "ollama",
      model: "llama3.2:3b",
      proposeUpdate: true,
    });
  });

  it("requires --input and rejects unknown providers/flags", () => {
    expect(parseWorkflowArgs(" graph.json").ok).toBe(false);
    expect(parseWorkflowArgs(" graph.json --input in.txt openrouter").ok).toBe(false);
    expect(parseWorkflowArgs(" graph.json --input in.txt --bogus").ok).toBe(false);
    expect(parseWorkflowArgs("").ok).toBe(false);
  });
});

describe("workflowFromWalker (:workflow)", () => {
  const ACCEPT_GRAPH = {
    name: "tui-accept",
    entry: "g1",
    provides: [{ key: "cap", signature: "(x: string): string" }],
    nodes: [
      { id: "g1", kind: "generator", prompt: "Echo the input: ${INPUT}" },
      { id: "t", kind: "terminal", terminalVerdict: "accept" },
    ],
    edges: [{ from: "g1", to: "t", type: "feeds" }],
  };

  it("runs a graph against mock and reports the verdict (no proposal by default)", async () => {
    const cwd = setupProject();
    const id = createNode(cwd, "focal");
    fs.writeFileSync(path.join(cwd, "graph.json"), JSON.stringify(ACCEPT_GRAPH));
    fs.writeFileSync(path.join(cwd, "in.txt"), "seed");

    const result = await workflowFromWalker({
      focal: loadNodeById(id, cwd)!,
      graphFile: "graph.json",
      inputFile: "in.txt",
      provider: "mock",
      cwd,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe("accept");
    expect(result.proposalId).toBeUndefined();
    const proposalsDir = path.join(cwd, ".ontology/proposals");
    const files = fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : [];
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });

  it("--propose-update routes through the shared §3.6 path: wfrun_* record + node_update on the focal", async () => {
    const cwd = setupProject();
    const id = createNode(cwd, "focal to refine");
    fs.writeFileSync(path.join(cwd, "graph.json"), JSON.stringify(ACCEPT_GRAPH));
    fs.writeFileSync(path.join(cwd, "in.txt"), "seed");

    const result = await workflowFromWalker({
      focal: loadNodeById(id, cwd)!,
      graphFile: "graph.json",
      inputFile: "in.txt",
      provider: "mock",
      proposeUpdate: true,
      cwd,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposalId).toMatch(/^proposal_/);
    expect(result.workflowRunId).toMatch(/^wfrun_[0-9a-f]{8}$/);

    const proposal = JSON.parse(
      fs.readFileSync(path.join(cwd, ".ontology/proposals", `${result.proposalId}.json`), "utf-8"),
    );
    expect(proposal.mutation.kind).toBe("node_update");
    expect(proposal.mutation.payload.nodeId).toBe(id);
    expect(proposal.mutation.payload.provides).toEqual(["cap"]);
    expect(proposal.source.kind).toBe("workflow_run");
    expect(proposal.source.workflowRunId).toBe(result.workflowRunId);
    // The record exists on disk next to the run_* records.
    expect(
      fs.existsSync(path.join(cwd, ".ontology/runs", `${result.workflowRunId}.json`)),
    ).toBe(true);
  });

  it("refuses --propose-update on a rejected run", async () => {
    const cwd = setupProject();
    const id = createNode(cwd, "focal");
    const rejectGraph = {
      ...ACCEPT_GRAPH,
      nodes: [
        { id: "g1", kind: "generator", prompt: "Echo: ${INPUT}" },
        { id: "t", kind: "terminal", terminalVerdict: "reject" },
      ],
    };
    fs.writeFileSync(path.join(cwd, "graph.json"), JSON.stringify(rejectGraph));
    fs.writeFileSync(path.join(cwd, "in.txt"), "seed");

    const result = await workflowFromWalker({
      focal: loadNodeById(id, cwd)!,
      graphFile: "graph.json",
      inputFile: "in.txt",
      provider: "mock",
      proposeUpdate: true,
      cwd,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/accepted/);
  });
});
