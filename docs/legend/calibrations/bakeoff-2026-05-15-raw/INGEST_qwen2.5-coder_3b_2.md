# ingest report — run_e9f34c5d

**Generated:** 2026-05-15T18:24:43.116Z
**Root:** `/private/tmp/ontology-bakeoff/runs/qwen2.5-coder_3b_2`
**Branch:** —
**Provider:** ollama · **Model:** `qwen2.5-coder:3b`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 20 |
| Extracted ok | 19 |
| Failed | 1 |
| Proposals created | 0 |
| Total tokens | 45,360 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 12 |
| `operational-glue` | 8 |
| `algebraic-lawful` | 5 |
| `io-bound` | 4 |
| `adapter-boundary` | 2 |
| `prompt-sensitive` | 1 |

```
pure-transform    ████████████████████  12
operational-glue  █████████████░░░░░░░  8
algebraic-lawful  ████████░░░░░░░░░░░░  5
io-bound          ███████░░░░░░░░░░░░░  4
adapter-boundary  ███░░░░░░░░░░░░░░░░░  2
prompt-sensitive  ██░░░░░░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  █▄▃█▄▃▄▄▅▅▅▆▆▇█▅▄▁▅▆
               total: 45,360
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 23 |
| Files with >1 attempt | 3 |
| Files with H1 schema retry | 3 |
| Mean wall-clock per file | 19.00s |
| First-file wall-clock | 26.73s |
| Mean wall-clock after first | 18.59s |
| Warmup overhead (heuristic) | 8.14s |

```
wall-clock per file:  ▆▂▁▆▁▁█▃▃▁▁▃▁▄█▂▂▅▂▅
                             total: 379.9s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `kind_invalid_value` | 3 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/effects/index.ts` | 32.63s | 2 | ✓ |
| `src/src/runtime/llm/anthropic/adapter.ts` | 31.99s | 2 | ✓ |
| `src/src/commands/init.ts` | 26.73s | 1 |  |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | ok | 3,858 | — | 1 | 26.73s |
| `src/src/commands/runs/show.ts` | ok | 1,873 | — | 1 | 14.69s |
| `src/src/commands/walk.ts` | ok | 1,367 | — | 1 | 12.33s |
| `src/src/core/fs/lock.ts` | ok | 3,847 | — | 1 | 25.63s |
| `src/src/core/integrity/hash.ts` | ok | 1,667 | — | 1 | 12.81s |
| `src/src/core/state/state-store.ts` | ok | 1,366 | — | 1 | 12.89s |
| `src/src/runtime/effects/index.ts` | ok | 1,860 | — | 2 | 32.63s |
| `src/src/runtime/effects/laws.ts` | ok | 1,787 | — | 1 | 16.89s |
| `src/src/runtime/effects/result.ts` | ok | 2,254 | — | 1 | 19.26s |
| `src/src/runtime/graph/poset.ts` | ok | 2,019 | — | 1 | 11.63s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 2,394 | — | 1 | 13.82s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 2,860 | — | 1 | 18.42s |
| `src/src/runtime/legend/translator.ts` | ok | 2,804 | — | 1 | 12.68s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,065 | — | 1 | 20.58s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 3,819 | — | 2 | 31.99s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 2,007 | — | 1 | 15.36s |
| `src/src/runtime/static/edges.ts` | ok | 1,686 | — | 1 | 16.48s |
| `src/src/runtime/topos/index.ts` | failed (schema_failed) | — | — | 2 | 24.03s |
| `src/src/runtime/topos/omega.ts` | ok | 1,951 | — | 1 | 16.68s |
| `src/src/runtime/topos/predicate.ts` | ok | 2,876 | — | 1 | 24.39s |
