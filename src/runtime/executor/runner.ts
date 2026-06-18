// The EXECUTOR runner: a topological walk that drives the pure policy over the
// real machinery. NOT a map over nodes — a dependency-ordered walk where a
// node's upstream-closed status feeds its decision, so a node whose dependency
// failed is honestly reported `blocked-upstream` rather than mis-blamed.
//
// runRegenerate is injected (ExecutorDeps.regenerate) so the walk, the policy
// integration, and the governance (write only on `closed`) are testable without
// a live LLM. The default wiring in runExecutorLive binds the real command.

import { computeCompilePlan, HARD_DEPENDENCY_EDGE_TYPES } from "../../kernel/graph/compile-plan.js";
import type { OntologyEdge } from "../../kernel/schemas/ontology.js";
import type { ResolvedNodeModel } from "../llm/resolve-node-model.js";
import type { RegenerateCommandOptions, RegenerateResult } from "../../surfaces/commands/regenerate.js";
import { decide, DEFAULT_REFINE_ROUNDS } from "./policy.js";
import { normalize } from "./verdict.js";
import { buildReport, type ExecReport } from "./report.js";
import type { Decision, Lever, NodeExecState, NodeRecord, Terminal } from "./types.js";

export interface ExecutorConfig {
  // Focal nodes to close. Each focal's dependency closure is walked in
  // topological order; a shared `closed` set means common dependencies are
  // attempted once across focals.
  focalIds: string[];
  // Resolved capability ladder (rung 0 cheapest). See model-ladder.resolveLadder.
  ladder: ResolvedNodeModel[];
  maxAttemptsPerNode?: number;
  refineRounds?: number;
  behaviorFixturesDir?: string;
  ollamaHost?: string;
  maxTokens?: number;
  // Converge-write closed nodes (default true). false = dry run (probe only).
  write?: boolean;
}

export interface ExecutorDeps {
  edges: OntologyEdge[];
  // The single effectful actuator. In production this is runRegenerate.
  regenerate: (nodeId: string, opts: RegenerateCommandOptions) => Promise<RegenerateResult>;
}

const HARD_TYPES: ReadonlySet<string> = new Set(HARD_DEPENDENCY_EDGE_TYPES as readonly string[]);

// Base gate configuration applied to every probe: behaviour + rules + grounding
// on, single draw (the policy, not consensus, drives retries), no write.
function baseOptions(config: ExecutorConfig, model: ResolvedNodeModel): RegenerateCommandOptions {
  return {
    provider: model.provider,
    model: model.model,
    behaviorCheck: true,
    checkRules: true,
    astGrounding: true,
    rulesGrounding: true,
    draws: 1,
    write: false,
    behaviorFixturesDir: config.behaviorFixturesDir,
    ollamaHost: config.ollamaHost,
    maxTokens: config.maxTokens,
  };
}

function leverOptions(
  lever: Lever,
  config: ExecutorConfig,
  model: ResolvedNodeModel,
): RegenerateCommandOptions {
  const base = baseOptions(config, model);
  if (lever.kind === "refine") {
    return { ...base, refine: lever.rounds ?? config.refineRounds ?? DEFAULT_REFINE_ROUNDS };
  }
  if (lever.kind === "decompose") {
    return { ...base, decompose: true };
  }
  // generate / escalate → a plain draw at the current rung.
  return base;
}

// Hard dependencies of `nodeId`: edges of a hard-dependency type pointing FROM
// the node TO its dependency (compile-plan walks e.from -> e.to).
function upstreamTargets(nodeId: string, edges: OntologyEdge[]): string[] {
  return edges.filter((e) => HARD_TYPES.has(e.type) && e.from === nodeId).map((e) => e.to);
}

async function runNode(
  nodeId: string,
  config: ExecutorConfig,
  deps: ExecutorDeps,
  closed: ReadonlySet<string>,
): Promise<NodeRecord> {
  const ladderSize = config.ladder.length;
  const targets = upstreamTargets(nodeId, deps.edges);
  let state: NodeExecState = {
    nodeId,
    rung: 0,
    ladderSize,
    history: [],
    upstreamAllClosed: targets.every((t) => closed.has(t)),
    maxAttemptsPerNode: config.maxAttemptsPerNode ?? 8,
  };
  const decisions: Decision[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const action = decide(state);
    decisions.push({ rung: state.rung, action });

    if (action.type === "terminate") {
      const written = await maybeConvergeWrite(action.terminal, nodeId, state, config, deps);
      return {
        nodeId,
        terminal: action.terminal,
        written,
        finalRung: state.rung,
        attempts: state.history.length,
        decisions,
        lastDetail: state.history.at(-1)?.verdict.detail,
      };
    }

    // `escalate` climbs a rung before the draw; clamp at the top.
    let rung = state.rung;
    if (action.lever.kind === "escalate") {
      rung = Math.min(rung + 1, ladderSize - 1);
    }
    const model = config.ladder[rung];
    const result = await deps.regenerate(nodeId, leverOptions(action.lever, config, model));
    const verdict = normalize(result);
    state = {
      ...state,
      rung,
      history: [...state.history, { rung, lever: action.lever.kind, verdict }],
    };
  }
}

// Governed write: only a `closed` terminal writes, and only when config.write is
// on. The write is a fresh runRegenerate with write:true at the winning rung —
// the command STILL refuses to overwrite unless its own gates are green, so the
// policy's decision and the command's gate are a double lock.
async function maybeConvergeWrite(
  terminal: Terminal,
  nodeId: string,
  state: NodeExecState,
  config: ExecutorConfig,
  deps: ExecutorDeps,
): Promise<boolean> {
  if (terminal !== "closed" || config.write === false) return false;
  const model = config.ladder[state.rung];
  const res = await deps.regenerate(nodeId, {
    ...baseOptions(config, model),
    write: true,
  });
  return res.written === true;
}

export async function runExecutor(config: ExecutorConfig, deps: ExecutorDeps): Promise<ExecReport> {
  if (config.ladder.length === 0) {
    throw new Error(
      "executor: empty capability ladder — the model premise excluded every dispatchable model",
    );
  }

  const records: NodeRecord[] = [];
  const closed = new Set<string>();
  const seen = new Set<string>();

  for (const focal of config.focalIds) {
    const plan = computeCompilePlan(focal, deps.edges);
    if (!plan.ok) {
      records.push({
        nodeId: focal,
        terminal: "infra-error",
        written: false,
        finalRung: 0,
        attempts: 0,
        decisions: [],
        lastDetail: `compile plan failed: ${plan.reason}`,
      });
      continue;
    }
    for (const step of plan.steps) {
      if (seen.has(step.nodeId)) continue;
      seen.add(step.nodeId);
      const record = await runNode(step.nodeId, config, deps, closed);
      if (record.terminal === "closed") closed.add(step.nodeId);
      records.push(record);
    }
  }

  return buildReport(records);
}
