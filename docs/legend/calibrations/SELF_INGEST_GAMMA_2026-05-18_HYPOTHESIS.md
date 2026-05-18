# Phase ε self-ingestion γ — pre-registered hypothesis

> *γ is the β′ correction with Move 1b applied. β′ proved Move 1's
> vocabulary-preservation mechanism works in isolation (prompt/types.ts
> at Jaccard 1.0) but the aggregate regressed because static_summary
> emitted module specifiers into `requires` while the gluing check
> demanded symbol names — silent vocabulary-domain mismatch sent
> 6 of 7 deflected files to `unrecoverable`. The open-items sweep
> (commit `9eb9211`, 2026-05-18) landed Move 1b: `static-summary.ts`
> now flatmaps `i.symbols` into `requires` instead of `i.modulePath`.
> γ measures whether that single ~10-line emitter fix returns
> aggregate unrecoverable below β's baseline. Pre-registered BEFORE
> the run starts — no peeking.*

**Run date:** 2026-05-18
**Pipeline:** `onto ingest --static-classifier enabled` (qwen2.5-coder:3b) → `onto proposal apply` × all → `onto verify-homeomorphism --all-artifacts --matrix` (qwen2.5-coder:7b via registry routing)
**Perimeter:** `src/runtime src/core src/commands src/schemas` (same as β/β′; expect ~126 files)
**Commit at run start:** `9eb9211` (open-items-sweep — Move 1b + 6 other backlog items)

## What changed vs β′

| Concern | β′ (prior) | γ (this run) |
|---|---|---|
| Ingest model (semantic_parse) | qwen2.5-coder:3b | qwen2.5-coder:3b (unchanged) |
| Verify model (code_sketch) | qwen2.5-coder:7b | qwen2.5-coder:7b (unchanged) |
| **static_summary `requires` source** | **`i.modulePath`** (`./laws.js`) | **`i.symbols.flatMap`** (`Result`, `ok`, `err`, …) |
| Dispatcher `preferred[]` fallback | papered over by ordering (`598fb25`) | real fallback loop in dispatcher.ts (Move B from β′ ranked moves) |
| Vocab guard `SymbolNameSchema` | absent | refines `requires`/`provides` in `ExtractionResultSchema` — regression net only, no behavioural change this run unless an emitter regressed |
| `MAX_OUTPUT` ceiling | 4096 | 8192 — no effect on this run (ollama-only); matters for Move 3 |
| Anthropic profiles in `MODEL_CAPABILITY_PROFILES` | absent | present — no effect on this run (ollama-only); matters for Move 3 |
| Multi-model sequential architecture | restored | unchanged |

## H1 — primary: aggregate `unrecoverable` drops below β baseline

> *Move 1b restores vocabulary-domain consistency. The 6 static_summary
> files that newly went `unrecoverable` in β′ (effects/index.ts,
> fibration/index.ts, fibration/types.ts, context/types.ts,
> llm/types.ts, topos/index.ts) had their `requires` rejected by
> the gluing check because the upstream nodes' `provides` carried
> symbol names. Post-Move-1b both sides speak symbols.*

| Metric | β measured | β′ measured | γ predicted |
|---|---:|---:|---|
| `unrecoverable` count | 24 (19%) | 32 (25%) | **≤ 18 (≤ 14%)** — below β baseline |
| static_summary deflected files in `unrecoverable` | 4 / 7 | 6 / 7 | **≤ 2 / 7** — at minimum the 6 newly-broken should recover |

**Falsified if:** `unrecoverable` count ≥ 25 OR more than 3 of the 7 static_summary files stay `unrecoverable`. Either outcome means Move 1b didn't fix the gluing-check problem — there's a deeper architectural bug (e.g. provides shape upstream is wrong, or the gluing check rejects for some non-vocabulary reason).

**Surprised by:** `unrecoverable` ≤ 5. Would suggest other unrecoverables in β/β′ were also vocab-domain bugs we haven't surfaced — interesting finding but not predicted.

## H2 — secondary: mean structural honesty stable or marginally up

> *Move 1b lets MORE files pass the contract gate. Files that pass
> the gate but produce divergent regens (low Jaccard, large LoC
> delta) contribute honesty < 1.0 to the mean. β/β′ already
> floored at ~0.17 honesty regardless of which files passed the
> gate, so γ should land in the same band.*

