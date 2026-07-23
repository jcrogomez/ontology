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
import { decide, DEFAULT_REFINE_ROUNDS, classifyPlateauWithEvidence } from "./policy.js";
import { normalize } from "./verdict.js";
import { kappaStar } from "./kappa-star.js";
import { rungLocality, type LadderRung } from "./model-ladder.js";
import { buildReport, type ExecReport } from "./report.js";
import { RunGovernor, type Rung } from "./governor.js";
import type { PrecedentStore } from "./precedents.js";
import type { Decision, Lever, NodeExecState, NodeRecord } from "./types.js";

export interface ExecutorConfig {
  // Focal nodes to close. Each focal's dependency closure is walked in
  // topological order; a shared `closed` set means common dependencies are
  // attempted once across focals.
  focalIds: string[];
  // Resolved capability ladder (rung 0 cheapest). See model-ladder.resolveLadder.
  // Rungs MAY carry caps (resolveLadder always attaches them); locality falls
  // back to the provider heuristic for hand-built ladders. ResolvedNodeModel-
  // shaped arrays therefore remain valid configs.
  ladder: (ResolvedNodeModel | LadderRung)[];
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
  // Run governor (B1/B2): budget on attempts at cloud-locality rungs across
  // the whole run. When it runs out, later nodes climb a local-only effective
  // ladder; a mid-climb cloud attempt terminates that node infra-error with an
  // explicit budget detail. undefined = unlimited (pre-governor behaviour).
  maxCloudAttempts?: number;
}

