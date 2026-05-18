# Phase ε self-ingestion β′ — hypothesis vs reality + next moves

> *Synthesis sibling of
> [SELF_INGEST_BETA_PRIME_2026-05-16_HYPOTHESIS.md](./SELF_INGEST_BETA_PRIME_2026-05-16_HYPOTHESIS.md)
> (pre-registered) and [SELF_INGEST_BETA_PRIME_2026-05-16.md](./SELF_INGEST_BETA_PRIME_2026-05-16.md)
> (raw matrix). Captures what β′ measured, surfaced, and falsified —
> including a routing-architecture bug that the run itself surfaced
> mid-flight, and one fidelity success (Jaccard = 1.0) that proves
> Move 1's mechanism works in isolation.*

**Run dates:** 2026-05-16 (ingest + apply) → 2026-05-17 (verify after registry fix)
**Pipeline:** `ingest --static-classifier enabled` (qwen2.5-coder:3b) → `proposal apply` × 127 → registry fix `598fb25` → `verify-homeomorphism --all-artifacts --matrix` (qwen2.5-coder:7b)
**Total wall-clock:** 144 min (45 ingest + 2 apply + 98 verify; 2s wasted first verify attempt excluded)
**Spend:** $0.00

## The mid-flight finding: routing has no fallback

β′'s first verify attempt failed in **2 seconds** with every node `unrecoverable` and the error `model 'qwen2.5-coder:14b' not found`. Cause:

> `getDefaultModelForTask` returns `preferred[0]` only. There is **no** automatic fallback through `preferred[1..N]` when the first entry isn't pulled or doesn't fit local VRAM.

The Ollama routing table listed 14b-tier models first for `code_sketch` / `test_generate` / `node_expand`. On an M1 (5.3 GiB VRAM ceiling per bake-off v2 §2.1), 14b never dispatched. β′ surfaced a routing-architecture bug that nothing previously caught because every prior run had a `--model` override masking it.

**Patched in commit `598fb25`** — reordered the Ollama `preferred[]` arrays so the deployable model is first; aspirational larger entries kept as `preferred[1]` for the future dispatcher-fallback patch. Verify re-ran with `qwen2.5-coder:7b` actually dispatching this time (98 min wall-clock for 126 nodes; ~47s per node).

## Pre-registered predictions vs measured

### Aggregate

| Verdict | β (3b verify) | β′ (7b verify) | Delta |
|---|---:|---:|---|
| `epsilon_equivalent` | 0 | **0** | 0 — H2 falsified |
| `divergent_loc` | 1 | 2 | +1 |
| `divergent_structural` | 9 | **15** | +6 — marginally more Jaccard-positive cases |
| `divergent_both` | 90 | 77 | −13 |
| `unrecoverable` | 24 | **32** | **+8 — H3 falsified in the OPPOSITE direction** |
| Mean structural honesty | 0.166 | **0.187** | +0.021 (essentially noise) |

### H1 — static_summary Jaccard improves

| File | Shape | β verdict | β′ verdict | β′ Jaccard | β′ LoC dist |
|---|---|---|---|---:|---:|
| context/types.ts | declaration_only | divergent_structural | **unrecoverable** | — | — |
| effects/index.ts | barrel | divergent_both | **unrecoverable** | — | — |
| fibration/index.ts | barrel | divergent_both | **unrecoverable** | — | — |
| fibration/types.ts | declaration_only | divergent_both | **unrecoverable** | — | — |
| llm/types.ts | declaration_only | divergent_both | divergent_structural | 0.000 | 0.286 |
| **prompt/types.ts** | declaration_only | divergent_both | **divergent_loc** | **1.000** | 0.673 |
| topos/index.ts | barrel | divergent_both | **unrecoverable** | — | — |

**The signal: ONE file got perfect Jaccard.** `prompt/types.ts` produced regen with the *exact same top-level declaration names* as the source (`PromptAST`, `PromptMarkers`, `PromptExpand`, etc.). Move 1's vocabulary preservation mechanism works.

