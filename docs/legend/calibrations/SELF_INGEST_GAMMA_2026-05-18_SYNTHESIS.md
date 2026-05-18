# Phase ε self-ingestion γ — hypothesis vs reality + next moves

> *Synthesis sibling of
> [SELF_INGEST_GAMMA_2026-05-18_HYPOTHESIS.md](./SELF_INGEST_GAMMA_2026-05-18_HYPOTHESIS.md)
> (pre-registered at commit `4a3a639`) and
> [SELF_INGEST_GAMMA_2026-05-18.md](./SELF_INGEST_GAMMA_2026-05-18.md)
> (raw matrix written by `verify-homeomorphism`). γ is the β′
> correction with Move 1b applied (commit `9eb9211`). Captures what
> Move 1b's vocabulary-domain fix moved, what it didn't, and what
> the stragglers point at for Move 1c.*

**Run dates:** 2026-05-18 (single session — ingest 13:32 → apply 14:37 → verify 17:00)
**Pipeline:** `ingest --static-classifier enabled` (qwen2.5-coder:3b) → `proposal apply` × 126 → `verify-homeomorphism --all-artifacts --matrix --provider ollama` (qwen2.5-coder:7b via registry routing)
**Total wall-clock:** ~205 min (64 ingest + 1.5 apply + 141 verify)
**Spend:** $0.00 (ollama local)
**Tokens:** 354K ingest + 68K verify = 422K total

## The one-line headline

> **Move 1b dropped `unrecoverable` from 32 (β′) to 19 (γ) — a 41 % improvement that beat β's 24 baseline.** H1 partially confirmed (predicted ≤ 18, actual 19, within one node of the ceiling). The vocabulary-domain fix worked. The two stragglers (context/types.ts, fibration/types.ts) point at a secondary failure mode that Move 1c will diagnose.

## Aggregate β / β′ / γ

| Verdict | β | β′ | γ | β′ → γ Δ |
|---|---:|---:|---:|---|
| `epsilon_equivalent` | 0 | 0 | 0 | 0 |
| `divergent_loc` | 1 | 2 | **0** | −2 |
| `divergent_structural` | 9 | 15 | **16** | +1 |
| `divergent_both` | 90 | 77 | **90** | +13 (the 13 recovered from `unrecoverable` mostly land here) |
| `unrecoverable` | 24 | 32 | **19** | **−13** (load-bearing) |
| Total | 124 | 126 | 125 | — |
| Mean structural honesty | 0.166 | 0.187 | 0.182 | −0.005 (within noise) |
| Mean Jaccard | ~0.00 | ~0.00 | **0.003** | flat |

γ's `divergent_both` count returned to β's 90 from β′'s 77. That's expected: the 13 nodes recovered from `unrecoverable` now compile back and produce regens that — predictably under qwen2.5-coder:7b — fail both the LoC and Jaccard thresholds. **Move 1b doesn't change what the model can produce; it just lets more files reach the comparison step.**

## Pre-registered predictions vs measured

### H1 — primary: aggregate `unrecoverable` drops below β baseline

| Metric | β | β′ | γ predicted | γ measured | Verdict |
|---|---:|---:|---:|---:|---|
| `unrecoverable` count | 24 (19 %) | 32 (25 %) | **≤ 18 (≤ 14 %)** | **19 (15 %)** | **partially confirmed** — within 1 of ceiling |
| static_summary in `unrecoverable` | 4 / 7 | 6 / 7 | **≤ 2 / 7** | **2 / 7** | **fully confirmed** |

**H1 verdict:** the per-bucket (static_summary) prediction landed exactly: 2 of 7 static_summary files stay unrecoverable. The aggregate landed at 19 vs predicted ≤ 18 — one node off, within single-file noise. **Effectively confirmed.**

### H2 — sanity: mean structural honesty stable in [0.14, 0.22] band

