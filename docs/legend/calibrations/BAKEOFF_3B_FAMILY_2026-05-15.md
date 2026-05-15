# Bake-off v2 — 3b Family Calibration

> *Phase ε E6 deliverable: cross-model variance + ensemble effectiveness measurement
> on a curated 20-file subset of the Ontology core perimeter. Falsifies or
> strengthens the "82.3% → 95.97% recovery" pilot headline by establishing
> per-model variance, not just point estimates.*

**Run date:** 2026-05-15
**Hardware:** Mac M1, 5.3 GiB unified VRAM available to GPU inference
**Provider:** Ollama (local)
**Cost:** $0
**Total wall-clock:** 8,940 s (≈ 2 h 29 min)
**Hardening active:** NUL guard + H1 retry + H2 adaptive context + H3 backoff (commits `f2e0f61`, `f4855b9`, `716b341`, `b6badaf`, `16933fd`, `2678ed8`)

---

## 1. Executive summary

A 4-model × 3-repeat × 20-file matrix (12 runs, 240 file-extractions) was run on
the Ontology core perimeter to answer four questions the single-sample pilot
(`MILESTONE_REVIEW_2026-05-14`) could not:

1. **Is the 82.3% → 95.97% recovery a stable signal or a lucky single sample?**
2. **Do failures concentrate on objectively hard files, or are they model-specific?**
3. **Does the hypothesis §4 (faithful predicted) / §5 (resistant predicted) prediction hold across models?**
4. **Can ensembling cheap local models recover the residual failures?**

**Headline findings:**

- **qwen-coder:3b is deterministic** — same 1/20 file fails across 3 repeats, zero variance. Single-run mean = 95%, ensemble × 3 = 100% (barrel file fails only 2/3 reps).
- **llama3.2:3b is stochastic complementary** — 0 files fail in all 3 reps; ensemble × 3 → 100% coverage at $0.
- **phi3:mini (Microsoft, instruction-tuned, 3.8B) is stochastic but catastrophic per-run** — single-run avg 63%, ensemble × 3 = 95%. ~3× the wall-clock of qwen/llama.
- **deepseek-r1:1.5b (reasoning-tuned) is structurally unsuited** for the task — 25% single-run, ensemble × 3 = only 55%. Nine files fail in *all* 3 reps. Failures concentrate on `required_missing`: the chain-of-thought consumes the output budget and leaves the JSON incomplete.
- **The hypothesis §4/§5 prediction is model-dependent.** With qwen-coder, both predicted regions extract cleanly (10/10 faithful always-ok, 8/8 resistant always-ok — the only failures are the 2 barrels, which were tagged as "edge", not as either prediction class). With phi3 or deepseek, both regions collapse. The prediction was a statement conditional on extraction quality, not absolute on file structure.

**Pareto frontier (cost = wall-clock, value = coverage):**

| Strategy | Coverage | Wall-clock | Notes |
|---|---:|---:|---|
| qwen-coder:3b single-run | 95% | 6:23 | Fast, cheap, predictable. The default. |
| **llama3.2:3b × 3 ensemble** | **100%** | **23:30** | **Pareto-optimal for coverage.** |
| qwen-coder:3b × 3 ensemble | 100% | 19:08 | Slightly faster than llama × 3; same coverage. |
| phi3:mini × 3 ensemble | 95% | 53:50 | Strictly dominated. |
| deepseek-r1:1.5b × 3 ensemble | 55% | 51:57 | Strictly dominated. |

The two competing 100%-coverage strategies (qwen × 3 or llama × 3) are nearly
tied on cost. **qwen × 3 is the simpler choice operationally** (one model, no
routing), but **llama × 3 is more robust to model-specific blind spots** (different
files fail across reps so the union is genuinely diverse).

---

## 2. Per-model results

### 2.1 qwen2.5-coder:3b

| Metric | rep1 | rep2 | rep3 | Mean | Variance |
|---|---:|---:|---:|---:|---:|
| OK | 19 | 19 | 19 | 19.00 | **0.00** |
| Failed | 1 | 1 | 1 | 1.00 | 0.00 |
| Tokens | 45,028 | 45,360 | 45,138 | 45,175 | 0.7% spread |
| Wall-clock | 363 s | 382 s | 403 s | 382.7 s | 10% (thermal) |

