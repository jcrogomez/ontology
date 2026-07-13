# P7_ROUTING_CALIBRATION_2026-07-08 — HYPOTHESIS (pre-registered)

> **Dated pre-registration. Committed BEFORE the run.** Never edit to match
> results; results land in `P7_ROUTING_CALIBRATION_2026-07-08_RESULT.md`.
> This is the P3 test of `docs/design/proposals/STOCHASTIC_FUNCTORS.md` §6:
> does the cheap static router `s(c)` predict the collapse-22 above a
> length-only baseline, and can its thresholds be fit without overfitting?

## 0. Declared purpose

`s(c)` (`src/inverse/routing-signature.ts`, shipped 2026-07-08) is a pure
AST-only router that labels each node `core` / `truncation_risk` /
`reexpression_risk` and routes prompt-profile + model-tier accordingly. The
STOCHASTIC_FUNCTORS §1 finding is that the 22 zero-recall nodes are **not**
separable by length (mean ~1200 tok vs ~1120 for the rest — a near-tie), so
the router keys off declaration *kind*. This experiment tests whether that
bet holds: **kind-based `s(c)` must separate the collapse-22, and a
length-only baseline must fail.** If length-only also separates them, the
whole §1 premise is wrong and we say so.

## 1. Frozen context

- **Date:** 2026-07-08. **Git HEAD:** `feat/trustworthy-core @ fc3fdcf`.
- **Perimeter (fixed):** the 125-node Phase ε Arm A perimeter
  (`SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md`).
- **Predictor under test:** `computeRoutingSignature` at HEAD, unchanged
  during scoring. `ROUTING_THRESHOLDS` are the pre-calibration defaults
  (`exportManyForTruncation=8`, `tokenLargeForTruncation=2500`,
  `typeSurfaceRatio=0.6`).
- **Ground truth (immutable, recomputed canonically):** run
  `src/laws/loss-breakdown.ts` over the archived Arm A sidecar
  `.ontology.self-ingest-epsilon-3a-arm-a.json` (present, 297 KB). Define
  the positive set **R0 = { node : recall == 0 }** (regen dropped *every*
  original top-level declaration). Expected `|R0| ≈ 22` (22 rows carry
  col-5 = 0.000 in the published table; the sidecar recompute is
  authoritative and resolves the one ambiguous `| 0.000 |` table match).
  Secondary softer label **R½ = { recall < 0.5 }**, reported but not the
  primary target.
- **Environment:** pure static + already-archived labels. **$0, no LLM, no
  new inference.** Deterministic; re-runnable to identical output.

## 2. Scores compared

- **s_kind (the router, primary):** `resistance(c) = (predictedMode ==
  "core") ? 0 : modeConfidence`. Binary operating point = `predictedMode ≠
  "core"`.
- **s_len (the baseline / control):** `tokenEstimate` alone, best single
  threshold chosen by the same CV protocol as any `s_kind` fit. This is the
  **falsifiable control** — the §1 premise predicts it is near-chance.

## 3. Method

1. Compute `s(c)` for all 125 nodes; join to R0/R½ from the sidecar.
2. **Out-of-the-box (no fitting):** confusion matrix + AUC of `s_kind` at
   the frozen thresholds. This is the honest headline number.
3. **Baseline:** AUC of `s_len`.
4. **Constrained fit (overfit-guarded):** grid-search *only* the three
   `ROUTING_THRESHOLDS` on a coarse grid, scored by **leave-one-out CV**
   over the 125. Report the **LOO-CV** AUC, never the in-sample AUC, as the
   fitted headline. No new features may be added during fitting; no
   per-node special-casing.
5. **Mode assignment:** for `c ∈ R0`, compare `s(c)`'s truncation-vs-
   reexpression label to a LoC-distance proxy: **truncation ⟺ LoC-dist ≥
   0.6** (regen much shorter), **reexpression ⟺ LoC-dist < 0.6** (similar
   length, restructured), read from the Arm A table.

## 4. Hypotheses, thresholds, falsifiers (frozen)

- **H1 — out-of-the-box separation.** `AUC(s_kind) ≥ 0.70` at the frozen
  thresholds. *Falsifier:* `< 0.62` → the router as shipped does not
  separate collapse from core; `s(c)` is not yet a usable triage signal.
- **H2 — kind beats length (the load-bearing control).** `AUC(s_len) ≤
  0.60` **and** `AUC(s_kind) − AUC(s_len) ≥ 0.10`. *Falsifier of the §1
  premise:* `AUC(s_len) ≥ 0.70` → length *does* separate the 22; the
  "kind, not size" claim (and the P7 model-tier logic that keeps
  re-expression on the economy model) is wrong and must be revised.
- **H3 — fitting helps without overfitting.** Fitted `LOO-CV AUC ≥ 0.75`
  **and** `in-sample AUC − LOO-CV AUC ≤ 0.15`. *Falsifier:* gap `> 0.15` →
  with only ~22 positives the thresholds overfit; keep the frozen defaults
  and report the honest out-of-the-box number instead.
- **H4 — mode assignment tracks the LoC signature.** `s(c)`'s
  truncation/reexpression label agrees with the LoC-dist proxy on `≥ 60%`
  of R0. *Falsifier:* `< 50%` (chance) → the two-mode split is not
  recoverable statically; collapse the router to binary core/non-core.
- **H5 — the small-but-collapsing residual (named, not hidden).** We
  **pre-declare** that `s(c)` out-of-the-box mislabels ≥ 1 small,
  value-export module as `core` (`effects/result.ts`: recall 0, ~892 tok,
  11 value exports — observed in the 2026-07-08 smoke). This is expected,
  not a surprise to be patched. *Rule:* the fit in step 4 may only recover
  it through a **legitimate feature** (e.g. high export-count × low
  type-ratio × utility role); **hand-adding a `result.ts` special case is
  forbidden** and would void the run.

## 5. Decision the experiment informs

Whether to **wire `s(c)` into ingest as-is** (H1 passes, H3 clean → ship
the frozen router), **fit-then-wire** (H3 improves LOO-CV materially),
**revise the theory** (H2 falsified → length matters, rewrite
STOCHASTIC_FUNCTORS §1/§P7 and the model-tier logic), or **downgrade to
binary** (H4 falsified → drop the two-mode split). It gates the "then wire
it in" step the owner sequenced after this hypothesis.

## 6. Out of scope (deferred, named so the report cannot claim them)

The P4 decompose-and-glue recall-recovery run (separate hypothesis); any
real-LLM re-extraction (this is $0 static only); generalisation off the
Ontology perimeter; the circularity-controlled `inheritContext` ablation
(needs an A/A0-style live run). This experiment scores a **static router
against archived labels** — it does not itself measure any fidelity lift.

## 7. Cost

$0 marginal. Pure static evaluation over 125 nodes + LOO-CV grid on three
integer/coarse thresholds against one archived sidecar. One short session,
no inference, fully reproducible.