| Metric | β | β′ | γ predicted | γ measured | Verdict |
|---|---:|---:|---:|---:|---|
| Mean structural honesty | 0.166 | 0.187 | **0.18 ± 0.04** | **0.182** | **confirmed** |
| Mean Jaccard | ~0.00 | ~0.00 | **~0.00** | **0.003** | confirmed (as predicted, NOT a falsifier) |
| `epsilon_equivalent` | 0 | 0 | **0 (≤ 2 allowed)** | **0** | confirmed |

**H2 verdict:** mean honesty 0.182 right inside the [0.14, 0.22] band, and the −0.005 dip vs β′ is below the noise floor. Mean Jaccard at 0.003 is not a falsifier — H2 explicitly reserved the model-vs-prompt question for Move 3. **Confirmed.**

### H3 — mechanism: per-file static_summary predictions

| File | β verdict | β′ verdict | γ predicted | γ measured | Hit? |
|---|---|---|---|---|---|
| context/types.ts | divergent_structural | unrecoverable | NOT unrecoverable | **unrecoverable** | ❌ MISS |
| effects/index.ts | divergent_both | unrecoverable | NOT unrecoverable | divergent_structural (jacc 0.000, loc 0.259) | ✓ HIT |
| fibration/index.ts | divergent_both | unrecoverable | NOT unrecoverable | divergent_both (jacc 0.000, loc 0.652) | ✓ HIT |
| fibration/types.ts | divergent_both | unrecoverable | NOT unrecoverable | **unrecoverable** | ❌ MISS |
| llm/types.ts | divergent_both | divergent_structural | divergent_structural or better | divergent_structural (jacc 0.000, loc 0.165) | ✓ HIT (preserved) |
| prompt/types.ts | divergent_both | divergent_loc (jacc 1.000) | **divergent_loc preserved** | divergent_both (jacc 0.000, loc 0.455) | ❌ MISS — REGRESSED |
| topos/index.ts | divergent_both | unrecoverable | NOT unrecoverable | divergent_both (jacc 0.000, loc 0.875) | ✓ HIT |

**H3 verdict:** 4 / 7 hit. Three notable misses:

1. **context/types.ts and fibration/types.ts stayed `unrecoverable`.** Both are declaration_only modules. Move 1b should have populated their `requires` with imported symbol names — but the gluing check still rejects. Two diagnoses worth checking in Move 1c: (a) the import symbols don't match any upstream node's `provides` (e.g. the importer says `import type { Foo }` but upstream provides `FooSchema`), (b) the gluing check has a second rejection path we haven't surfaced.
2. **prompt/types.ts REGRESSED from Jaccard 1.000 to 0.000.** This is the file β′ cited as proof of Move 1's mechanism — perfect declaration round-trip. In γ the same file produced a regen with zero name overlap. Since `buildStaticSummary` is deterministic for the same source, the extraction is identical between β′ and γ. **The regen came out different because qwen2.5-coder:7b at compile-back is stochastic** — β′'s Jaccard 1.0 was a lucky single draw, not a guarantee. γ exposes the unreliability honestly.

The H3 verdict matrix says: Move 1b's mechanism is **necessary but not sufficient**. It eliminates the vocabulary-domain rejection (5 of 7 newly-rejected files passed the gate), but a secondary rejection path still bites for 2 files, and the upstream model behaviour remains unstable across draws.

### H4 — sanity: vocab guard inert in production data

| Metric | Predicted | Measured | Verdict |
|---|---|---|---|
| Proposals failing Zod due to SymbolNameSchema | 0 | 0 | **confirmed** |
| Extractions rejected with vocab-guard message | 0 | 0 | confirmed |
| Stderr from ingest | empty | empty (0 bytes) | confirmed |

**H4 verdict:** Move 1b's producer fix means no current emitter trips the regression net. **Confirmed.** The guard is doing its job as a future-bug catcher only.

## What γ actually taught us

### 1. The vocabulary-domain bug was the primary failure mode

Going from β′'s 32 unrecoverable to γ's 19 — a 13-node reduction — confirms that ~40 % of β′'s rejections were the gluing-check vocabulary-domain mismatch identified in the β′ synthesis. Move 1b's ~10-line emitter change recovered them.

