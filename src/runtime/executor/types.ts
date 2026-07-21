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
//   - probe:     N independent draws at the current rung (--draws N) fired
//                ONCE, just before a plateau verdict, to measure whether the
//                draws disagree with EACH OTHER (the gray-zone index). The
//                probe is evidence-gathering that can still close the node
//                (a consensus pass writes) — it adds no verification semantics
export type Lever =
  | { kind: "generate" }
  | { kind: "refine"; rounds: number }
  | { kind: "decompose" }
  | { kind: "escalate" }
  | { kind: "probe"; draws: number };

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

// WHY a plateau landed on extraction-gap vs capacity-ceiling — the evidence
// axis behind the Terminal, ranked strongest-first. Draw-vs-draw evidence
// (probe/multi-draw) outranks the lint proxy: draws that DISAGREE with each
// other prove the intent under-determines the artifact (Gap A → repair the
// ficha); draws that AGREE yet fail point at the models (Gap B → ladder).
export type PlateauEvidence =
  | "behaviour-split" // draws split pass/fail on the SAME fixture → Gap A
  | "semantic-split" // draws all FAIL but on DIFFERENT cases → Gap A (bespoke; structure agrees, none passes)
  | "draw-disagreement" // no majority declKey cluster across draws → Gap A
  | "clean-lint" // lint-clean at plateau, still failing → Gap A (legacy proxy)
  | "draw-agreement" // draws agree AND lint not clean → Gap B with evidence
  | "dirty-or-unknown-lint" // no draw evidence, lint dirty/unknown → Gap B
  | "precedent"; // a prior run flagged this exact ficha; unchanged since → Gap A cited, not re-measured

// One recorded attempt: which rung, which lever produced it, and the normalized
// gate outcome. The history is the audit log; replaying `decide` over it is
// deterministic (the only non-determinism is the LLM draw that produced each
// verdict).
export interface Attempt {
  rung: number;
  lever: LeverKind | "initial";
  verdict: GateVerdict;
  /** Wall-clock milliseconds the attempt took (regenerate + gates). Optional so
   *  synthetic policy-test histories stay terse; the runner always records it.
   *  This is the honest, measurable unit of the ladder-economics report — we
   *  measure time and rung locality, never fabricated dollars or watts (see
   *  docs/design/proposals/LADDER_ECONOMICS.md). */
  durationMs?: number;
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
  // Set by the runner from the episodic precedent store: a PRIOR run ended
  // this node extraction-gap, the ficha is UNCHANGED since, and the current
  // ladder is no taller. Re-burning the ladder cannot change that verdict, so
  // the policy honours the precedent on first touch (data in, purity kept —
  // the store lookup itself is runner-side IO).
  priorExtractionGap?: boolean;
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
  /** Present only on plateau terminals (extraction-gap / capacity-ceiling):
   *  the evidence that decided the Gap A vs Gap B call. Routes Gap A to the
   *  ficha-repair queue (`onto status --gray-zone`) instead of a re-run. */
  gapEvidence?: PlateauEvidence;
  /** κ* — the least ladder rung observed to close this node (null if it never
   *  closed). The capability barometer; see runtime/executor/kappa-star.ts. */
  kappa: number | null;
  /** Total wall-clock ms across all attempts (sum of Attempt.durationMs). */
  totalDurationMs: number;
  /** Attempts spent at local vs cloud rungs (rung locality from the ladder's
   *  caps, provider-derived when unannotated). The per-node input to the
   *  oracle-routing economics: how much of the work stayed on-device. */
  attemptsLocal: number;
  attemptsCloud: number;
  /** Locality of the κ* rung — where the node actually closed. null when it
   *  never closed (or the ladder rung is unknown). */
  closedLocality: "local" | "cloud" | null;
}
