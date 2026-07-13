# P1_COLLAPSE_VARIANCE_2026-07-08 — RESULT (written after the run)

> **Dated record. Written AFTER the run; the hypothesis (with its pre-run
> amendment) was frozen first and is not edited to match this.** Companion
> to `P1_COLLAPSE_VARIANCE_2026-07-08_HYPOTHESIS.md`.
>
> **Headline: the collapse-22 is overwhelmingly a SINGLE-DRAW ARTEFACT, not
> a property of the file. 20 of the 22 reach perfect recall in at least one
> of 7 draws; best-of-7 recovers them for free. A tiny residual (2 nodes)
> stably collapses. And the *controls* are not stable either — three
> flipped from Arm A `recall ≥ 0.9` to `0.00` across all 7 draws — so the
> ε n = 1 labels are per-node unreliable.**

- **Date:** 2026-07-08. **Git HEAD:** `feat/trustworthy-core @ fc3fdcf`.
- **Run:** `verify-homeomorphism --nodes <22 + 12> --reps 7 --ast-grounding
  --provider ollama --model qwen2.5-coder:7b`. 34 nodes × 7 draws = 238
  compile-backs. Wall-clock **12h 44m** (ops note: Ollama ran on **CPU at
  ~2.6 tok/s** — a GPU run is ~30–60 min; this does not affect the
  measurement, only the clock).
- **Analysis:** `scripts/p1-variance-report.ts` over the per-draw
  `reps.perRepMetrics` telemetry. Pure, re-runnable.

## 1. Per-node draws (collapse = recall < 0.2)

```
id          grp   collapse/7  meanRecall  maxRecall  agreement  stable?
node_0005  pos      7/7        0.00        0.00       1.00      STABLE
node_0009  pos      1/7        0.64        1.00       0.71
node_0013  pos      2/7        0.71        1.00       0.71
node_0018  pos      1/7        0.81        1.00       0.86
node_0019  pos      0/7        0.81        1.00       0.57
node_0021  pos      2/7        0.63        0.89       0.57
node_0041  pos      2/7        0.60        1.00       0.57
node_0042  pos      5/7        0.29        1.00       0.43
node_0048  pos      0/7        1.00        1.00       1.00
node_0052  pos      2/7        0.64        1.00       0.57
node_0060  pos      1/7        0.86        1.00       0.43
node_0061  pos      5/7        0.29        1.00       0.71
node_0067  pos      1/7        0.79        1.00       0.43
node_0070  pos      4/7        0.29        1.00       0.29
node_0071  pos      1/7        0.71        1.00       0.86
node_0072  pos      1/7        0.64        1.00       0.71
node_0073  pos      4/7        0.43        1.00       0.57
node_0083  pos      0/7        0.86        1.00       0.43
node_0088  pos      7/7        0.02        0.11       1.00      STABLE
node_0096  pos      0/7        1.00        1.00       1.00
node_0099  pos      0/7        0.67        1.00       0.71
node_0100  pos      1/7        0.86        1.00       0.86
node_0017  ctrl     0/7        1.00        1.00       0.57
node_0022  ctrl     1/7        0.86        1.00       0.71
node_0015  ctrl     4/7        0.43        1.00       0.29
node_0023  ctrl     1/7        0.69        1.00       0.71
node_0030  ctrl     2/7        0.61        1.00       0.43
node_0031  ctrl     1/7        0.86        1.00       0.57
node_0084  ctrl     5/7        0.29        1.00       0.57
node_0085  ctrl     5/7        0.14        0.50       0.71
node_0001  ctrl     7/7        0.00        0.00       1.00      STABLE
node_0003  ctrl     7/7        0.00        0.00       1.00      STABLE
node_0006  ctrl     7/7        0.00        0.00       1.00      STABLE
node_0007  ctrl     0/7        0.86        1.00       0.86
```

## 2. Hypothesis verdicts

- **HV1 — property vs draw: DRAW.** stable-collapse `p = 2/22 = 0.091`
  (≤ 0.30 band). Only node_0005 and node_0088 collapse in ≥ 6/7 draws; the
  other **20/22 bounce**, and **20/22 reach recall = 1.00 in at least one
  draw**. The collapse is a sample from a high-variance fiber of `Ĝ`, not a
  fixed trait — exactly STOCHASTIC_FUNCTORS §P1. Static prediction (P3/P7)
  is **confirmed dead**: you cannot predict a coin flip from the file's
  surface.