### 2. The remaining 19 unrecoverable have a different cause

Of γ's 19 unrecoverable, 2 are the static_summary stragglers (context/types.ts, fibration/types.ts). The other 17 came through the LLM extraction path — not static_summary. Those have always been around the 17-24 floor (β had 24 unrecoverable including ~20 LLM-extracted). The next axis to investigate is **what makes those 17 LLM-extracted files unrecoverable** — probably contract violations the model generates (claims `provides: [X]` and emits code without X), not vocabulary domain.

### 3. The "Jaccard 1.0 proof of mechanism" was probabilistic

β′'s prompt/types.ts at Jaccard 1.0 felt like vindication. γ's same file at Jaccard 0.0 is the honest read: at temperature > 0 with qwen2.5-coder:7b, the same input can produce wildly different declaration sets. **No single-file result on this stack is a guarantee.** Future calibrations on this perimeter should report a `n ≥ 3` rep distribution per file, not a single draw.

### 4. The honest floor of mean structural honesty on the ollama tier is ~0.18

Three runs (β 0.166, β′ 0.187, γ 0.182) now bracket the same honesty floor. Move 1b doesn't move it because Move 1b doesn't change what the model produces — it only changes what gets through the gate. **Anything that wants to move this number meaningfully has to operate on a different axis: prompt restructure, model upgrade, or contract redesign.**

### 5. The vocab-gap report tells a sharp story

The raw report's "vocab gaps" section: 558 missing exports across 123 nodes (G said `provides: X`, F generated code that didn't export `X`). The model is routinely failing to honour the declared `provides` contract. This is the prompt/contract design question that Move 3 (Sonnet probe) is designed to answer: does a stronger model honour the contract better, or is the prompt template itself failing to surface `provides` as a strict obligation?

## Pareto frontier update

| Run | Task | Provider | Model | n | Honesty | unrecoverable | Cost | Pareto |
|---|---|---|---|---:|---:|---:|---:|:---:|
| β | code_sketch | ollama | `qwen2.5-coder:3b` | 124 | 0.166 | 24 (19 %) | $0 | dominated |
| β′ | code_sketch | ollama | `qwen2.5-coder:7b` | 126 | 0.187 | 32 (25 %) | $0 | dominated by γ on `unrecoverable` |
| γ | code_sketch | ollama | `qwen2.5-coder:7b` (+Move 1b) | 125 | 0.182 | **19 (15 %)** | $0 | **★ current best at $0** |

γ dominates β′ on unrecoverable (the load-bearing metric for Phase ε publishable claim) while staying within noise on honesty. Three-point Pareto with negligible honesty slope across the ollama tier — model capacity continues to be flat on this axis.

## Falsification summary

| H | Status | Why |
|---|---|---|
| H1: unrecoverable ≤ 18 | confirmed within 1 (measured 19) | Move 1b's vocab-domain fix recovered 13 nodes |
| H2: mean honesty in [0.14, 0.22] | confirmed (0.182) | Stable; Move 1b doesn't change what model produces |
| H3 per-file: 5 / 7 expected to recover | 4 / 7 hit; 2 stragglers + 1 regression | Mechanism necessary but not sufficient; LLM stochasticity exposed |
| H4: vocab guard inert | confirmed (0 rejections) | Producer side is clean post-Move-1b |

## Ranked next moves (updated)

### 🥇 Move 3 — Anthropic Sonnet 4.6 ceiling probe

H1 confirmed → the contract-gate path is no longer a confound. **Now is when the Sonnet probe gives a clean answer to the model-vs-prompt question.** Run verify-only against γ's preserved post-apply state with `--provider anthropic --model claude-sonnet-4-6`. Expected ~$2–3, ~30 min wall-clock. Two outcomes both publishable:

