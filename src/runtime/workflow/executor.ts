import { dispatchLlmRequest, type DispatchOptions } from "../llm/dispatcher.js";
import type { LlmProvider, LlmRequest, LlmResponse } from "../llm/types.js";
import type {
  WorkflowNode,
  WorkflowEdge,
  TerminalVerdict,
} from "../../schemas/workflow.js";
import {
  evaluatePredicate,
  type VerifierVisit,
} from "./predicate-parser.js";
import {
  parseVerdict,
  extractJsonObject,
  type VerifierVerdict,
} from "./verifier-schemas.js";
import { edgePredicateKey, type LoadedGraph } from "./graph-load.js";

// Workflow executor (Phase ζ v0).
//
// Walks a LoadedGraph one node at a time, threading the previous
// visit's output into the next visit's input, branching on verifier
// verdicts via the predicate DSL, and terminating on accept / reject
// / no-matching-branch / step-budget-exhausted.
//
// The executor is intentionally serial — v0 picks exactly one
// outgoing edge per verifier visit. Parallel fan-out + join is a v1
// concern (spec §5).
//
// All LLM dispatch goes through `runtime/llm/dispatcher.ts`, which
// already supports mock / ollama / anthropic per the existing
// adapter registry — so the workflow runtime is model-agnostic by
// construction. The per-node `model` field, the CLI-wide
// `--model` / `--provider` overrides, and the dispatcher's
// task-default routing all compose without workflow-specific code.

// ── Public types ────────────────────────────────────────────────────────────

export interface WorkflowVisit {
  /** Step index within the workflow run (1-based for readability). */
  step: number;
  /** Node visited on this step. */
  nodeId: string;
  /** Node kind, repeated for convenience when reading traces. */
  kind: WorkflowNode["kind"];
  /**
   * Input passed to the node. For the entry node this is the
   * workflow's initial input; for downstream nodes it is the
   * previous visit's output (text).
   */
  input: string;
  /**
   * Raw LLM response text. For terminal nodes this is the empty
   * string (no LLM dispatch). For generators it is the generated
   * text. For verifiers it is the verbatim model output BEFORE the
   * JSON extraction — the parsed verdict lives in `verdict`.
   */
  output: string;
  /**
   * Parsed verifier verdict when the node is a verifier; absent
   * otherwise. Carries `verdict`, optional `severity`, etc.
   */
  verdict?: VerifierVerdict;
  /**
   * Free-form notes captured by the executor — e.g. "schema parse
   * retried once" or "fallback verdict used due to parse failure".
   * Empty when nothing notable happened on this visit.
   */
  notes?: string[];
  /** Per-visit wall-clock duration including LLM dispatch. */
  durationMs: number;
  /** Per-visit token usage when the provider reports it. */
  usage?: LlmResponse["usage"];
}

export type WorkflowResult =
  | {
      verdict: "accept";
      reason?: undefined;
      /** Final accumulated output. Comes from the last generator visit. */
      output: string;
      trace: WorkflowVisit[];
      stepCount: number;
      durationMs: number;
    }
  | {
      verdict: "reject";
      /** Why the workflow rejected. */
      reason: string;
      output: string;
      trace: WorkflowVisit[];
      stepCount: number;
      durationMs: number;
    };

export interface RunWorkflowOptions {
  /** Maximum total visits before the runtime rejects with `step_budget_exhausted`. */
  maxSteps?: number;
  /** Provider override for every dispatch in the workflow. */
  provider?: LlmProvider;
  /** Model override for every dispatch (overrides per-node `model`). */
  model?: string;
  /** Ollama host override. */
  ollamaHost?: string;
  /** Anthropic API key override. */
  anthropicApiKey?: string;
  /**
   * When true, do not dispatch any LLM call. Each node visit emits a
   * canned `dry-run` output (and, for verifiers, a fallback
   * `verdict: "pass"` so the workflow takes its happy-path edge).
   * Useful for graph-shape testing without spending tokens.
   */
  dryRun?: boolean;
}

const DEFAULT_MAX_STEPS = 100;

// ── Run ─────────────────────────────────────────────────────────────────────

