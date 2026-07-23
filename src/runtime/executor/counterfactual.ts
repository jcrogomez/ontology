// Counterfactual fork-and-diff — FORK_AND_DIFF.md slice 1, the mechanism the
// MVP regen loop's ficha-repair lever is evaluated with (MVP_REGEN_LOOP.md §1).
//
// Frame one ficha repair as a NODE-LEVEL fork, not a fresh run:
//   parent = the node's last governed evaluation at fichaHash₀
//   fork   = the same node at fichaHash₁ (repaired), SAME RUNG, FIXED —
//            the E1 discipline: a flip must be attributable to the ficha,
//            never to a ladder climb happening in the same breath.
//
// The verdict artifact is deterministic per-case FLIPS (wrong→right vs
// right→wrong on the behaviour fixture), never a text diff. Draw variance is
// real (P1_COLLAPSE_VARIANCE), so both sides aggregate a MAJORITY outcome per
// case across their evaluated draws, and the diff honestly reports whether
// each side met the same floor `semanticSplit` trusts
// (SEMANTIC_SPLIT_MIN_RAN_DRAWS): below it, flips are coin-flip noise for a
// high-variance model, not evidence about the ficha.
//
// This module is PURE data-in/data-out except `recordRepairEvent`, which
// appends the audit event exactly the way runs/persist.ts does — the loop's
// own history lives in the same append-only log it audits.

import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { SEMANTIC_SPLIT_MIN_RAN_DRAWS } from "../../laws/gray-zone.js";
import { OntologyEventSchema, type OntologyEvent } from "../../kernel/schemas/ontology.js";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { appendJsonl } from "../../kernel/core/fs/json.js";
import { readState, writeState } from "../../kernel/core/state/state-store.js";

/** One behaviour-fixture case outcome, as regenerate.ts surfaces it
 *  (RegenerateResult.behaviorCases / draftSummary[].caseOutcomes). `outcome`
 *  stays a plain string at the boundary; only "match" counts as RIGHT. */
export interface CaseOutcome {
  name: string;
  outcome: string;
  detail?: string;
}

/** Which repair operator produced the fork's ficha (MVP_REGEN_LOOP.md §3).
 *  "human" covers Walker-authored edits evaluated through the same fork. */
export type RepairOperator = "R_strict" | "R_perm" | "human";

/** Identity of one counterfactual comparison. rung/provider/model pin the
 *  FIXED-rung discipline; the pair of ficha hashes is what the flip diff is
 *  evidence ABOUT. */
export interface ForkSpec {
  nodeId: string;
  parentFichaHash: string;
  forkFichaHash: string;
  operator: RepairOperator;
  rung: number;
  provider?: string;
  model?: string;
}

/** Majority fold of one side's draws: per-case majority outcome + how many
 *  draws actually evaluated the fixture (≥1 case reported). */
export interface AggregatedSide {
  cases: CaseOutcome[];
  /** Draws that reported ≥1 case — the same "evaluated" notion the
   *  semanticSplit floor uses. Load-failed draws report nothing and do not
   *  count; they cannot vote a case right OR wrong. */
  evaluatedDraws: number;
}

export interface CaseFlip {
  name: string;
  direction: "wrong-to-right" | "right-to-wrong";
  parentOutcome: string;
  forkOutcome: string;
}

export interface FlipDiff {
  /** Cases present on BOTH sides — the only ones that can flip. */
  comparableCases: number;
  wrongToRight: CaseFlip[];
  rightToWrong: CaseFlip[];
  /** wrongToRight − rightToWrong. The promotion currency. */
  netFlips: number;
  /** Fixture drift honesty guard: case names present on one side only.
   *  Non-empty means the fixture changed between parent and fork — the diff
   *  is then evidence about a MOVED target, and the human must see that. */
  parentOnlyCases: string[];
  forkOnlyCases: string[];
  parentEvaluatedDraws: number;
  forkEvaluatedDraws: number;
  /** Both sides met the draw floor. A diff below the floor is reported, not
   *  hidden — but it must never silently justify a promotion. */
  meetsDrawFloor: boolean;
  drawFloor: number;
}

/** Majority-vote one side's per-draw case outcomes into a single per-case
 *  verdict. A case is RIGHT only when STRICTLY more than half of the draws
 *  that reported it said "match" — ties count WRONG (conservative: an
 *  ambiguous case must not look repaired). The representative outcome kept
 *  for a WRONG case is the most frequent non-match outcome (ties broken by
 *  first appearance, deterministic in draw order). */
export function aggregateCaseOutcomes(perDraw: ReadonlyArray<ReadonlyArray<CaseOutcome>>): AggregatedSide {
  const evaluated = perDraw.filter((d) => d.length > 0);
  const byName = new Map<string, CaseOutcome[]>();
  for (const draw of evaluated) {
    for (const c of draw) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name)!.push(c);
    }
  }
  const cases: CaseOutcome[] = [];
  for (const [name, votes] of byName) {
    const matches = votes.filter((v) => v.outcome === "match").length;
    if (matches * 2 > votes.length) {
      cases.push({ name, outcome: "match" });
      continue;
    }
    const counts = new Map<string, { n: number; detail?: string }>();
    for (const v of votes) {
      if (v.outcome === "match") continue;
      const entry = counts.get(v.outcome) ?? { n: 0, detail: v.detail };
      entry.n += 1;
      counts.set(v.outcome, entry);
    }
    let top: { outcome: string; n: number; detail?: string } | undefined;
    for (const [outcome, { n, detail }] of counts) {
      if (!top || n > top.n) top = { outcome, n, detail };
    }
    // A tied-at-half case with zero non-match votes cannot happen (matches*2
    // <= votes.length and matches === votes.length imply votes.length === 0),
    // so `top` is always set here; the fallback keeps the type honest.
    cases.push({ name, outcome: top?.outcome ?? "divergent", detail: top?.detail });
  }
  return { cases, evaluatedDraws: evaluated.length };
}

