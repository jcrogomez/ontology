# Fork-and-Diff — cheap counterfactuals for the ficha-repair lever

Status: **proposal, not built** (2026-07-23). Import analysis of two external
papers against our machinery; slices 1–3 need no new architecture decisions,
slice 4 is explicitly deferred behind [`BRANCH_MODEL.md`](BRANCH_MODEL.md).

External sources:
- Nakajima, *The Log is the Agent* (arXiv 2605.21997) — event-sourced runtime
  ("ActiveGraph") where the graph is a pure projection of an append-only log;
  forks branch a run at an event and replay the shared prefix from a
  content-addressed LLM-response cache, so a counterfactual pays only for the
  divergent suffix.
- Nakajima, *Regimes* (arXiv 2606.10241) — an auditable self-improvement loop
  on that substrate: diagnose failures into typed regimes, route each regime
  to its repairable seam, LLM authors a patch, **promote only if a held-out
  CONFIRM split does not regress**. Their honest negative: one split decayed
  from +0.09 to +0.01 by continuing to promote inside the noise band.

Companion reads: [`../runtime/EXECUTOR_SPEC.md`](../runtime/EXECUTOR_SPEC.md)
(the governed loop this plugs into),
[`../../legend/calibrations/EXTRACTION_CAPACITY_CLASSIFIER_PREREG_2026-07-21.md`](../../legend/calibrations/EXTRACTION_CAPACITY_CLASSIFIER_PREREG_2026-07-21.md)
(E3 — shares the flip-count currency defined here).

## Why import anything — the A1 gap in one sentence

The executor's levers (`refine`/`decompose`/`escalate`) all act on the *code
draft*; the highest-yield lever — repairing the **ficha** (E1: query-string
flipped FAIL→PASS on a FIXED 120b rung after human ficha-enrichment) — is
still human-driven, and when it runs, the counterfactual "did the repair
cause the flip?" is paid at full model price and judged informally.

## Inventory — what we already have (do not rebuild)

| ActiveGraph/Regimes piece | Ours, today |
|---|---|
| Content-addressed LLM response cache | `computeRunId = hash(input, model)` + served cache (`checkCache` in `src/forward/compile/compile-node.ts`); every grounding signal folds into `contextHash`; draws bust deliberately via `repCacheBypassToken` |
| Append-only causal log | `events.jsonl`, hash-chained (`sequence` + `previousEventId`), replay law T1 for state counters (`src/kernel/core/state/replay.ts`) |
| Loop history as auditable events | `run_persisted`, `proposal_*`, `compilation_run` events; executor precedents (`src/runtime/executor/precedents.ts`) keyed by `fichaHash` |
| Regime histogram → route to seam | Gap A/B taxonomy + gray-zone `semanticSplit` ranking (= "which fichas to repair first") |
| Fork at a cut point, prefix from cache | **missing** — this proposal, slice 1 |
| Held-out promotion gate | **missing** — slice 2 |
| Strict replay (divergence detection) | **missing** — slice 3 |

## Slice 1 — counterfactual fork for ficha repair (A1's engine)

Frame one ficha repair as a **node-level fork**, not a fresh run:

- **Parent** = the node's last governed run at `fichaHash₀` (already recorded
  by precedents + persisted runs).
- **Fork** = same node at `fichaHash₁` (repaired), **same rung, FIXED** — the
  E1 discipline: a flip must be attributable to the ficha, never to a ladder
  climb happening in the same breath.
- **Shared prefix at ~$0**: upstream/context compiles are unchanged by a
  focal-ficha edit, so their runs hit the existing cache; only the focal node
  re-dispatches. No new cache machinery — this is `computeRunId` doing its
  job.
- **Diff = flips, not text.** The verdict artifact is deterministic:
  per-behavior-case wrong→right vs right→wrong counts + gate-verdict deltas
  (homeomorphism/behavior/contract), parent vs fork. Draw variance is real
  (P1_COLLAPSE_VARIANCE), so the `evaluatedDraws ≥ 3` floor applies to the
  diff exactly as it does to `semanticSplit`.
