# Stochastic functors — a probabilistic theory of `G`, grounded in the collapse-22

> **Status: RFC / theory note (2026-07-08). NOT IMPLEMENTED as a named
> module.** This formalises an object the project *already half-owns*
> (`MATHEMATICAL_CLAIMS.md` §3.10 calls `G` "irreducibly a probabilistic
> functor … a natural transformation valued in a category enriched over
> probability distributions"). Every axiom below is graded T1–T4 per the
> ledger conventions; the *instruments* that estimate the theory are
> mostly shipped, the *theorems* are aspirational. Do not cite any P-axiom
> as proven without checking the tier line.

> **UPDATE 2026-07-08 — P3/P7 static-predictor form FALSIFIED.** The
> pre-registered calibration
> (`docs/legend/calibrations/P7_ROUTING_CALIBRATION_2026-07-08_RESULT.md`)
> found that `s(c)` does **not** predict the collapse-22 (AUC 0.479) and
> that **no** cheap static feature does (size, decl-count, shape all at
> chance; R0 nodes are the same size as the rest). So P3 (predict collapse
> statically) and P7-as-triage are dead as stated. What survives: the §1
> "not size" finding is *strengthened*; `s(c)` remains a useful prompt
> *descriptor* (not a predictor); and the live lead moves to **P1** — is
> `recall = 0` even a stable property, or a single-draw artefact? Read the
> RESULT before building on P3/P7.
>
> **UPDATE 2026-07-08 — P1 CONFIRMED (collapse is stochastic).** The
> variance run (`P1_COLLAPSE_VARIANCE_2026-07-08_RESULT.md`, 34 nodes × 7
> draws) settles it: stable-collapse `p = 2/22 = 0.09` — collapse is a
> **draw, not a property**. 20/22 reach recall 1.0 in ≥ 1 of 7 draws, and
> **median best-of-7 recall = 1.0**, so the immediate lever is **best-of-N
> resampling** (§P1), not prediction. A ~2/22 stable residual (large
> multi-export modules) is genuine **P4-decompose** territory; separately,
> three *controls* flipped `recall≥0.9 → 0` on re-measure, exposing
> ficha↔code **drift** as a third cause and flagging the ε n=1 labels as
> per-node noisy.

**Depends on / reuses (shipped):** `verdict-variance.ts`,
`sync-readiness.ts`, `kappa-star.ts`, `verify-homeomorphism.ts`,
`loss-breakdown.ts`, `context/gluing.ts` (`identify-if-equal` sheaf),
`slice-keep.ts` (MONOTONE_DECOMPOSE, shipped 2026-07-07).
**Lifts (if the P4/P5 experiments land):** `MATHEMATICAL_CLAIMS.md` §3.10
from T2 (mean tolerance) → T2⁺ (measured *law*, not mean).
**See also:** [`MONOTONE_DECOMPOSE.md`](MONOTONE_DECOMPOSE.md),
[`LADDER_ECONOMICS.md`](LADDER_ECONOMICS.md),
[`../runtime/EXECUTOR_SPEC.md`](../runtime/EXECUTOR_SPEC.md).

---

## 0. Orientation (one paragraph)

`F : Intent → Code` and `G : Code → Intent` are treated in the canon as
functors between ordinary (Set-valued) categories, with `F∘G ≈ id`
measured as a *mean* fidelity. That framing is the right first cut, but it
hides the object that actually governs the frontier: **`G` does not return
a point of `Intent`, it returns a distribution.** Repeated extraction of
the same module yields different intents; the honest object of study is
the whole law, not one draw. This note takes that seriously, promotes `G`
to a **Markov kernel** `Ĝ`, and shows that the project's hardest measured
failure — the 22 nodes that collapse to zero structural recall — is not
noise but a *systematic, kind-dependent bias* of `Ĝ`, with a categorical
resolution using machinery that already ships at T1.

---

## 1. The empirical hook: the collapse-22 (and what it is *not*)

Phase ε, Arm A (grounded `qwen2.5-coder:7b`, 125-node Ontology perimeter,
`SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md`). Verdict split: 73
`divergent_loc` (structurally faithful, just re-lengthed — fine), 14
`epsilon_equivalent`, and a hard tail of **22 nodes with zero structural
recall** (`divergent_both` / `divergent_structural`, col-5 = 0.000): the
regen's top-level declaration set has *no* overlap with the original's.
Mean structural 0.496, mean Jaccard 0.581 — the headline number is
entirely governed by this tail.

**The honest twist (measured here, 2026-07-08).** The obvious story —
"large modules blow the generation budget and get truncated" — is *the
minority cause*. The 22 collapse-nodes average **1200 tokens vs 1120 for
the other 103** — a near-tie, not the ~2× a pure length-budget story
predicts. Size is a contributing prior, not the separator. The 22 split
into two structural modes:

- **(a) Truncation collapse** — genuinely large multi-export modules where
  the regen emits a short prefix and drops the tail (`proposals/persist.ts`
  746→71 LoC, `effects/result.ts`). High LoC-distance + 0 recall.
- **(b) Re-expression collapse** — modules of *ordinary* size whose
  top-level declarations are not plain named functions but **type aliases,
  interfaces, const-maps, re-export barrels, or imperative command
  entrypoints** (`prompt/types.ts` 629 tok, `llm/model-capabilities.ts`
  666 tok, `frontier/index.ts` 708 tok, `nodes/node-id.ts` 609 tok). Here
  the model produces *structurally different* declarations under different
  names — low LoC-distance, still 0 recall.

Mode (b) is why the length-budget story under-fits: the fiber of `Ĝ` over
these objects has high entropy **because the intent genuinely
under-determines the surface form**, independent of size. This is the
`C_resistant` subcategory of §3.10 given an empirical face: *it is
characterised by declaration-kind / intent-entropy, not by LoC.*

---

## 2. The exotic object: `Ĝ` as a Markov kernel

Let `P` be a probability monad — the Giry monad on the measurable space of
intents, or, discretely, the finitely-supported distribution monad `D`.
Its **Kleisli category** `Kl(P)` has the same objects; a morphism `A → B`
is a Markov kernel `A → P(B)`, composed by Chapman–Kolmogorov. `Kl(P)` is
a **Markov category** in the sense of Fritz (symmetric monoidal, with
copy/discard) — the standard setting for "functors that return
distributions."

> **Definition (stochastic extraction functor).** `Ĝ : C → Kl(P)`; the
> object `Ĝ(c) ∈ P(Intent)` is the extraction *law* of code object `c`.
> The canon's deterministic `G` is the pushforward of `Ĝ` along a mode /
> MAP selector: `G = argmax ∘ Ĝ`. Everything the ledger says about `G` is
> a statement about *one summary statistic* of `Ĝ`.

The round-trip becomes an **endo-kernel** on the code category:

$$\Phi \;=\; F \circ \hat G \;:\; C \longrightarrow P(C), \qquad
\eta : \mathrm{id}_C \Rightarrow \Phi$$

a natural transformation valued in `Kl(P)`. Fidelity is not `Φ(c) = c`; it
is a **concentration** statement — mass of `Φ(c)` near `c` under each axis
metric. This is exactly §3.10's "enriched over probability distributions,
its rigor artefact is a measured concentration, not a determinism proof",
written as one object.

---

## 3. Axioms P1–P6

Each axiom: **statement · grounding · capability · tool · tier.** Tiers use
the `MATHEMATICAL_CLAIMS.md` scale (T1 tested law … T4 aspirational).

### P1 — Stochasticity (the object is a law, not a point)
- **Statement.** `Ĝ(c) ∈ P(Intent)`; the trustworthy content of an
  extraction is the *shape* of that distribution (mode + dispersion), not
  a single draw.
- **Grounding.** Re-running extraction on the collapse-22 gives different
  truncations/re-expressions each time — the failure is distributional.
- **Capability.** *Per-node uncertainty.* A node is trustworthy iff `Ĝ(c)`
  concentrates; you can rank the whole graph by extraction entropy before
  trusting any of it.
- **Tool.** `src/laws/verdict-variance.ts` (shipped): N samples →
  per-node verdict distribution → agreement / Shannon entropy / metric
  σ, with `agreement=1, entropy=0` recovering the deterministic idealisation.
  This *is* the estimator of `Ĝ`. What is budget-gated is only generating
  the N real-LLM samples (ROADMAP Gap 2).
- **Tier.** Object framing **T4** (no module names `Ĝ`); estimator **T2**
  (shipped, tested).

### P2 — Enriched round-trip (measure the law, not the mean)
- **Statement.** `Φ = F∘Ĝ` is a Markov endo-kernel; fidelity is
  `Pr_{c' ∼ Φ(c)}[ d_axis(c,c') < ε_axis ]` per axis, a *distribution* of
  distances, not their mean.
- **Grounding.** The mean-Jaccard 0.581 collapses a bimodal law (73 faithful
  + 22 collapsed) into one misleading scalar; `loss-breakdown.ts` already
  splits it into recall vs precision per node.
- **Capability.** Replace the single fidelity number with a per-axis
  *fidelity law* — you can state "core nodes: `Pr[d<ε]=0.98`; resistant
  nodes: 0.1" instead of a mean that describes neither.
- **Tool.** Extend `verify-homeomorphism.ts` matrix (already per-node) to
  emit the per-axis distance histogram; `verdict-variance.ts` supplies the
  sampling.
- **Tier.** **T2** (the per-node distances are measured; the *law* is one
  aggregation step away, not yet reported as such).

### P3 — Complexity/kind prior (the bias is real but not size-only)
- **Statement.** `Ĝ` is biased, not zero-mean: for objects of high
  *intent-entropy* `H(c)` the mode of `Ĝ(c)` sits at a sub-object (a
  truncation or a re-expression). There is a budget `β(κ)` — a function of
  the model rung `κ` on the ladder — and recovery is floored below 1 once
  `H(c) > β(κ)`. Crucially `H` is **kind-weighted**, not LoC: type/barrel/
  const-map/command modules carry high `H` at low LoC (the §1 twist).
- **Grounding.** The 1200-vs-1120 token near-tie falsifies a pure-length
  `β`; mode (b) shows `H` must weight declaration-kind.
- **Capability.** *Predict collapse before spending inference.* A cheap
  static `H(c)` estimator (AST export-count + kind-mix + token length —
  all already computed by the ingest scanner) flags the resistant
  subcategory for pre-emptive decomposition, instead of discovering it
  after N wasted LLM calls.
- **Tool.** A `collapse-predictor` over the existing AST features; validated
  against the labelled collapse-22 as ground truth (a real, cheap test).
- **Tier.** Rate-distortion reading **T3** (§3.11 already grades `κ*` as a
  T3 rate-distortion analogy, not a coding theorem); the *predictor* is
  **T2-buildable** and falsifiable against the 22.

### P4 — Decomposition as the recovery operator (the categorical resolution)
- **Statement.** If `H(c) > β(κ)`, replace `c` by a cover `{c_i}` with each
  `H(c_i) < β`, extract per-piece, and **glue**. Fidelity of the whole is
  recoverable from the parts *iff the cover glues as a sheaf* — i.e. the
  overlap sections agree (§Axiom 5 `identify-if-equal`, the one gluing mode
  the ledger grades **T1**). Decomposition is the operad action that turns
  a resistant object into a family of core objects.
- **Grounding.** `proposals/persist.ts` (collapse, mode a) is a bag of
  independent small exports — a textbook good cover. Mode (b) type/barrel
  modules are *already* near-atomic per declaration; the cover is the
  per-symbol split.
- **Capability.** *Turn the 22 un-extractable modules into extractable
  covers* — recover recall the ceiling forbids at the whole-module grain.
- **Tool.** The executor's `decompose` lever + `slice-keep.ts`
  (MONOTONE_DECOMPOSE, shipped 2026-07-07: passing slices are *kept*, so
  recall grows monotonically across rounds) for the split; `context/
  gluing.ts` `identify-if-equal` (T1 signature-sheaf gluing on the
  standard site) for the correct recomposition.
- **Tier.** Split machinery **T2** (shipped executor lever), gluing law
  **T1**; the *theorem* "fidelity recovers under a good cover" is **T4**
  (unproven) but **falsifiable** — re-run the 22 decomposed and measure
  recall lift.

### P5 — The trustworthy core as concentration fixed points
- **Statement.** Core `= { c : Φ(c)` is Dirac-like within `ε }`. This is
  §3.11's "fixed points of the `F∘G` closure" made probabilistic: the set
  where the Markov kernel `Φ` concentrates. It is **monotone** — grows
  under fixture addition, budget/rung increase, or decomposition (P4);
  never shrinks (integrity guard).
- **Grounding.** The measured core moved 47 → 136 / 221 (ROADMAP) exactly
  by the three monotone levers above.
- **Capability.** A *measured, monotone growth law* for what the system can
  be trusted to maintain, with `κ*` as the least rung admitting `c` into
  the core.
- **Tool.** `sync-readiness.ts` (order-ideal, **T1**) + `kappa-star.ts`
  (least-rung, **T1** order part) + `verdict-variance.ts` (concentration).
  The theory *unifies three shipped modules as one object.*
- **Tier.** Order part **T1**; probabilistic-closure part **T2** (rides on
  the §3.10 measurement — do not state as a theorem).

### P6 — Temperature as the developer's steering knob
- **Statement.** Sampling temperature `T` indexes a family `Φ_T`; `T→0`
  concentrates (never to a Dirac — the irreducible §3.10 non-determinism),
  large `T` explores the fiber. The optimal policy is *per-node*: low `T`
  on core nodes (exploit the concentrated extraction), high `T` on frontier
  nodes (enumerate candidate intents, then a human selects the mode).
- **Grounding.** Mode (b) resistant nodes have genuinely multi-modal fibers
  — the right move is to *show the modes*, not force one.
- **Capability.** *Governed exploration of intent*: the developer steers a
  distribution, not a point — the principled version of "show me N variants
  and I'll pick" (cf. the gstack `/design-shotgun` pattern), but over
  **intent extraction** with deterministic gates behind the human's choice.
- **Tool.** Executor model-ladder + a per-node temperature policy; a
  Walker "intent-shotgun" surface that renders the top-k modes of `Ĝ(c)`
  for human selection.
- **Tier.** **T4** (no intent-temperature policy or intent-shotgun ships
  today).

---

## 4. What this actually buys us (the capability ledger)

| Capability | Axiom | Tool (● shipped / ○ buildable / ◇ aspirational) |
|---|---|---|
| Per-node extraction **uncertainty**, rank-before-trust | P1 | ● `verdict-variance.ts` (needs N-sample generation, Gap 2) |
| Fidelity stated as a **law**, not a deceptive mean | P2 | ● `verify-homeomorphism` + `loss-breakdown` (one aggregation from done) |
| **Predict collapse** before spending inference | P3 | ○ `collapse-predictor` over existing AST features |
| **Recover** the resistant 22 via decompose-and-glue | P4 | ● `slice-keep` + ● T1 `identify-if-equal`; ◇ recovery *theorem* |
| **Monotone growth law** for the trustworthy core | P5 | ● `sync-readiness` + `kappa-star` (T1) + `verdict-variance` |
| **Human-steered** intent exploration (per-node `T`) | P6 | ◇ intent-shotgun surface + temperature policy |

The through-line: the exotic object is not vaporware category theory. It
**reuses shipped T1/T2 modules** and names precisely what is new
(`Ĝ`, `β(κ)`, the recovery theorem, the temperature policy) and unproven.

---

## 5. Honest tiering summary

- **What is real now.** `Ĝ`'s estimator (P1), the per-node distance data
  (P2), the T1 order-skeleton of the core (P5), and the T1 sheaf-gluing
  (P4 recomposition) all ship. The measured fidelity is a *mean* over a
  bimodal law we can already decompose.
- **What is analogy (T3).** The rate-distortion reading of `β(κ)` / `κ*`
  (P3) — a floor motivated by information theory, **not** a proven coding
  bound. Keep it labelled.
- **What is aspirational (T4).** The Markov-category object `Ĝ` as a named
  module; the "fidelity recovers under a good cover" recovery theorem (P4);
  the per-node temperature policy and intent-shotgun (P6).
- **The one claim to never make.** None of this licenses `F∘G = id`, nor a
  Dirac `Φ`. Production inference is not bit-deterministic at `T=0`
  (§3.10); the object is irreducibly stochastic, and that is a feature —
  it is *why* uncertainty is measurable at all.

---

## 6. The falsifying experiment (cheap, pre-registerable)

One pre-registered run closes the loop and would move P3/P4 from analogy
to measurement:

1. Fix the collapse-22 as the ground-truth resistant set.
2. **P3 test.** Fit `H(c)` (export-count + kind-mix + tokens) on all 125;
   pre-register the threshold; check it separates the 22 above chance
   (AUC vs a LoC-only baseline — the near-tie predicts LoC-only fails).
3. **P4 test.** Decompose the 22 with `slice-keep`, re-extract per-piece,
   glue with `identify-if-equal`, re-measure recall. Pre-registered success
   floor: median recall on the 22 lifts from ~0 to ≥ 0.5 with **0
   introduced gluing conflicts** (the sheaf must not over-identify).
4. Record as a dated calibration under `docs/legend/calibrations/`; do not
   retro-edit the hypothesis.

If P4's recall lift materialises, `MATHEMATICAL_CLAIMS.md` §3.10 gains its
first *decomposition-recovered* subcategory — the honest way the core
grows past a bimodal ceiling.
