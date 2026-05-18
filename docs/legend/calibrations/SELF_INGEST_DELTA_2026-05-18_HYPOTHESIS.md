# Phase ε self-ingestion δ — pre-registered hypothesis

> *δ is the γ continuation with a rewritten EXTRACTION_SYSTEM_PROMPT.
> γ confirmed Move 1b's vocab-domain fix recovered 13 unrecoverable
> nodes (32 → 19), but mean Jaccard stayed at 0.003 and the vocab-gap
> report counted 558 missing exports across 123 nodes. Diagnosis from
> the user observation + γ data: the pre-δ prompt told the extractor
> to "describe the SHAPE of the behavior" — narrative voice. The
> compile-back model read narrative prose (load-bearing in the
> system prompt) and weighed it over the structured contract list,
> dropping symbol names the contract declared. δ pivots the
> extractor's voice from descriptive to constructive: every name in
> `provides` MUST appear in `prompt` verbatim, narrative phrases
> FORBIDDEN, prescriptive MUST verbs required. Pre-registered BEFORE
> the run starts.*

**Run date:** 2026-05-18
**Pipeline:** same as γ (`ingest --static-classifier enabled` (qwen2.5-coder:3b) → `proposal apply` × all → `verify-homeomorphism --all-artifacts --matrix --provider ollama` (qwen2.5-coder:7b))
**Perimeter:** `src/runtime src/core src/commands src/schemas` (~126 files; same as γ for direct comparison)
**Commit at run start:** will be the prompt-rewrite commit landing alongside this hypothesis

## What changed vs γ

| Concern | γ (prior) | δ (this run) |
|---|---|---|
| Ingest model (semantic_parse) | qwen2.5-coder:3b | qwen2.5-coder:3b (unchanged) |
| Verify model (code_sketch) | qwen2.5-coder:7b | qwen2.5-coder:7b (unchanged) |
| static_summary builder | Move 1b (symbol-name requires) | unchanged from γ |
| **EXTRACTION_SYSTEM_PROMPT voice** | **descriptive** ("describe the SHAPE", "regenerate something semantically equivalent") | **prescriptive** ("MUST export/return/preserve", per-symbol enumeration, FORBIDDEN narrative phrases, MANDATORY: every `provides` name appears in `prompt`) |
| Schema (ExtractionResultSchema) | unchanged | unchanged — δ is voice-only |
| Pipeline + apply path | unchanged | unchanged |
| Dispatcher fallback / vocab guard / Anthropic profiles | from sweep `9eb9211` | unchanged |

The single variable that moves: the extractor's voice. Same schema, same models, same pipeline. δ is the prompt-bound vs model-bound disambiguation that γ explicitly reserved.

## H1 — primary: mean Jaccard moves materially off the 0.003 floor

> *γ's mean Jaccard ≈ 0.003 with mean honesty 0.182 was the
> load-bearing signal that the prompt/model pair drops names
> regardless of contract. The vocab-gap report (558 missing
> exports across 123 nodes) localized the failure: the model
> reads prose, prose omits names, regen drops them. If the
> δ prompt forces names into the prose, compile-back has them
> as anchors. Mean Jaccard is the cleanest metric to read this.*

| Metric | γ measured | δ predicted | Falsifier |
|---|---:|---:|---|
| Mean Jaccard (overall) | 0.003 | **≥ 0.10** (conservative; aspirational 0.20-0.30) | **< 0.05** → prompt was NOT the bottleneck; model capacity is the floor; escalate to Move 3 (Sonnet) |
| Mean structural honesty | 0.182 | **≥ 0.25** | **< 0.18** (within γ noise) → no measurable lift, same as Jaccard verdict |
| Missing exports (G said, F skipped) | 558 | **≤ 250 (-55 % or better)** | **> 400** → prescriptive prompt isn't actually forcing the model to honour declared names |
| `epsilon_equivalent` count | 0 | **≥ 2 (any qualitative shift is signal)** | exactly 0 + Jaccard < 0.05 confirms model-bound |

**H1 verdict logic:**
- **All three confirmed:** prompt was the dominant bottleneck. Phase ε now has a frontier-prompt baseline on ollama tier. Move 3 (Sonnet) becomes the orthogonal lift, not the dominant fix. §3.10 still T4 but the path is clearer.
- **All three falsified:** prompt was NOT the bottleneck. Move 3 (Sonnet) is the next experiment regardless of prompt design. δ becomes a null result.
- **Partially confirmed:** likely scenario — Jaccard lifts to ~0.10 but doesn't cross epsilon_equivalent threshold. Both prompt AND model are limits; both fixes needed for the final claim.

## H2 — `unrecoverable` count stable or marginally up