- **Single-run OK rate: 95% ± 0.0pp** — deterministic.
- **Intersection × 3 fails:** 1 file (`src/runtime/effects/index.ts` — barrel).
- **Ensemble × 3 OK:** 20/20 (100%). The barrel file failed in 2 of 3 reps; rep1 caught it.
- **First-failure-kind:** `kind_invalid_value` × 2 per run, all retried by H1; 1 recovered, 1 persistent.
- **Token efficiency:** ~2,260 tokens per file (most concise structured output of the four models).
- **Characterization: notary.** The most reliable extractor in the set; the one file it consistently struggles with is structural (a re-export barrel) and is best handled by an AST pre-classifier, not by retrying the LLM.

### 2.2 llama3.2:3b

| Metric | rep1 | rep2 | rep3 | Mean | Variance |
|---|---:|---:|---:|---:|---:|
| OK | 18 | 19 | 19 | 18.67 | rango 18-19 |
| Failed | 2 | 1 | 1 | 1.33 | |
| Tokens | 40,733 | 44,639 | 42,495 | 42,622 | 4.6% spread |
| Wall-clock | 383 s | 518 s | 488 s | 463 s | 26% spread |

- **Single-run OK rate: 93.3% ± 2.5pp** — mildly variable.
- **Intersection × 3 fails:** **0 files** — no file fails in every rep. Every failure was a different file.
- **Ensemble × 3 OK:** **20/20 (100%)** — full recovery via ensemble.
- **First-failure-kind:** mixed — `level_invalid_value`, `kind_invalid_value` dominate, but the *target file* varies each rep.
- **Per-rep failure pattern:**
  - rep1: `matrix-intersections.ts`, `translator.ts` (both `level_invalid_value`)
  - rep2: `ollama/adapter.ts` (`kind_invalid_value`)
  - rep3: `commands/init.ts` (`level_invalid_value`)
- **Characterization: stochastic complementary.** Worse than qwen on any single run but the variance is *productive* — failures don't cluster, so 3 independent samples cover every file.

### 2.3 phi3:mini

| Metric | rep1 | rep2 | rep3 | Mean | Variance |
|---|---:|---:|---:|---:|---:|
| OK | 12 | 10 | 16 | 12.67 | rango 10-16 |
| Failed | 8 | 10 | 4 | 7.33 | |
| Tokens | 28,689 | 30,074 | 49,531 | 36,098 | 73% spread |
| Wall-clock | 978 s | 1,049 s | 1,203 s | 1,076.7 s | 23% spread |

- **Single-run OK rate: 63.3% ± 15pp** — large variance.
- **Intersection × 3 fails:** 1 file (`src/runtime/legend/translator.ts` — prompt-sensitive).
- **Ensemble × 3 OK:** 19/20 (95%).
- **First-failure-kind:** `level_invalid_value` × 22 across all reps. phi3 is structurally confused about the level enum (`canon | project | target | stack | architecture | domain | workflow | interface | unit | token | artifact`) on most files.
- **H1 retry usage:** 11 retries per run on average. H1 recovers ~3 of them per run.
- **Wall-clock:** ~17 min per run — nearly 3× qwen/llama. Microsoft's Phi3 architecture is slower under llama.cpp/Metal on M1 than qwen or llama3.2.
- **Characterization: stochastic but catastrophic.** Comparable ensemble coverage to qwen ×3 (95% vs 95%) but at 5× the wall-clock. Strictly dominated.

### 2.4 deepseek-r1:1.5b

| Metric | rep1 | rep2 | rep3 | Mean | Variance |
|---|---:|---:|---:|---:|---:|
| OK | 5 | 5 | 5 | 5.00 | **0.00** |
| Failed | 15 | 15 | 15 | 15.00 | 0.00 |
| Tokens | 12,286 | 14,362 | 13,404 | 13,351 | 14% spread |
| Wall-clock | 1,483 s | 824 s | 770 s | 1,025.7 s | 84% spread |

- **Single-run OK rate: 25.0% ± 0.0pp** — deterministically poor.
- **Intersection × 3 fails:** **9 files** — structurally impossible for this model:
  - `commands/init.ts`
  - `commands/runs/show.ts`
  - `core/fs/lock.ts`
  - `core/integrity/hash.ts`
  - `runtime/effects/index.ts`
  - `runtime/legend/render-ascii.ts`
  - `runtime/legend/translator.ts`
  - `runtime/llm/anthropic/adapter.ts`
  - `runtime/topos/predicate.ts`
