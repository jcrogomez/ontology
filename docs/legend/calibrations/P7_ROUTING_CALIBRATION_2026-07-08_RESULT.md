# P7_ROUTING_CALIBRATION_2026-07-08 — RESULT (written after the run)

> **Dated record. Written AFTER the run; the hypothesis was frozen first.**
> Companion to `P7_ROUTING_CALIBRATION_2026-07-08_HYPOTHESIS.md` — that file
> is NOT edited to match this. **Headline: the static router `s(c)` is a
> NEGATIVE result — it does not predict the collapse-22, and neither does
> any cheap static surface feature.** The record-only wiring stays
> record-only; do not activate.

- **Date:** 2026-07-08. **Git HEAD:** `feat/trustworthy-core @ fc3fdcf`.
- **Ground truth:** `.ontology.self-ingest-epsilon-3a-arm-a.json` (Arm A,
  n=1/node). Recall recomputed per node from `metrics.originalDeclarations`
  / `regenDeclarations`. **125/125 nodes resolved** to current source files
  (suffix-mapped across the post-ε `src/` restructure); **|R0| = 22**
  (recall == 0) — matches the pre-registered ~22 exactly.
- **Cost:** $0, pure static, no inference. Deterministic.

## 1. Measured numbers

| Quantity | Value | Pre-registered floor | Verdict |
|---|---|---|---|
| **AUC(s_kind)** (router score) | **0.479** | H1: ≥ 0.70 (falsifier < 0.62) | ❌ **falsified** |
| AUC(s_len) — today's `tokenEstimate` | 0.513 | H2: length ≤ 0.60 | ✅ (length near-chance) |
| AUC(s_kind) − AUC(s_len) | **−0.035** | H2: Δ ≥ 0.10 | ❌ **falsified** (kind is *worse*) |
| H4 mode-assignment on flagged R0 | **5/11 = 0.455** | ≥ 0.60 (falsifier < 0.50) | ❌ **falsified** |

Binary operating point (`predictedMode ≠ core` as the positive call):

```
TP 11   FP 59   FN 11   TN 44
recall(R0) 0.500   precision 0.157   base rate 22/125 = 0.176
mode distribution: core 55 | truncation_risk 4 | reexpression_risk 66
```

The router flags **70 / 125** nodes as non-core. Precision 0.157 is **below
the 17.6% base rate** — the "non-core" flag carries essentially no
information about R0. Eleven of the 22 R0 nodes are mislabeled `core`,
including clear truncations the LoC signal identifies (`node_0021` loc 0.76,
`node_0052` loc 0.85). The earlier 4/5 smoke was cherry-picked and did not
survive the full 125-node evaluation.

## 2. The load-bearing corroboration (confound-free, May-native metrics)

`s(c)` above was run on **today's** files vs **May's** labels (the
restructure/edits are a confound). To remove it, the same R0 labels were
tested against the sidecar's own May-era static features — same code the
labels came from:

| Cheap pre-extraction feature | AUC vs R0 |
|---|---|
| original line count | 0.522 |
| declaration count | 0.432 |
| prompt tokens (May) | 0.541 |

```
mean line count   R0 177  vs  rest 192   (R0 is if anything SMALLER)
mean decl count   R0 5.4  vs  rest 5.4   (identical)
```

**No static surface feature separates the collapse-22.** Size, declaration
count, prompt tokens, and structural shape (`s_kind`) are all at chance.
The confound does not rescue `s(c)`: the whole class of static-surface
predictors fails on confound-free data.

## 3. Hypothesis verdicts

- **H1 (out-of-box separation) — FALSIFIED.** AUC 0.479 < 0.62. The router
  as shipped is not a usable collapse-triage signal.