But **6 of 7 deflected files moved to `unrecoverable`** — worse than β. Cause:

> Move 1 populates `requires: [<module specifiers>]`. The intent-validator's gluing check demands every `requires` entry be satisfied by some upstream node's `provides`. But upstream nodes' `provides` contain SYMBOL NAMES (e.g. `"createNodeProposalForExtraction"`), not MODULE PATHS (e.g. `"./io.js"`). The vocabularies are misaligned, so the gluing check rejects all six.

**`prompt/types.ts` succeeded because it has zero imports** → `requires: []` → gluing check trivially satisfied → Move 1's prompt anchors the regen exactly.

**H1 verdict: mechanism PROVEN on one file; aggregate negatively affected by an unanticipated vocabulary-domain mismatch in the gluing check.**

### H2 — semantic_parse improves via correct-task model routing

| Metric | β (3b code_sketch) | β′ (7b code_sketch) | Δ |
|---|---:|---:|---:|
| Mean structural honesty (semantic_parse) | 0.166 | 0.187 | +0.021 |
| Mean Jaccard (semantic_parse) | ~0.00 | ~0.00 (within rounding) | — |
| epsilon_equivalent count | 0 | 0 | 0 |

**H2 verdict: FALSIFIED.** Going from 3b to 7b for `code_sketch` produced a ~12% relative improvement in mean honesty (0.166 → 0.187), but **mean Jaccard stayed at ~0** and zero nodes hit epsilon_equivalent. The hypothesis predicted Jaccard ≥ 0.30 and honesty ≥ 0.35. Neither happened.

**The bottleneck is NOT 3b-vs-7b model capacity.** Doubling parameter count gave a noise-level improvement.

### H3 — unrecoverable count drops

| Metric | β | β′ | Predicted | Outcome |
|---|---:|---:|---:|---|
| unrecoverable count | 24 (19%) | **32 (25%)** | ≤ 10 (8%) | **falsified, OPPOSITE direction** |

**H3 verdict: FALSIFIED in the opposite direction.** Move 1's `requires` additions to static_summary files broke the gluing check on barrels and declaration-only files that DO have imports. Net effect: 8 MORE unrecoverable, not fewer.

## What β′ actually taught us

### 1. The bottleneck is structural, not model-capacity

The `code_sketch` honesty went from 0.166 (3b) to 0.187 (7b) — a 12% improvement for what should be a 2.3× capability jump (3B parameters → 7B parameters). That's a near-flat curve on the model axis. **Bigger models won't fix this.**

What's hard-floored at ~0.17 honesty: the model is generating code that BEHAVES like the prompt asks but uses entirely different identifier names. Jaccard ≈ 0 across the board. The contract specifies `provides: [foo, bar]` and the regen emits `function frobnicate() ...`. The bound here is the prompt's ability to surface specific names AND the model's adherence to them — and 7b is essentially indifferent to that anchor.

### 2. The gluing check has a vocabulary-domain bug

`provides` accepts **symbol names** (per the ExtractionResultSchema contract). `requires` is interpreted by the gluing check as **resolvable tokens that some other node provides**. Move 1 put **module path specifiers** in `requires` (e.g. `./io.js`). The gluing check can't match `./io.js` against any node's `provides: [...]` array because modules aren't symbols.

This is fixable in either direction:
- Change Move 1 to put SYMBOL NAMES (the imported `symbols` from `vocabulary.imports[].symbols`) in `requires` instead of module paths.
- Or change the gluing check to recognize module paths as a separate dependency kind.

The first is cheaper and more aligned with the existing semantics. β″ candidate.

### 3. Move 1's mechanism works (n=1 proof)

`prompt/types.ts` round-tripped with Jaccard = 1.0. The vocabulary preservation works exactly as designed when the gluing check doesn't reject the file first. This is genuinely useful evidence: Move 1 isn't wrong, it's incomplete.

