# ingest report — run_1324c805

**Generated:** 2026-05-15T18:18:20.131Z
**Root:** `/private/tmp/ontology-bakeoff/runs/qwen2.5-coder_3b_1`
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
| Total tokens | 45,028 |
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
tokens  █▄▃█▄▃▁▄▆▅▅▆▆▇█▅▄▄▅▇
               total: 45,028
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 22 |
| Files with >1 attempt | 2 |
| Files with H1 schema retry | 2 |
| Mean wall-clock per file | 18.07s |
| First-file wall-clock | 26.24s |
| Mean wall-clock after first | 17.64s |
| Warmup overhead (heuristic) | 8.60s |

```
wall-clock per file:  ▆▂▂▅▃▂█▃█▁▁▃▂▄▂▂▂▂▃▄
                             total: 361.3s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `kind_invalid_value` | 2 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/effects/index.ts` | 34.22s | 2 | ✓ |
| `src/src/runtime/effects/result.ts` | 31.57s | 2 | ✓ |
| `src/src/commands/init.ts` | 26.24s | 1 |  |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | ok | 3,838 | — | 1 | 26.24s |
| `src/src/commands/runs/show.ts` | ok | 1,878 | — | 1 | 14.89s |
| `src/src/commands/walk.ts` | ok | 1,384 | — | 1 | 13.19s |
| `src/src/core/fs/lock.ts` | ok | 3,811 | — | 1 | 23.48s |
| `src/src/core/integrity/hash.ts` | ok | 1,731 | — | 1 | 16.23s |
| `src/src/core/state/state-store.ts` | ok | 1,388 | — | 1 | 13.99s |
| `src/src/runtime/effects/index.ts` | failed (schema_failed) | — | — | 2 | 34.22s |
| `src/src/runtime/effects/laws.ts` | ok | 1,804 | — | 1 | 17.71s |
| `src/src/runtime/effects/result.ts` | ok | 2,547 | — | 2 | 31.57s |
| `src/src/runtime/graph/poset.ts` | ok | 1,992 | — | 1 | 10.11s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 2,339 | — | 1 | 10.70s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 2,850 | — | 1 | 17.22s |
| `src/src/runtime/legend/translator.ts` | ok | 2,844 | — | 1 | 14.89s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,079 | — | 1 | 21.09s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 3,438 | — | 1 | 15.73s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 1,986 | — | 1 | 13.77s |
| `src/src/runtime/static/edges.ts` | ok | 1,667 | — | 1 | 14.56s |
| `src/src/runtime/topos/index.ts` | ok | 1,569 | — | 1 | 13.12s |
| `src/src/runtime/topos/omega.ts` | ok | 2,004 | — | 1 | 17.57s |
| `src/src/runtime/topos/predicate.ts` | ok | 2,879 | — | 1 | 21.09s |