- **H2 (kind beats length) — MIXED, net FALSIFIED.** Its *control clause*
  holds: length is near-chance (0.51–0.54 ≤ 0.60), so STOCHASTIC_FUNCTORS
  §1's "collapse is **not** separated by size" is **confirmed and
  strengthened** (declaration count too). But the *positive clause* — that
  declaration **kind** separates them — fails: `s_kind` (0.479) is not
  better than length; Δ = −0.035. Neither size nor this kind-encoding
  predicts collapse.
- **H3 (fit without overfit) — MOOT / not run.** Fitting the three
  `ROUTING_THRESHOLDS` only re-partitions the same features; the
  confound-free feature AUCs (0.43–0.54) upper-bound what any threshold on
  them can reach, so a LOO-CV AUC ≥ 0.75 is unreachable in principle. No
  fit is reported (fitting a proven-non-discriminative feature would be
  theatre).
- **H4 (mode assignment) — FALSIFIED.** 0.455 < 0.50 (chance). The
  truncation/re-expression split is not statically recoverable on R0.
- **H5 (small-value residual) — confirmed, and larger than declared.** Not
  1 miss but **11** R0 nodes labeled `core`, spanning both small
  low-LoC modules and large high-LoC truncations. The over-flagging is the
  dominant failure, not the residual.

## 4. Interpretation

Static surface (size, count, shape) does **not** predict zero-recall
collapse. Two live, non-exclusive explanations:

1. **Collapse is semantic, not syntactic.** What makes a node
   un-round-trippable is how compressible its *intent* is (does the prose
   ficha determine the surface?), which the cheap AST read cannot see.
2. **Collapse is substantially STOCHASTIC (the P1 point, and the likeliest
   lead).** Arm A is **n = 1 per node**. A `recall = 0` draw may be a
   sample from a high-variance fiber, not a fixed property of the file. If
   the collapse label is itself noisy, **no static predictor can separate
   it by construction** — the right instrument is not a better `s(c)` but
   the P1 variance measurement (`verdict-variance.ts`): re-extract each node
   N times and ask whether `recall = 0` is *stable*.

Either way, the pre-registered decision (hypothesis §5) is clear.

## 5. Decision

- **Do NOT activate `s(c)` routing.** H1 falsified → the record-only wiring
  in `onto ingest` stays record-only. Nothing shipped acts on this signal;
  the "measurement before control" discipline held exactly as intended.
- **`s(c)` is retired as a collapse *predictor*, not as a *descriptor*.**
  Its shape/profile labels (barrel, type-surface, schema, cli) are still
  correct descriptions of a file; they simply do not correlate with recall.
  Whether prompt-profile conditioning improves *extraction quality* is a
  **different** question — an extraction-quality A/B, not a collapse-AUC —
  and is not answered here.
- **Tiering unchanged.** This run lifts nothing. `MATHEMATICAL_CLAIMS.md`
  §3.10 stays T2. STOCHASTIC_FUNCTORS §P3/§P7 must be marked **falsified for
  the static-predictor form** (see the doc's status note).

## 6. Next (exploratory — NOT pre-registered; needs its own hypothesis)

1. **P1 variance run (the real lead).** Re-extract the 22 R0 nodes plus a
   matched control set N times; measure per-node recall variance with
   `verdict-variance.ts`. Pre-register: is `recall = 0` stable (a real
   property → look for a semantic predictor) or unstable (a draw → the
   lever is P4 decompose + resample, and P7 conditioning is the wrong
   frame)? This decides whether P3/P7 is salvageable at all.
2. **If stable:** hunt a *semantic* (not surface) predictor — e.g. ficha
   compressibility or an embedding-distance proxy — under a fresh
   pre-registration.
3. **Prompt-profile value:** test whether `s(c)`'s barrel/type/schema
   prompt profiles raise extraction quality on their own kind, measured by
   recall lift vs the generic prompt (an A/B, its own hypothesis).

The honest one-line: **the collapse-22 is not visible from the outside of
the file. The next question is whether it is even a fixed property of the
file — and that is a variance measurement, not a router.**
