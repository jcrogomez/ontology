# Phase ε self-ingestion Move 3α — pre-registered hypothesis

> *Move 3α is the AST-grounding-at-compile-back intervention.
> δ' established that the descriptive→prescriptive extraction-prompt
> rewrite moved mean Jaccard 7× off the γ floor but only −12 % on the
> vocab gap (488 missing exports / 115 of 125 nodes), with the
> synthesis line "the compile-back model still drops 488 of them
> across the perimeter — acknowledging the contract structurally and
> ignoring it semantically." 3α addresses that gap from the
> COMPILE_BACK side, not the EXTRACTION side: every code_sketch
> dispatch receives a deterministic MANDATORY EXPORTS section
> (AST-derived) appended to its system prompt, and the run-cache
> contextHash folds in the grounding identity. The intervention is
> multi-arm by design — control + 2 candidate code_sketch models —
> because δ''s decision tree fired "model is the floor for the
> incumbent" and we want to know whether the floor moves when both
> grounding AND the model change together. Pre-registered BEFORE the
> run starts.*

**Run date:** 2026-05-19
**Pipeline:** same as δ' (`ingest --static-classifier enabled` (qwen2.5-coder:3b) → `proposal apply` × all → `verify-homeomorphism --all-artifacts --matrix --ast-grounding --provider ollama --model <arm>`)
**Perimeter:** `src/runtime src/core src/commands src/schemas` (~126 files; same as δ' for direct comparison)
**Commit at run start:** the 3α tooling commit landing alongside this hypothesis
**Arms:** A) qwen2.5-coder:7b (control), B) granite4.1:8b, C) devstral-small-2:24b — all three with `--ast-grounding`, all three sharing the same extractor (δ' qwen 3b template)

## Why this deviates from the δ' Sonnet recommendation

δ' synthesis recommends Move 3 — Anthropic Sonnet 4.6 ceiling probe — as "unambiguously the right experiment." 3α deviates deliberately:

```
We deviate from the δ' Sonnet recommendation because δ' established
model-bound behaviour only for the incumbent qwen code_sketch model,
not for the local model class as a whole. Before paying for the
Sonnet ceiling, 3α tests whether a different combination of (AST
grounding + candidate local model) can close the gap at $0. If the
local class collapses with the same floor, 3α-A still informs the
Sonnet probe with a cleaner baseline; if any local arm despega, the
Sonnet probe becomes optional rather than mandatory.
```

This honours the project memory `feedback_self_ingestion_order` (Ollama dry-run first, then Anthropic) and the strategic framing `project_ontology_strategic_framing` (ε success is a fidelity cartography matrix across orthogonal axes + cost, not a single number). Move 4 (Opus 4.7 ceiling, not Sonnet — per `feedback_sota_ceiling_use_opus`) follows 3α regardless of outcome.

## What changed vs δ'

| Concern | δ' (prior) | 3α (this run) |
|---|---|---|
| Ingest model (semantic_parse) | qwen2.5-coder:3b | qwen2.5-coder:3b (unchanged) |
| EXTRACTION_SYSTEM_PROMPT voice | prescriptive (δ') | prescriptive (δ' — unchanged) |
| **Move 1c safety net** (NEW, baseline cleanup) | absent | **active** — LLM provides=[] gets replaced by AST exports for contract completeness. Affects ALL arms; expected to reduce stragglers from 24 → ~17 |
| **AST grounding at code_sketch** (NEW, the 3α intervention) | absent | **active** — every compile-back dispatch receives a MANDATORY EXPORTS section + grounding-folded contextHash |
| **Verify model (code_sketch)** | qwen2.5-coder:7b | **three arms**: qwen2.5-coder:7b / granite4.1:8b / devstral-small-2:24b |
| Schema (ExtractionResultSchema) | unchanged | unchanged |
| Pipeline + apply path | unchanged | unchanged |
| Pareto label fix (milestone 3.1) | bug active | **fixed** — matrix bucketed by actual dispatched model |

Two interventions move together (safety net + AST grounding) and one variable moves across arms (the code_sketch model). The two interventions are inseparable for the qwen control arm because both land in the same commit chain; if Move 3α-A shows improvement over δ', the split between (safety-net rescue) and (AST grounding at code_sketch) is decomposable by:
- safety-net contribution = (3α-A export-recovery on nodes that previously had provides=[] from upstream) − (δ' on same nodes)
- AST grounding contribution = total 3α-A lift − safety-net contribution

The decomposition is mechanical post-hoc; both signals are visible in the per-node matrix.

## The two candados (Move 3α pre-registered invariants)

These are properties of the experiment, not predictions about outcomes. They were locked in before any model ran.

**Candado #1:** Granite enters as an arm, not as a default. No model is wired into `ontology-config.ts` as a production tier on the basis of 3γ's bake-off result alone. Models earn defaults via cross-arm comparison, not via category-fit assertions.

**Candado #2:** ExportRecoveryRate is measured on the regenerated OUTPUT (the actual .ts file), not on the prompt. A prompt-level metric would reward "dump" behaviour (model recites mandatoryExports in the bullet list without weaving them into code). Measuring at the output enforces "weave" — does the export survive into the TypeScript? — which is the only thing that matters for downstream gluing and compile-back fidelity.

Both candados are enforced in code (`src/runtime/legend/export-recovery.ts` takes the regenerated declarations, not the prompt; no model default is committed in this PR).

## Aggregate baselines from δ' (pre-registered comparison floor)

| Verdict | γ | δ' | 3α floor (= δ' for arm A on safety-net-affected nodes) |
|---|---:|---:|---|
| `unrecoverable` | 19 | **24** | predicted ≤ 17 after safety-net cleanup |
| Mean Jaccard | 0.003 | **0.021** | per-arm prediction below |
| Mean honesty | 0.182 | **0.246** | per-arm prediction below |
| Files with Jaccard ≥ 0.5 | 0 | **2** | per-arm prediction below |
| Missing exports (vocab gap) | 558 | **488** | per-arm prediction below |
| Export recovery rate (new metric) | — | — | per-arm prediction below |

## H1 — Arm A (qwen 7b + AST grounding) lifts off the δ' floor

> *δ' was qwen 7b WITHOUT AST grounding at code_sketch. Arm A is
> qwen 7b WITH grounding (and the safety-net cleanup). Two
> interventions stacked. If Arm A doesn't beat δ' meaningfully, the
> AST grounding at compile-back is doing nothing — qwen 7b's
> attention budget is unable to translate the deterministic
> constraint into emitted code regardless of whether the constraint
> is also in the system prompt.*

| Metric | δ' measured | Arm A predicted | Falsifier |
|---|---:|---:|---|
| **exportRecoveryRate (micro)** | n/a (new metric; computed retroactively on δ' artifacts for comparison: ≤ 0.30) | **≥ 0.45** | < 0.30 → AST grounding at compile-back is inert at this tier |
| Mean Jaccard | 0.021 | **≥ 0.06** | < 0.04 → Arm A is statistical noise relative to δ' |
| Mean honesty | 0.246 | **≥ 0.30** | < 0.25 (within δ' noise) → no measurable lift |
| Missing exports (vocab gap) | 488 | **≤ 350** | > 420 (less than half-way to the −55 % target δ' missed) |
| Files Jaccard ≥ 0.5 | 2 | **≥ 5** | ≤ 2 → no mechanism shift |
| `unrecoverable` | 24 | **≤ 19** | > 22 → safety-net cleanup is failing |

**H1 verdict logic:**
- **All confirmed:** AST grounding at code_sketch is the right axis at the qwen tier. Arms B and C measure how much further a better-tuned model takes it.
- **All falsified:** AST grounding at compile-back is inert OR qwen 7b cannot honour deterministic constraints regardless of where they're surfaced. Either way, Move 4 (Opus ceiling) becomes the next experiment without further local model exploration.
- **Partial:** Arms B and C inform the next read — see H4 cross-arm.

## H2 — Arm B (granite4.1:8b + AST grounding) reduces hallucination vs Arm A

> *Granite 4.1 is tuned for structured JSON output and tool use.
> The 3α-relevant prediction: when the system prompt carries a
> MANDATORY EXPORTS section, Granite should be better at obeying
> the constraint without inventing additional exports — i.e. lower
> hallucinationRate. We do not pre-commit to Granite being better
> at recovery; the hypothesis is about hallucination discipline.*

| Metric | Arm A predicted | Arm B predicted | Falsifier |
|---|---:|---:|---|
| **hallucinationRate (micro)** | ~ 0.15 (estimate, qwen baseline) | **≤ 0.08** | ≥ Arm A → Granite is not measurably more disciplined |
| **exportRecoveryRate (micro)** | ≥ 0.45 | **≥ Arm A − 0.05** (i.e. comparable, may be slightly lower if Granite is conservative) | < Arm A − 0.15 → Granite trades too much recovery for hallucination discipline |
| Mean Jaccard | ≥ 0.06 | **≥ 0.05** (Granite's code generation may be slightly weaker than qwen-coder) | < 0.03 → Granite's code quality outside its tuning target shows up |

**H2 verdict:** if confirmed, Granite earns a slot as the **extractor** in the [[TARGET_ARCHITECTURE]] blueprint (where its structured-output tuning is in habitat), not necessarily as the code_sketch default. The 3α data does not over-claim a production role.

## H3 — Arm C (devstral-small-2:24b + AST grounding) leads the arms on code generation

> *Devstral Small 2 is coding-specialized — 24B parameters, reports
> 65.8 % on SWE-bench Verified. The 3α-relevant prediction:
> conditional on the AST grounding being a useful signal, the
> coding-specialized model should make the most of it. If Devstral
> dominates the arms, the bottleneck WAS code-generation capacity
> and the path forward is "Devstral becomes the code_sketch default,
> Granite becomes the extractor default" (split-role architecture).
> If Devstral does not dominate, code-specialization is not the
> right axis at this perimeter size — possibly because Ontology's
> task is structurally regeneration (full file) not point fixes
> (SWE-bench's task profile).*

| Metric | Arm A predicted | Arm C predicted | Falsifier |
|---|---:|---:|---|
| **exportRecoveryRate (micro)** | ≥ 0.45 | **≥ 0.60** | < 0.50 → coding-specialization doesn't transfer to regeneration |
| Mean Jaccard | ≥ 0.06 | **highest among local arms** | not highest → see H4 cross-arm |
| Files Jaccard ≥ 0.5 | ≥ 5 | **≥ 10** | < 7 → no decisive lift |
| `unrecoverable` | ≤ 19 | **≤ 12** | > 17 → Devstral's coding tuning doesn't address the dropout pattern |

**H3 verdict:** the strongest single signal for 3α. If Arm C cleanly leads on all four metrics, the [[TARGET_ARCHITECTURE]] split-role choice (Granite extractor / Devstral coder) is data-supported. If Arm C ties Arm A, the experiment instead supports "AST grounding alone is the lift" and the model swap is cost-without-benefit at this perimeter.

## H4 — Cross-arm: Devstral beats qwen by ≥ 0.10 mean Jaccard → Devstral promotes

> *The promotion criterion is pre-registered so post-hoc narratives
> can't shift it. If Devstral leads qwen by ≥ 0.10 mean Jaccard
> AND beats it on exportRecoveryRate by ≥ 0.15 (micro), Devstral
> becomes the candidate primary code_sketch model for 3γ's full
> bake-off and the Anthropic publishable pass.*

| Cross-arm metric | Threshold for Devstral promotion |
|---|---|
| Mean Jaccard lift (Arm C − Arm A) | **≥ 0.10** |
| exportRecoveryRate lift (Arm C − Arm A) | **≥ 0.15** |
| Hallucination delta (Arm C − Arm A) | ≤ +0.05 (does not regress badly) |
| `unrecoverable` (Arm C) | ≤ Arm A |

**H4 verdict logic:**
- **Confirmed:** Devstral promotes to candidate primary code_sketch model. The TARGET_ARCHITECTURE.md split-role blueprint is updated with measured backing. 3γ runs over the same 20 calibrated files with Devstral as primary and Sonnet ceiling probe directly compared (rather than against qwen).
- **Falsified:** No model swap is justified by 3α alone. The post-3α next move depends on H5 below.

## H5 — Floor case: if all arms keep exportRecoveryRate below 0.40

> *If the highest-recovering arm does not cross 0.40 microaveraged,
> the bottleneck is NOT model capacity OR AST grounding alone — it's
> the representation: either the regen prompt body still rewards
> narrative response (a code_sketch-side analogue of δ's extraction-
> prompt failure mode), or the perimeter mixes file types where
> rebuilding ≥ 60 % of identifiers is structurally infeasible for any
> open model. The pre-registered next move is NOT to jump to Opus.*

| Pre-registered condition | Pre-registered next move |
|---|---|
| max(arm) exportRecoveryRate < 0.40 | Rewrite the **code_sketch prompt body** (the analogue of δ's extraction-prompt rewrite, but at the compile-back stage). Run 3α-prime with the new prompt. Move 4 (Opus 4.7 ceiling) is conditional on this rewrite landing first. |
| max(arm) exportRecoveryRate ≥ 0.40 AND H1/H3 confirm | Move 4 (Opus ceiling) on the strongest local arm's graph. |
| max(arm) exportRecoveryRate ≥ 0.40 AND H4 confirms | Devstral promotes; Move 4 on Devstral's graph. |

This rule prevents the post-hoc temptation to "well it's not as bad as δ', let's just pay for Sonnet" — the data has to cross a measurable bar before the paid pass is justified.

## H6 — Sanity: extraction reliability holds (δ' baseline)

| Metric | δ' measured | Arm-pooled predicted | Falsifier |
|---|---:|---:|---|
| Total proposals created from 130 files | 126 | **≥ 122** | < 115 → the safety-net is destabilising ingest somehow |
| Schema-retry rate | unmeasured | **≤ 10 %** | > 25 % → the new AST safety net is triggering schema oddities |
| Total extraction wall-clock | 115 min | **115-130 min** (safety-net adds < 15 % overhead) | > 160 min → safety-net or scanner is unexpectedly expensive |

Sanity floor only — the safety-net is a deterministic post-processing step, not a model dispatch, so it should add ≪ 1 % per-file overhead.

## Cost prediction (per arm; 3α total = 3× this)

| Phase | Predicted per-arm | Notes |
|---|---|---|
| Ingest wall-clock | ~100-115 min | shared across all 3 arms — ingest runs once |
| Apply wall-clock | ~2 min | shared |
| Verify wall-clock (per arm) | 280-340 min (~5h-5h40min) | qwen and granite at similar speed; devstral larger may add 20 % |
| Total per-arm wall-clock | **~ 5 h** (verify only) | + shared ingest |
| Total 3-arm wall-clock | **~ 16-18 h** total | feasible overnight + morning |
| Spend | **$0.00** | all arms local (ollama) |

## What 3α measures vs what it doesn't

**Measures:**
- Whether AST grounding at compile-back lifts mean Jaccard / honesty / exportRecoveryRate above the δ' floor (H1).
- Whether a coding-specialized model (Devstral) makes more of the grounding than the incumbent (H3, H4).
- Whether a structured-output-tuned model (Granite) is meaningfully less hallucinating (H2).
- The post-cleanup baseline (safety-net) for the unrecoverable straggler set (H1 secondary).

**Does NOT measure:**
- Opus 4.7 ceiling. Move 4 (Opus on the strongest arm's graph) is the next experiment.
- Ensemble / contract reducer with majority vote. That's 3δ, conditional on 3γ rama B.
- Repair loop with a small fast model. That's 3ε.
- Per-file rep distribution (n ≥ 3). That's Move 6, separate concern.
- Routing decisions in production (`modelRouter.ts`). [[TARGET_ARCHITECTURE]] is the blueprint; 3α-3γ produce the data the router needs but the router itself is not built yet.

## Path-dependent decision tree post-3α

```
                              3α result
                                  │
   ┌──────────────────────────────┼──────────────────────────────┐
   │                              │                              │
H1 confirmed                  H1 partial                    H1 falsified
(Arm A export                 (Arm A export                 (Arm A export
recovery ≥ 0.45,              recovery 0.30-0.45)           recovery < 0.30)
Jaccard ≥ 0.06)                    │                              │
   │                               ▼                              ▼
   ▼                          Both grounding              AST grounding at
   AST grounding             AND model contribute.        compile-back is
   IS the lift at            Look at H3 (Devstral)        inert. Move 4
   qwen tier.                to decide promotion;         (Opus ceiling)
   Look at H3, H4            local floor may be at        is the only
   for promotion.            ~ 0.4 ceiling.               meaningful next
                                                          experiment.

                            H4 confirmed              H4 falsified
                            (Devstral lead ≥          (no decisive
                            0.10 Jaccard +            cross-arm lift)
                            0.15 recovery)                  │
                                  │                         ▼
                                  ▼                    No promotion.
                            Devstral promotes          Either H5 fires
                            to candidate              (representation
                            primary. 3γ +              bottleneck →
                            Move 4 (Opus) on           code_sketch
                            Devstral's graph.          prompt rewrite)
                                                       or proceed to
                                                       Move 4 directly
                                                       on Arm A.
```

## What gets committed regardless of outcome

- This hypothesis doc (committed BEFORE the 3α run starts — the hash anchors the prediction).
- The 3α tooling commits (AST scanner, ast-grounding module, export-recovery metric, failure-mode tagger, Move 1c safety net, Pareto label fix). Already landing alongside this hypothesis.
- The raw 3-arm matrix reports at `docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_ARM_{A,B,C}.md`.
- A synthesis sibling at `docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md` cross-comparing γ / δ' / 3α-A / 3α-B / 3α-C on Jaccard, honesty, vocab gaps, exportRecoveryRate (micro + macro), hallucinationRate, failure-mode distribution, and per-file rebuild status.
- A target-architecture blueprint at `docs/legend/architecture/TARGET_ARCHITECTURE.md` (the role-based + failure-mode-routing design; archived as destination, not as ruta).

The `.ontology.self-ingest-epsilon-3a-*` run dirs are gitignored per the existing β / β' / γ / δ' convention.

## Sequencing within Phase ε

```
β / β' / γ / δ' ✓ (landed)
3α tooling (this commit) ✓
  ↓
3α-A (qwen 7b + grounding)  ─┐
3α-B (granite4.1:8b)         ├─► synthesis ──► 3γ (full bake-off if H4 fires)
3α-C (devstral-small-2:24b)  ─┘                ──► Move 4 (Opus 4.7 ceiling)
                                                  on the strongest local
                                                  arm's graph
```

Move 4 uses Opus 4.7, not Sonnet — see [[feedback_sota_ceiling_use_opus]].

---

## Addendum 2026-05-24 — falsifier recalibration post-A0

> *The original H1–H4 falsifiers in this document were calibrated
> against the **δ' baseline** (qwen-3b without safety-net, mean
> Jaccard 0.021). After Arm A landed (2026-05-23) and Arm A0
> control landed (2026-05-24), the H1 falsifier ceased to
> discriminate — A0 trivially passes 0.226 ≥ 0.1, and so does A.
> Per project memory `feedback_h1_floor_recalibration`, falsifier
> thresholds must reference the strongest current control arm, not
> the original baseline. The recalibrated falsifiers below apply to
> **any new arm launched from 2026-05-24 onward**, including Arm
> C-cloud (`devstral-small-2:24b`). The original §H1–§H5 stay in git
> history as the original pre-registration and are confirmed
> 6-of-6 for Arm A (see `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md`
> post-publication addendum for the recalibrated reading).*

**Strongest current controls** (measured, not predicted):

| Arm | Mean Jaccard | Mean LoC dist | Structural honesty | ExportRecovery (micro) | Missing exports | Hallucinated exports |
|---|---:|---:|---:|---:|---:|---:|
| δ' (qwen-3b, no safety-net) | 0.021 | — | 0.246 | n/a (≤ 0.30 retro) | 488 | — |
| A0 (qwen-7b + safety-net, **no grounding**) | **0.226** | 0.563 | **0.332** | **25.6 %** | 297 | 16 |
| A (qwen-7b + safety-net + grounding) | **0.581** | 0.589 | **0.496** | **68.6 %** | 106 | 116 |

A0 is the **floor any new arm must clear to count as informative**.
A is the **target any new arm must beat to count as a promotion
candidate**. Both bars are now data-grounded, not modelled.

### H1' — recalibrated "intervention not inert" falsifier

For any new arm X (e.g., Arm C-cloud), the H1' falsifier replaces the
original H1:

| Metric | A0 (control) | New-arm-X falsifier | Reading if missed |
|---|---:|---|---|
| Mean Jaccard | 0.226 | **< 0.30** (A0 + 0.07 ≈ 1σ over noise) | Arm X adds nothing measurable over the strong qwen-7b baseline |
| Structural honesty | 0.332 | **< 0.40** (A0 + 0.07) | Same reading |
| ExportRecovery (micro) | 25.6 % | **< 40 %** (A0 + ~14 pp) | Same reading |
| Missing exports | 297 | **> 250** (A0 − 47, i.e., the arm fails to recover at least ~15 % more exports than the no-grounding control) | Same reading |
| `unrecoverable` | 0 | **> 6** (more than A0's distribution allows) | Arm X regresses on stability vs the qwen control |

If any falsifier fires for Arm X, the arm did not earn its cost; the
right next move is **not** to launch another arm but to interrogate
why the intervention failed at this tier.

### H3' — recalibrated "coding-spec earns its premium" falsifier (Arm C-cloud)

H3 (original) predicted Arm C exportRecovery ≥ 0.60 with falsifier
< 0.50 — both numbers **below** Arm A's actual 68.6 %, so they no
longer discriminate "coding-spec transfers" from "the model just
matches the strong incumbent". Recalibrate:

| Metric | A (grounded incumbent) | Arm C-cloud target | Falsifier |
|---|---:|---|---|
| Mean Jaccard | 0.581 | **≥ 0.65** (A + 0.07; A0 + 0.42) | < A's 0.581 → coding-spec does not transfer; H3 falsified independent of H4 |
| ExportRecovery (micro) | 68.6 % | **≥ 75 %** (A + 6.4 pp) | < A's 68.6 % → coding-spec earns no premium over qwen + grounding |
| Files Jaccard ≥ 0.5 | 83 / 125 | **≥ 95** (A + 12) | < 83 → no decisive lift; ties Arm A |
| `unrecoverable` | 0 | **= 0** | > 0 → Devstral regresses on stability |
| Hallucinated exports | 116 | **≤ 80** (A − 36; ~30 % less over-stuffing) | > 130 → Devstral inherits the over-stuffing problem worse |

The hallucination falsifier is new and important: Arm A's 7×
over-stuffing of exports (16 → 116, A0 → A) is a real cost of the
grounding intervention; a coding-specialised model should be able to
satisfy the contract block without inventing exports. If Devstral
matches or exceeds A's over-stuffing rate while only modestly lifting
Jaccard, the verdict is "Devstral pays for a 24B model to get
qwen-7b's behaviour" — no promotion.

### H4 — promotion criterion (unchanged from original)

H4's "Devstral leads qwen by ≥ 0.10 mean Jaccard + 0.15 export-recovery
to promote" stays as-is. The threshold is against Arm A (the grounded
incumbent), which is the right comparator for promotion (we want
Devstral to beat the best local combo, not the no-grounding control).

The new wrinkle: a 0.10 Jaccard lift over A = 0.681 mean Jaccard for
Arm C-cloud. That's a high bar; if H4 fires, the cartography claim
becomes substantially stronger because it would be the **first arm
that simultaneously beats A on Jaccard AND avoids A's hallucination
cost**.

### Pre-registered decision tree post-Arm-C-cloud

```
                          Arm C-cloud result
                                 │
   ┌─────────────────────────────┼─────────────────────────────┐
   │                             │                             │
H1' confirmed                 H1' partial                  H1' falsified
(Arm C clears                 (clears some,                (misses on all)
 A0 by margins                 misses others)                    │
 on all metrics)                    │                            ▼
   │                                ▼                       Arm C does NOT
   ▼                           Inspect per-mode             earn a slot
H3'?  (does C earn its         deltas; partial signal.      in the matrix.
premium over grounded A?)      Likely "grounding +          Coding-spec at
   │                            model both contribute,      24B fails to
   ├── confirmed ──► H4 fires? safety-net is the floor".    transfer; the
   │                  │                                     bottleneck is
   │              ┌───┴───┐                                 the prompt /
   │            yes      no                                  representation,
   │             │        │                                 not the model.
   │             ▼        ▼                                 Move 4 (Opus
   │       Devstral   No promotion;                         ceiling) on A's
   │       promotes   matrix records                        graph is the
   │       per H4.    "coding-spec adds                     next experiment.
   │                  marginal lift only".
   │
   └── falsified ──► matrix records "coding-spec adds nothing beyond
                     the strong qwen + grounding baseline".
                     Cost-without-benefit at this perimeter; no promotion.
```

The §3.10 adjoint claim T4 → T2 upgrade (`MATHEMATICAL_CLAIMS.md`)
is gated on at least H1' confirming for Arm C-cloud **and** the
behaviour-axis checker landing per [[cartography-matrix-status]]
(otherwise the cartography matrix is still 1 of 5 columns and the
"orthogonal axes" claim is unearned).
