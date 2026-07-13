# Ladder Economics — the executor as an oracle router, measured

**Status:** proposal (2026-07-07). The §4 instrumentation is **shipped** same
day (`src/runtime/executor/` + `tests/executor-economics.test.ts`); everything
else here is queued behind Gap 2 numbers or explicitly de-scoped. Claims graded
per [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) conventions.

See also: [`../runtime/EXECUTOR_SPEC.md`](../runtime/EXECUTOR_SPEC.md) (the
machinery this measures), [`../../ROADMAP.md`](../../ROADMAP.md) Gap 2 (the
open sweep this serves).

## 1. External signals (June 2026) and why they matter here

Five contemporaneous results, each independently converging on the
architecture this project already runs:

1. **Stanford "intelligence per watt"** (Saad-Falcon, Narayan et al.,
   preprint Nov 2025; June 2026 press cycle). Local ≤20B models answer 88.7%
   of 1M real queries; local coverage rose 23.2% → 71.3% (2023→2025);
   intelligence-per-watt improved 5.3×. An **oracle router** — send to local
   when local suffices — cuts energy ~80% and compute cost ~74%; even an 80%-
   accurate router keeps >60% of the savings.
2. **DeepSeek DSpark / DeepSpec** (June 26, 2026). Speculative decoding:
   a cheap **draft** model proposes, the expensive model **verifies**, and the
   output distribution is provably unchanged. 80% inference speedup in
   production.
3. **"3B local matched Claude for $0/day"** (Arize, June 2026). Structured
   evals + prompt engineering let Llama 3.2 3B replace frontier API calls at
   ~90% accuracy. Nvidia's SLM-agents position paper argues the same.
4. **RL for agents survey** (Wolfe, June 2026). ToRL, AgentGym-RL: training
   agents over multi-turn tool-use trajectories; curriculum approaches
   (ScalingInter-RL) stabilize by gradually growing interaction budgets.
5. **Sakana Fugu** (June 22, 2026). "Multi-agent system as a model": a
   contractor that delegates to specialist models and verifies/synthesizes;
   enterprises opt models out of the pool for compliance.

## 2. The load-bearing observation

The executor (`onto execute`) **already is the oracle router**, with one
structural advantage: its routing decision is not a probabilistic classifier
but **deterministic gates** (structural verdict + behaviour fixture + rules).
`DEFAULT_PREMISE` forbids `paid` → rung 0 is local $0; the ladder escalates
only when gates fail. Stanford's 80%-accurate router keeps >60% of the
savings; a gate-verified router misroutes *zero* accepted work — a wrong draft
is never written, it is escalated.

Likewise, the DSpark draft/verify split is the executor's shape at the graph
level: local rung = draft model, gates = verifier, "output distribution
unchanged" = "write only behind green gates". And Fugu's compliance opt-out is
`ModelPremise.allow/forbid` — shipped 2026-06-18.

So: nothing here motivates new architecture. What the signals motivate is
**measuring the economics we already have**, in the sweep the ROADMAP already
gates the Architect on (Gap 2).

## 3. What we adopt vs. what we refuse

| Signal | Adopt | Refuse (the desvío) |
|---|---|---|
| Intelligence per watt | Report **local-coverage share** + attempt split + wall-clock per executor run (§4) | Fabricated watts/dollars — we measure time and rung locality only |
| DSpark draft/verify | The **T3 analogy**, documented; a future *speculative sweep* ordering (§6) | Building a token-level speculative decoder |
| 3B + structured evals | Fixtures ARE the eval harness; **persisted κ\* warm starts** (§5) turn measured capability into routing | Per-task fine-tuning pipelines |
| RL for agents | Keep `wfrun_*` + executor histories replayable — they are trajectory data (T4 note, §7) | Training/fine-tuning any model; reward engineering |
| Fugu multi-agent | Nothing new needed (premise = opt-out; ladder = contractor); consensus-as-lever noted low-priority (§8) | A multi-agent orchestration layer |

## 4. Shipped: run-level economics instrumentation (T1)

