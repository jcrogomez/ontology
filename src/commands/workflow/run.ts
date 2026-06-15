import * as fs from "node:fs";
import * as path from "node:path";
import { errorMessage } from "../../kernel/core/errors.js";
import { loadWorkflowGraphFromFile } from "../../runtime/workflow/graph-load.js";
import {
  runWorkflow,
  type RunWorkflowOptions,
  type WorkflowResult,
} from "../../runtime/workflow/executor.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import { createProposal } from "../../kernel/core/proposals/persist.js";
import { createWorkflowRunRecord } from "../../kernel/core/runs/workflow-record.js";
import { readState } from "../../kernel/core/state/state-store.js";
import { loadNodeById } from "../../kernel/core/project/load.js";
import {
  AbstractionLevelSchema,
  EdgeTypeSchema,
  NodeKindSchema,
  type OntologyNode,
  type Proposal,
  type ProposalWorkflowSource,
} from "../../kernel/schemas/ontology.js";
import { validateEdgeDirection } from "../../kernel/graph/poset.js";
import { parseTypeScriptFile } from "../../runtime/static/typescript.js";
import { extractCodeFence } from "../../forward/compile/post/extract-code-fence.js";
import type { WorkflowProposedEdge, WorkflowProvision } from "../../kernel/schemas/workflow.js";

// `onto workflow run` — Phase ζ v0.
//
// Load a workflow graph JSON, run it against an input file, and
// emit a summary + trace. The CLI surface mirrors the
// WORKFLOW_RUNTIME_SPEC §3.5 contract.

export interface WorkflowRunOptions {
  /** Path to the input file whose contents seed the workflow. */
  input: string;
  /** Maximum total node visits. Default 100. */
  maxSteps?: number;
  /** Where to write the JSON trace. When omitted, the trace is suppressed in human mode and embedded in --json output. */
  trace?: string;
  provider?: string;
  model?: string;
  ollamaHost?: string;
  /** Validate the graph + input and report; no LLM dispatch. */
  dryRun?: boolean;
  json?: boolean;
  // O3 (CONTEXT_GLUING_REGIMES.md): close the execution→intent loop. When
  // set, an ACCEPTED workflow's final artefact becomes a pending
  // `node_create` proposal (for human review via `onto proposal apply`),
  // letting an execution propose growth of the intention graph rather than
  // just print a result. Requires an initialised `.ontology/` project.
  asProposal?: boolean;
  // §3.6 mode 2 (refine): propose a node_update of this existing node
  // instead of a node_create. Mutually exclusive with the create-mode
  // level/kind/parent options. Graph-declared proposesEdges become
  // edge_create proposals alongside (both endpoints exist in this mode).
  updateNode?: string;
  proposalLevel?: string;
  proposalKind?: string;
  proposalParent?: string;
  proposalLabel?: string;
  proposalRationale?: string;
}

