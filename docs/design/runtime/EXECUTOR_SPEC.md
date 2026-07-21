# Executor — the governed dynamic-agent loop

**Status:** shipped 2026-06-18 (Phase ζ). Code in `src/runtime/executor/` +
`onto execute`. Tiering: **T2 operational** — "closes a node when it can,
flags honestly when it can't." This is NOT autonomous correctness and NOT an
autonomous system builder; it is a governed actuator over machinery that already
exists (`runRegenerate` + the three gates + per-task routing).

See also: [`SYNC_LOOP_SPEC.md`](SYNC_LOOP_SPEC.md) (the one-step seed the
executor generalises), [`WORKFLOW_RUNTIME_SPEC.md`](WORKFLOW_RUNTIME_SPEC.md)
(the sibling ζ engine), and `docs/MATHEMATICAL_CLAIMS.md` §3.11 (the order
theory of sync readiness).

## 1. What it does

`onto execute <nodes...>` closes intent→code for each node **and its dependency
closure**, in topological order:

```
regenerate from intent → gate (structural + behaviour + rules)
  → DECIDE the next move (refine / decompose / escalate the model ladder)
  → write ONLY behind green gates
  → classify every node it cannot close, honestly.
```

It introduces **no new verification semantics** — the gates are
`runRegenerate`'s. What it adds is the *decision*: which lever to pull, when to
climb the capability ladder, and an honest terminal verdict per node.

Per-node terminal states (this enum IS the report taxonomy — no remapping):

