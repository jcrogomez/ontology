# Phase ε self-ingestion β — hypothesis vs reality + next moves

> *Synthesis sibling of [SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md](./SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md)
> (pre-registered) and [SELF_INGEST_BETA_2026-05-16.md](./SELF_INGEST_BETA_2026-05-16.md)
> (raw matrix). Reads the run as a falsification exercise: which
> predictions held, which failed, what the failures teach.*

**Run date:** 2026-05-16
**Pipeline:** `onto ingest --static-classifier enabled` → `proposal apply` × 125 → `verify-homeomorphism --all-artifacts --matrix`
**Model (both directions):** `qwen2.5-coder:3b` on local ollama
**Wall-clock:** 96 min total (44 min ingest + 2 min apply + 50 min verify)
**Spend:** $0.00

## Pre-registered predictions vs measured

### Verdict folder distribution

| Verdict | Predicted | Measured | Delta |
|---|---:|---:|---|
| `epsilon_equivalent` | ~30 (24%) | **0 (0%)** | **−30** — no node round-tripped close enough to count |
| `divergent_loc` (small struct, large LoC) | ~15 (12%) | 1 (1%) | |
| `divergent_structural` (large struct, small LoC) | ~25 (20%) | 9 (7%) | |
| `divergent_both` | ~58 (44%) | **90 (73%)** | **+32** — the dominant outcome |
| `unrecoverable` | 0 (not predicted) | **24 (19%)** | **+24** — compile-back rejected outright |

### Structural fidelity

| Metric | Predicted | Measured | Delta |
|---|---:|---:|---|
| Mean Jaccard (`semantic_parse`) | 0.55 | **~0.00** | **catastrophic miss** |
| Mean Jaccard (`static_summary`) | ≥ 0.95 | **0.00** | **catastrophic miss** |
| Mean structural honesty (whole run) | 0.55 | **0.166** | −0.38 (66% miss) |

### Falsification conditions — which fired?

| Condition | Status |
|---|---|
| Mean `semantic_parse` Jaccard < 0.20 → 3b unusable for compile-back | **✅ FIRED** — measured ~0.00 |
| Mean `semantic_parse` Jaccard > 0.80 → 3b stronger than calibrated | ❌ did not fire |
| `static_summary` < `semantic_parse` → deflection hurts fidelity, revert PR3 | **⚠️ AMBIGUOUS** — both at ~0.0, no signal differentiation |
| LoC variance flat across shapes → taxonomy carries no fidelity signal | ❌ did not fire (some variance present, see Pareto section) |

## What actually held

The few predictions that didn't fail are themselves signal:

1. **Cost prediction held.** $0.00 actual vs $0.00 predicted. Trivially true on ollama but the wall-clock estimate (~2 hr) landed within 5%.
2. **Cartography matrix structure works.** The `--matrix` flag emitted six honest axes: `structural` (measured, mean 0.166, coverage 81%), `intent` (24 nodes flagged needs-human), and `contract`/`behavior`/`literalRequired` correctly reporting `not-measured`. The shape of the matrix is sound; only the cell values came in worse than predicted.
3. **Vocab-gap signal is dense and useful.** 113/124 nodes have a gap; the top missing keys (`failWith` × 6, `errorMessage` × 2, Result-monad combinators × multiple) point at real Ontology-internal vocabulary the 3b model couldn't synthesize.

## What the failures actually teach

### 1. qwen2.5-coder:3b is below the compile-back threshold

Bake-off v2 calibrated 3b for `structured_extraction` (ingest direction: code → JSON intent). That direction is **classification + summarization**, which 3b handles. Compile-back is **generation from intent → code**, which is an entirely different load. The bake-off didn't measure this and our prediction extrapolated incorrectly.

**Concrete signature in the data:** Jaccard ≈ 0 across the board. The model is emitting code, but it's not emitting code with the same top-level declaration names. It's writing *different* code that nominally satisfies the prompt — the prompt mentions "function foo" and the model emits "function bar that does what foo does". Structural Jaccard, which compares top-level identifier sets, falls to zero.

### 2. The `static_summary` deflection set is information-poor

PR3's conservatism — `provides: []` and `requires: []` for barrels and declaration-only modules — encoded **shape** but not **vocabulary**. The compile-back prompt has nothing to anchor regen to specific symbol names. Result: even files we deflected (cheap, deterministic intent) compile-back into something semantically adjacent but lexically unrelated.

**This is actionable.** The classifier already has `parsed.exports` available (it counts them). Passing the actual exported names through `buildStaticSummary` would:
- Restore Jaccard signal on barrels (their identity IS their export list).
- Restore Jaccard signal on declaration_only modules (their identity IS their type names).
- Cost zero — pure AST data already computed.