const isRight = (c: CaseOutcome): boolean => c.outcome === "match";

/** The deterministic verdict artifact: per-case flips between the parent's
 *  and the fork's aggregated sides. Pure; order of the flip arrays follows
 *  the parent's case order (deterministic across replays). */
export function computeFlipDiff(
  parent: AggregatedSide,
  fork: AggregatedSide,
  drawFloor: number = SEMANTIC_SPLIT_MIN_RAN_DRAWS,
): FlipDiff {
  const forkByName = new Map(fork.cases.map((c) => [c.name, c]));
  const parentNames = new Set(parent.cases.map((c) => c.name));
  const wrongToRight: CaseFlip[] = [];
  const rightToWrong: CaseFlip[] = [];
  let comparable = 0;
  for (const p of parent.cases) {
    const f = forkByName.get(p.name);
    if (!f) continue;
    comparable += 1;
    if (!isRight(p) && isRight(f)) {
      wrongToRight.push({ name: p.name, direction: "wrong-to-right", parentOutcome: p.outcome, forkOutcome: f.outcome });
    } else if (isRight(p) && !isRight(f)) {
      rightToWrong.push({ name: p.name, direction: "right-to-wrong", parentOutcome: p.outcome, forkOutcome: f.outcome });
    }
  }
  return {
    comparableCases: comparable,
    wrongToRight,
    rightToWrong,
    netFlips: wrongToRight.length - rightToWrong.length,
    parentOnlyCases: parent.cases.filter((c) => !forkByName.has(c.name)).map((c) => c.name),
    forkOnlyCases: fork.cases.filter((c) => !parentNames.has(c.name)).map((c) => c.name),
    parentEvaluatedDraws: parent.evaluatedDraws,
    forkEvaluatedDraws: fork.evaluatedDraws,
    meetsDrawFloor: parent.evaluatedDraws >= drawFloor && fork.evaluatedDraws >= drawFloor,
    drawFloor,
  };
}

// ── Audit events ────────────────────────────────────────────────────────────

export type RepairEventType = "repair_proposed" | "repair_promoted" | "repair_discarded";

/** The payload every repair event carries. Proposed events omit `flips`
 *  (nothing measured yet); promoted/discarded carry the diff that informed
 *  the human's Walker decision. `proposalId` links to the proposal-system
 *  record carrying the actual ficha text. */
export interface RepairEventPayload {
  nodeId: string;
  operator: RepairOperator;
  parentFichaHash: string;
  forkFichaHash: string;
  rung: number;
  provider?: string;
  model?: string;
  proposalId?: string;
  flips?: {
    wrongToRight: string[];
    rightToWrong: string[];
    netFlips: number;
    comparableCases: number;
    parentOnlyCases: string[];
    forkOnlyCases: string[];
    parentEvaluatedDraws: number;
    forkEvaluatedDraws: number;
    meetsDrawFloor: boolean;
    drawFloor: number;
  };
}

export function buildRepairEventPayload(spec: ForkSpec, diff?: FlipDiff, proposalId?: string): RepairEventPayload {
  return {
    nodeId: spec.nodeId,
    operator: spec.operator,
    parentFichaHash: spec.parentFichaHash,
    forkFichaHash: spec.forkFichaHash,
    rung: spec.rung,
    ...(spec.provider !== undefined ? { provider: spec.provider } : {}),
    ...(spec.model !== undefined ? { model: spec.model } : {}),
    ...(proposalId !== undefined ? { proposalId } : {}),
    ...(diff
      ? {
          flips: {
            wrongToRight: diff.wrongToRight.map((f) => f.name),
            rightToWrong: diff.rightToWrong.map((f) => f.name),
            netFlips: diff.netFlips,
            comparableCases: diff.comparableCases,
            parentOnlyCases: diff.parentOnlyCases,
            forkOnlyCases: diff.forkOnlyCases,
            parentEvaluatedDraws: diff.parentEvaluatedDraws,
            forkEvaluatedDraws: diff.forkEvaluatedDraws,
            meetsDrawFloor: diff.meetsDrawFloor,
            drawFloor: diff.drawFloor,
          },
        }
      : {}),
  };
}

/** Append one repair event to the temporal log, chained exactly like every
 *  other writer (sequence = eventCount, previousEventId = lastEventId, then
 *  counters advance). Throws on an uninitialised project — a repair event
 *  with no chain to join is a caller bug, not a recoverable condition. */
export function recordRepairEvent(
  cwd: string,
  eventType: RepairEventType,
  payload: RepairEventPayload,
): OntologyEvent {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.eventsPath)) {
    throw new Error(`cannot record ${eventType}: no event log at ${paths.eventsPath} (project not initialised?)`);
  }
  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType,
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: payload as unknown as Record<string, unknown>,
  });
  appendJsonl(paths.eventsPath, event);
  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);
  return event;
}
