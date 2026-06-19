// The dynamic agent layer — EXECUTOR.
//
// This module declares the *state* the executor's decision policy operates over
// and the *actions* it can take. The policy (policy.ts) is a pure reducer
// `decide(state) -> Action`; the runner (runner.ts) applies the action via the
// real machinery (runRegenerate) and folds the resulting GateVerdict back into
// a new NodeExecState. Keeping the state and the verdict in plain types here —
// with no IO and no LLM imports — is what lets the policy stay pure and be
// tested exhaustively against synthetic histories.
//
// Design note (docs/design/runtime/SYNC_LOOP_SPEC.md is the one-step seed):
// the executor is the governed one-node loop generalised — it escalates the
// capability ladder, refines/decomposes via the levers already built into
// runRegenerate, writes ONLY behind green gates, and terminates with a verdict
// that IS the per-node report category (no separate mapping → no drift).

import type { GateVerdict } from "./verdict.js";

// A lever the policy can pull. Each maps to a concrete runRegenerate options
// shape (see runner.leverOptions):
//   - generate:  a plain blind draw at the current rung (draws=1, no refine)
//   - refine:    runRegenerate's internal verify-refine loop (--refine N) —
//                failed criteria + runtime diagnostic + export drift + lint are
//                fed back round-to-round by the machinery itself
//   - decompose: slice-and-assemble (--decompose) for "can't hold the whole
//                contract at once" ceilings
//   - escalate:  climb one rung of the capability ladder, then a plain draw
export type Lever =
  | { kind: "generate" }
  | { kind: "refine"; rounds: number }
  | { kind: "decompose" }
  | { kind: "escalate" };

export type LeverKind = Lever["kind"];

// A terminal verdict. THIS ENUM IS THE PER-NODE REPORT TAXONOMY — the runner
// never maps it to something else, so what the policy decides is exactly what
// the report says.
//   - closed:                 gates green, written under governance
//   - extraction-gap:         lint clean at the top rung yet still failing →
//                             the intention is the limit, not the model. Flag G,
//                             do NOT write. (The hardest call — see classifyPlateau.)
//   - capacity-ceiling:       levers + ladder exhausted with a non-clean/unknown
//                             lint → the available models can't close it
//   - blocked-upstream:       a hard dependency did not close → not attempted
//                             honestly (never disguised as a capacity ceiling)
//   - unverified-no-fixture:  no behaviour fixture present → cannot gate on
//                             behaviour, so the executor refuses to write and
//                             flags it (more conservative than raw runRegenerate)
//   - infra-error:            machine failure (provider down, missing shadow,
//                             lock) — neither an intention nor a capacity result
export type Terminal =
  | "closed"
  | "extraction-gap"
  | "capacity-ceiling"
  | "blocked-upstream"
  | "unverified-no-fixture"
  | "infra-error";

export type Action =
  | { type: "apply"; lever: Lever }
  | { type: "terminate"; terminal: Terminal };

// One recorded attempt: which rung, which lever produced it, and the normalized
// gate outcome. The history is the audit log; replaying `decide` over it is
// deterministic (the only non-determinism is the LLM draw that produced each
// verdict).
export interface Attempt {
  rung: number;
  lever: LeverKind | "initial";
  verdict: GateVerdict;
}

export interface NodeExecState {
  nodeId: string;
  // Current rung in the resolved capability ladder (0 = cheapest).
  rung: number;
  // How many rungs the ladder has (resolved from the premise + registry).
  ladderSize: number;
  history: Attempt[];
  // Set by the runner from the topological walk: are all hard dependencies
  // closed? When false the only honest action is terminate("blocked-upstream").
  upstreamAllClosed: boolean;
  // Hard backstop against a runaway loop. The ladder/lever logic terminates well
  // before this in practice.
  maxAttemptsPerNode: number;
}

// ── Runner reporting types ──────────────────────────────────────────────────

export interface Decision {
  rung: number;
  action: Action;
}

export interface NodeRecord {
  nodeId: string;
  terminal: Terminal;
  written: boolean;
  finalRung: number;
  attempts: number;
  decisions: Decision[];
  lastDetail?: string;
  /** κ* — the least ladder rung observed to close this node (null if it never
   *  closed). The capability barometer; see runtime/executor/kappa-star.ts. */
  kappa: number | null;
}