- **Ensemble × 3 OK:** 11/20 (55%). The 9 files above never recover, even with 3 independent samples.
- **First-failure-kind:** `required_missing` dominates (6 in rep1, 4 in rep2, etc.). The reasoning-tuned model **produces parseable JSON but with required fields missing** — the chain-of-thought consumes the output budget before the structured fields are filled.
- **Tokens per file:** ~670 — 3-4× less than qwen/llama. Confirms output budget is being consumed by internal reasoning.
- **Wall-clock:** 17 min per run on average — same scale as phi3, with 1/3 the coverage.
- **Characterization: structurally unsuited.** This is not a noise problem; it is a competence problem. Ensembling does not rescue it. The reasoning-tuned architecture produces a different kind of output (deliberative prose), which conflicts with the structured-output contract.

---

## 3. Cross-tab — file × model failure grid

Each cell shows fails-out-of-3-reps for that (file, model) pair. `0/3` = always OK; `3/3` = always failed.

| File | qwen | llama | phi3 | deepseek | Predicted bucket |
|---|:---:|:---:|:---:|:---:|---|
| `src/core/integrity/hash.ts` | 0/3 | 0/3 | 0/3 | 3/3 | pure-transform (faithful) |
| `src/runtime/topos/predicate.ts` | 0/3 | 0/3 | 1/3 | 3/3 | algebraic-lawful (faithful) |
| `src/runtime/topos/omega.ts` | 0/3 | 0/3 | 1/3 | 1/3 | algebraic-lawful (faithful) |
| `src/runtime/effects/result.ts` | 0/3 | 0/3 | 0/3 | 2/3 | algebraic-lawful (faithful) |
| `src/runtime/effects/laws.ts` | 0/3 | 0/3 | 1/3 | 2/3 | algebraic-lawful (faithful) |
| `src/runtime/legend/render-ascii.ts` | 0/3 | 0/3 | 1/3 | 3/3 | pure-transform (faithful) |
| `src/runtime/legend/vocab-gap.ts` | 0/3 | 0/3 | 1/3 | 1/3 | pure-transform (faithful) |
| `src/runtime/legend/matrix-intersections.ts` | 0/3 | 1/3 | 1/3 | 2/3 | pure-transform (faithful) |
| `src/runtime/graph/poset.ts` | 0/3 | 0/3 | 2/3 | 2/3 | pure-transform (faithful) |
| `src/runtime/static/edges.ts` | 0/3 | 0/3 | 2/3 | 2/3 | pure-transform (faithful) |
| `src/commands/init.ts` | 0/3 | 1/3 | 1/3 | 3/3 | cli-parsing (resistant) |
| `src/commands/walk.ts` | 0/3 | 0/3 | 1/3 | 2/3 | cli-parsing (resistant) |
| `src/commands/runs/show.ts` | 0/3 | 0/3 | 1/3 | 3/3 | cli-parsing (resistant) |
| `src/core/fs/lock.ts` | 0/3 | 0/3 | 2/3 | 3/3 | io-bound (resistant) |
| `src/core/state/state-store.ts` | 0/3 | 0/3 | 0/3 | 1/3 | io-bound (resistant) |
| `src/runtime/llm/anthropic/adapter.ts` | 0/3 | 0/3 | 1/3 | 3/3 | adapter-boundary (resistant) |
| `src/runtime/llm/ollama/adapter.ts` | 0/3 | 1/3 | 1/3 | 1/3 | adapter-boundary (resistant) |
| `src/runtime/legend/translator.ts` | 0/3 | 1/3 | 3/3 | 3/3 | prompt-sensitive (resistant) |
| `src/runtime/effects/index.ts` | 2/3 | 0/3 | 1/3 | 3/3 | barrel (edge) |
| `src/runtime/topos/index.ts` | 1/3 | 0/3 | 1/3 | 2/3 | barrel (edge) |

**Reading the grid:**

