# Bake-off — Phase ε E5

**Generated:** 2026-05-15T20:41:15Z
**Wall-clock total:** 8940s (149m)
**Models:** 4 · **Repeats:** 3 · **Files:** 20

## Results

| Model | Repeat | OK / Failed | Tokens | Wall | Report |
|---|---:|---|---:|---:|---|
| `qwen2.5-coder:3b` | 1 | 19 / 1 | 45028 | 363s | [link](results/INGEST_qwen2.5-coder_3b_1.md) |
| `qwen2.5-coder:3b` | 2 | 19 / 1 | 45360 | 382s | [link](results/INGEST_qwen2.5-coder_3b_2.md) |
| `qwen2.5-coder:3b` | 3 | 19 / 1 | 45138 | 403s | [link](results/INGEST_qwen2.5-coder_3b_3.md) |
| `llama3.2:3b` | 1 | 18 / 2 | 40733 | 383s | [link](results/INGEST_llama3.2_3b_1.md) |
| `llama3.2:3b` | 2 | 19 / 1 | 44639 | 518s | [link](results/INGEST_llama3.2_3b_2.md) |
| `llama3.2:3b` | 3 | 19 / 1 | 42495 | 488s | [link](results/INGEST_llama3.2_3b_3.md) |
| `phi3:mini` | 1 | 12 / 8 | 28689 | 978s | [link](results/INGEST_phi3_mini_1.md) |
| `phi3:mini` | 2 | 10 / 10 | 30074 | 1049s | [link](results/INGEST_phi3_mini_2.md) |
| `phi3:mini` | 3 | 16 / 4 | 49531 | 1203s | [link](results/INGEST_phi3_mini_3.md) |
| `deepseek-r1:1.5b` | 1 | 5 / 15 | 12286 | 1483s | [link](results/INGEST_deepseek-r1_1.5b_1.md) |
| `deepseek-r1:1.5b` | 2 | 5 / 15 | 14362 | 824s | [link](results/INGEST_deepseek-r1_1.5b_2.md) |
| `deepseek-r1:1.5b` | 3 | 5 / 15 | 13404 | 770s | [link](results/INGEST_deepseek-r1_1.5b_3.md) |

## Variance per model (across repeats)

| Model | OK rate range | Mean tokens | Note |
|---|---|---:|---|
| `qwen2.5-coder:3b` | 19 – 19 | 45175 | (stable) |
| `llama3.2:3b` | 18 – 19 | 42622 |  |
| `phi3:mini` | 10 – 16 | 36098 |  |
| `deepseek-r1:1.5b` | 5 – 5 | 13350 | (stable) |

## Files in the curated subset

| Source | Predicted bucket |
|---|---|
| `src/core/integrity/hash.ts` | pure-transform |
| `src/runtime/topos/predicate.ts` | algebraic-lawful |
| `src/runtime/topos/omega.ts` | algebraic-lawful |
| `src/runtime/effects/result.ts` | algebraic-lawful |
| `src/runtime/effects/laws.ts` | algebraic-lawful |
| `src/runtime/legend/render-ascii.ts` | pure-transform |
| `src/runtime/legend/vocab-gap.ts` | pure-transform |
| `src/runtime/legend/matrix-intersections.ts` | pure-transform |
| `src/runtime/graph/poset.ts` | pure-transform |
| `src/runtime/static/edges.ts` | pure-transform |
| `src/commands/init.ts` | cli-parsing |
| `src/commands/walk.ts` | cli-parsing |
| `src/commands/runs/show.ts` | cli-parsing |
| `src/core/fs/lock.ts` | io-bound |
| `src/core/state/state-store.ts` | io-bound |
| `src/runtime/llm/anthropic/adapter.ts` | adapter-boundary |
| `src/runtime/llm/ollama/adapter.ts` | adapter-boundary |
| `src/runtime/legend/translator.ts` | prompt-sensitive |
| `src/runtime/effects/index.ts` | barrel |
| `src/runtime/topos/index.ts` | barrel |
