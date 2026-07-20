// The EXECUTOR's decision policy — a pure reducer `decide(state) -> Action`.
//
// This is the heart of the dynamic layer and the cheapest thing to validate:
// no IO, no LLM, deterministic given the state. The runner applies the action,
// observes a GateVerdict, and folds it into the next state. Every branch is
// read from the calibration record (REGEN_ORACLE_REFINE / REGEN_INTENT_
// CONSUMPTION, 2026-06-17): structural+behaviour gates are the signal, lint
// discriminates "broken code" from "insufficient intention", and the routing
// ladder is the capability axis.
//
// Termination is guaranteed: every applied lever appends to history, and the
// budget guard terminates once attempts reach maxAttemptsPerNode.

import type { Action, NodeExecState, PlateauEvidence, Terminal } from "./types.js";
import type { GateVerdict } from "./verdict.js";

// runRegenerate clamps --refine to [1,4]; 3 rounds is the calibrated default.
export const DEFAULT_REFINE_ROUNDS = 3;

// Draws for the one-shot disagreement probe fired before a plateau verdict.
// Matches the sync loop's default (--draws 3): the smallest N that can
// distinguish unanimous / majority / gray.
export const DEFAULT_PROBE_DRAWS = 3;

const atTopRung = (s: NodeExecState): boolean => s.rung >= s.ladderSize - 1;

const refinedAtThisRung = (s: NodeExecState): boolean =>
  s.history.some((a) => a.rung === s.rung && a.lever === "refine");

const decomposedEver = (s: NodeExecState): boolean =>
  s.history.some((a) => a.lever === "decompose");

const probedEver = (s: NodeExecState): boolean => s.history.some((a) => a.lever === "probe");

// The hardest call in the system, isolated and honest. Evidence hierarchy:
//   1. Draw-vs-draw disagreement (when a multi-draw probe ran): draws that
//      DISAGREE with each other — no majority declKey cluster, or a pass/fail
//      split on the same fixture — prove the intent under-determines the
//      artifact → extraction-gap, with direct evidence. Draws that AGREE yet
//      still fail show the intent is consumed consistently → the models are
//      the limit (capacity-ceiling), UNLESS lint is clean (the pre-existing
//      calibrated rule: consistent, clean, still failing → the intention).
//   2. No draw evidence → the original lint proxy: clean lint → extraction-
//      gap; dirty OR unknown lint → capacity-ceiling. Unknown lint
//      deliberately does NOT flag G: we never accuse the intention without
//      evidence.
export function classifyPlateauWithEvidence(
  last: GateVerdict,
): { terminal: Terminal; evidence: PlateauEvidence } {
  const gz = last.grayZone;
  if (gz && gz.compiledDraws >= 2) {
    if (gz.behaviorSplit) return { terminal: "extraction-gap", evidence: "behaviour-split" };
    if (gz.zone === "gray") return { terminal: "extraction-gap", evidence: "draw-disagreement" };
    if (last.lintClean === true) return { terminal: "extraction-gap", evidence: "clean-lint" };
    return { terminal: "capacity-ceiling", evidence: "draw-agreement" };
  }
  return last.lintClean === true
    ? { terminal: "extraction-gap", evidence: "clean-lint" }
    : { terminal: "capacity-ceiling", evidence: "dirty-or-unknown-lint" };
}

function classifyPlateau(last: GateVerdict): Terminal {
  return classifyPlateauWithEvidence(last).terminal;
}

export function decide(s: NodeExecState): Action {
  // Graph coupling: a node whose hard dependencies have not closed was never
  // given valid upstream context. Reporting capacity/G here would be a lie.
  if (!s.upstreamAllClosed) {
    return { type: "terminate", terminal: "blocked-upstream" };
  }

  const last = s.history.at(-1)?.verdict;

  // Episodic precedent: a prior run already proved this exact ficha is the
  // limit (extraction-gap) and nothing material changed — no ficha edit, no
  // taller ladder. Re-burning the ladder cannot improve that verdict; cite it
  // and keep the node in the repair queue. (Capacity-ceiling precedents never
  // short-circuit — the local F is high-variance, a fresh climb can close.)
  if (!last && s.priorExtractionGap) {
    return { type: "terminate", terminal: "extraction-gap" };
  }

  // First touch: a plain blind draw at the cheapest rung.
  if (!last) {
    return { type: "apply", lever: { kind: "generate" } };
  }

  // Terminal outcomes that short-circuit the ladder.
  if (last.outcome === "pass") {
    return { type: "terminate", terminal: "closed" };
  }
  if (last.outcome === "infra-error") {
    return { type: "terminate", terminal: "infra-error" };
  }
  if (last.outcome === "untested" && !last.hasFixture) {
    // No behaviour gate exists for this node → cannot honestly converge-write.
    return { type: "terminate", terminal: "unverified-no-fixture" };
  }

  // Hard backstop + exhaustion of the lever/ladder space.
  const attempts = s.history.length;
  const exhausted =
    attempts >= s.maxAttemptsPerNode ||
    (atTopRung(s) && refinedAtThisRung(s) && decomposedEver(s));
  if (exhausted) {
    // Before conceding, gather the ONE piece of evidence the plateau verdict
    // actually needs: do independent draws at this rung agree with each other?
    // Fired at most once per node, never past the attempt backstop, and only
    // when the last verdict carries no draw evidence already. A consensus pass
    // still closes the node (write stays governed by runRegenerate), so the
    // probe is a lever, not a new gate.
    if (attempts < s.maxAttemptsPerNode && last.grayZone === undefined && !probedEver(s)) {
      return { type: "apply", lever: { kind: "probe", draws: DEFAULT_PROBE_DRAWS } };
    }
    return { type: "terminate", terminal: classifyPlateau(last) };
  }

  // Needs-work outcomes (broken, behavior-fail, rule-violation, untested with a
  // fixture present): climb the lever ladder. Refine first (it folds the
  // deterministic critique back in), then escalate the model, then decompose,
  // then concede. Lint affects only the FINAL classification, not the order.
  if (!refinedAtThisRung(s)) {
    return { type: "apply", lever: { kind: "refine", rounds: DEFAULT_REFINE_ROUNDS } };
  }
  if (!atTopRung(s)) {
    return { type: "apply", lever: { kind: "escalate" } };
  }
  if (!decomposedEver(s)) {
    return { type: "apply", lever: { kind: "decompose" } };
  }
  return { type: "terminate", terminal: classifyPlateau(last) };
}