Every `Attempt` now records `durationMs`; every `NodeRecord` aggregates
`totalDurationMs`, `attemptsLocal/attemptsCloud`, and `closedLocality` (the
locality of the κ\* rung). `ExecReport.economics` derives:

- `localCloseShare` — closed-at-local-rung / closed. **This is the project's
  analogue of Stanford's local-coverage number**, for intent→code work under
  deterministic gates.
- attempt split local/cloud — how much of the *work* (not just the wins)
  stayed on-device.
- total wall-clock — the honest cost axis an 8 GB Mac actually pays.

Rung locality comes from the registry's explicit `caps` (attached to each
`LadderRung` by `resolveLadder`); the provider heuristic is only a fallback
for hand-built ladders. Pinned by `tests/executor-economics.test.ts`.

**How it feeds Gap 2:** the sweep prescribed in ROADMAP Gap 2 (fixed 6-node
calibrated sample, ladder local → frontier, `--dry-run --json`) now yields,
for free, the economics block alongside terminal states — i.e. one run
answers both "what closes where" (κ\*) and "what did the local rungs save"
(economics). No separate measurement pass.

## 5. Queued: persist κ\* as routing memory (small, after Gap 2)

`priorKappa` (warm start) already exists but is fed manually. The 3B-evals
result suggests the payoff of persisting each node's last κ\* (e.g.
`.ontology/executor/kappa.json`, written on run end, read as default
`priorKappa`): the second sweep starts each node at the rung evidence says,
converting measured capability into routing — the "structured evals make
small models trustworthy" loop, closed with data we already produce.
Deliberately queued until Gap 2 establishes run-to-run κ\* stability
(a κ\* that varies wildly between runs must not become a routing prior;
`kappaStar` already surfaces monotonicity violations).

## 6. Queued: speculative sweep ordering (T3 analogy → maybe T2)

DSpark amortizes verification by batching drafts. Graph-level analogue: run
the **entire batch at rung 0 first**, collect failures, then escalate only
the failed subset — instead of climbing per-node inline. Same terminal
states, potentially much less cloud time for multi-node sweeps. This is an
ordering change in `runExecutor`'s walk, not new semantics — but it interacts
with `blocked-upstream` propagation (a batch pass must still respect the
topological order within each rung). Design it only if Gap 2 shows cloud time
dominating the sweep cost. Until then it stays a documented T3 analogy.

## 7. De-scoped: RL training (T4, recorded so we stop re-deriving it)

The project does not train models — that is the classic detour. Two ideas
survive as notes: (a) executor `decisions`/`history` and `wfrun_*` records
are, structurally, multi-turn tool-use trajectories; keeping them replayable
(already true — they are the audit log) preserves the option of someday
training a *draft* model on them. (b) ScalingInter-RL's curriculum (grow the
interaction budget) is the same shape as the policy's refine-rounds
scheduling; if refine budgets ever become adaptive, that is the reference.
Both T4 aspirational. No implementation.

## 8. De-scoped: consensus lever (low priority)

`--draws N` consensus exists in `runRegenerate`; the executor deliberately
uses `draws: 1` (the policy, not consensus, drives retries). A `consensus`
lever (N draws at the current rung before escalating — cheaper than a rung
climb when local variance, not capability, is the blocker) is plausible but
unmotivated until Gap 2 distinguishes variance-limited from capacity-limited
failures. The §8.1 determinacy-probe finding (7B run-to-run variance swamps
small effects) suggests it may matter; wait for the sweep.

## 9. Claim grading

| Claim | Tier |
|---|---|
| Economics accounting (durations sum; locality split; share arithmetic) | **T1** — `tests/executor-economics.test.ts` |
| "The executor is an oracle router with deterministic gates" | **T2** — operational; gates are tested, routing-vs-Stanford framing is interpretive |
| "localCloseShare is an intelligence-per-watt analogue" | **T3** — analogy; we measure time/locality, not energy |
| Speculative-sweep savings | **T3** — analogy, unmeasured |
| Trajectories → future draft-model training | **T4** — aspirational, de-scoped |