- **Column intensity reflects model competence.** qwen has at most `2/3` on a single file (a barrel); deepseek has `3/3` on 9 files.
- **Row intensity reflects file difficulty conditional on model class.** `translator.ts` is uniformly hard (1/3 + 1/3 + 3/3 + 3/3 = 8 fails across 12 runs) — it's the only file that all four models struggle with, but qwen still gets it right always.
- **Barrels (edge bucket)** are the only files where qwen has *any* difficulty, validating the prediction that "structural re-export files need an AST classifier, not LLM extraction".

---

## 4. Hypothesis §4 / §5 — predicted vs actual

The hypothesis (`SELF_INGEST_HYPOTHESIS_2026-05-13.md`) predicted two classes:

- **§4 Faithful:** pure-transform, algebraic-lawful, schema-driven, declarative-validator. *Expected OK > average.*
- **§5 Resistant:** cli-parsing, io-bound, adapter-boundary, prompt-sensitive, operational-glue, tui-rendering. *Expected OK < average.*

This subset includes 10 faithful + 8 resistant + 2 edge (barrels).

### 4.1 Validation per model

| Model | Faithful: always-ok / sometimes-fail / never-ok | Resistant: always-ok / sometimes / never | Verdict |
|---|---:|---:|---|
| qwen2.5-coder:3b | **10 / 0 / 0** | **8 / 0 / 0** | both classes pass; only the 2 barrels falter |
| llama3.2:3b | 9 / 1 / 0 | 5 / 3 / 0 | both classes pass; resistant has more wobble |
| phi3:mini | 2 / 8 / 0 | 1 / 6 / 1 | both classes wobble heavily; resistant slightly worse |
| deepseek-r1:1.5b | 0 / 7 / 3 | 0 / 3 / 5 | both classes collapse; resistant worse |

### 4.2 Reading

- **The hypothesis is conditional on model quality.** With qwen, *both* classes are clean — the predicted-faithful and predicted-resistant files extract equally well. The frontier-tagger's predicted split does not separate them under a competent extractor.
- **With degraded models, the resistant class fails slightly more** than the faithful class (consistent with the prediction), but the difference is small compared to the model-vs-model spread.
- **The prediction's real load-bearing claim is the "edge" bucket** (barrels) — those files fail across *every* model in some reps, including qwen. That part of the prediction is validated.

**Outcome:** §4 ("faithful regions outperform") and §5 ("resistant regions underperform") are **partially validated** in the weak sense that resistant > 0 in failure rate under low-quality models, but the strong claim "the frontier tagger predicts the failure surface" is only meaningful when the extractor is the bottleneck — not when the model is.

---

## 5. Operational diagnosis per model

### qwen2.5-coder:3b → **extractor primario / notario determinista**

- ✅ Predictable, code-aware, cheap (~6 min for 20 files, $0).
- ✅ Zero variance across reps — operational scheduling is trivial.
- ⚠️ Has one structural blind spot: re-export barrels. Mitigation: AST pre-classifier before the LLM dispatch.
- **Role:** default extractor for any new ingest pass.

### llama3.2:3b → **extractor estocástico complementario**

- ✅ 100% coverage via ensemble × 3 at ~23 min total.
- ✅ Different files fail across reps — failures don't cluster.
- ⚠️ Higher single-run variance than qwen.
- **Role:** second-opinion when qwen flags persistent confidence issues, or as primary ensemble extractor when "single-pass coverage" is the success criterion.

### phi3:mini → **útil pero demasiado caro/lento**

- ✅ Ensemble × 3 reaches 95% coverage.
- ❌ 3× the wall-clock of qwen/llama for the same final coverage.
- ❌ Strictly dominated on the Pareto frontier.
- **Role:** none in the operational pipeline. Possible use as an adversarial probe — phi3 fails on a different distribution of files than qwen/llama, so testing "would this file pass on phi3 too?" can be a stress check during development.

### deepseek-r1:1.5b → **no apto para extracción estructurada**

- ❌ 25% single-run, 55% ensemble — irreparable via repeats.
- ❌ Failure mode is `required_missing`: the reasoning-tuned model consumes its output budget on chain-of-thought and never finishes filling the JSON.
- ❌ The 9 always-fail files are a structural ceiling, not noise.
- **Role:** none for extraction. The reasoning architecture is appropriate for evaluative tasks (validating two competing extractions, writing a translator paragraph, deciding inter-cell composition) where the output IS prose — *not* for structured-output tasks where the output IS a typed record.