export async function runWorkflow(
  loaded: LoadedGraph,
  initialInput: string,
  options: RunWorkflowOptions = {},
): Promise<WorkflowResult> {
  const t0 = Date.now();
  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_STEPS);
  const trace: WorkflowVisit[] = [];
  const verifierHistory = new Map<string, VerifierVisit[]>();
  let stepCount = 0;
  let currentNode = loaded.nodesById.get(loaded.graph.entry);
  if (!currentNode) {
    return {
      verdict: "reject",
      reason: `entry node "${loaded.graph.entry}" not found`,
      output: "",
      trace,
      stepCount: 0,
      durationMs: Date.now() - t0,
    };
  }
  let currentInput = initialInput;

  while (stepCount < maxSteps) {
    stepCount += 1;
    const visit = await visitNode(currentNode, currentInput, options);
    visit.step = stepCount;
    trace.push(visit);

    if (currentNode.kind === "terminal") {
      const verdict = currentNode.terminalVerdict ?? "reject";
      return {
        verdict,
        ...(verdict === "reject"
          ? {
              reason:
                currentNode.metadata && typeof currentNode.metadata.reason === "string"
                  ? currentNode.metadata.reason
                  : `terminal ${currentNode.id}`,
            }
          : {}),
        output: currentInput,
        trace,
        stepCount,
        durationMs: Date.now() - t0,
      } as WorkflowResult;
    }

    if (currentNode.kind === "verifier") {
      // Stash this visit in the per-node history so consecutive() /
      // since_last() predicates see it. `verdict` is the JSON-shaped
      // visit; the `current.severity` field is undefined when the
      // schema does not declare it.
      const verifierVisit: VerifierVisit = {
        verdict: visit.verdict?.verdict ?? "fail",
        ...(visit.verdict && "severity" in visit.verdict
          ? { severity: visit.verdict.severity }
          : {}),
      };
      const prior = verifierHistory.get(currentNode.id) ?? [];
      const history = prior.slice();
      verifierHistory.set(currentNode.id, [...prior, verifierVisit]);

      // Find the first matching branches_on edge, in declaration
      // order. Outgoing list is the order encountered when reading
      // graph.edges; structural validation already ensured every
      // edge from a verifier is branches_on, so we cast.
      const sourceId = currentNode.id;
      const outgoing = loaded.outgoingByNodeId.get(sourceId) ?? [];
      let chosen: WorkflowEdge | null = null;
      outgoing.some((edge, idx) => {
        if (edge.type !== "branches_on") return false;
        const ast = loaded.predicateAstByEdge.get(
          edgePredicateKey(sourceId, edge.to, idx),
        );
        if (!ast) return false;
        const matched = evaluatePredicate(ast, {
          current: verifierVisit,
          history,
          stepCount,
        });
        if (matched) {
          chosen = edge;
          return true;
        }
        return false;
      });

      if (!chosen) {
        return {
          verdict: "reject",
          reason: `no_matching_branch at verifier "${currentNode.id}" (verdict: ${verifierVisit.verdict}${
            verifierVisit.severity ? `, severity: ${verifierVisit.severity}` : ""
          })`,
          output: visit.output,
          trace,
          stepCount,
          durationMs: Date.now() - t0,
        };
      }

      const nextNode = loaded.nodesById.get((chosen as WorkflowEdge).to);
      if (!nextNode) {
        return {
          verdict: "reject",
          reason: `internal: edge target "${(chosen as WorkflowEdge).to}" not found`,
          output: visit.output,
          trace,
          stepCount,
          durationMs: Date.now() - t0,
        };
      }
      currentNode = nextNode;
      // The next node's input is the verifier's verbatim output (the
      // raw text response). Generators typically ignore most of it,
      // but for "bug report review → correction" loops the verifier's
      // critique is exactly what the corrector should read.
      currentInput = visit.output;
      continue;
    }

    // Generator. Exactly one outgoing `feeds` edge per graph-load
    // structural check.
    const outgoing = loaded.outgoingByNodeId.get(currentNode.id) ?? [];
    const feeds = outgoing.find((e) => e.type === "feeds");
    if (!feeds) {
      return {
        verdict: "reject",
        reason: `internal: generator "${currentNode.id}" has no outgoing feeds edge`,
        output: visit.output,
        trace,
        stepCount,
        durationMs: Date.now() - t0,
      };
    }
    const nextNode = loaded.nodesById.get(feeds.to);
    if (!nextNode) {
      return {
        verdict: "reject",
        reason: `internal: feeds edge target "${feeds.to}" not found`,
        output: visit.output,
        trace,
        stepCount,
        durationMs: Date.now() - t0,
      };
    }
    currentNode = nextNode;
    currentInput = visit.output;
  }

  return {
    verdict: "reject",
    reason: `step_budget_exhausted (maxSteps = ${maxSteps})`,
    output: currentInput,
    trace,
    stepCount,
    durationMs: Date.now() - t0,
  };
}

// ── Per-node visit ──────────────────────────────────────────────────────────