| Metric | β measured | β′ measured | γ predicted |
|---|---:|---:|---|
| Mean structural honesty | 0.166 | 0.187 | **0.18 ± 0.04** (essentially flat) |
| Mean Jaccard (overall) | ~0.00 | ~0.00 | **~0.00** (still flat — Move 1b doesn't move the prompt/model axis) |
| `epsilon_equivalent` count | 0 | 0 | **0 expected; ≤ 2 allowed** |

**Falsified if:** mean honesty < 0.150. That would mean Move 1b regressed extraction quality somehow (very unlikely given it only changes one local field).

**Mean Jaccard staying ~0.00 is NOT a falsifier** — H2 is about whether Move 1b breaks anything, not about whether it solves the model/prompt question. That question is reserved for Move 3 (Sonnet probe).

## H3 — mechanism: the 6 newly-broken files specifically pass the gluing check

> *Per-file diagnostic. β′'s synthesis identified exactly which 6
> files broke from the vocab-domain mismatch. γ predicts each
> individually.*

| File | β verdict | β′ verdict | γ prediction |
|---|---|---|---|
| context/types.ts | divergent_structural | unrecoverable | **NOT unrecoverable** — likely divergent_* |
| effects/index.ts | divergent_both | unrecoverable | **NOT unrecoverable** |
| fibration/index.ts | divergent_both | unrecoverable | **NOT unrecoverable** |
| fibration/types.ts | divergent_both | unrecoverable | **NOT unrecoverable** |
| llm/types.ts | divergent_both | divergent_structural | divergent_structural or better (already passing the gate in β′) |
| prompt/types.ts | divergent_both | divergent_loc (Jaccard = 1.0) | **divergent_loc preserved** — file has no imports, Move 1b is inert here |
| topos/index.ts | divergent_both | unrecoverable | **NOT unrecoverable** |

**Falsified if:** any of the 5 expected-to-recover files stays `unrecoverable` (context/types.ts, effects/index.ts, fibration/{index,types}.ts, topos/index.ts). One straggler is a sign of a secondary bug; three or more would suggest Move 1b is targeting the wrong source of failure.

## H4 — vocab guard inert in production data

> *SymbolNameSchema is a regression net for future emitter bugs.
> No current production emitter should produce module-path-shape
> tokens after Move 1b. This hypothesis pins that.*

| Metric | Predicted |
|---|---|
| Proposals that fail Zod validation due to vocab guard | **0** |
| Files where ingest reports `requires`/`provides` extraction errors with the symbol-name rejection message | **0** |

**Falsified if:** any extraction rejected with a vocab-guard message. That would mean some emitter we don't know about is producing module paths — surface the offender, fix immediately.

## Cost prediction

| Metric | Predicted | Notes |
|---|---|---|
| Ingest wall-clock | ~45 min | unchanged vs β/β′ (same model, similar perimeter) |
| Apply wall-clock | ~2 min | unchanged |
| Verify wall-clock | ~95-100 min | 7b verify; similar to β′'s 98 min |
| Total wall-clock | **~2 h 25 min** | within 5% of β′'s 144 min |
| Spend | **$0.00** | ollama local |
| Peak VRAM | ~4 GB | sequential model loading, never coexisting |

## What γ measures vs what it doesn't

**Measures:**
- Whether Move 1b's vocab-domain fix returns aggregate `unrecoverable` below β baseline (H1).
- Whether the contract gate is the dominant rejection mechanism for static_summary files (H3 per-file diagnostic).
- Whether the open-items sweep introduced any silent regressions (H2 sanity floor, H4 vocab-guard sanity).

**Does NOT measure:**
- Anthropic-tier ceiling (Move 3 — Sonnet 4.6 probe; should follow γ if γ confirms Move 1b worked).
- Whether the `code_sketch` prompt template is the right anchor for symbol-name regen at scale. The mean Jaccard ≈ 0 floor across β/β′ is consistent with prompt-bound failure; γ won't disambiguate that.
- A qwen14b ceiling on the same perimeter (VRAM-blocked on M1).

## Path-dependent decision tree post-γ

```
                        γ result
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   H1 confirmed         H1 partially        H1 falsified
   (unrecoverable      (some recover,       (>25 stays)
    ≤ 18)              not all)             
        │                   │                   │
        ▼                   ▼                   ▼
   PROCEED to Move 3   DIAGNOSE the          ROLLBACK Move 1b
   (Sonnet probe).     stragglers — likely    interpretation:
   The contract bug    a second vocab         the gluing-check
   is gone; Sonnet     mismatch we didn't     fails for non-
   data answers the    surface, OR a          vocabulary reasons
   model-vs-prompt     `provides`-side bug    (e.g. context
   question cleanly.   on upstream nodes.     assembly is wrong)
                       Land Move 1c, repeat.  — file deeper
                                              investigation.
```

## What gets committed regardless of outcome

- This hypothesis doc (committed before run, hash anchors the prediction).
- The raw matrix at `docs/legend/calibrations/SELF_INGEST_GAMMA_2026-05-18.md`.
- A synthesis sibling at `docs/legend/calibrations/SELF_INGEST_GAMMA_2026-05-18_SYNTHESIS.md` comparing β / β′ / γ axis-by-axis.

If H1 confirms and H2 holds (the expected outcome), Phase ε's MATHEMATICAL_CLAIMS §3.10 entry CAN be updated to T2 with the γ measurement as citation — but only after Move 3 closes the model-vs-prompt question, because the publishable claim wants a frontier-model number too.

If H1 falsifies, Phase ε stays at T4 and the next ranked move is Move 1c (whatever the diagnosis names) rather than Move 3.