- **HV3 — best-of-N recovery: PASS, decisively.** Median best-of-7 recall
  over the 22 = **1.000**. Drawing 7 and keeping the best recovers **20/22
  collapse nodes to perfect recall today**, with no predictor and no
  decompose. This is the cheap, shippable lever.
- **HV2 — control integrity: strict falsifier NOT met, but WEAK and
  informative.** Control mean agreement `0.702 > 0.50`, so the pipeline is
  **not uniformly random** (the falsifier for "re-run all of ε" did not
  trigger). BUT the controls are not the stable-good set Arm A implied:
  **node_0001, node_0003, node_0006 flipped from Arm A `recall ≥ 0.9` to
  `0.00` across all 7 draws** (stable-collapse), and node_0015/0084/0085
  bounce. Net control meanRecall = 0.477. **The per-node n = 1 ε labels are
  unreliable** — a node scored good once can be stably bad on re-measure.

## 3. Three findings, separated

1. **Most "collapse" was noise.** 20/22 positives are recoverable; the n = 1
   Arm A recall-0 label massively overstated collapse. The honest collapse
   rate at best-of-7 is **2/22**, not 22/22.
2. **A small, real, stable residual exists.** node_0088 (recall ≤ 0.11 over
   7 draws — a large multi-export module, textbook **P4 decompose**
   territory) and node_0005 (0.00) genuinely resist. This is where
   decomposition, not resampling, is the lever.
3. **A third cause surfaced: drift, not capacity or sampling.** The three
   controls that flipped to stable-0 (0001 `artifact-writer.ts`, 0003
   `compile-plan-runner.ts`, 0006) were `recall ≥ 0.9` in May. Re-running
   on **today's** files against **today's** exports, they collapse
   deterministically — the signature of **ficha/code drift** (the node's
   intent no longer matches the current file), the pre-registered
   today-vs-May confound biting. This is a *correctness* signal (stale
   intent), distinct from model noise.

## 4. Decision

- **P3/P7 static collapse-prediction: retired for good.** HV1 = draw
  confirms it on evidence. `s(c)` stays a descriptor, never a triage.
- **New primary lever — best-of-N resampling.** Median best-of-7 = 1.0.
  Recommend wiring `onto regenerate --draws N` / the executor to **keep the
  best-recall draw** (not only majority-consensus) for extraction-frontier
  nodes; it recovers ~90% of apparent collapse at N-fold cost. Own
  hypothesis before shipping the policy, but the signal is strong.
- **P4 decompose — reserved for the true residual** (node_0088-type large
  modules, ~2/22 here). Its recall-recovery run is still worth doing, now
  scoped to the *stable* collapsers only.
- **ε n = 1 numbers are noisy — treat accordingly.** The strict "re-run all
  of ε" falsifier did not fire, so no mandate; but three controls inverting
  their labels means **any single-draw fidelity figure (incl. the 0.581
  matrix headline and per-node trustworthy-core membership) carries
  per-node draw variance**. Recommend N ≥ 3 median for any future fidelity
  claim. Recorded as guidance, not a tier change.
- **Drift audit.** node_0001/0003/0006 (and node_0005) should be checked for
  ficha↔source drift — if the intent is stale, that is an integrity issue
  the sync loop should catch, unrelated to `Ĝ` variance.

## 5. Tiering

Nothing lifted. But this is the **first real measurement of `Ĝ`'s
stochasticity** the §3.10 adjoint claim asked for ("measure the spread, not
prove determinism"): 34 nodes × 7 draws, per-node verdict entropy and
recall variance. It strengthens the §3.10 T2 evidence base (measured
concentration) and is the empirical content behind STOCHASTIC_FUNCTORS §P1.
`MATHEMATICAL_CLAIMS.md` §3.10 stays T2; this run is citable evidence under
it.

## 6. Next (exploratory — each needs its own pre-registration)

1. **Best-of-N policy** — pre-register a recall floor and cost budget; wire
   "keep best-recall draw" and measure trustworthy-core growth.
2. **P4 decompose on the stable residual** — node_0088 + node_0005; does
   slice-and-glue lift the 2/22 that resampling cannot?
3. **Drift audit / N≥3 re-measure of the ε matrix** — quantify how much of
   the 0.581 headline is draw variance.

The one-line: **the collapse frontier is mostly a mirage of n = 1 — draw a
few times and it dissolves; what's left is a handful of genuinely hard
modules (P4) and some stale intent (drift), not a predictable static
class.**