- **Audit trail**: new event types `repair_proposed` / `repair_promoted` /
  `repair_discarded` carrying `{nodeId, fichaHash₀, fichaHash₁, rung, flips}`
  — the loop's own history stays in the same log it already writes to
  (Regimes' central auditability claim, which we get almost for free).

Sketch: `src/runtime/executor/counterfactual.ts` (fork descriptor + flip
diff) + the three event types in `src/kernel/schemas/ontology.ts`. Precedent
interaction is already correct by construction: `fichaHash₁ ≠ fichaHash₀`
voids the old precedent, and a promoted repair records a fresh one.

## Slice 2 — held-out CONFIRM gate on promotion

> **SHIPPED 2026-07-23** (same-day follow-up to slice 1): seeded
> `splitAuthorConfirm` (~1/3 held out, n≥4, seed = parent fichaHash → the
> split replays from the event and rotates when the ficha changes),
> `confirmHoldout` threaded through regenerate (oracle grounding + refine
> critique filtered; the cases still RUN and score), author-restricted
> repairer prompt, dual AUTHOR/CONFIRM flip diffs + `confirmRegression`
> flag, split + both flip summaries in `repair_proposed`. Still open from
> this slice: the plateau/anti-over-promotion stopping rule (relevant only
> when v2 automation arrives — v1 promotion is human).

Today the behavior fixtures leak into generation twice (`behaviorOracle`
grounding + `refineFeedback` critique), and the same fixtures then score the
result — in-sample by construction. Regimes measured what that costs: an
in-sample +0.18 collapsed to +0.04 held-out.

- Split each node's `BehaviorCase` list: **AUTHOR** (visible to
  oracle-grounding, refine-feedback, and whatever authors the repair) vs
  **CONFIRM** (held out — never folded into any prompt or hash).
- Promotion requires: target failures flip on AUTHOR **and** zero regression
  on CONFIRM.
- **Anti-over-promotion rule** (their seed-101 lesson): stop repairing a node
  when successive promotions stop producing flips beyond the measured draw
  noise — plateau detection, not a fixed iteration count.
- Honest boundary: nodes with few cases (n < 4) cannot split; report
  `heldOut: none` in the verdict rather than fake confidence. Split choice is
  seeded + recorded in the `repair_proposed` event so it replays.

## Slice 3 — strict replay as a measurement

Permissive replay exists (cache hit serves the recorded output). **Strict**
replay = re-dispatch a recorded run with byte-identical input and compare
output hashes. The divergence *rate* is the deliverable, not a pass/fail:

- 7B verifier JSON flakiness (~50% anecdotal) gets a number for free.
- Temperature-0 cloud rungs should approach 0; if they don't, that bounds
  every "deterministic" claim we make.
- CLI sketch: `onto run verify --strict <runId | --sample N>`.
- MATHEMATICAL_CLAIMS impact: the replay law stays T1 for state counters;
  run-level replay is honestly T2 (cache-replay), and strict replay
  **measures** the T2→T1 gap instead of asserting determinism we don't have.

## Slice 4 (deferred) — true event-log forks

Full ActiveGraph-style forking (branch the whole log at event *k*) requires
the [`BRANCH_MODEL.md`](BRANCH_MODEL.md) materialization decision (A/B/C) —
not decided here. Slices 1–3 dodge it on purpose: their fork unit is the
node-level run, which needs no branch semantics. Note for when it lands:
option C (lazy materialization on touch) composes best with prefix-from-cache
reuse, and would finally give the dormant `branch` field on `OntologyEvent` a
meaning.

## What we explicitly do NOT import

- **Reactive blackboard coordination** (behaviors firing on graph patterns,
  emergent control flow). Our F is a deterministic topological walk by
  design; trading that for emergence reverses the project's thesis. Their own
  containment is per-run budgets — "a blunt instrument".
- **Log-as-only-truth.** Our source of truth is the *intent graph*; the log
  audits it. ActiveGraph versions what *happened*; we version what was
  *meant*. Complementary layers, not a migration target.

## Acceptance (pre-registerable before building)

1. Reproduce the query-string flip via fork-and-diff: repaired ficha, fixed
   rung, prefix cache-hit rate reported, flip counts as the verdict.
2. E3 consumes the same currency: per-case flips → McNemar exact test + a
   cross-run noise band, one statistical apparatus for the classifier study
   and the repair lever.
3. A promoted repair that regresses CONFIRM anywhere in the sweep is a
   design falsifier for slice 2's threshold (then raise it, as they did).
