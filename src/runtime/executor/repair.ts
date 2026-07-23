// The ficha-repair lever — MVP_REGEN_LOOP.md §4.2, ROADMAP A1.
//
// Orchestrates one HUMAN-GATED repair of a node's intent surface:
//
//   1. parent baseline  — regenerate at the FIXED rung, draws=N, no write →
//                         the parent's aggregated per-case side + the
//                         spec-side evidence the repairer is allowed to see
//   2. author           — dispatch the repair prompt (R_strict / R_perm) to
//                         the repairer model (typically a stronger rung than
//                         the generator: repairing is G-side reasoning)
//   3. guard            — parse + injected-text budget (Regimes invariant);
//                         a failed parse or a busted budget DISCARDS the
//                         candidate before it ever becomes a proposal
//   4. propose          — a node_update proposal carries the repaired ficha
//                         (the human's approve/reject surface), and
//                         repair_proposed chains into the temporal log
//   5. fork evaluation  — regenerate with fichaOverride at the SAME rung,
//                         draws=N, no write → flip diff vs the parent
//
// Promotion is NOT here: resolveRepair applies/rejects the proposal on the
// human's Walker decision and records repair_promoted / repair_discarded with
// the flip evidence. The lever proposes and measures; the human decides.

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { dispatchLlmRequest, type DispatchOptions } from "../llm/dispatcher.js";
import type { LlmRequest, LlmResponse } from "../llm/types.js";
import { loadNodeById } from "../../kernel/core/project/load.js";
import { createProposal, applyProposal, rejectProposal, loadProposal } from "../../kernel/core/proposals/persist.js";
import { runRegenerate, type RegenerateCommandOptions, type RegenerateResult } from "../../surfaces/commands/regenerate.js";
import { fichaHashFor } from "./precedents.js";
import {
  aggregateCaseOutcomes,
  computeFlipDiff,
  buildRepairEventPayload,
  recordRepairEvent,
  splitAuthorConfirm,
  seedFromFichaHash,
  restrictSide,
  type AggregatedSide,
  type CaseOutcome,
  type CaseSplit,
  type FlipDiff,
  type ForkSpec,
} from "./counterfactual.js";
import {
  buildRepairSystemPrompt,
  buildRepairUserPrompt,
  parseRepairResponse,
  checkRepairBudget,
  DEFAULT_REPAIR_BUDGET_CHARS,
  type RepairOperatorMode,
  type RepairedFicha,
  type BudgetCheck,
} from "./repair-prompt.js";
import { SEMANTIC_SPLIT_MIN_RAN_DRAWS } from "../../laws/gray-zone.js";
import { loadFixture } from "../../laws/behavior-checker.js";
import { readEventLog } from "../../kernel/core/state/replay.js";

export interface RepairConfig {
  nodeId: string;
  operator: RepairOperatorMode;
  /** The FIXED evaluation rung: generator provider/model for BOTH sides. */
  provider: string;
  model?: string;
  /** Ladder rung index of the fixed rung, for the audit events (informational;
   *  the provider/model pair is what pins the discipline). */
  rung?: number;
  /** The repairer model. Defaults to the generator pair — but the whole point
   *  of the asymmetric design is to pass a STRONGER one here. */
  repairProvider?: string;
  repairModel?: string;
  /** Draws per side. Defaults to the semanticSplit floor (3). */
  draws?: number;
  /** AUTHOR/CONFIRM holdout (FORK_AND_DIFF slice 2). Default true: fixtures
   *  with ≥ MIN_CASES_TO_SPLIT cases hold ~1/3 out of every prompt (oracle
   *  grounding, refine critique, the repair author) and report a separate
   *  CONFIRM flip diff. false = in-sample everywhere, honestly recorded as
   *  split-absent in the audit event. */
  holdout?: boolean;
  budgetChars?: number;
  behaviorFixturesDir?: string;
  ollamaHost?: string;
  maxTokens?: number;
  cwd?: string;
}

/** Injectable effects for tests: the generator actuator and the repairer
 *  dispatch. Production defaults bind the real machinery. */
export interface RepairDeps {
  regenerate?: (nodeId: string, opts: RegenerateCommandOptions, cwd: string) => Promise<RegenerateResult>;
  dispatch?: (req: LlmRequest, opts?: DispatchOptions) => Promise<LlmResponse>;
}