export interface ExecutorDeps {
  edges: OntologyEdge[];
  // The single effectful actuator. In production this is runRegenerate.
  regenerate: (nodeId: string, opts: RegenerateCommandOptions) => Promise<RegenerateResult>;
  // Episodic memory (optional): prior-run outcomes keyed to ficha content.
  // The runner consults it BEFORE a node's climb (warm-start κ*, honour an
  // extraction-gap precedent on an unchanged ficha) and records each node's
  // terminal AFTER. Absent → every run starts from scratch, as before.
  precedents?: PrecedentStore;
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
    // Decompose composes with refine + monotone keep-slices: slices whose
    // behaviour cases pass are frozen between rounds and only the implicated
    // slices re-generate ("passing work is kept" — slice-keep.ts). This is
    // what makes the lever effective on large declaration modules, where the
    // chunked scaffold gives keep-slices real granularity.
    return {
      ...base,
      decompose: true,
      refine: config.refineRounds ?? DEFAULT_REFINE_ROUNDS,
      keepSlices: true,
    };
  }
  if (lever.kind === "probe") {
    // Disagreement probe: N independent draws at the current rung. The
    // consensus write gate inside runRegenerate still governs (a majority
    // pass writes and closes); what the probe ADDS is the grayZone fold the
    // plateau classification needs.
    return { ...base, draws: lever.draws };
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
  // The EFFECTIVE ladder this node may climb (governor-filtered: dead
  // providers always removed; cloud rungs removed once the budget is spent).
  // All rung indices in this node's record index into THIS ladder.
  ladder: readonly (ResolvedNodeModel | LadderRung)[],
  governor: RunGovernor,
): Promise<NodeRecord> {
  const ladderSize = ladder.length;
  const targets = upstreamTargets(nodeId, deps.edges);
  // Episodic precedent (valid = ficha unchanged; the store enforces that).
  const precedent = deps.precedents?.lookup(nodeId);
  // Warm start at the prior κ* (least-element search from a known lower bound):
  // the in-config priorKappa wins over the persisted precedent when both exist.
  // Clamped to the ladder. Absent → rung 0.
  const warmKappa = config.priorKappa?.[nodeId] ?? (precedent?.terminal === "closed" ? precedent.kappa : null) ?? 0;
  const startRung = Math.min(Math.max(0, warmKappa), ladderSize - 1);
  // An extraction-gap precedent binds only while there is no NEW capacity to
  // try: a taller current ladder voids it (the prior run never saw those rungs).
  const priorExtractionGap =
    precedent?.terminal === "extraction-gap" && ladderSize <= precedent.ladderSize;
  let state: NodeExecState = {
    nodeId,
    rung: startRung,
    ladderSize,
    history: [],
    upstreamAllClosed: targets.every((t) => closed.has(t)),
    maxAttemptsPerNode: config.maxAttemptsPerNode ?? 8,
    priorExtractionGap,
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
      // Ladder economics: wall-clock + rung-locality accounting per attempt.
      // Measured facts only — the oracle-routing interpretation (how much cloud
      // spend the local rungs avoided) lives in the report/proposal doc.
      const localityOf = (r: number): "local" | "cloud" =>
        rungLocality(ladder[Math.min(r, ladderSize - 1)] as LadderRung);
      const totalDurationMs = state.history.reduce((s, a) => s + (a.durationMs ?? 0), 0);
      const attemptsLocal = state.history.filter((a) => localityOf(a.rung) === "local").length;
      // Plateau terminals record WHY: the same evidence fold the policy used
      // (single source — no separate mapping that could drift). A zero-attempt
      // extraction-gap can only have come from an honoured precedent.
      const lastVerdict = state.history.at(-1)?.verdict;
      const gapEvidence =
        (action.terminal === "extraction-gap" || action.terminal === "capacity-ceiling") && lastVerdict
          ? classifyPlateauWithEvidence(lastVerdict).evidence
          : action.terminal === "extraction-gap" && state.priorExtractionGap
            ? ("precedent" as const)
            : undefined;
      return {
        nodeId,
        terminal: action.terminal,
        written: action.terminal === "closed" ? lastWritten : false,
        finalRung: state.rung,
        attempts: state.history.length,
        decisions,
        lastDetail: state.history.at(-1)?.verdict.detail,
        gapEvidence,
        kappa,
        totalDurationMs,
        attemptsLocal,
        attemptsCloud: state.history.length - attemptsLocal,
        closedLocality: kappa === null ? null : localityOf(kappa),
      };
    }

    // `escalate` climbs a rung before the draw; clamp at the top.
    let rung = state.rung;
    if (action.lever.kind === "escalate") {
      rung = Math.min(rung + 1, ladderSize - 1);
    }
    const model = ladder[rung];
    // runRegenerate normally returns a RegenerateResult even for refusals/blocks;
    // it throws only on genuinely exceptional failures (a non-lock error from the
    // compile lock, or — for an IO node like lock.ts — a draft whose throw escapes
    // the v0 in-process containment). Treat any throw as an infra-error verdict so
    // ONE pathological node cannot crash the whole batch. (A truly DEFERRED uncaught
    // throw from an orphaned draft timer can still escape this; the principled fix
    // is child-process isolation of the behaviour check — tracked follow-up.)
    let verdict;
    const attemptStart = Date.now();
    // Governor gate: a cloud attempt only dispatches while the run's cloud
    // budget lasts. A refused attempt is an infra-error (resource condition,
    // never a model verdict) with the budget spelled out in the detail.
    const gate = governor.noteAttempt(model as Rung);
    if (!gate.allowed) {
      verdict = {
        outcome: "infra-error" as const,
        lintClean: undefined,
        hasFixture: false,
        detail: gate.detail ?? "cloud attempt budget exhausted",
      };
      lastWritten = false;
    } else {
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
      // Dead-provider marking: quota/connection-family infra failures kill the
      // provider for the REST OF THE RUN (later nodes skip its rungs instead of
      // re-burning a timeout each — the 2026-07-07 failure shape).
      governor.noteVerdict(model as Rung, verdict);
    }
    const durationMs = Date.now() - attemptStart;
    state = {
      ...state,
      rung,
      history: [...state.history, { rung, lever: action.lever.kind, verdict, durationMs }],
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
  const governor = new RunGovernor({ maxCloudAttempts: config.maxCloudAttempts });

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
        totalDurationMs: 0,
        attemptsLocal: 0,
        attemptsCloud: 0,
        closedLocality: null,
      });
      continue;
    }
    for (const step of plan.steps) {
      if (seen.has(step.nodeId)) continue;
      seen.add(step.nodeId);
      // The rungs THIS node may climb, as of now: dead providers filtered,
      // cloud rungs gone once the budget is spent.
      const ladder = governor.effectiveLadder(config.ladder);
      if (ladder.length === 0) {
        records.push({
          nodeId: step.nodeId,
          terminal: "infra-error",
          written: false,
          finalRung: 0,
          attempts: 0,
          decisions: [],
          lastDetail:
            "no dispatchable rungs: every ladder rung is governed out (dead provider and/or exhausted cloud budget)",
          kappa: null,
          totalDurationMs: 0,
          attemptsLocal: 0,
          attemptsCloud: 0,
          closedLocality: null,
        });
        continue;
      }
      const record = await runNode(step.nodeId, config, deps, closed, ladder, governor);
      if (record.terminal === "closed") closed.add(step.nodeId);
      // Record the episodic precedent for MEASURED outcomes only: closed (its
      // κ* seeds the next warm start) and the two plateau verdicts. Cited
      // precedents are not re-recorded (that would overwrite the original
      // evidence with "precedent" and refresh its date); blocked/unverified/
      // infra say nothing about this ficha's limit.
      if (
        record.gapEvidence !== "precedent" &&
        (record.terminal === "closed" ||
          record.terminal === "extraction-gap" ||
          record.terminal === "capacity-ceiling")
      ) {
        deps.precedents?.record({
          nodeId: step.nodeId,
          terminal: record.terminal,
          kappa: record.kappa,
          gapEvidence: record.gapEvidence,
          // The EFFECTIVE height this node actually saw — a plateau declared
          // under a governed-down ladder must not block a future climb up the
          // full one (the taller-ladder voiding rule then correctly fires).
          ladderSize: ladder.length,
        });
      }
      records.push(record);
    }
  }

  return buildReport(records, governor.summary());
}
