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

import type { Action, NodeExecState, Terminal } from "./types.js";
import type { GateVerdict } from "./verdict.js";

// runRegenerate clamps --refine to [1,4]; 3 rounds is the calibrated default.
export const DEFAULT_REFINE_ROUNDS = 3;

const atTopRung = (s: NodeExecState): boolean => s.rung >= s.ladderSize - 1;

const refinedAtThisRung = (s: NodeExecState): boolean =>
  s.history.some((a) => a.rung === s.rung && a.lever === "refine");

const decomposedEver = (s: NodeExecState): boolean =>
  s.history.some((a) => a.lever === "decompose");

// The hardest call in the system, isolated and honest:
//   clean lint + nothing left to try → the intention is the limit (extraction-gap).
//   dirty OR unknown lint → blame the available capacity, not the intention.
// Unknown lint deliberately does NOT flag G: we never accuse the intention
// without evidence.
function classifyPlateau(last: GateVerdict): Terminal {
  return last.lintClean === true ? "extraction-gap" : "capacity-ceiling";
}

export function decide(s: NodeExecState): Action {
  // Graph coupling: a node whose hard dependencies have not closed was never
  // given valid upstream context. Reporting capacity/G here would be a lie.
  if (!s.upstreamAllClosed) {
    return { type: "terminate", terminal: "blocked-upstream" };
  }

  const last = s.history.at(-1)?.verdict;

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