export async function workflowRunCommand(
  graphFile: string,
  options: WorkflowRunOptions,
): Promise<void> {
  const cwd = process.cwd();
  const graphPath = path.isAbsolute(graphFile)
    ? graphFile
    : path.resolve(cwd, graphFile);
  if (!fs.existsSync(graphPath)) {
    fail(`workflow graph not found: ${graphPath}`, options.json);
    return;
  }
  const inputPath = path.isAbsolute(options.input)
    ? options.input
    : path.resolve(cwd, options.input);
  if (!fs.existsSync(inputPath)) {
    fail(`input file not found: ${inputPath}`, options.json);
    return;
  }
  // A dry run forces every verifier to pass and produces canned placeholder
  // output; turning that into a pending proposal would pollute the
  // append-only proposal sequence and audit chain with junk. Refuse upfront.
  if (options.asProposal && options.dryRun) {
    fail(
      `--as-proposal cannot be combined with --dry-run (a dry run produces placeholder output, not a real artefact)`,
      options.json,
    );
    return;
  }

  let loaded;
  try {
    loaded = loadWorkflowGraphFromFile(graphPath);
  } catch (err) {
    fail(`graph load failed: ${errorMessage(err)}`, options.json);
    return;
  }

  // Surface non-fatal load-time warnings (branch-coverage gaps, spec
  // §3.2). In human mode print them before running; in --json mode
  // they ride along in the result envelope below.
  if (!options.json && loaded.warnings.length > 0) {
    for (const w of loaded.warnings) {
      console.error(`⚠ ${w}`);
    }
  }

  const initialInput = fs.readFileSync(inputPath, "utf-8");

  const provider = options.provider as LlmProvider | undefined;
  const runOptions: RunWorkflowOptions = {};
  if (options.maxSteps !== undefined) runOptions.maxSteps = options.maxSteps;
  if (provider !== undefined) runOptions.provider = provider;
  if (options.model !== undefined) runOptions.model = options.model;
  if (options.ollamaHost !== undefined) runOptions.ollamaHost = options.ollamaHost;
  if (options.dryRun) runOptions.dryRun = true;

  let result: WorkflowResult;
  try {
    result = await runWorkflow(loaded, initialInput, runOptions);
  } catch (err) {
    fail(`workflow run failed: ${errorMessage(err)}`, options.json);
    return;
  }

  if (options.trace) {
    const absTrace = path.isAbsolute(options.trace)
      ? options.trace
      : path.resolve(cwd, options.trace);
    fs.mkdirSync(path.dirname(absTrace), { recursive: true });
    fs.writeFileSync(absTrace, JSON.stringify(result, null, 2), "utf-8");
  }

  // O3: close the execution→intent loop. An accepted workflow's final
  // artefact can become a pending node_create proposal over the existing
  // proposal substrate — nothing mutates the graph here; `onto proposal
  // apply` is the human-gated step.
  let proposalInfo: { id: string; status: string } | undefined;
  // §3.6 provenance: id of the persisted workflow run record (wfrun_*).
  let workflowRunId: string | undefined;
  // §3.6: edge proposals (update mode) in recommended apply order — edges
  // BEFORE the node_update, because the update rewrites the focal node's
  // hash and stales any still-pending edge proposal pinned to it.
  let edgeProposalInfos: Array<{ id: string; status: string; edge: string }> = [];
  let deferredEdges: WorkflowProposedEdge[] = [];
  let contractCheck: ContractCheck | undefined;
  if (options.asProposal) {
    if (result.verdict !== "accept") {
      fail(
        `--as-proposal needs an accepted workflow; this run rejected (${result.reason})`,
        options.json,
      );
      return;
    }
    if (
      options.updateNode !== undefined &&
      (options.proposalLevel !== undefined ||
        options.proposalKind !== undefined ||
        options.proposalParent !== undefined)
    ) {
      fail(
        `--update-node is mutually exclusive with --proposal-level/--proposal-kind/--proposal-parent (the target node already has them)`,
        options.json,
      );
      return;
    }
    // O4: resolve the output contract. The workflow's declared `provides`
    // (intent) is measured against the produced artefact when it is code
    // (the round-trip); the node carries the MEASURED contract when available
    // (grounded) and the declared one otherwise (intent), with declared≠
    // produced surfaced as a defect.
    contractCheck = resolveContract(
      loaded.graph.provides ?? [],
      loaded.graph.artefactLanguage,
      result.output,
    );
    // Surface mismatches before the (still-created) proposal — a defect to
    // review, not a hard block: the human decides on apply.
    if (!options.json && contractCheck.mismatches.length > 0) {
      console.error(`⚠ contract check (declared ≠ produced):`);
      for (const m of contractCheck.mismatches) console.error(`  - ${m}`);
    }
    const contractNote =
      contractCheck.mismatches.length > 0
        ? `contract mismatch (declared≠produced): ${contractCheck.mismatches.join("; ")}`
        : undefined;
    // The proposal carries the PROJECTED artefact (fences stripped for code
    // languages) — the same text the contract was measured against, and the
    // same projection the compiler applies before writing artifacts.
    const artefactForProposal = projectWorkflowArtefact(
      result.output,
      loaded.graph.artefactLanguage,
    );

    // §3.6 provenance: persist the workflow run record FIRST so every
    // proposal born from this run carries a non-null source pointing at it.
    let source: ProposalWorkflowSource;
    try {
      const { record } = createWorkflowRunRecord({
        graphName: loaded.graph.name ?? null,
        graphFile: path.basename(graphPath),
        graphText: fs.readFileSync(graphPath, "utf-8"),
        inputText: initialInput,
        provider: options.provider ?? null,
        model: options.model ?? null,
        result: {
          // The record persists only on the --as-proposal path, which has
          // already required an ACCEPTED run — so reason is always null here.
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
      });
      workflowRunId = record.id;
      source = {
        kind: "workflow_run",
        workflowRunId: record.id,
        graphHash: record.graph.graphHash,
        inputHash: record.inputHash,
        provider: options.provider ?? null,
        model: options.model ?? null,
      };
    } catch (err) {
      fail(`workflow run-record persistence failed: ${errorMessage(err)}`, options.json);
      return;
    }

    if (options.updateNode !== undefined) {
      // §3.6 mode 2 — refine: node_update of the existing node, plus
      // edge_create proposals for the graph-declared edges (both
      // endpoints exist in this mode).
      try {
        const built = buildUpdateProposalsFromWorkflow({
          nodeId: options.updateNode,
          output: artefactForProposal,
          label: options.proposalLabel,
          rationale: options.proposalRationale,
          graphName: path.basename(graphPath),
          stepCount: result.stepCount,
          provides: contractCheck.provides,
          provideSignatures: contractCheck.provideSignatures,
          contractNote,
          proposesEdges: loaded.graph.proposesEdges,
          source,
        });
        edgeProposalInfos = built.edgeProposals.map((p) => ({
          id: p.id,
          status: p.status,
          edge:
            p.mutation.kind === "edge_create"
              ? `${p.mutation.payload.from} -${p.mutation.payload.type}-> ${p.mutation.payload.to}`
              : "",
        }));
        proposalInfo = { id: built.nodeProposal.id, status: built.nodeProposal.status };
      } catch (err) {
        fail(`proposal creation failed: ${errorMessage(err)}`, options.json);
        return;
      }
    } else {
      const lvl = AbstractionLevelSchema.safeParse(options.proposalLevel);
      if (!lvl.success) {
        fail(
          `--as-proposal requires a valid --proposal-level (got: ${options.proposalLevel ?? "missing"})`,
          options.json,
        );
        return;
      }
      const knd = NodeKindSchema.safeParse(options.proposalKind);
      if (!knd.success) {
        fail(
          `--as-proposal requires a valid --proposal-kind (got: ${options.proposalKind ?? "missing"})`,
          options.json,
        );
        return;
      }
      try {
        const proposal = buildProposalFromWorkflow({
          output: artefactForProposal,
          level: lvl.data,
          kind: knd.data,
          parent: options.proposalParent,
          label: options.proposalLabel,
          rationale: options.proposalRationale,
          graphName: path.basename(graphPath),
          stepCount: result.stepCount,
          provides: contractCheck.provides,
          provideSignatures: contractCheck.provideSignatures,
          contractNote,
          source,
        });
        proposalInfo = { id: proposal.id, status: proposal.status };
      } catch (err) {
        fail(`proposal creation failed: ${errorMessage(err)}`, options.json);
        return;
      }
      // Create mode cannot propose edges in-run (the focal id is born at
      // apply time) — surface the declaration as a deferred note (§3.6).
      deferredEdges = loaded.graph.proposesEdges ?? [];
      if (!options.json && deferredEdges.length > 0) {
        console.error(
          `ℹ ${deferredEdges.length} declared edge(s) NOT proposed: create mode defers edges until the node exists (apply the proposal, then propose the edges against the created id)`,
        );
      }
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          warnings: loaded.warnings,
          result,
          ...(workflowRunId ? { workflowRun: { id: workflowRunId } } : {}),
          ...(proposalInfo ? { proposal: proposalInfo } : {}),
          // Recommended apply order: edges first, then the node proposal.
          ...(edgeProposalInfos.length > 0 ? { edgeProposals: edgeProposalInfos } : {}),
          ...(deferredEdges.length > 0 ? { deferredProposedEdges: deferredEdges } : {}),
          ...(contractCheck ? { contractCheck } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  printResultHuman(result, graphPath, options.trace);
  if (proposalInfo) {
    if (workflowRunId) {
      console.log(`run record: ${workflowRunId} (provenance for the proposals below)`);
    }
    // Apply order matters in update mode: the node_update rewrites the focal
    // hash, staling any still-pending edge proposal — so edges print first.
    for (const e of edgeProposalInfos) {
      console.log(
        `proposal:  ${e.id} (${e.status}) — edge ${e.edge} — apply BEFORE the node update`,
      );
    }
    console.log(
      `proposal:  ${proposalInfo.id} (${proposalInfo.status}) — review with \`onto proposal apply ${proposalInfo.id}\``,
    );
    if (contractCheck && contractCheck.provides.length > 0) {
      const tag = contractCheck.measured ? "measured" : "declared";
      console.log(
        `contract:  ${contractCheck.provides.join(", ")} (${tag})${
          contractCheck.mismatches.length > 0 ? ` — ⚠ ${contractCheck.mismatches.length} mismatch(es)` : " — ✓ verified"
        }`,
      );
    }
    console.log(``);
  }
}

// ── Output contract resolution (O4) ───────────────────────────────────────────

export interface ContractCheck {
  // Keys + signatures the proposed node will carry (measured when available,
  // else declared).
  provides: string[];
  provideSignatures: Record<string, string>;
  // True when the contract was MEASURED from the artefact (code), false when
  // it is the author's declaration only (no measurement possible).
  measured: boolean;
  // declared ≠ produced findings (empty when verified or not measurable).
  mismatches: string[];
}

const CODE_LANGUAGES = new Set([
  "typescript", "ts", "tsx", "javascript", "js", "jsx",
]);

// Parity with the compiler (2026-06-09, found by the first live ζ run):
// models wrap code artefacts in markdown fences, and compile-node strips
// them via extractCodeFence before writing artifacts. The workflow path
// must apply the SAME projection before measuring the contract and before
// carrying the artefact into a proposal — otherwise a fenced-but-correct
// artefact measures as an empty contract and the proposed node's prompt
// carries LLM packaging instead of the work product. Non-code artefacts
// pass through verbatim (a fence may be content there).
export function projectWorkflowArtefact(
  artefact: string,
  language: string | undefined,
): string {
  if (language === undefined || !CODE_LANGUAGES.has(language.toLowerCase())) {
    return artefact;
  }
  return extractCodeFence({ text: artefact, language }).content;
}

// The round-trip F∘G ≈ id on a single output. `declared` is the workflow's
// intent; when `language` is code, the artefact is parsed (G) and the measured
// contract is compared to the declaration. The node carries the measured
// contract when available (grounded), the declared one otherwise.
export function resolveContract(
  declared: WorkflowProvision[],
  language: string | undefined,
  artefact: string,
): ContractCheck {
  const declaredByKey = new Map(declared.map((p) => [p.key, p.signature]));
  const canMeasure =
    language !== undefined && CODE_LANGUAGES.has(language.toLowerCase());

  if (!canMeasure) {
    // Declaration stands alone — intent without measurement (honest
    // degradation for non-extractable artefacts).
    const provideSignatures: Record<string, string> = {};
    for (const p of declared) if (p.signature) provideSignatures[p.key] = p.signature;
    return {
      provides: declared.map((p) => p.key),
      provideSignatures,
      measured: false,
      mismatches: [],
    };
  }

  // Measure the produced artefact (G). A synthetic filename gives the parser
  // its script kind; the source is the FENCE-STRIPPED artefact text (the
  // same projection the compiler applies before writing artifacts).
  const ext = language!.toLowerCase().startsWith("ts") ? "ts" : "js";
  const measured = parseTypeScriptFile(
    `workflow-artefact.${ext}`,
    projectWorkflowArtefact(artefact, language),
  )
    .exports.filter((e) => !e.isDefault)
    .map((e) => ({ key: e.name, signature: e.signature }));
  const measuredByKey = new Map(measured.map((m) => [m.key, m.signature]));

  const mismatches: string[] = [];
  for (const [key, decSig] of declaredByKey) {
    if (!measuredByKey.has(key)) {
      mismatches.push(`declared "${key}" but the artefact does not provide it`);
      continue;
    }
    const prodSig = measuredByKey.get(key);
    if (decSig !== undefined && prodSig !== undefined && decSig !== prodSig) {
      mismatches.push(
        `"${key}" signature drift — declared \`${decSig}\`, produced \`${prodSig}\``,
      );
    }
  }
  // Produced-but-not-declared is informational (the workflow over-delivered),
  // surfaced so the author can tighten the declaration.
  for (const m of measured) {
    if (!declaredByKey.has(m.key)) {
      mismatches.push(`produced "${m.key}" which the workflow did not declare`);
    }
  }

  const provideSignatures: Record<string, string> = {};
  for (const m of measured) if (m.signature) provideSignatures[m.key] = m.signature;
  return {
    provides: measured.map((m) => m.key),
    provideSignatures,
    measured: true,
    mismatches,
  };
}

// Map an accepted workflow's final artefact onto a pending `node_create`
// proposal. Reuses the generic proposal substrate (`createProposal`) and the
// human-gated apply/audit chain wholesale; the workflow-specific parts are
// the provenance rationale and the §3.6 workflow-run source (the persisted
// `wfrun_*` record carrying the multi-step provenance).
function buildProposalFromWorkflow(args: {
  output: string;
  level: ReturnType<typeof AbstractionLevelSchema.parse>;
  kind: ReturnType<typeof NodeKindSchema.parse>;
  parent?: string;
  label?: string;
  rationale?: string;
  graphName: string;
  stepCount: number;
  // O4: the resolved output contract (measured-or-declared) the node carries.
  provides?: string[];
  provideSignatures?: Record<string, string>;
  // Appended to the rationale when the round-trip found declared≠produced.
  contractNote?: string;
  source: ProposalWorkflowSource;
}): Proposal {
  const state = readState();
  const parentNodeId = args.parent ?? state.rootNodeId;
  const parentNode = loadNodeById(parentNodeId);
  if (!parentNode) {
    throw new Error(`parent node not found: ${parentNodeId}`);
  }
  const baseRationale =
    args.rationale ??
    `Produced by workflow run "${args.graphName}" (${args.stepCount} steps).`;
  const rationale = args.contractNote
    ? `${baseRationale} ⚠ ${args.contractNote}`
    : baseRationale;
  const hasContract = args.provides !== undefined && args.provides.length > 0;
  const hasSigs =
    args.provideSignatures !== undefined &&
    Object.keys(args.provideSignatures).length > 0;
  const { proposal } = createProposal({
    mutation: {
      kind: "node_create",
      payload: {
        level: args.level,
        kind: args.kind,
        prompt: args.output,
        label: args.label ?? null,
        parentNodeId,
        ...(hasContract ? { provides: args.provides } : {}),
        ...(hasSigs ? { provideSignatures: args.provideSignatures } : {}),
      },
      parentHash: parentNode.integrity.hash,
    },
    source: args.source,
    validation: null,
    provenance: {
      derivedFrom: [parentNodeId],
      rationale,
    },
  });
  return proposal;
}

// §3.6 mode 2 — refine: map the accepted artefact onto a pending
// `node_update` proposal of an EXISTING node (artefact → prompt, resolved
// contract → provides/provideSignatures), plus one `edge_create` proposal
// per graph-declared edge. All edge declarations are validated (type
// vocabulary, endpoint existence, self-loop, poset direction) BEFORE any
// proposal is created, so a bad declaration never leaves a partial set in
// the append-only sequence. Exported for the walker's `:workflow
// --propose-update` (v1.5), which reuses the exact same provenance path.
export function buildUpdateProposalsFromWorkflow(args: {
  nodeId: string;
  output: string;
  label?: string;
  rationale?: string;
  graphName: string;
  stepCount: number;
  provides: string[];
  provideSignatures: Record<string, string>;
  contractNote?: string;
  proposesEdges: WorkflowProposedEdge[] | undefined;
  // §3.6 provenance: the persisted workflow run record every proposal of
  // this run references.
  source: ProposalWorkflowSource;
  cwd?: string;
}): { edgeProposals: Proposal[]; nodeProposal: Proposal } {
  const target = loadNodeById(args.nodeId, args.cwd);
  if (!target) {
    throw new Error(`update target not found: ${args.nodeId}`);
  }

  // Validation pass over every declared edge — no proposal is created yet.
  const resolvedEdges: Array<{
    fromNode: OntologyNode;
    toNode: OntologyNode;
    type: ReturnType<typeof EdgeTypeSchema.parse>;
  }> = [];
  for (const e of args.proposesEdges ?? []) {
    const edgeType = EdgeTypeSchema.safeParse(e.type);
    if (!edgeType.success) {
      throw new Error(
        `proposesEdges: invalid edge type "${e.type}" (expected one of: ${EdgeTypeSchema.options.join(", ")})`,
      );
    }
    const other = loadNodeById(e.target, args.cwd);
    if (!other) {
      throw new Error(`proposesEdges: target node not found: ${e.target}`);
    }
    const [fromNode, toNode] = e.direction === "in" ? [other, target] : [target, other];
    if (fromNode.id === toNode.id) {
      throw new Error(`proposesEdges: self-loop refused (${fromNode.id} → ${toNode.id})`);
    }
    const direction = validateEdgeDirection({
      sourceLevel: fromNode.coordinates.abstraction,
      targetLevel: toNode.coordinates.abstraction,
      edgeType: edgeType.data,
    });
    if (!direction.ok) {
      throw new Error(`proposesEdges: ${direction.reason}`);
    }
    resolvedEdges.push({ fromNode, toNode, type: edgeType.data });
  }

  // Edge proposals first — they pin the focal node's CURRENT hash, which the
  // node_update will rewrite; the printed apply order preserves validity.
  const edgeProposals: Proposal[] = [];
  for (const e of resolvedEdges) {
    const { proposal } = createProposal({
      mutation: {
        kind: "edge_create",
        payload: { from: e.fromNode.id, to: e.toNode.id, type: e.type, branch: null },
        fromHash: e.fromNode.integrity.hash,
        toHash: e.toNode.integrity.hash,
      },
      source: args.source,
      validation: null,
      provenance: {
        derivedFrom: [e.fromNode.id, e.toNode.id],
        rationale: `Edge declared by workflow "${args.graphName}" (proposesEdges, §3.6).`,
      },
      cwd: args.cwd,
    });
    edgeProposals.push(proposal);
  }

  const baseRationale =
    args.rationale ??
    `Refined by workflow run "${args.graphName}" (${args.stepCount} steps).`;
  const rationale = args.contractNote
    ? `${baseRationale} ⚠ ${args.contractNote}`
    : baseRationale;
  const hasContract = args.provides.length > 0;
  const hasSigs = Object.keys(args.provideSignatures).length > 0;
  const { proposal } = createProposal({
    mutation: {
      kind: "node_update",
      payload: {
        nodeId: target.id,
        prompt: args.output,
        ...(args.label !== undefined ? { label: args.label } : {}),
        ...(hasContract ? { provides: args.provides } : {}),
        ...(hasContract && hasSigs ? { provideSignatures: args.provideSignatures } : {}),
      },
      nodeHash: target.integrity.hash,
    },
    source: args.source,
    validation: null,
    provenance: {
      derivedFrom: [target.id],
      rationale,
    },
    cwd: args.cwd,
  });
  return { edgeProposals, nodeProposal: proposal };
}

function printResultHuman(
  result: WorkflowResult,
  graphPath: string,
  tracePath: string | undefined,
): void {
  const label = result.verdict === "accept" ? "✓ ACCEPT" : "✗ REJECT";
  console.log(``);
  console.log(`${label}  (workflow: ${path.basename(graphPath)})`);
  console.log(`steps: ${result.stepCount}   wall-clock: ${result.durationMs}ms`);
  if (result.verdict === "reject") {
    console.log(`reason: ${result.reason}`);
  }
  console.log(``);
  console.log(`trace:`);
  for (const v of result.trace) {
    const kindTag = v.kind === "verifier" ? "VER" : v.kind === "terminal" ? "TRM" : "GEN";
    const verdictTag =
      v.verdict !== undefined
        ? ` [verdict=${v.verdict.verdict}${
            "severity" in v.verdict ? `, severity=${v.verdict.severity}` : ""
          }]`
        : "";
    const noteTag =
      v.notes && v.notes.length > 0 ? `  // ${v.notes.join("; ")}` : "";
    console.log(
      `  ${String(v.step).padStart(3)}. ${kindTag}  ${v.nodeId}${verdictTag}  (${v.durationMs}ms)${noteTag}`,
    );
  }
  console.log(``);
  if (result.verdict === "accept") {
    const preview = result.output.slice(0, 300);
    const truncated = result.output.length > 300 ? " …" : "";
    console.log(`output preview:\n${preview}${truncated}`);
    console.log(``);
  }
  if (tracePath) {
    console.log(`full trace written to: ${tracePath}`);
  }
}

function fail(message: string, json: boolean | undefined): void {
  // Nonzero exit so scripts/CI can detect failure without parsing output.
  // `exitCode` (not `process.exit`) lets pending writes flush.
  process.exitCode = 1;
  if (json) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(`✖ ${message}`);
  }
}
