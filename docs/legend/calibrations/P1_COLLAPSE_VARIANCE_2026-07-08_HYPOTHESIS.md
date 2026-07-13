# P1_COLLAPSE_VARIANCE_2026-07-08 — HYPOTHESIS (pre-registered)

> **Dated pre-registration. Committed BEFORE the run.** Never edit to match
> results; results land in `P1_COLLAPSE_VARIANCE_2026-07-08_RESULT.md`.
> Follow-up to `P7_ROUTING_CALIBRATION_2026-07-08_RESULT.md`, which found
> that **no static feature separates the collapse-22** and named the prime
> suspect: the `recall = 0` label may be a **single-draw artefact**, not a
> property of the file (Arm A was n = 1). This experiment settles that.

> **AMENDMENT 2026-07-08 (pre-run, BEFORE any draw was generated — no data
> seen).** Two changes made while wiring the runner: (1) **N = 6 → 7**
> draws, because `verify-homeomorphism --reps` warns that an *even* rep
> count makes the median a synthetic midpoint no draw produced; an odd N
> gives a real-draw aggregate. Thresholds restate accordingly (stable ≥ 6/7,
> unstable [1/7, 5/7]; best-of-7). (2) The **12 control node ids are now
> frozen verbatim** (§2) from the deterministic selector, run before any
> draw: node_0017, node_0022, node_0015, node_0023, node_0030, node_0031,
> node_0084, node_0085, node_0001, node_0003, node_0006, node_0007.

## 0. Declared purpose

Arm A extracted/regenerated each node **once**. A node scored `recall = 0`
(regen dropped every original declaration). The P3 result showed this label
is invisible to every cheap static feature — consistent with the collapse
being **stochastic**: a sample from a high-variance fiber of the
probabilistic functor `Ĝ` (STOCHASTIC_FUNCTORS.md §P1), not a fixed trait.
This run **measures the fiber**: re-run the round-trip `N` times per node and
ask whether `recall = 0` is **stable** (reproduces across draws → a real
property, hunt a semantic predictor) or **unstable** (bounces → the lever is
best-of-N resampling + P4 decompose, and P3/P7 prediction is dead for good).

It also carries a second, larger question (HV2): if even the **controls**
bounce, then Arm A's whole n = 1 matrix — including the 0.581 headline — is a
single noisy draw, and the ε numbers need N-run re-measurement.

## 1. Frozen context

- **Date:** 2026-07-08. **Git HEAD:** `feat/trustworthy-core @ fc3fdcf`.
- **Instrument:** `src/laws/verdict-variance.ts` `measureNodeVariance`
  (shipped, test-pinned): folds `N` regen samples → per-node
  `agreementRate`, `verdictEntropyBits`, `jaccardMean/Stdev`,
  `locMean/Stdev`. `AggregateVarianceReport` for the cross-node roll-up.
- **Extractor/regenerator (matches the Arm A lineage that produced the
  labels):** `G` = `onto ingest --provider ollama --model qwen2.5-coder:7b
  --ast-grounding`; `F` = `onto regenerate` on the same local model. Draws
  are generated at the **operational sampling temperature** (explicitly
  NOT temp 0 — we are measuring the fiber spread, and temp 0 is not
  bit-deterministic anyway, §3.10). `$0` marginal (local Ollama). A `$0`
  cold-subagent **frontier arm** is an OPTIONAL second arm to test whether
  the variance is model-specific; it does not gate the primary decision.
- **Ground truth per draw:** recall = |extracted∩emitted declarations that
  match the file's **current** AST exports| / |current AST exports|,
  computed by the same `verify-homeomorphism` fold Arm A used. NB: we
  re-extract **today's** files (the P3 run resolved all 125/125 node→file
  paths), so this measures stability on current code, with the May labels
  as the motivating prior — stated caveat, not a hidden one.

## 2. Sample (fixed before any run)

- **Positives — the 22 collapse nodes** (`recall = 0` on the Arm A sidecar,
  recomputable via `loss-breakdown.ts`): node_0005, 0009, 0013, 0018, 0019,
  0021, 0041, 0042, 0048, 0052, 0060, 0061, 0067, 0070, 0071, 0072, 0073,
  0083, 0088, 0096, 0099, 0100.