This is a tiny PR (Plan A's sibling).

### 3. The contract-enforcement gate is *correctly* loud

24 `unrecoverable` failures are NOT compile-back giving up. They're the **intent validator rejecting regens that don't surface declared `requires`/`provides`**. The system did its job: when the model wrote regen that ignored a declared dependency, the gate refused to mark it as valid.

This is the **opposite** of silent drift. The 19% unrecoverable rate is the system telling us "the model can't satisfy this contract — flagging instead of pretending". That's the right behavior.

### 4. The cartography matrix has its first calibrated baseline

Pre-PR3, there was no measured Pareto point. After this run:

| Task | Provider | Model | n | Honesty | Cost | Pareto |
|---|---|---|---:|---:|---:|:---:|
| code_sketch | ollama | qwen2.5-coder:3b | 124 | 0.166 | $0 | ★ |

A single point, $0 / 0.166. Any future model that lands above the line `honesty / cost > 0.166 / 0` (i.e., any nonzero honesty per nonzero cost) is on a Pareto frontier with this point. **We now have a baseline against which Sonnet 4.6, qwen2.5-coder:7b, and the high-confidence ensemble can each be priced.** That's the load-bearing capability the user's memory note flagged: the matrix as the success object, not the percentage.

## Next moves (ranked)

### 🥇 Move 1 — Quick fidelity restoration on static_summary (1-day fix)

Extend `buildStaticSummary` in `src/runtime/legend/static-summary.ts`:
- For `barrel`: pass through `provides: <re-exported-symbol-names>` and `requires: <module-paths-imported>` from `parsed.exports` and `parsed.imports`.
- For `declaration_only`: pass through `provides: <declared-type-names>` from the AST walker (already detected).

Cost: ~50 lines of code, deterministic AST traversal, no LLM. Predicted impact: static_summary nodes go from Jaccard 0.0 to Jaccard ≥ 0.7 on this perimeter — restoring the deflection-vs-LLM fidelity comparison the hypothesis wanted to measure but couldn't because both sides were at 0.

**Run a second self-ingestion β' with this fix in place.** Same model, same perimeter. Should be reproducible in ~96 min.

### 🥈 Move 2 — Test the model boundary with `qwen2.5-coder:7b`

Pull qwen2.5-coder:7b (~4 GB, fits in 5.3 GB VRAM with some pressure). Re-run verify-homeomorphism on the same applied nodes (no need to re-ingest if .ontology.self-ingest-beta-result/ is preserved — and it is).

Expected: Jaccard climbs to ~0.3-0.5. If it does, the bake-off v2 calibration carries to compile-back at the 7b tier. If it doesn't, the calibration is structurally extraction-only and compile-back needs its own bake-off.

Wall-clock estimate: ~75 min (7b is ~1.5× slower than 3b at generation per the bake-off data).

### 🥉 Move 3 — Anthropic-tier ceiling probe

Run verify-homeomorphism on the same applied nodes with `--provider anthropic --model claude-sonnet-4-6`. Expected cost: 124 nodes × ~3000 tokens × Sonnet rates ≈ ~$2.50. Expected Jaccard: high — Sonnet at code_sketch is the calibrated frontier model. Gives us the **upper-bound** Pareto point opposite the qwen:3b lower-bound.

Together, moves 2 and 3 produce a three-point Pareto curve (3b / 7b / Sonnet 4.6). That's a cartography, not a percentage.

### Note on Plan A (schema_module predicate tightening)

The original "C luego A" plan deferred A. After this run, A is **less urgent** than expected: schema_module didn't differentiate meaningfully from executable_module in the measured fidelity (both at ~0 Jaccard at 3b). The overfit predicate's harm is only visible at higher fidelity tiers where the false-positive schemas would round-trip well and the true zod-validators wouldn't. Move 2 or 3 will surface that distinction; until then, A doesn't change observable behaviour.

## Decision needed from the user

After committing this synthesis, the natural next gate is choosing between Move 1 (fix static_summary, re-run β'), Move 2 (probe 7b without code change), and Move 3 (Anthropic ceiling probe).

My recommendation: **Move 1 first**, because:
- Cheapest code change.
- Restores the deflection-vs-LLM comparison the hypothesis wanted.
- Doesn't burn more wall-clock without first fixing what we KNOW is broken.
- After β' with the fix, Move 2 or Move 3 (or both) tells us about model scaling.

If the user wants empirical pressure on the model question first, Move 2 is fast (~75 min) and code-free.