export type RepairFailureStage = "load" | "baseline" | "author" | "parse" | "budget" | "propose" | "fork-eval";

export interface RepairReport {
  ok: boolean;
  nodeId: string;
  operator: RepairOperatorMode;
  /** Set on ok=false: where the pipeline stopped, with detail. Nothing was
   *  proposed unless the stage is at or past "propose". */
  failedStage?: RepairFailureStage;
  detail?: string;
  parentFichaHash?: string;
  forkFichaHash?: string;
  proposalId?: string;
  repaired?: RepairedFicha;
  budget?: BudgetCheck;
  parentSide?: AggregatedSide;
  forkSide?: AggregatedSide;
  /** AUTHOR-side flip diff (all cases when no split ran). */
  diff?: FlipDiff;
  /** The seeded AUTHOR/CONFIRM split, when the fixture was big enough and the
   *  holdout was on. Absent = the measurement is in-sample (honestly so). */
  split?: CaseSplit;
  /** CONFIRM-side flip diff — cases no prompt ever saw. */
  confirmDiff?: FlipDiff;
  /** True when the fork REGRESSED a held-out case (right→wrong on CONFIRM).
   *  The promotion-blocking signal for the human (and for v2's auto-gate). */
  confirmRegression?: boolean;
  /** True when the parent baseline ALREADY passes (nothing to repair). */
  parentAlreadyPasses?: boolean;
}

/** Per-case sides from a regenerate result: draws>1 → per-draw caseOutcomes
 *  from draftSummary; draws=1 → the single candidate's cases as one draw. */
function sidesFromResult(result: RegenerateResult): CaseOutcome[][] {
  if (result.draftSummary !== undefined) {
    return result.draftSummary.map((d) => (d.caseOutcomes ?? []) as CaseOutcome[]);
  }
  return [(result.behaviorCases ?? []) as CaseOutcome[]];
}

/** sha256 of a hypothetical ficha surface, IDENTICAL in shape to
 *  precedents.fichaHashFor (prompt raw, rules, context) so parent and fork
 *  hashes live in the same space. The context contract is unchanged by the
 *  MVP repair (prompt+rules only), so it is carried from the live node. */
function forkFichaHash(nodeId: string, cwd: string, repaired: RepairedFicha): string | undefined {
  try {
    const node = loadNodeById(nodeId, cwd);
    if (!node) return undefined;
    // The overlaid prompt object mirrors updateNode's shape ({...prompt, raw})
    // so this hash EQUALS what fichaHashFor will report after the proposal is
    // applied — the fork hash predicts the promoted node's identity.
    const surface = JSON.stringify([
      { ...node.prompt, raw: repaired.prompt },
      repaired.rules ?? [],
      node.context ?? null,
    ]);
    return createHash("sha256").update(surface).digest("hex");
  } catch {
    return undefined;
  }
}