async function visitNode(
  node: WorkflowNode,
  input: string,
  options: RunWorkflowOptions,
): Promise<WorkflowVisit> {
  const t0 = Date.now();
  if (node.kind === "terminal") {
    return {
      step: 0, // filled in by caller
      nodeId: node.id,
      kind: node.kind,
      input,
      output: "",
      durationMs: Date.now() - t0,
    };
  }
  if (options.dryRun) {
    return dryRunVisit(node, input, t0);
  }

  // Pass-through generator: echo input verbatim, no LLM dispatch.
  // Used to preserve an artefact across a verifier self-loop (see
  // examples/workflow-imo-verify-refine for the canonical use).
  if (node.kind === "generator" && node.passThrough === true) {
    return {
      step: 0,
      nodeId: node.id,
      kind: node.kind,
      input,
      output: input,
      durationMs: Date.now() - t0,
      notes: ["pass-through: no LLM dispatch"],
    };
  }

  const dispatchOptions: DispatchOptions = {};
  if (options.provider !== undefined) dispatchOptions.provider = options.provider;
  if (options.ollamaHost !== undefined) dispatchOptions.ollamaHost = options.ollamaHost;
  if (options.anthropicApiKey !== undefined) {
    dispatchOptions.anthropicApiKey = options.anthropicApiKey;
  }
  // CLI-wide --model overrides the per-node model; per-node model
  // wins over the dispatcher's task-default routing only when no CLI
  // override is set.
  const resolvedModel = options.model ?? node.model;
  if (resolvedModel !== undefined) dispatchOptions.defaultModel = resolvedModel;

  const request: LlmRequest = {
    task: node.kind === "verifier" ? "node_critique" : "node_expand",
    prompt: composePrompt(node, input),
    ...(node.system !== undefined ? { system: node.system } : {}),
    ...(node.temperature !== undefined ? { temperature: node.temperature } : {}),
    metadata: {
      workflow: { nodeId: node.id, kind: node.kind },
    },
  };

  if (node.kind === "generator") {
    const response = await dispatchLlmRequest(request, dispatchOptions);
    const visit: WorkflowVisit = {
      step: 0,
      nodeId: node.id,
      kind: node.kind,
      input,
      output: response.text,
      durationMs: Date.now() - t0,
    };
    if (response.usage) visit.usage = response.usage;
    return visit;
  }

  // Verifier: dispatch, try to parse JSON-shaped verdict, retry once
  // on parse failure, fall back to schema_parse_failed verdict on
  // second failure so the workflow has a defined branch to take.
  if (!node.verifierSchema) {
    throw new Error(
      `verifier "${node.id}" missing verifierSchema — graph-load invariant violated`,
    );
  }
  const notes: string[] = [];
  let response = await dispatchLlmRequest(request, dispatchOptions);
  let parsed = tryParseVerdict(node.verifierSchema, response.text);
  if (!parsed) {
    notes.push("first verifier response did not match schema; retrying once");
    const retryRequest: LlmRequest = {
      ...request,
      prompt:
        request.prompt +
        `\n\n[your last response did not match the required schema; please respond with ONLY a JSON object matching the schema "${node.verifierSchema}"]`,
    };
    response = await dispatchLlmRequest(retryRequest, dispatchOptions);
    parsed = tryParseVerdict(node.verifierSchema, response.text);
  }
  let verdict: VerifierVerdict;
  if (parsed) {
    verdict = parsed;
  } else {
    notes.push("schema parse failed twice; using fallback verdict");
    verdict =
      node.verifierSchema === "with-severity"
        ? {
            verdict: "fail",
            severity: "major",
            issues: ["schema_parse_failed"],
          }
        : { verdict: "fail", reason: "schema_parse_failed" };
  }
  const visit: WorkflowVisit = {
    step: 0,
    nodeId: node.id,
    kind: node.kind,
    input,
    output: response.text,
    verdict,
    durationMs: Date.now() - t0,
  };
  if (notes.length > 0) visit.notes = notes;
  if (response.usage) visit.usage = response.usage;
  return visit;
}

function composePrompt(node: WorkflowNode, input: string): string {
  const body = node.prompt ?? "";
  if (!input) return body;
  // The simplest composition: append the incoming input after the
  // node's own prompt under an `INPUT:` heading. Workflows that
  // need different composition can use `${INPUT}` in their prompt
  // body and the runtime will substitute (v1).
  return `${body}\n\nINPUT:\n${input}`;
}

function tryParseVerdict(
  schemaName: NonNullable<WorkflowNode["verifierSchema"]>,
  text: string,
): VerifierVerdict | null {
  const json = extractJsonObject(text);
  if (json === null) return null;
  try {
    return parseVerdict(schemaName, json);
  } catch {
    return null;
  }
}

function dryRunVisit(
  node: WorkflowNode,
  input: string,
  t0: number,
): WorkflowVisit {
  const out: WorkflowVisit = {
    step: 0,
    nodeId: node.id,
    kind: node.kind,
    input,
    output:
      node.kind === "verifier"
        ? `{"verdict":"pass"}`
        : `[dry-run output of ${node.id}]`,
    durationMs: Date.now() - t0,
    notes: ["dry-run: no LLM dispatch"],
  };
  if (node.kind === "verifier") {
    out.verdict =
      node.verifierSchema === "with-severity"
        ? { verdict: "pass", severity: "minor", issues: [] }
        : { verdict: "pass" };
  }
  return out;
}

// Re-export for use by tests / external callers that build a result
// without the full executor (e.g. constructing one from a custom
// dispatch loop). Reserved; not used internally.
type _TerminalVerdict = TerminalVerdict;
