import * as fs from "node:fs";
import * as path from "node:path";
import { loadWorkflowGraphFromFile } from "../../../runtime/workflow/graph-load.js";
import { runWorkflow, type RunWorkflowOptions } from "../../../runtime/workflow/executor.js";
import { createWorkflowRunRecord } from "../../../kernel/core/runs/workflow-record.js";
import {
  resolveContract,
  buildUpdateProposalsFromWorkflow,
  projectWorkflowArtefact,
} from "../../commands/workflow/run.js";
import type { OntologyNode, ProposalWorkflowSource } from "../../../kernel/schemas/ontology.js";
import type { LlmProvider } from "../../../runtime/llm/types.js";

// Walker v1.5 action: `:workflow <graph> --input <file> [provider]
// [--model <m>] [--propose-update]` — run a Phase ζ workflow graph from the
// TUI. With --propose-update an ACCEPTED run goes through the exact §3.6
// provenance path the CLI uses (persist a wfrun_* record, then a node_update
// proposal on the FOCAL node + edge_create proposals for graph-declared
// edges) — the walker only chooses the target; the substrate is shared.

export interface WorkflowFromWalkerOptions {
  focal: OntologyNode;
  graphFile: string;
  inputFile: string;
  provider?: LlmProvider;
  model?: string;
  ollamaHost?: string;
  /** On accept: propose a node_update of the focal with the artefact (§3.6). */
  proposeUpdate?: boolean;
  cwd?: string;
}

export type WorkflowFromWalkerResult =
  | {
      ok: true;
      graphName: string;
      verdict: "accept" | "reject";
      reason?: string;
      stepCount: number;
      durationMs: number;
      outputPreview: string;
      warnings: string[];
      workflowRunId?: string;
      proposalId?: string;
      edgeProposalIds?: string[];
    }
  | { ok: false; message: string };

const PREVIEW_CHARS = 280;

export async function workflowFromWalker(
  options: WorkflowFromWalkerOptions,
): Promise<WorkflowFromWalkerResult> {
  const cwd = options.cwd ?? process.cwd();
  const graphPath = path.isAbsolute(options.graphFile)
    ? options.graphFile
    : path.resolve(cwd, options.graphFile);
  if (!fs.existsSync(graphPath)) {
    return { ok: false, message: `workflow graph not found: ${options.graphFile}` };
  }
  const inputPath = path.isAbsolute(options.inputFile)
    ? options.inputFile
    : path.resolve(cwd, options.inputFile);
  if (!fs.existsSync(inputPath)) {
    return { ok: false, message: `input file not found: ${options.inputFile}` };
  }

  let loaded;
  try {
    loaded = loadWorkflowGraphFromFile(graphPath);
  } catch (err: unknown) {
    return { ok: false, message: `graph load failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const initialInput = fs.readFileSync(inputPath, "utf-8");
  const runOptions: RunWorkflowOptions = {};
  if (options.provider !== undefined) runOptions.provider = options.provider;
  if (options.model !== undefined) runOptions.model = options.model;
  if (options.ollamaHost !== undefined) runOptions.ollamaHost = options.ollamaHost;

  let result;
  try {
    result = await runWorkflow(loaded, initialInput, runOptions);
  } catch (err: unknown) {
    return { ok: false, message: `workflow run failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const base = {
    ok: true as const,
    graphName: loaded.graph.name ?? path.basename(graphPath),
    verdict: result.verdict,
    ...(result.verdict === "reject" && result.reason !== undefined
      ? { reason: result.reason }
      : {}),
    stepCount: result.stepCount,
    durationMs: result.durationMs,
    outputPreview:
      result.output.slice(0, PREVIEW_CHARS) +
      (result.output.length > PREVIEW_CHARS ? " …" : ""),
    warnings: loaded.warnings,
  };

  if (!options.proposeUpdate) return base;
  if (result.verdict !== "accept") {
    return { ok: false, message: `--propose-update needs an accepted run; this one rejected (${result.reason})` };
  }

  // §3.6 provenance, shared with the CLI: record first, proposals second.
  try {
    const contractCheck = resolveContract(
      loaded.graph.provides ?? [],
      loaded.graph.artefactLanguage,
      result.output,
    );
    const { record } = createWorkflowRunRecord({
      graphName: loaded.graph.name ?? null,
      graphFile: path.basename(graphPath),
      graphText: fs.readFileSync(graphPath, "utf-8"),
      inputText: initialInput,
      provider: options.provider ?? null,
      model: options.model ?? null,
      result: {
        verdict: result.verdict,
        reason: null,
        stepCount: result.stepCount,
        durationMs: result.durationMs,
      },
      steps: result.trace.map((v) => ({
        step: v.step,
        nodeId: v.nodeId,
        kind: v.kind,
        durationMs: v.durationMs,
        verdict: v.verdict?.verdict ?? null,
      })),
      cwd,
    });
    const source: ProposalWorkflowSource = {
      kind: "workflow_run",
      workflowRunId: record.id,
      graphHash: record.graph.graphHash,
      inputHash: record.inputHash,
      provider: options.provider ?? null,
      model: options.model ?? null,
    };
    const built = buildUpdateProposalsFromWorkflow({
      nodeId: options.focal.id,
      // Same projection as the CLI: fences stripped for code artefacts.
      output: projectWorkflowArtefact(result.output, loaded.graph.artefactLanguage),
      graphName: path.basename(graphPath),
      stepCount: result.stepCount,
      provides: contractCheck.provides,
      provideSignatures: contractCheck.provideSignatures,
      ...(contractCheck.mismatches.length > 0
        ? {
            contractNote: `contract mismatch (declared≠produced): ${contractCheck.mismatches.join("; ")}`,
          }
        : {}),
      proposesEdges: loaded.graph.proposesEdges,
      source,
      cwd,
    });
    return {
      ...base,
      workflowRunId: record.id,
      proposalId: built.nodeProposal.id,
      edgeProposalIds: built.edgeProposals.map((p) => p.id),
    };
  } catch (err: unknown) {
    return { ok: false, message: `proposal creation failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