export async function runFichaRepair(config: RepairConfig, deps: RepairDeps = {}): Promise<RepairReport> {
  const cwd = config.cwd ?? process.cwd();
  const regenerate = deps.regenerate ?? ((id, opts, c) => runRegenerate(id, opts, c));
  const dispatch = deps.dispatch ?? dispatchLlmRequest;
  const draws = Math.max(1, config.draws ?? SEMANTIC_SPLIT_MIN_RAN_DRAWS);
  const fail = (failedStage: RepairFailureStage, detail: string): RepairReport => ({
    ok: false,
    nodeId: config.nodeId,
    operator: config.operator,
    failedStage,
    detail,
  });

  // ── 1. Load + split + parent baseline ─────────────────────────────────────
  const node = loadNodeById(config.nodeId, cwd);
  if (!node) return fail("load", `node not found: ${config.nodeId}`);
  const parentHash = fichaHashFor(config.nodeId, cwd);
  if (parentHash === undefined) return fail("load", "ficha surface not hashable");
  const fichaPrompt = node.prompt?.raw ?? "";
  const rules = node.rules ?? [];

  // The behaviour oracle's black-box criteria — loaded BEFORE the baseline
  // because the AUTHOR/CONFIRM split must filter the very first generation:
  // a holdout applied only at scoring time would still be in-sample.
  const fixturesDir = config.behaviorFixturesDir ?? path.join(cwd, "tests/behavior-fixtures");
  const fixture = await loadFixture(fixturesDir, config.nodeId).catch(() => null);
  const allCases = fixture ? fixture.fixture.cases.map((c) => ({ name: c.name, description: c.description })) : [];

  // Seeded from the parent ficha hash: parent and fork of THIS repair share
  // the split by construction, and the deal rotates when the ficha changes.
  const split: CaseSplit | null =
    config.holdout === false
      ? null
      : splitAuthorConfirm(allCases.map((c) => c.name), seedFromFichaHash(parentHash));
  const confirmSet = new Set(split?.confirm ?? []);
  const oracle = allCases.filter((c) => !confirmSet.has(c.name));

  const evalOptions: RegenerateCommandOptions = {
    provider: config.provider,
    model: config.model,
    behaviorCheck: true,
    checkRules: true,
    astGrounding: true,
    rulesGrounding: true,
    draws,
    write: false,
    behaviorFixturesDir: config.behaviorFixturesDir,
    ollamaHost: config.ollamaHost,
    maxTokens: config.maxTokens,
    ...(split ? { confirmHoldout: split.confirm } : {}),
  };
  let parentResult: RegenerateResult;
  try {
    parentResult = await regenerate(config.nodeId, evalOptions, cwd);
  } catch (err) {
    return fail("baseline", `parent baseline threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parentResult.ok) return fail("baseline", parentResult.failure ?? "parent baseline failed");
  const parentSide = aggregateCaseOutcomes(sidesFromResult(parentResult));
  if (parentSide.cases.length === 0) {
    return fail("baseline", "no behaviour cases evaluated at baseline — a repair cannot be measured without an oracle (unverified-no-fixture territory)");
  }
  // "Nothing to repair" is judged on the AUTHOR side: the author cannot
  // honestly target a failure it is not allowed to see. Failures living only
  // in CONFIRM are reported as such, not smuggled into the prompt.
  const parentAuthorSide = split ? restrictSide(parentSide, split.author) : parentSide;
  const parentFailing = parentAuthorSide.cases.filter((c) => c.outcome !== "match");
  if (parentFailing.length === 0) {
    const confirmFailing = split
      ? restrictSide(parentSide, split.confirm).cases.filter((c) => c.outcome !== "match").length
      : 0;
    return {
      ...fail(
        "baseline",
        confirmFailing > 0
          ? `parent passes every AUTHOR case; ${confirmFailing} failure(s) live only in held-out CONFIRM — grow the fixture or re-deal (the author must not see them)`
          : "parent baseline already passes every case on majority — nothing to repair",
      ),
      parentAlreadyPasses: true,
      parentFichaHash: parentHash,
      parentSide,
      ...(split ? { split } : {}),
    };
  }

  // ── 2. Author ─────────────────────────────────────────────────────────────
  let referenceSource: string | undefined;
  if (config.operator === "R_perm") {
    const rel = node.outputs?.files?.[0];
    if (rel !== undefined) {
      try {
        referenceSource = fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(cwd, rel), "utf-8");
      } catch {
        referenceSource = undefined; // perm degrades to strict-shaped inputs, honestly recorded via operator field
      }
    }
  }
  const metrics = parentResult.metrics;
  const original = new Set(metrics?.originalDeclarations ?? []);
  const regen = new Set(metrics?.regenDeclarations ?? []);
  // The repairer sees the AUTHOR-side spec only: the filtered oracle and the
  // author-side failures (`parentFailing` is already author-restricted).
  const userPrompt = buildRepairUserPrompt(config.operator, {
    nodeId: config.nodeId,
    fichaPrompt,
    rules,
    contract: {
      // Requirements/provisions are typed objects; surface the identifier the
      // human would recognise (entity, else key, else nodeType@source).
      requires: (node.context?.requires ?? []).map(
        (r) => r.entity ?? `${r.nodeType}@${r.source}`,
      ),
      provides: (node.context?.provides ?? []).map((p: unknown) =>
        typeof p === "string" ? p : ((p as { key?: string }).key ?? JSON.stringify(p)),
      ),
      forbids: (node.context?.forbids ?? []).map(
        (r) => r.entity ?? `${r.nodeType}@${r.source}`,
      ),
    },
    oracle,
    failingCases: parentFailing.map((c) => ({ name: c.name, diagnostic: c.detail })),
    missingExports: [...original].filter((d) => !regen.has(d)),
    extraExports: [...regen].filter((d) => !original.has(d)),
    referenceSource: config.operator === "R_perm" ? referenceSource : undefined,
  });

  let response: LlmResponse;
  try {
    response = await dispatch(
      { task: "node_expand", prompt: userPrompt, system: buildRepairSystemPrompt(config.operator) },
      {
        provider: (config.repairProvider ?? config.provider) as DispatchOptions["provider"],
        defaultModel: config.repairModel ?? config.model,
        ollamaHost: config.ollamaHost,
      },
    );
  } catch (err) {
    return fail("author", `repairer dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Guards ─────────────────────────────────────────────────────────────
  const repaired = parseRepairResponse(response.text);
  if (repaired === null) return fail("parse", "repairer response did not contain a valid {prompt, rules} JSON object");
  const budget = checkRepairBudget({ prompt: fichaPrompt, rules }, repaired, config.budgetChars ?? DEFAULT_REPAIR_BUDGET_CHARS);
  if (!budget.withinBudget) {
    return { ...fail("budget", `repair adds ${budget.addedChars} chars > budget ${budget.budgetChars} — refusing (laundering/padding guard)`), budget, repaired };
  }
  const forkHash = forkFichaHash(config.nodeId, cwd, repaired);
  if (forkHash === undefined) return fail("propose", "could not hash the repaired ficha surface");
  if (forkHash === parentHash) return fail("parse", "repairer returned the ficha unchanged — nothing to evaluate");

  // ── 4. Propose + audit ────────────────────────────────────────────────────
  const spec: ForkSpec = {
    nodeId: config.nodeId,
    parentFichaHash: parentHash,
    forkFichaHash: forkHash,
    operator: config.operator,
    rung: config.rung ?? 0,
    provider: config.provider,
    model: config.model,
  };
  let proposalId: string;
  try {
    const { proposal } = createProposal({
      mutation: {
        kind: "node_update",
        payload: { nodeId: config.nodeId, prompt: repaired.prompt, rules: repaired.rules },
        nodeHash: node.integrity.hash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [config.nodeId],
        rationale: `ficha-repair ${config.operator} @ rung ${spec.rung} (${config.provider}${config.model ? `:${config.model}` : ""}), repairer ${config.repairProvider ?? config.provider}${config.repairModel ? `:${config.repairModel}` : ""}`,
      },
      cwd,
    });
    proposalId = proposal.id;
  } catch (err) {
    return fail("propose", `proposal creation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 5. Fork evaluation (fixed rung, no write, ficha overlay) ─────────────
  // The repair_proposed event is emitted AFTER the evaluation so one event
  // carries the full measurement (split + AUTHOR flips + CONFIRM flips) —
  // that single record is what the agreement-rate fold and any out-of-session
  // resolution read back. A failed evaluation still emits the event (split
  // only, no flips) so the proposal never dangles unaudited.
  const emitProposed = (diffs?: { diff: FlipDiff; confirmDiff?: FlipDiff }): void => {
    recordRepairEvent(
      cwd,
      "repair_proposed",
      buildRepairEventPayload(spec, diffs?.diff, proposalId, {
        ...(split ? { split } : {}),
        ...(diffs?.confirmDiff ? { confirmDiff: diffs.confirmDiff } : {}),
      }),
    );
  };
  let forkResult: RegenerateResult;
  try {
    forkResult = await regenerate(
      config.nodeId,
      { ...evalOptions, fichaOverride: { prompt: repaired.prompt, rules: repaired.rules } },
      cwd,
    );
  } catch (err) {
    emitProposed();
    return { ...fail("fork-eval", `fork evaluation threw: ${err instanceof Error ? err.message : String(err)}`), proposalId, repaired, budget, parentFichaHash: parentHash, forkFichaHash: forkHash, parentSide, ...(split ? { split } : {}) };
  }
  if (!forkResult.ok) {
    emitProposed();
    return { ...fail("fork-eval", forkResult.failure ?? "fork evaluation failed"), proposalId, repaired, budget, parentFichaHash: parentHash, forkFichaHash: forkHash, parentSide, ...(split ? { split } : {}) };
  }
  const forkSide = aggregateCaseOutcomes(sidesFromResult(forkResult));
  // AUTHOR-side flips = what the author was allowed to target; CONFIRM-side
  // flips = the held-out readout. Without a split there is one full diff and
  // the confirm fields stay absent (in-sample, honestly so).
  const diff = split
    ? computeFlipDiff(parentAuthorSide, restrictSide(forkSide, split.author))
    : computeFlipDiff(parentSide, forkSide);
  const confirmDiff = split
    ? computeFlipDiff(restrictSide(parentSide, split.confirm), restrictSide(forkSide, split.confirm))
    : undefined;
  emitProposed({ diff, ...(confirmDiff ? { confirmDiff } : {}) });

  return {
    ok: true,
    nodeId: config.nodeId,
    operator: config.operator,
    parentFichaHash: parentHash,
    forkFichaHash: forkHash,
    proposalId,
    repaired,
    budget,
    parentSide,
    forkSide,
    diff,
    ...(split ? { split } : {}),
    ...(confirmDiff ? { confirmDiff } : {}),
    ...(confirmDiff ? { confirmRegression: confirmDiff.rightToWrong.length > 0 } : {}),
  };
}

// ── Human resolution (the Walker's approve/reject) ─────────────────────────

/** Recover the ForkSpec of a proposal's repair_proposed event so a resolution
 *  (CLI `onto repair proposal_X --promote` or the Walker panel) carries the
 *  same identity the proposal was measured under. Returns null when the
 *  proposal has no repair_proposed event — i.e. it is not a repair proposal. */
export function repairSpecForProposal(cwd: string, proposalId: string): ForkSpec | null {
  const events = readEventLog(cwd);
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.eventType !== "repair_proposed") continue;
    const p = ev.payload as Record<string, unknown>;
    if (p.proposalId !== proposalId) continue;
    return {
      nodeId: String(p.nodeId ?? ""),
      parentFichaHash: String(p.parentFichaHash ?? ""),
      forkFichaHash: String(p.forkFichaHash ?? ""),
      operator: (p.operator as ForkSpec["operator"]) ?? "human",
      rung: typeof p.rung === "number" ? p.rung : 0,
      ...(typeof p.provider === "string" ? { provider: p.provider } : {}),
      ...(typeof p.model === "string" ? { model: p.model } : {}),
    };
  }
  return null;
}

export interface ResolveRepairOptions {
  proposalId: string;
  decision: "promote" | "discard";
  /** The measured evidence from the RepairReport, chained into the audit
   *  event so the log records WHAT the human saw when deciding. */
  spec: ForkSpec;
  diff?: FlipDiff;
  cwd?: string;
}

export interface ResolveRepairResult {
  ok: boolean;
  proposalId: string;
  decision: "promote" | "discard";
  detail?: string;
}

export function resolveRepair(options: ResolveRepairOptions): ResolveRepairResult {
  const cwd = options.cwd ?? process.cwd();
  const proposal = loadProposal(options.proposalId, cwd);
  if (!proposal) return { ok: false, proposalId: options.proposalId, decision: options.decision, detail: "proposal not found" };

  if (options.decision === "promote") {
    const applied = applyProposal(options.proposalId, { cwd });
    if (!applied.ok) {
      return { ok: false, proposalId: options.proposalId, decision: "promote", detail: applied.message };
    }
    recordRepairEvent(cwd, "repair_promoted", buildRepairEventPayload(options.spec, options.diff, options.proposalId));
    return { ok: true, proposalId: options.proposalId, decision: "promote" };
  }

  try {
    rejectProposal(options.proposalId, { reason: "ficha-repair discarded in review", cwd });
  } catch (err) {
    return { ok: false, proposalId: options.proposalId, decision: "discard", detail: err instanceof Error ? err.message : String(err) };
  }
  recordRepairEvent(cwd, "repair_discarded", buildRepairEventPayload(options.spec, options.diff, options.proposalId));
  return { ok: true, proposalId: options.proposalId, decision: "discard" };
}