### 4. The registry-routing architecture has a fallback gap

`getDefaultModelForTask → preferred[0] only` is a real architectural limitation. Today it's papered over by reordering preferred lists to put deployable models first (commit `598fb25`). The proper fix is dispatcher-level fallback: try `preferred[0]`, on "model not found" try `preferred[1]`, etc. This is the only way the registry's `preferred[]` semantic actually delivers on its promise.

## What we now have on the Pareto frontier

| Run | Task | Provider | Model | n | Honesty | Cost | Pareto |
|---|---|---|---|---:|---:|---:|:---:|
| β | code_sketch | ollama | `qwen2.5-coder:3b` | 124 | 0.166 | $0 | ★ (was, now dominated) |
| β′ | code_sketch | ollama | `qwen2.5-coder:7b` | 126 | 0.187 | $0 | **★** (current best at $0) |

β' dominates β on this perimeter at the same cost. Two-point Pareto with negligible slope: the curve is essentially flat through the ollama tier.

## Falsification summary

| H | Status | Why |
|---|---|---|
| H1: static_summary Jaccard ≥ 0.5 mean | partial (1/7 proves mechanism; 6/7 newly broken via gluing) | Vocabulary preservation works; gluing-check domain mismatch broke aggregate |
| H2: semantic_parse honesty ≥ 0.35 | falsified (0.187) | Model capacity is not the bottleneck at the 3b→7b boundary |
| H3: unrecoverable ≤ 10 | falsified, opposite direction (24→32) | Move 1's module-path `requires` violates the gluing check's vocabulary contract |

## Ranked next moves (updated)

### 🥇 Move 1b — fix the Move 1 vocabulary domain

`buildStaticSummary` currently puts module specifiers in `requires`. Change it to put the IMPORTED SYMBOL NAMES (from `vocabulary.imports[].symbols`) there instead. Module paths can move to the prompt prose where they're already mentioned but not contractually checked. Predicted impact:
- The 6 newly-unrecoverable static_summary files should pass the gluing check (their symbol-name requires will match other nodes' symbol-name provides).
- Aggregate `unrecoverable` should drop from 32 back toward β's 24 — possibly below.
- Aggregate honesty likely flat or slightly up.

Cost: ~10 lines in static-summary.ts. ~30 min for re-run on preserved post-apply state via the verify-only script. **Cheapest meaningful next experiment.**

### 🥈 Move 3 — Anthropic ceiling probe (Sonnet 4.6)

β + β′ produced a flat curve through the ollama tier. The model-capacity question can only be answered by stepping outside that tier. Run `verify-homeomorphism` on the same preserved post-apply state with `--provider anthropic --model claude-sonnet-4-6`. Predicted: ~$2-3 spend, ~30 min wall-clock, and an honest answer to "is the bottleneck the model or the prompt/contract design?"

If Sonnet 4.6 also produces Jaccard ≈ 0, the answer is the prompt / contract template — and the next move is restructuring `code_sketch` (a separate larger PR). If Sonnet produces meaningful Jaccard, the ollama tier just isn't deployable for compile-back on this codebase.

### 🥉 Move B (deferred from earlier) — proper dispatcher fallback

Add real fallback to the dispatcher: on "model not found" / "model unavailable", iterate through `preferred[1..N]`. This is the right long-term fix for the architectural gap β′ surfaced. Not blocking any specific experiment, but the right time to do it is now while the bug is fresh in context.

## Decision needed

My recommendation: **Move 1b first** (15-min code change + 30-min verify-only re-run). Then **Move 3** to ceiling-probe whether the model is the bottleneck. If Move 3 confirms "prompt-bound", Move B (dispatcher fallback) lands next; if Move 3 says "model-bound", then the next experiment is a stronger ollama tier (qwen2.5-coder:14b deployed on a bigger host).