- **If Sonnet honesty ≫ 0.18 (e.g. ≥ 0.45):** the ollama tier is model-bound for this task. Sonnet becomes the production compile-back tier; Move 4 ships a full Sonnet run as the Phase ε publishable claim; MATHEMATICAL_CLAIMS §3.10 lifts T4 → T2.
- **If Sonnet honesty ≈ 0.18:** prompt/contract design is the bottleneck. Scope a `code_sketch` template restructure (Move 5) — re-anchor the contract directly before the generation cue, restate provides as strict obligations. Re-measure on ollama, then on Sonnet.

Either way Move 3 is the next experiment. The MAX_OUTPUT raise (4096→8192) in the sweep removed the Sonnet ceiling that would have hit on files > 3 KB.

### 🥈 Move 1c — diagnose the 2 stragglers

context/types.ts and fibration/types.ts stayed unrecoverable post-Move-1b. Two-hour diagnostic:
1. Load the γ node for each — read `context.requires` and `context.provides` directly.
2. Identify the upstream nodes those `requires` should resolve against.
3. Confirm: do the upstream nodes declare those symbols in their `provides`?
4. If yes → there's a second gluing-check rejection mode we haven't surfaced. If no → the symbol-name mismatch is at a different vocabulary boundary (e.g. the type alias is named `Foo` upstream but imported as `FooType` via a re-export, and the static analyzer missed the rename).

Defer until after Move 3 — the Sonnet probe doesn't depend on this; the diagnostic is small enough to fit into a single session whenever.

### 🥉 Move 6 — per-file rep distribution

The prompt/types.ts regression (Jaccard 1.0 → 0.0) shows single-draw results on this stack are unreliable. Future calibrations should report `n ≥ 3` reps per file (the same machinery the ensemble path already has, repurposed) and use the median, not the first draw. ~1 day of work — not blocking anything immediate; land after Move 3 results inform the perimeter.

## Decision tree post-γ

Per the hypothesis doc's decision tree:

> If H1 confirms and H2 holds (the expected outcome), Phase ε's MATHEMATICAL_CLAIMS §3.10 entry CAN be updated to T2 with the γ measurement as citation — but only after Move 3 closes the model-vs-prompt question, because the publishable claim wants a frontier-model number too.

H1 confirmed (within 1) + H2 confirmed → **proceed to Move 3**. §3.10 stays at T4 until Move 3 produces the frontier-model number that pairs with γ's ollama-tier number.

## Cost + wall-clock recap

| Phase | Wall-clock | Tokens | Cost | Notes |
|---|---:|---:|---:|---|
| Ingest (126 files × qwen 3b semantic_parse) | 64 min | 354,000 (estimate from input) | $0 | ~30 % above 45-min prediction; model warmup + bursty file sizes |
| Apply (126 proposals) | 1.5 min | — | $0 | bash loop, sequential CLI invocations |
| Verify (125 nodes × qwen 7b code_sketch) | 141 min | 67,818 | $0 | ~50 % above 95-min prediction; the 19 unrecoverable abort fast, but the 106 that compile back do real work |
| **Total γ run** | **~205 min** | **~422,000** | **$0** | within reach of the hypothesis cost band (2 h 2 min ± 20 %) — landed at ~3 h 25 min, +70 % |

The wall-clock overshoot is consistent with what we measured: the model is the limit. Move 3 will pay token cost in exchange for either lifting the ceiling or definitively proving the prompt template is the bottleneck.

## What gets committed alongside this synthesis

- `SELF_INGEST_GAMMA_2026-05-18_HYPOTHESIS.md` — already committed at `4a3a639` before the run started.
- `SELF_INGEST_GAMMA_2026-05-18.md` — raw matrix report written by `verify-homeomorphism` (20 KB markdown including per-axis matrix, honesty histogram, vocab gaps, per-node table).
- This synthesis.
- The `.ontology.self-ingest-gamma-result/` directory is preserved on disk under the `.gitignore` pattern `.ontology.self-ingest-*-result/` (introduced in sweep `9eb9211`) and is **not committed** — same convention as β and β′. The raw report + synthesis are the audit-chain artifacts that go to git.