- **Controls — 12 stable-good nodes** (`recall ≥ 0.9` on Arm A), selected
  deterministically (first two `recall ≥ 0.9` nodes of each shape by
  ascending `node_id`, spanning barrel / declaration-only / schema / cli /
  executable, topped up by ascending id). **Frozen list (selector run
  pre-draw):** node_0017, node_0022 (barrel); node_0015, node_0023
  (declaration-only); node_0030, node_0031 (schema); node_0084, node_0085
  (cli); node_0001, node_0003, node_0006, node_0007 (executable). No
  post-hoc swaps.
- **Draws:** `N = 7` per node per functor arm (odd — see amendment). Seven
  distinguishes stable (≥ 6/7 collapse) from unstable (bounces) while
  bounding cost.

## 3. Metric definitions (frozen)

- **collapse-draw:** a single draw with round-trip `recall < 0.2`
  (equivalently verdict ∈ {divergent_both, divergent_structural} with the
  original declarations dropped).
- **stable-collapse node:** collapses in **≥ 6 / 7** draws.
- **unstable node:** collapse-draws in the closed interval **[1/7, 5/7]**
  (it sometimes collapses, sometimes not).
- **best-of-N recall:** `max` round-trip recall over the node's 7 draws.

## 4. Hypotheses, thresholds, falsifiers (frozen)

- **HV1 — the decider: is collapse a property or a draw?** Let `p =`
  fraction of the 22 that are **stable-collapse**.
  - `p ≥ 0.60` → collapse is largely a **property**. *Consequence:* a
    predictor is possible but must be **semantic** (not surface); reopen P3
    with semantic features under a new pre-registration; P4 decompose stays
    valid.
  - `p ≤ 0.30` → collapse is largely a **draw**. *Consequence:* P3/P7
    prediction is **dead**; the lever is **best-of-N resampling + P4
    decompose**. This is the STOCHASTIC_FUNCTORS §P1 outcome.
  - `0.30 < p < 0.60` → **mixed**; both levers, triaged per node.
  *No threshold is retrofitted; these three bands are the pre-registered
  decision surface.*
- **HV2 — control integrity (the bigger fish).** Controls stay good: mean
  round-trip `recall ≥ 0.70` **and** mean `agreementRate ≥ 0.70` across the
  12. *Falsifier:* control mean `agreementRate < 0.50` → the pipeline is
  **globally high-variance**, Arm A's n = 1 labels (including the 0.581
  matrix headline and the trustworthy-core count) are one noisy draw each,
  and **the ε measurements must be re-run with N**. Flag loudly; it
  dominates HV1.
- **HV3 — best-of-N recovery (the immediately actionable number).** Median
  over the 22 of best-of-N recall `≥ 0.50`. *If met:* simply drawing 6 and
  keeping the best recovers half the collapse **today**, with no predictor
  and no decompose — a cheap ship. *Falsifier of "resampling is enough":*
  median best-of-N `< 0.25` → even 7 draws rarely recover these nodes →
  resampling is not the lever; P4 decompose is load-bearing.
- **HV4 — localize the variance (G vs F), report-only.** On a 6-node subset
  (3 positives, 3 controls), also measure **G-only contract recall** (one
  ingest dispatch, no regen: extracted `provides ∩ exports`) across the 6
  draws. Report whether the variance lives in extraction (`G`) or
  regeneration (`F`). No threshold — this points the next fix, it does not
  gate a decision.

## 5. Decision the experiment informs

Whether the collapse frontier is attacked by **(a)** a semantic predictor
(HV1 property), **(b)** best-of-N resampling (HV3) and/or P4 decompose
(HV1 draw), or **(c)** a wholesale N-run re-measurement of Phase ε (HV2
falsified). It also retires or reopens STOCHASTIC_FUNCTORS §P3/§P7 on
evidence rather than intuition.

## 6. Out of scope (deferred, named so the RESULT cannot claim them)

The P4 decompose-and-glue recall-recovery run (its own hypothesis);
designing the semantic predictor (gated on HV1 = property); cross-model /
cross-temperature variance beyond the optional frontier arm; lifting any
`MATHEMATICAL_CLAIMS.md` tier (this measures spread, it does not prove a
law — §3.10 stays T2 regardless of outcome).

## 7. Cost

`$0` marginal on local Ollama. ~34 nodes × 7 draws × compile-back
≈ 238 dispatches + 42 G-only dispatches; one local session. The frontier
arm, if run, is `$0` via cold session subagents (the proven replay path).
Fully re-runnable; the fold is deterministic and test-pinned.