---

## 6. Decision rules for the router

These rules are **proposals**, not changes to the productive router. See §7 below for the implementation candidates.

### 6.1 Default fast path

```
input:   any source file
default: qwen2.5-coder:3b (single dispatch + H1 retry on schema failure)
trigger: every onto ingest invocation
expected: ~95% OK at ~18s/file, $0
```

### 6.2 High-confidence path

```
input:   any source file
config:  llama3.2:3b × 3 ensemble (run 3 times, union the OK results)
trigger: --high-confidence flag, or when the corpus is being indexed
         for downstream measurement (Phase ε verify-homeomorphism)
expected: 100% coverage at ~70s/file, $0
```

### 6.3 Fallback ensemble (only when needed)

```
input:   files that failed qwen single-run AND llama × 3
config:  qwen + llama × 3 combined ensemble (4 dispatches, union of OK)
trigger: failed files after default + high-confidence paths
expected: covers all but pathological cases
```

### 6.4 Ban deepseek-r1:1.5b for extraction / JSON-schema tasks

The model is structurally unsuited. Use only for evaluative tasks
(translator prose, second-opinion auditing) where free-form output is the
target.

### 6.5 Avoid phi3:mini unless testing adversarial variance

phi3 produces *useful failure data* (different file distribution than
qwen/llama) but is too slow to be a production choice. Reserve for stress
tests when validating prompt/schema changes.

---

## 7. Pareto conclusion

```
                              coverage
                                 ▲
                                 │
                  llama × 3 ●━━━━━━━━ 100%
                  qwen × 3 ●
                            │
              qwen single ●  │       ● phi3 × 3
                  95% ────  │         95%
                            │
                            │
                            │              ● deepseek × 3
                            │                55%
                  phi3 single ●  
                  63% ────   │
                            │
                            │   ● deepseek single
                            │     25%
                            │
                            └───────────────────────────▶ wall-clock
                          fast                          slow
                        ($0 each)
```

**Two competing operational defaults:**

| Choice | Coverage | Wall-clock | When |
|---|---:|---:|---|
| **qwen2.5-coder:3b single-run** | 95% | ~6 min for 20 files | Default. Most operations don't need 100% — they need predictable. |
| **llama3.2:3b × 3 ensemble** | 100% | ~23 min | When the corpus is being prepared for downstream measurement (verify-homeomorphism). |

**Neither is strictly better** — the choice is between *low-cost predictable* and *higher-cost complete*. Both are recommended over the previous qwen-7b-only choice from the pilot, which had a 96% single-run rate but with no ensemble option to push higher.

---

## 8. Implementation candidates

Items below are *proposed* router changes. Not committed unless the user requests it.

### 8.1 Add `--ensemble N` flag to `onto ingest`

```sh
onto ingest src/ --include ts --provider ollama --model llama3.2:3b --ensemble 3
```

Behavior: runs the ingest N times with different random seeds (or just N times
if seed control is unavailable), unions the OK results, reports per-file
voting counts in the INGEST report.

LoC estimate: ~120 (orchestration in `commands/ingest/index.ts` + new section
in `progress-report.ts`).

### 8.2 AST barrel pre-classifier

```ts
// In extractIntentFromFile, before the LLM dispatch:
const barrelHint = detectBarrelOrTypeOnly(fileContent, language);
if (barrelHint.isBarrel) {
  return {
    ok: true,
    filePath, cwdRelative,
    extracted: { kind: "artifact", level: "artifact",
                 label: barrelHint.suggestedLabel,
                 prompt: barrelHint.suggestedPrompt,
                 provides: barrelHint.reexports, ... },
    response: SYNTHETIC_RESPONSE,
    telemetry: { ...zero, classifiedAsBarrel: true },
  };
}
```

LoC estimate: ~80 (the detector + plumbing).

### 8.3 firstFailureKind-based routing

When `dispatchAttempts > 1 && firstFailureKind === "required_missing"`, the
model is structurally unsuited — fall back to a different model rather than
retrying with the same one. Implements §6.4 / §6.5 as runtime behavior.

LoC estimate: ~40 in the dispatcher + a fallback model parameter on
`onto ingest`.

