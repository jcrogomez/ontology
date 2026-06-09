import * as fs from "node:fs";
import * as path from "node:path";
import { errorMessage } from "../../core/errors.js";
import { loadWorkflowGraphFromFile } from "../../runtime/workflow/graph-load.js";
import {
  runWorkflow,
  type RunWorkflowOptions,
  type WorkflowResult,
} from "../../runtime/workflow/executor.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import { createProposal } from "../../core/proposals/persist.js";
import { readState } from "../../core/state/state-store.js";
import { loadNodeById } from "../../core/project/load.js";
import {
  AbstractionLevelSchema,
  NodeKindSchema,
  type Proposal,
} from "../../schemas/ontology.js";
import { parseTypeScriptFile } from "../../runtime/static/typescript.js";
import type { WorkflowProvision } from "../../schemas/workflow.js";

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
  let contractCheck: ContractCheck | undefined;
  if (options.asProposal) {
    if (result.verdict !== "accept") {
      fail(
        `--as-proposal needs an accepted workflow; this run rejected (${result.reason})`,
        options.json,
      );
      return;
    }
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
    try {
      const proposal = buildProposalFromWorkflow({
        output: result.output,
        level: lvl.data,
        kind: knd.data,
        parent: options.proposalParent,
        label: options.proposalLabel,
        rationale: options.proposalRationale,
        graphName: path.basename(graphPath),
        stepCount: result.stepCount,
        provides: contractCheck.provides,
        provideSignatures: contractCheck.provideSignatures,
        contractNote:
          contractCheck.mismatches.length > 0
            ? `contract mismatch (declared≠produced): ${contractCheck.mismatches.join("; ")}`
            : undefined,
      });
      proposalInfo = { id: proposal.id, status: proposal.status };
    } catch (err) {
      fail(`proposal creation failed: ${errorMessage(err)}`, options.json);
      return;
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          warnings: loaded.warnings,
          result,
          ...(proposalInfo ? { proposal: proposalInfo } : {}),
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
  // its script kind; the source is the artefact text.
  const ext = language!.toLowerCase().startsWith("ts") ? "ts" : "js";
  const measured = parseTypeScriptFile(`workflow-artefact.${ext}`, artefact)
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
// human-gated apply/audit chain wholesale; the only workflow-specific part is
// the provenance rationale. `source` is null — workflows do not persist a run
// record yet (a future enrichment could thread one for a tighter audit link).
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
    source: null,
    validation: null,
    provenance: {
      derivedFrom: [parentNodeId],
      rationale,
    },
  });
  return proposal;
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