> *More prescriptive prompts could ask for symbol names that
> the model invents to satisfy the per-symbol structure
> requirement. Invented names then fail the gluing check (they
> don't appear in upstream `provides`). Net effect: unrecoverable
> could climb. Hopefully the closing self-check ("Did you avoid
> inventing symbols not present in the file?") mitigates this.*

| Metric | γ measured | δ predicted | Falsifier |
|---|---:|---:|---|
| `unrecoverable` count | 19 (15 %) | **18-25** (±25 % band) | **> 30** → prescriptive prompt over-constraining; the self-check failed to prevent invented names |

**H2 verdict:** measure as a sanity floor. The forbidden-symbol-invention rule should hold; if it doesn't, the prompt needs tightening before the next iteration.

## H3 — mechanism: vocab-gap report drops materially

> *The δ template's MANDATORY rule "every name in provides
> appears verbatim in prompt" directly targets the 558 missing
> exports. This is the mechanistic test: do the per-symbol
> enumeration + the closing self-check actually change what the
> compile-back model produces?*

| Metric | γ measured | δ predicted | Falsifier |
|---|---:|---:|---|
| Missing exports (G said, F skipped) | 558 across 123 nodes | **≤ 250 across ≤ 90 nodes** | **> 400** → MANDATORY rule was ignored by qwen 7b |
| Unexpected exports (F invented, G silent) | 2 | **≤ 10** | **> 25** → model is inventing under the prescriptive pressure |
| Nodes with ANY vocab gap | 123 of 125 (98 %) | **≤ 100 (≤ 80 %)** | **> 115** → the prompt change made no per-file difference |

## H4 — sanity: extraction failure rate stays acceptable

> *The new template is ~5500 chars (was ~3500). More text =
> more chances qwen 3b drops a required field or invents an
> enum value. The strict CRITICAL SCHEMA RULE block + the
> closing self-check should mitigate; the H1 retry path catches
> what slips through.*

| Metric | γ measured | δ predicted | Falsifier |
|---|---:|---:|---|
| Total proposals created from 130 files | 126 | **≥ 120** | **< 110** → template is too constraining; schema retries dominate |
| Schema-retry rate (telemetry.schemaRetried = true) | unmeasured baseline | **≤ 25 %** | **> 50 %** → small model can't follow the constraints; need ensemble or larger ingest model |
| Total extraction wall-clock | 64 min | **65-90 min** (longer if retries spike) | **> 100 min** → retry storm |

## H5 — vocab guard inert in production data (regression sanity, same as γ)

| Metric | γ measured | δ predicted | Falsifier |
|---|---:|---:|---|
| Proposals failing Zod due to SymbolNameSchema | 0 | **0** | any > 0 → some emitter regressed |
| Extractions rejected with vocab-guard message | 0 | **0** | any > 0 |

## Cost prediction

| Metric | Predicted | Notes |
|---|---|---|
| Ingest wall-clock | 65-90 min | range accounts for higher retry rate possibility |
| Apply wall-clock | ~2 min | unchanged |
| Verify wall-clock | ~140 min | similar to γ's 141 min; longer if more nodes pass the gluing check and reach full compile-back |
| Total wall-clock | **~3.5-4 h** | comparable to γ |
| Spend | **$0.00** | ollama local |

## What δ measures vs what it doesn't

**Measures:**
- Whether prescriptive extraction-prompt voice lifts compile-back fidelity at all (H1).
- Whether the MANDATORY rule (provides-names-in-prompt-verbatim) gets honoured by qwen 7b (H3).
- Whether the prescriptive constraints cost too much extraction reliability on qwen 3b (H4).

**Does NOT measure:**
- Anthropic-tier ceiling. Move 3 (Sonnet probe) is the orthogonal lift; δ tells us how much of the gap is prompt-design vs model-capacity. If δ confirms prompt was a big chunk, Move 3 measures what's left.
- The Cartographer / path-fibration dimension. Separate concept, will get its own RFC if/when prioritized.
- Per-file rep distribution under the new prompt. γ's prompt/types.ts regression (Jaccard 1.0 → 0.0) showed single-draw results are stochastic; δ measures a single draw too.
- The two stragglers from γ (context/types.ts, fibration/types.ts unrecoverable). Move 1c is orthogonal.

## Path-dependent decision tree post-δ

```
                          δ result
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
  H1 fully confirmed     H1 partially          H1 falsified
  (Jaccard ≥ 0.10,       (Jaccard 0.05-0.10,   (Jaccard < 0.05,
   honesty ≥ 0.25,        honesty 0.20-0.25,    vocab gap > 400)
   vocab gap ≤ 250)        vocab gap 250-400)
       │                      │                      │
       ▼                      ▼                      ▼
  PROMPT WAS the bottleneck.  PROMPT and MODEL both  MODEL is the floor.
  ollama 7b + δ prompt        contribute. Move 3     Move 3 (Sonnet) is
  is now the calibrated       (Sonnet) measures      the only meaningful
  baseline. Move 3            the remaining gap.     next experiment.
  (Sonnet) measures the       Both moves needed      Prompt-design work
  ceiling; γ's bottleneck     for the §3.10 claim.   would be premature.
  diagnosis confirmed.
```

## What gets committed regardless of outcome

- This hypothesis doc (committed BEFORE the run, hash anchors the prediction — paired with the EXTRACTION_SYSTEM_PROMPT rewrite in the same commit so the prompt change and prediction are bound).
- The raw matrix at `docs/legend/calibrations/SELF_INGEST_DELTA_2026-05-18.md`.
- A synthesis sibling at `docs/legend/calibrations/SELF_INGEST_DELTA_2026-05-18_SYNTHESIS.md` comparing γ vs δ on Jaccard, honesty, vocab gaps, per-file shifts.

The `.ontology.self-ingest-delta-result/` run dir is gitignored per the sweep's patterns and is NOT committed — same convention as β / β′ / γ.
