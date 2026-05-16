# Phase ε self-ingestion β′ — pre-registered hypothesis

> *β′ is the conceptual correction of β: removes the `--model qwen2.5-coder:3b`
> override on verify-homeomorphism so the registry's per-task routing
> actually runs. Multi-model by task is the architecture we were
> supposed to be measuring; β collapsed it into a single model. Move 1
> (export-vocabulary preservation in static_summary) ships in this run
> too. Pre-registered BEFORE the run starts — no peeking at the result.*

**Run date:** 2026-05-16
**Pipeline:** same as β (`ingest --static-classifier enabled` → `proposal apply` × all → `verify-homeomorphism --all-artifacts --matrix`)
**Perimeter:** `src/runtime src/core src/commands src/schemas` (130 files)
**Commit at run start:** `f7bce43` (Move 1 fix — export vocabulary in static_summary)

## What changed vs β

| Concern | β (old) | β′ (this run) |
|---|---|---|
| Ingest model (semantic_parse) | qwen2.5-coder:3b | qwen2.5-coder:3b (unchanged) |
| Verify model (code_sketch) | qwen2.5-coder:3b (**forced via override**) | qwen2.5-coder:7b (**via registry routing**, fallback after 14b won't fit VRAM) |
| static_summary builder | empty provides/requires | exports/imports threaded through (Move 1, f7bce43) |
| Memory model | one model loaded, one swap | one model loaded, one swap (still sequential, Ollama auto-unloads 3b before loading 7b) |
| Multi-model architecture | collapsed | restored as designed |

## H1 — static_summary Jaccard improves materially

> *Move 1 threads named re-export targets + upstream module specifiers + type names through provides/requires/prompt. Compile-back now has vocabulary to anchor regen.*

| Bucket | β measured | β′ predicted |
|---|---:|---:|
| static_summary mean Jaccard | ~0.00 | **≥ 0.5** (load-bearing claim) |
| static_summary mean honesty | ~0.05 | **≥ 0.45** |
| static_summary verdict folder | dominated by `divergent_both` | shifted toward `epsilon_equivalent` / `structurally_similar` for at least 3 of the 7 deflected files |

**Falsified if:** static_summary mean Jaccard stays < 0.20 after Move 1. That would mean export-vocabulary preservation isn't load-bearing for compile-back — either the verify model can't use the explicit `provides` array, or the prompt isn't surfacing them clearly enough.

## H2 — semantic_parse round-trip improves via correct-task routing

> *β forced 3b for code_sketch; 3b is calibrated for structured_extraction (the opposite direction). 7b is the registry's calibrated default for code_sketch after 14b fallback. Same prompt, same files, properly-routed model.*

| Bucket | β measured | β′ predicted |
|---|---:|---:|
| semantic_parse mean Jaccard | ~0.00 | **≥ 0.30** |
| semantic_parse mean honesty | ~0.17 | **≥ 0.35** |
| epsilon_equivalent count | 0 | **≥ 5 nodes** (any in this bucket would be a real qualitative shift) |

**Falsified if:** semantic_parse mean Jaccard remains < 0.10. That would mean the verify-direction bottleneck is NOT model capacity at the 7b tier — it's structural (the code_sketch contract / prompt / context assembly), and bigger models won't help. Sonnet 4.6 probe would become higher priority.

## H3 — unrecoverable count drops

> *β had 24 nodes (19%) fail intent validation — the gate refused regens that ignored declared requires/provides. If 7b respects the contract structure better than 3b, fewer regens should be rejected outright.*

| Bucket | β measured | β′ predicted |
|---|---:|---:|
| unrecoverable count | 24 (19%) | **≤ 10 (8%)** |

**Falsified if:** unrecoverable count stays ≥ 20. That tells us the contract gate is rejecting regens for STRUCTURAL reasons (model can't bind the listed `provides` tokens during generation regardless of size), pointing at the code_sketch prompt template rather than the model.

## Cost prediction

| Metric | Predicted | Notes |
|---|---|---|
| Ingest wall-clock | ~45 min | unchanged vs β |
| Apply wall-clock | ~2 min | unchanged vs β |
| Verify wall-clock | ~75 min | 7b is ~1.5× slower per token than 3b per bake-off |
| Total wall-clock | ~2 hr 2 min | within 20% of β's 96 min |
| Spend | $0.00 | ollama local |
| Peak VRAM | ~4 GB | only one model in memory at a time |

## Multi-model sequential expectation

```
TIME →
[ingest phase]                                    [apply]   [verify phase]
qwen2.5-coder:3b loaded ────────────────────────► (unloaded) ► qwen2.5-coder:7b loaded ─►
~45 min of semantic_parse dispatches               ~2 min     ~75 min of code_sketch dispatches
```

At no point are both models resident. Ollama unloads 3b automatically when 7b is requested (since 3b's idle timer expires during the apply phase). This is the load-bearing architectural property β collapsed — three models would be possible (3b + 7b + 8b) and still sequential, by design, never coexisting.

## What this run measures vs what it doesn't

**Measures:**
- Whether Move 1's vocabulary preservation actually helps compile-back (H1).
- Whether the registry's task-tier routing is the right discipline (H2).
- Whether contract-gate rejections are model-capacity-bound or structural (H3).

**Does NOT measure:**
- Anthropic-tier ceiling (separate Move 3 run).
- The full Pareto curve (we'll have two points after β': 3b@$0/0.166 from β, and whatever β′ produces). The third Sonnet point is still TBD.
- The qwen2.5:14b "right answer" — we're using 7b only because 14b doesn't fit VRAM. The β′ result understates what a frontier coder model would do.

## What gets committed regardless of outcome

- This hypothesis doc (committed before run).
- The resulting `SELF_INGEST_BETA_PRIME_2026-05-16.md` matrix report.
- A synthesis sibling that compares β vs β′ axis-by-axis.

If H1 holds and H2 fails, the bottleneck story shifts to code_sketch contract design.
If H2 holds and H1 fails, vocabulary preservation alone isn't enough — the prompt template ignores the `provides` array.
If both hold, multi-model routing is vindicated and the architecture stands.
If neither holds, the model class is the limit and we need to escalate to Anthropic for a non-degenerate measurement.