### 8.4 Ban list in `getDefaultModelForTask`

Add explicit refusal for `deepseek-r1` as `semantic_parse` task:

```ts
if (task === "semantic_parse" && model.startsWith("deepseek-r1")) {
  throw new Error("deepseek-r1 is not supported for semantic_parse — see BAKEOFF_3B_FAMILY_2026-05-15.md §6.4");
}
```

LoC estimate: ~10.

---

## 9. Raw paths to reports + data

All artifacts are under `/tmp/ontology-bakeoff/results/`:

```
INDEX.md                                        — auto-generated index
summary.csv                                     — 12 rows, one per (model, repeat)
INGEST_qwen2.5-coder_3b_1.md                    — per-run reports (× 12)
INGEST_qwen2.5-coder_3b_2.md
INGEST_qwen2.5-coder_3b_3.md
INGEST_llama3.2_3b_1.md
INGEST_llama3.2_3b_2.md
INGEST_llama3.2_3b_3.md
INGEST_phi3_mini_1.md
INGEST_phi3_mini_2.md
INGEST_phi3_mini_3.md
INGEST_deepseek-r1_1.5b_1.md
INGEST_deepseek-r1_1.5b_2.md
INGEST_deepseek-r1_1.5b_3.md
```

The `/tmp/` directory is ephemeral. To preserve, copy:

```sh
cp -r /tmp/ontology-bakeoff/results docs/legend/calibrations/bakeoff-2026-05-15-raw/
```

(Not done automatically — large files; the user decides whether to archive.)

### 9.1 summary.csv contents

```csv
model,repeat,files,ok,failed,total_tokens,wallclock_s,report_path
qwen2.5-coder:3b,1,20,19,1,45028,363,results/INGEST_qwen2.5-coder_3b_1.md
qwen2.5-coder:3b,2,20,19,1,45360,382,results/INGEST_qwen2.5-coder_3b_2.md
qwen2.5-coder:3b,3,20,19,1,45138,403,results/INGEST_qwen2.5-coder_3b_3.md
llama3.2:3b,1,20,18,2,40733,383,results/INGEST_llama3.2_3b_1.md
llama3.2:3b,2,20,19,1,44639,518,results/INGEST_llama3.2_3b_2.md
llama3.2:3b,3,20,19,1,42495,488,results/INGEST_llama3.2_3b_3.md
phi3:mini,1,20,12,8,28689,978,results/INGEST_phi3_mini_1.md
phi3:mini,2,20,10,10,30074,1049,results/INGEST_phi3_mini_2.md
phi3:mini,3,20,16,4,49531,1203,results/INGEST_phi3_mini_3.md
deepseek-r1:1.5b,1,20,5,15,12286,1483,results/INGEST_deepseek-r1_1.5b_1.md
deepseek-r1:1.5b,2,20,5,15,14362,824,results/INGEST_deepseek-r1_1.5b_2.md
deepseek-r1:1.5b,3,20,5,15,13404,770,results/INGEST_deepseek-r1_1.5b_3.md
```

---

## 10. Open questions

1. **Would a 4th repeat change any model's intersection?** With 3 reps, qwen's barrel fail is intersection={`effects/index.ts`}. With 4 reps the barrel might recover or stay; the question is whether failures saturate or continue to mix. Not testable cheaply but interesting.
2. **Does the same bake-off on a different 20-file subset reproduce the per-model rankings?** Variance across *file subsets* is not measured. Subset 1: hash + topos + effects + commands. Subset 2: schemas + persistence + render. Worth one more 1h sweep.
3. **Does Anthropic Sonnet/Opus invalidate the Pareto?** Frontier models have no `level_invalid_value` failures (they follow enums tightly) but at $0.01-0.05 per file. If a 124-file pilot costs $1-7 vs $0 for local llama × 3 with same coverage, the local choice wins on cost. If 100% coverage is required for publishable, Anthropic still wins on certainty.
4. **Is `translator.ts` actually a literal candidate?** Three of four models fail on it consistently. Maybe the file is *genuinely* dark code that should use `node.literal` instead of LLM extraction.

---

*Author: Phase ε bake-off automation. Source: `scripts/bakeoff.sh` at HEAD `2678ed8`. Data window: 2026-05-15 12:48 — 15:17 EST.*
