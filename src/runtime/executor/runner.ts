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
import { kappaStar } from "./kappa-star.js";
import { buildReport, type ExecReport } from "./report.js";
import type { Decision, Lever, NodeExecState, NodeRecord } from "./types.js";

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
  // Cost-optimal WARM START: a prior κ* per node (the rung that closed it last
  // time). The node starts its climb at that rung instead of rung 0 — the
  // least-element search from a known lower bound, skipping rungs known to fail.
  // Clamped to the ladder; absent → start at rung 0.
  priorKappa?: Record<string, number>;
}

export interface ExecutorDeps {
  edges: OntologyEdge[];
  // The single effectful actuator. In production this is runRegenerate.
  regenerate: (nodeId: string, opts: RegenerateCommandOptions) => Promise<RegenerateResult>;
}

const HARD_TYPES: ReadonlySet<string> = new Set(HARD_DEPENDENCY_EDGE_TYPES as readonly string[]);

// Base gate configuration applied to every attempt: behaviour + rules +
// grounding on, single draw (the policy, not consensus, drives retries).
//
// write is on by default and governed BY runRegenerate itself: the command
// writes the attempt's draft ONLY when its own gates are green (structure-safe
// verdict + behaviour pass + no rule violations), so a non-passing attempt
// writes nothing. Crucially the WRITE happens on the same call as the passing
// draw — we never re-generate at converge time, because a fresh stochastic draw
// would not reproduce the draft that actually passed (the 7B is high-variance).
function baseOptions(config: ExecutorConfig, model: ResolvedNodeModel): RegenerateCommandOptions {
  return {
    provider: model.provider,
    model: model.model,
    behaviorCheck: true,
    checkRules: true,
    astGrounding: true,
    rulesGrounding: true,
    draws: 1,
    write: config.write !== false,
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
  // Warm start at the prior κ* (least-element search from a known lower bound),
  // clamped to the ladder. Absent → rung 0.
  const startRung = Math.min(Math.max(0, config.priorKappa?.[nodeId] ?? 0), ladderSize - 1);
  let state: NodeExecState = {
    nodeId,
    rung: startRung,
    ladderSize,
    history: [],
    upstreamAllClosed: targets.every((t) => closed.has(t)),
    maxAttemptsPerNode: config.maxAttemptsPerNode ?? 8,
  };
  const decisions: Decision[] = [];
  // Whether the attempt that produced the most recent verdict actually wrote.
  // The passing attempt writes atomically (write is on by default and gated by
  // runRegenerate), so on a `closed` terminal this reflects the real write.
  let lastWritten = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const action = decide(state);
    decisions.push({ rung: state.rung, action });

    if (action.type === "terminate") {
      // κ* = the least rung observed to close (pass). For the normal climb this
      // is the rung where it passed; null when it never closed.
      const kappa = kappaStar(
        state.history.map((a) => ({ rung: a.rung, closed: a.verdict.outcome === "pass" })),
      ).kappa;
      return {
        nodeId,
        terminal: action.terminal,
        written: action.terminal === "closed" ? lastWritten : false,
        finalRung: state.rung,
        attempts: state.history.length,
        decisions,
        lastDetail: state.history.at(-1)?.verdict.detail,
        kappa,
      };
    }

    // `escalate` climbs a rung before the draw; clamp at the top.
    let rung = state.rung;
    if (action.lever.kind === "escalate") {
      rung = Math.min(rung + 1, ladderSize - 1);
    }
    const model = config.ladder[rung];
    // runRegenerate normally returns a RegenerateResult even for refusals/blocks;
    // it throws only on genuinely exceptional failures (a non-lock error from the
    // compile lock, or — for an IO node like lock.ts — a draft whose throw escapes
    // the v0 in-process containment). Treat any throw as an infra-error verdict so
    // ONE pathological node cannot crash the whole batch. (A truly DEFERRED uncaught
    // throw from an orphaned draft timer can still escape this; the principled fix
    // is child-process isolation of the behaviour check — tracked follow-up.)
    let verdict;
    try {
      const result = await deps.regenerate(nodeId, leverOptions(action.lever, config, model));
      verdict = normalize(result);
      lastWritten = result.written === true;
    } catch (err) {
      verdict = {
        outcome: "infra-error" as const,
        lintClean: undefined,
        hasFixture: false,
        detail: `regenerate threw: ${err instanceof Error ? err.message : String(err)}`,
      };
      lastWritten = false;
    }
    state = {
      ...state,
      rung,
      history: [...state.history, { rung, lever: action.lever.kind, verdict }],
    };
  }
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
        kappa: null,
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
