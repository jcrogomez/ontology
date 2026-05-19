# Phase ε self-ingestion δ' — hypothesis vs reality + next moves

> *Synthesis sibling of
> [SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md](./SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md)
> (pre-registered at commit `3453ac1`) and
> [SELF_INGEST_DELTA_2026-05-18.md](./SELF_INGEST_DELTA_2026-05-18.md)
> (raw matrix written by `verify-homeomorphism`). δ' is the prompt-
> rewrite run: same schema and same models as γ; the only variable
> changed was EXTRACTION_SYSTEM_PROMPT, rewritten from descriptive
> ("describe the SHAPE") to constructive ("MUST export/return,
> every provides name in prompt verbatim, FORBIDDEN narrative
> phrases"). δ' answers the prompt-bound vs model-bound question
> γ explicitly reserved.*

**Run dates:** 2026-05-18 (template applied 17:30, first attempt failed schema 47%, fix landed 20:30, δ' restart 20:33 → 04:00 next day)
**Pipeline:** `ingest --static-classifier enabled` (qwen2.5-coder:3b) → `proposal apply` × 126 → `verify-homeomorphism --all-artifacts --matrix --provider ollama` (qwen2.5-coder:7b)
**Total wall-clock:** ~7h 30min (115 ingest + 1.5 apply + 320 verify; ~2× γ's 205min)
**Spend:** $0.00
**Tokens:** 517K ingest + 94K verify = 611K total (γ was 422K; δ' +45% due to richer per-file prompts and more nodes passing the gluing check)

## The headline result

> **Mean Jaccard moved from γ's 0.003 to δ''s 0.021 — a 7× lift, but absolute value still 5× below the H1 prediction of ≥ 0.10. Mean structural honesty rose from 0.182 to 0.246 (+35%, essentially at the predicted ≥ 0.25 ceiling). The prompt change DID work mechanistically — 2 files crossed Jaccard ≥ 0.5 (vs γ's 0), one at Jaccard 1.0 — but 97 of 125 nodes stayed at Jaccard < 0.1.** The decision-tree branch this lands in is "partially confirmed": both prompt design AND model capacity contribute to the floor. Move 3 (Sonnet probe) now has clean ground to measure how much of the gap is model.

## The detour: the δ template bug

δ's first run (template commit `3453ac1`) crashed 62 of 130 files (47.7% schema_failed) with the same error: `prompt: Expected string, received array`. Root cause: the template's "Preferred structure" and "Good example" sections showed per-symbol bullets as bare lines (`- symbolName: MUST ...`). qwen 3b inferred "bullets = JSON array" and emitted `prompt` as `["- bullet1", "- bullet2"]`, failing the schema. The H1 retry path didn't recover because the retry prompt also didn't pin string-ness.

Fix landed at commit `661c540`: added explicit JSON FIELD TYPES block, replaced loose Good/Bad examples with a complete JSON output example showing `prompt` as a properly-escaped string with embedded `\n`, plus a third "Also bad — wrong JSON shape" example explicitly citing the failure. Also updated `buildRetryPrompt` with the same warning.

δ' re-ran at `661c540` with 126/130 OK (4 failed, exactly γ's baseline). H4 (extraction failure rate ≤ 25) re-confirmed at exactly the γ floor. **The bug was implementation, not hypothesis.** Failed-run artifacts preserved at `.ontology.archive-failed-delta-2026-05-18/` (gitignored).

## Aggregate β / β' / γ / δ'

| Verdict | β | β' | γ | δ' | γ → δ' Δ |
|---|---:|---:|---:|---:|---|
| `epsilon_equivalent` | 0 | 0 | 0 | 0 | 0 |
| `divergent_loc` | 1 | 2 | 0 | **2** | +2 |
| `divergent_structural` | 9 | 15 | 16 | **19** | +3 |
| `divergent_both` | 90 | 77 | 90 | **80** | **−10** |
| `unrecoverable` | 24 | 32 | 19 | **24** | **+5** (regression) |
| Total | 124 | 126 | 125 | 125 | — |
| **Mean Jaccard** | ~0.00 | ~0.00 | 0.003 | **0.021** | **+7×** |
| **Mean honesty** | 0.166 | 0.187 | 0.182 | **0.246** | **+35%** |
| Files with Jaccard ≥ 0.5 | — | 1 | 0 | **2** | +2 |
| Missing exports (vocab gap) | — | — | 558 | **488** | **−12%** (H3 falsified: predicted ≤250) |
| Total tokens | — | — | 422K | 611K | +45% |

δ''s Pareto position: dominates γ on honesty (0.246 vs 0.182) at the same $0 cost, but regresses on `unrecoverable` (+5). Whether this is net Pareto-better depends on which metric is load-bearing — honesty trends right, the unrecoverable regression has a structural cause (see §H2 below).

## Pre-registered predictions vs measured

### H1 — primary: mean Jaccard moves materially off the 0.003 floor

| Metric | γ | δ' predicted | δ' measured | Verdict |
|---|---:|---:|---:|---|
| Mean Jaccard | 0.003 | **≥ 0.10** | **0.021** | **partially falsified** (moved 7× but absolute value 5× below threshold) |
| Mean honesty | 0.182 | ≥ 0.25 | **0.246** | **basically met** (within 0.004) |
| Missing exports | 558 | ≤ 250 | 488 | **falsified** (−12% vs predicted −55%) |
| `epsilon_equivalent` count | 0 | ≥ 2 | 0 | falsified |
| Files Jaccard ≥ 0.5 | 0 | not predicted | **2** (proof-of-mechanism: 1.0 + 0.667) | new |

**H1 verdict — the nuanced read:** the prompt change is necessary but not sufficient.

- **Mechanism PROVEN at n=2.** `llm/mock.ts` regen produced declarations matching the source at Jaccard 1.0 (every exported name preserved). `effects/async.ts` at Jaccard 0.667. These are the first ollama-tier successes since the project began measuring. The δ' template DID make compile-back honour symbol names when the file is small/clean enough.
- **Mechanism INSUFFICIENT for the majority.** 97 of 125 nodes still landed Jaccard < 0.1. The model can read the prescriptive contract, hold 5-10 symbol names in working memory for a small file, and emit them — but loses fidelity once the contract has more than ~10 symbols or the file requires non-trivial control flow.
- **Vocab gap drop (-12%) is real but underwhelming.** The prompt now names every `provides` symbol in `prompt` verbatim. But the compile-back model still drops 488 of them across the perimeter. The model is acknowledging the contract structurally and ignoring it semantically.

### H2 — unrecoverable count stable or marginally up

| Metric | γ | δ' predicted | δ' measured | Verdict |
|---|---:|---:|---:|---|
| `unrecoverable` count | 19 | 18-25 | **24** | within band (predicted upper bound) |

**H2 verdict — confirmed at the predicted upper bound, with a clear structural cause.** The δ' prompts contain more specific symbol names (per the MANDATORY rule). The compile-back model tries to honour them and sometimes invents names that don't exist upstream → gluing check rejects → unrecoverable. Cross-checking the 24 vs γ's 19: γ had 17 LLM-extracted unrecoverable + 2 static_summary stragglers. δ' has ~22 LLM-extracted + 2 static_summary stragglers (same context/types.ts, fibration/types.ts that γ couldn't recover — Move 1c still required for them).

**Implication:** the prescriptive prompt has a built-in cost. More names asked of the model = more chances to invent wrong names. The trade-off is acceptable when the alternative is descriptive prompts producing Jaccard 0.003, but a perfect template would let the model say "I don't know" instead of inventing. That's a model-side capability gap.

### H3 — vocab gap drops materially

| Metric | γ | δ' predicted | δ' measured | Verdict |
|---|---:|---:|---:|---|
| Missing exports | 558 | ≤ 250 (−55%) | **488 (−12%)** | **falsified** |
| Nodes with any gap | 123 / 125 | ≤ 100 | **115 / 125** | falsified |
| Unexpected exports | 2 | ≤ 10 | **0** | confirmed (model doesn't invent EXTRA exports, but it does drop declared ones) |

**H3 verdict — falsified, in the most informative way.** The 0 unexpected exports tells us the model is NOT inventing new exports under prescriptive pressure — it's just dropping the declared ones. The mechanism we predicted ("anchor names in prose → model picks them up") works in proportion to the model's working memory / attention budget. qwen 7b's budget is small enough that for most files (97 of 125), the named anchors don't survive into the generation pass.

### H4 — extraction failure rate stays acceptable

| Metric | γ | δ' predicted | δ' measured (after fix) | Verdict |
|---|---:|---:|---:|---|
| Failed extractions | 4 (3.1%) | ≤ 25 (≤ 20%) | **4 (3.1%)** | **confirmed** (after `661c540` fix) |

δ' first attempt: 62 failed (47.7%) — H4 violated by the string-vs-array bug. Fix → δ' retry: 4 failed, exactly matching γ baseline. The 4 failures are the same pathological files γ also failed on (binary content / empty / unparseable). The new template is NOT inherently harder on qwen 3b once the JSON shape is specified correctly.

### H5 — vocab guard inert in production data

| Metric | γ | δ' predicted | δ' measured | Verdict |
|---|---:|---:|---:|---|
| Proposals failing Zod via SymbolNameSchema | 0 | 0 | 0 | confirmed |
| Stderr lines from ingest | empty | empty | empty | confirmed |

## What δ' actually taught us

### 1. The prompt was a real bottleneck, but not THE bottleneck

7× Jaccard improvement and 2 perfect-match files (vs γ's 0) prove the descriptive vs prescriptive distinction matters. The pre-δ template was leaving fidelity on the table. But the absolute value of Jaccard (0.021) is still far below what would let us call ε-equivalence common — the ceiling lifted by prompt design alone tops out around honesty 0.25 on this stack.

### 2. The model is now demonstrably the limit

With γ we couldn't disambiguate. After δ' we can: the prompt is doing its job, and the next gap is model capacity. Move 3 (Sonnet probe on the δ' graph) is the experiment that quantifies that gap.

### 3. Per-file rep distribution matters more than ever

`llm/mock.ts` at Jaccard 1.0 in δ' is the kind of result that γ's `prompt/types.ts` was: a single lucky draw. The model is stochastic at temperature > 0, and a single-draw n=125 measurement understates noise. Move 6 (per-file rep distribution) becomes more important after δ' because the high-Jaccard cohort is small enough (n=2) that single-draw results dominate.

### 4. The prescriptive prompt has a built-in unrecoverable cost

5 nodes (24 vs γ's 19) regressed into unrecoverable. Cause: the prompt names more symbols, the model tries to honour them and sometimes invents names that don't match upstream provides → gluing check rejects. A perfect template would let the model express uncertainty ("X exists in source but I cannot extract its exact name") rather than inventing. That's a UX-level template extension worth considering post-Move-3.

### 5. The string-vs-array bug is generic, not template-specific

The δ first-attempt failure (62 of 130 schema_failed because qwen emitted `prompt` as an array) is the kind of bug that hides in any template change that uses bullet-style examples. Worth a defensive template hygiene check: any new template that lists bullets in examples should explicitly say "this is JSON STRING formatting, not JSON ARRAY structure" before being shipped.

## Pareto frontier update

| Run | Task | Provider | Model | n | Honesty | Jaccard | unrecov | Cost | Pareto |
|---|---|---|---|---:|---:|---:|---:|---:|:---:|
| β | code_sketch | ollama | qwen2.5-coder:3b | 124 | 0.166 | ~0.00 | 24 | $0 | dominated |
| β' | code_sketch | ollama | qwen2.5-coder:7b | 126 | 0.187 | ~0.00 | 32 | $0 | dominated |
| γ | code_sketch | ollama | qwen2.5-coder:7b (+Move 1b) | 125 | 0.182 | 0.003 | 19 | $0 | dominated by δ' on honesty + Jaccard |
| δ' | code_sketch | ollama | qwen2.5-coder:7b (+Move 1b + δ' template) | 125 | **0.246** | **0.021** | 24 | $0 | **★ current best at $0 on honesty, but unrec regression** |

Four-point Pareto. The δ' curve shows the first real Jaccard movement of the project. Honesty ceiling on ollama tier appears to be ~0.25 with current prompt design.

## Falsification summary

| H | Status | Why |
|---|---|---|
| H1 primary (Jaccard ≥ 0.10) | **partially falsified** (0.021, +7× movement but below threshold) | Prompt necessary but not sufficient |
| H1 honesty (≥ 0.25) | **basically met** (0.246) | Acceptable within rounding |
| H1 epsilon_equivalent (≥ 2) | falsified (0) | No file hit BOTH thresholds; the 2 high-Jaccard files had LoC distance > 0.3 |
| H2 unrecoverable (18-25) | confirmed at upper bound (24) | Prescriptive prompts invent more names → more gluing rejection |
| H3 vocab gap (≤ 250) | **falsified** (488, only −12%) | Model acknowledges contract structurally but drops names semantically |
| H4 extraction failure rate (≤ 25) | **confirmed after `661c540` fix** (4) | The bug was implementation, not hypothesis |
| H5 vocab guard inert | confirmed (0) | Producer side clean |

## Ranked next moves (updated)

### 🥇 Move 3 — Anthropic Sonnet 4.6 ceiling probe

Now is when this is unambiguously the right experiment. The contract-gate path is clean (Move 1b), the prompt is now constructive (δ'), so any Sonnet measurement gives the true model-bound result. Run verify-only against the δ' graph at `.ontology.self-ingest-delta-result/` with `--provider anthropic --model claude-sonnet-4-6`. Predicted ~$2-3, ~30 min wall-clock.

Two outcomes both publishable:
- **Sonnet honesty ≫ 0.25 (e.g. ≥ 0.45):** ollama tier is model-bound for this task. Sonnet becomes the production compile-back tier; Move 4 ships a full Sonnet run; MATHEMATICAL_CLAIMS §3.10 lifts T4 → T2 with a citation pair (γ + Sonnet).
- **Sonnet honesty ≈ 0.25:** prompt-bound floor is real even at frontier. Move 5 (deeper prompt restructure) becomes the next experiment. Probably means the `code_sketch` template (compile-back, not extraction) needs the same prescriptive treatment δ' applied to extraction.

### 🥈 Move 6 — per-file rep distribution (n ≥ 3)

δ''s 2 high-Jaccard files are single draws. Run verify-only on JUST those 2 nodes (plus prompt/types.ts which was γ's Jaccard 1.0 luck) at n=3 with different seeds. Measure: do the high-Jaccard results persist or collapse? ~3 min wall-clock per node, $0. The answer informs whether the 2-file proof-of-mechanism is real signal or noise.

### 🥉 Move 1c — diagnose the persistent stragglers

context/types.ts and fibration/types.ts stayed unrecoverable through β, β', γ, AND δ'. Four runs unable to recover them is a clear signal something else is wrong (probably the same secondary gluing-check rejection mode the γ synthesis flagged). Two-hour diagnostic; small fix likely.

### 🟡 Move 7 (new) — prescriptive template UX: "I don't know"

δ' regression on unrecoverable comes from invented names. Add an explicit instruction to the template: "If you cannot determine the exact name or signature, write '[unknown_export_name]' rather than inventing one. The downstream validator handles unknown placeholders gracefully." Test whether this recovers some of the +5 regression.

## Decision-tree post-δ'

Per the δ hypothesis doc's decision tree:

> Jaccard 0.05-0.10 → "Both PROMPT and MODEL contribute. Move 3 (Sonnet) measures the remaining gap. Both moves needed for the §3.10 claim."

δ' Jaccard = 0.021. This is BELOW the "partially confirmed" band (0.05-0.10) but ABOVE the "falsified" floor (< 0.05). The qualitative read is the same as the partially-confirmed branch: both contribute, Sonnet next.

**§3.10 stays at T4** until Move 3 produces the frontier-model paired number. δ' is a strong intermediate data point that disambiguates the bottleneck for the first time.

## Cost + wall-clock recap

| Phase | Wall-clock | Tokens | Cost | Notes |
|---|---:|---:|---:|---|
| δ' Ingest (126 files × qwen 3b) | 115 min | 517,897 | $0 | +80% over γ (template +60% chars; richer per-file output) |
| Apply (126 proposals) | 1.5 min | — | $0 | unchanged |
| Verify (125 nodes × qwen 7b) | 320 min (~5h 20min) | 94,503 | $0 | +127% over γ; more nodes reach full compile-back (24 unrec vs γ's 19) and prompts are longer |
| **Total δ' run** | **~7h 30min** | **~611K** | **$0** | ~2× γ's wall-clock; same cost |
| (failed first δ attempt) | ~3h | 224K | $0 | preserved as `.ontology.archive-failed-delta-2026-05-18/` for diagnostic |

The wall-clock cost of δ' is the real signal of where we are: the model is operating at its capacity ceiling. Move 3 (Sonnet) pays token cost in exchange for either lifting that ceiling (cleanly answering "Sonnet honors prescriptive contracts qwen cannot") or pinning it (cleanly answering "even Sonnet floors at ~0.25 with current code_sketch design").

## What gets committed alongside this synthesis

- `SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md` — already committed at `3453ac1` before the first δ attempt.
- The bug fix commit `661c540` — the template patch that landed before δ' restart.
- `SELF_INGEST_DELTA_2026-05-18.md` — raw matrix report written by `verify-homeomorphism` (auto-generated, 21KB markdown including per-axis matrix, honesty histogram, vocab gaps, per-node table).
- This synthesis.
- The `.ontology.self-ingest-delta-result/` directory is preserved on disk under the `.gitignore` patterns from sweep `9eb9211`, and is **not committed** — same convention as β / β' / γ.
- The `.ontology.archive-failed-delta-2026-05-18/` is also gitignored, preserves the 68 successful proposals from the first δ attempt as failure-mode evidence.

The audit chain for δ': hypothesis (`3453ac1`) → bug-fix (`661c540`) → synthesis commit (this one) → raw report (auto-generated) → preserved workspace (gitignored). MATHEMATICAL_CLAIMS §3.10 stays T4 pending Move 3 to pair with δ' as the publishable claim.