| Terminal | Meaning |
|---|---|
| `closed` | gates green; the passing draft was written under governance |
| `extraction-gap` | the **intention** is the limit, not the model — since 2026-07-20 decided by draw-disagreement evidence first (a plateau probe's draws disagree with each other / split pass-fail on the same fixture → the ficha under-determines the artifact), falling back to the original clean-lint proxy. Flag G; do **not** write |
| `capacity-ceiling` | levers + ladder exhausted and the failure does NOT read as an ambiguous ficha (draws agree yet fail with non-clean lint, or no draw evidence + dirty/unknown lint) → the available models can't close it |
| `blocked-upstream` | a hard dependency did not close → not attempted (never disguised as a capacity ceiling) |
| `unverified-no-fixture` | no behaviour fixture → cannot gate on behaviour, so the executor refuses to write |
| `infra-error` | machine failure (provider down, missing shadow, lock, a draft that crashed the checker) |

## 2. Why this, not `sync` or `workflow`

`onto sync` is the *one-step* governed loop: one regen, three gates, write-or-
refuse. The executor is `sync` generalised into a **decision loop with memory**:
it retries with escalating levers, walks a whole dependency closure, and reports
*why* a node didn't close. `onto workflow` runs an author-defined graph; the
executor's "graph" is the intent DAG itself, walked topologically.

## 3. The decision policy — a pure reducer (`policy.ts`)

`decide(state: NodeExecState): Action` is **pure** (no IO, no LLM): given the
history of gate verdicts it returns the next `Action`, either `{apply, lever}`
or `{terminate, terminal}`. This is the heart and the cheapest thing to test —
exhaustive branch coverage in `tests/executor-policy.test.ts`.

Levers: `generate` (plain draw), `refine N` (runRegenerate's internal verify-
refine), `decompose` (slice-and-assemble — since 2026-07-07 it composes
refine + monotone `keepSlices`: green slices freeze between rounds, only
implicated slices regenerate; see
[`../proposals/MONOTONE_DECOMPOSE.md`](../proposals/MONOTONE_DECOMPOSE.md)),
`escalate` (climb one ladder rung), `probe N` (added 2026-07-20: N independent
draws at the current rung, fired **once per node** just before a plateau
verdict, to measure whether the draws agree with EACH OTHER — the gray-zone
fold from `laws/gray-zone.ts`. Not a new gate: a consensus pass still writes
and closes the node).

Branch order (read from the 2026-06-17 calibration record):
1. upstream not all closed → `blocked-upstream`.
2. no history + a valid extraction-gap **precedent** (ficha unchanged, ladder
   no taller — see §5.1) → cite it, terminate `extraction-gap` at zero cost.
3. no history → `generate` at the cheapest rung.
4. behaviour `pass` → `closed`; `infra-error` → terminate; `untested` with no
   fixture → `unverified-no-fixture`.
5. budget/ladder exhausted → if the last verdict carries no draw evidence and
   the probe hasn't fired (and the attempt backstop allows), `probe`; else
   `classifyPlateauWithEvidence`, the **evidence hierarchy** (2026-07-20,
   inspired by the flip-flop-as-boundary-signal framing — external, T3):
   - draws split pass/fail on the same fixture → `extraction-gap`
     (`behaviour-split`);
   - draws ALL fail but on DIFFERENT fixture cases → `extraction-gap`
     (`semantic-split`, added 2026-07-21). The bespoke case the declKey cluster
     and behaviour-split both miss: structure agrees, no draw passes, yet each
     draw fails a different case ⇒ the ficha under-determines WHICH behaviour is
     correct. `gray-zone.ts` fingerprints each compiled draw by the set of
     fixture cases it did not `match`; ≥2 distinct non-empty fingerprints ⇒
     `semanticSplit` ⇒ `zone: gray`. Validated on foreign code (query-string
     bespoke node → gray via semanticSplit where the old signals read
     `unanimous`; `dequal/lite` capacity node with 3 loading-and-failing 7B
     drafts → `semanticSplit false`, no false positive — consistent failure is
     the capacity signature). Residual: a weak model *could* fail differently by
     noise; empirically absent where capacity failure is systematic;
   - no majority declKey cluster across draws → `extraction-gap`
     (`draw-disagreement`) — the draws PROVE the ficha under-determines;
   - draws agree + clean lint → `extraction-gap` (`clean-lint`, the original
     calibrated rule preserved);
   - draws agree + dirty/unknown lint → `capacity-ceiling` (`draw-agreement`);
   - no draw evidence → original lint proxy (**clean → extraction-gap, else
     capacity-ceiling**; unknown lint stays conservative = capacity, never
     accusing the intention without evidence).
   The chosen evidence lands on `NodeRecord.gapEvidence` (same fold in policy
   and runner — no mapping drift) and Gap-A nodes flagged by disagreement are
   listed as the ficha-repair route in the report footer.
6. otherwise climb the lever ladder: refine → escalate → decompose → concede.

The anti-corruption layer `verdict.ts` collapses the 20-field `RegenerateResult`
into a small `GateVerdict {outcome, lintClean, hasFixture, grayZone?, detail}`
so the policy never sees the fat type. `fixturePresent` disambiguates the
overloaded `no_fixture` verdict: a fixture-present-but-unevaluable draw is
`broken` (refinable), not `untested` (unverifiable). `grayZone` (present only
on multi-draw attempts) carries the draw-agreement fold the plateau
classification needs.

**Typed failure channel (2026-07-20, REVIEW_2026-07-20 §3).** Failing
`runRegenerate` results stamp `failureKind: transport | compile | oracle |
lock | not-found | config | io`, derived from the compile-plan's typed step
reasons (`dispatch_failed` → transport, `validate/intent/runtime_failed` →
compile, …). `verdict.ts` routes broken-vs-infra on the enum — `compile`/
`oracle` → `broken` (refinable), everything else → `infra-error` — so a draft
diagnostic that QUOTES an infra token ("Cannot find name 'ECONNREFUSED'") can
no longer poison the classification, and producer message rewording cannot
silently flip the verdict. The old string regexes survive only as the
fallback for legacy results without the field. End-to-end producer→classifier
coverage: `tests/regen-failure-kind.test.ts` (including a real dead-provider
transport run).

## 4. The capability ladder (`model-ladder.ts`)

`escalate` climbs a ladder ordered cheapest → most capable. The ladder is **not
hardcoded** — it is the result of resolving a `ModelPremise` (allow/forbid/order
over `caps`: locality, tier, cost) against the model registry. A model is a rung
**only if it carries explicit `caps`** (the opt-in; keeps embed/extract models
out of the compile ladder). `DEFAULT_PREMISE` forbids `paid` + `mock`, so the
$0/local default falls out: opus is absent unless `--allow-paid` is passed.

Live ladder: `qwen2.5-coder:7b` (local) → `qwen3-coder:480b-cloud` (cloud, free
tier) → `claude-opus-4-7` (only with `--allow-paid`).

## 5. The runner — a topological walk (`runner.ts`)

NOT a `map` over nodes — a dependency-ordered walk (via `computeCompilePlan`)
where a node's `upstreamAllClosed` feeds its decision. Key invariants:
- **write on the passing attempt**: `write` is on for every attempt and gated by
  `runRegenerate` (writes only behind green gates), so the draft that passes is
  written atomically. No fresh re-draw at converge time (the 7B is high-variance;
  a re-draw would not reproduce the passing draft).
- **upstream propagation**: a node whose dependency didn't close is
  `blocked-upstream`, never mis-blamed as capacity.
- **resilience**: a `runRegenerate` throw is caught as `infra-error` so one
  pathological node never aborts the batch.

`runRegenerate` is injected (`ExecutorDeps.regenerate`) so the walk, the policy
integration, and the governance are testable without a live LLM
(`tests/executor-runner.test.ts`). `runExecutorLive` (`commands/execute.ts`)
binds the real command + loads graph/registry + resolves the premise ladder.

### 5.1 Episodic precedent store (`precedents.ts`, added 2026-07-20)

The executor's memory across runs: one record per node at
`.ontology/reports/executor-precedents.json` — `{terminal, κ*, gapEvidence,
ladderSize, fichaHash}`, keyed to a sha256 over exactly the intent surface F
consumes (prompt + rules + context contract). Consulted by the runner (IO
stays out of the pure policy; the applicable facts enter the state as data):

- **`closed` precedents warm-start κ*** — the next run begins the climb at the
  rung that closed the node last time. Never a verification cache: the gates
  run in full every time; a precedent cannot green-light a write.
- **`extraction-gap` precedents short-circuit** (evidence `precedent`, zero
  attempts): re-burning the ladder on an UNCHANGED ficha cannot change "the
  intention is the limit". Voided the moment the ficha hash changes or the
  current ladder is taller than the one recorded (new capacity to try).
- **`capacity-ceiling` deliberately does NOT short-circuit** — the local F is
  high-variance (P1_COLLAPSE_VARIANCE 2026-07-08), so a fresh climb can close
  what the last run's draws missed. It is recorded for the audit only.
- Cited precedents are not re-recorded (the original evidence and date stay);
  `--no-precedents` blinds the lookup for a from-scratch re-measure while
  still recording fresh outcomes.

The store is optional (`ExecutorDeps.precedents`); without it every run starts
from scratch, exactly as before. Coverage: `tests/executor-precedents.test.ts`.

## 6. Child-process isolation of the behaviour check

The v0 behaviour checker runs untrusted LLM drafts **in-process**. An IO node
like `lock.ts` schedules a deferred throw (an orphaned retry timer) that fires
after the in-process guard tears down → an uncaughtException that crashed the
whole run. The principled fix (shipped): run the draft check in a **disposable
child process** (`behavior-checker-isolated.ts` + `behavior-check-child.ts`):
`spawnSync(tsx, child)` with a hard timeout + SIGKILL, the verdict written to a
result file. A child that crashes / hangs / `process.exit`s without a result →
`untested` (so the executor refines/escalates; never writes). Only the untrusted
draft path (regenerate) is isolated; `onto probe` self-validation and
`onto verify` stay in-process (they run trusted source). Containment proven in
`tests/behavior-checker-isolated.test.ts`.

## 7. Sync readiness as an order ideal (`kernel/graph/sync-readiness.ts`)

The dependency relation is a poset. A node is confidently **batch**-syncable
only if its whole shadowed dependency closure is also ready — i.e. the batch-
syncable set is the largest **down-closed subset (order ideal)** of the
atomically-ready `core` tier. The dual is the leverage: non-ready nodes are
**blockers**, ranked by transitive dependents; the minimal ones form the
**fix-first antichain**. `computeSyncReadiness` is pure and `onto status
--blockers` surfaces it. The ideal is a monotone closure-style operator (adding a
fixture only grows it), proven in `tests/sync-readiness.test.ts`. See
`MATHEMATICAL_CLAIMS.md` §3.11.

### 7.1 κ* — the capability barometer (`kappa-star.ts`)

κ* is the **least rung of the capability ladder that closes a node** — the
sensor for "escalate the model" vs "improve the intention". The ladder is a
chain; "closes" is assumed an upward-closed (monotone-threshold) predicate, so
the executor's climb is a **least-element search** and κ* is the threshold.

- `kappaStar(observations)` (pure, T1): the least closing rung + whether the
  observed rungs are actually monotone + any **violation** (closed low, failed
  higher = variance / non-threshold — surfaced, not hidden).
- Every `onto execute` run records κ* per closed node and a **κ* distribution**
  (rung → count + never-closed) — the rate-distortion-flavoured measurement of
  *how much model capability this graph's F∘G needs*. Free from any multi-node run.
- **Cost-optimal warm start:** `priorKappa` lets a node start its climb at its
  last known κ* instead of rung 0 — the least-element search from a known lower
  bound, skipping rungs known to fail. This is the order-theoretic "best
  approximation from below" made operational.

Honest tiering: the least-element computation is T1 (tested); the
monotone-threshold + rate-distortion reading is T2/T3 (see
`MATHEMATICAL_CLAIMS.md` §3.11). A high κ* with clean lint at the top rung is the
`extraction-gap` signal; a low κ* means cheap models suffice.

### 7.2 Ladder economics (added 2026-07-07)

Every attempt records `durationMs`; each `NodeRecord` aggregates wall-clock +
attempts split by **rung locality** (from the ladder's `caps`, attached by
`resolveLadder`; provider heuristic as fallback) + `closedLocality` (the κ\*
rung's locality). `ExecReport.economics` derives the **local-coverage share**
— closed-at-local / closed — the run's oracle-routing measurement: how much of
the work the $0/local rungs handled before the ladder had to climb. Measured
facts only (time + locality; no fabricated cost/energy). Motivation, external
signals, and the queued follow-ons (persisted κ\* warm starts, speculative
sweep ordering) in
[`../proposals/LADDER_ECONOMICS.md`](../proposals/LADDER_ECONOMICS.md).
Pinned by `tests/executor-economics.test.ts`.

## 8. Honest results (2026-06-18, real machinery)

- `node_0110` / `node_0172` (pure leaves): `closed` at rung 0, written governed.
- `node_0013` (`lock.ts`, glue/IO): **escalates 7B→480b-cloud and closes** —
  the 7B can't, the cloud can; first end-to-end ladder escalation observed.
- Trustworthy core 47 → **136 / 221** after the fixtures grind; the order-ideal
  view shows only **77 batch-syncable**, 59 blocked-from-below, with
  `node_0021` (`load.ts`) alone blocking 82 nodes.

## 9. What it does NOT cover (yet)

- The measured frontier sweep / close-rate over the calibrated sample
  (ROADMAP gap #2) — the number that decides whether to build the Architect.
- The Architect (Goal→Intent): proposes an intent subgraph and validates each
  node via the executor. Designed as "the same loop one level up"; gated on the
  sweep.
- A truly deferred uncaught throw from a child is contained by killing the child;
  a draft that corrupts shared on-disk state before exit is out of scope.

## 10. Implementation handles

```
src/runtime/executor/
  types.ts        NodeExecState, Lever, Action, Terminal, NodeRecord
  verdict.ts      RegenerateResult → GateVerdict (anti-corruption)
  policy.ts       decide() — the pure reducer
  model-ladder.ts ModelPremise + resolveLadder (caps opt-in)
  kappa-star.ts   κ* barometer — least-element of the capability chain
  runner.ts       runExecutor — topological walk, governed write, κ* + warm start
  report.ts       ExecReport + formatReport
src/surfaces/commands/execute.ts   runExecutorLive + executeCommand
src/laws/behavior-checker-isolated.ts + behavior-check-child.ts
src/kernel/graph/sync-readiness.ts  computeSyncReadiness
```
