# ingest report — run_2e95bd82

**Generated:** 2026-05-15T18:46:33.195Z
**Root:** `/private/tmp/ontology-bakeoff/runs/llama3.2_3b_2`
**Branch:** —
**Provider:** ollama · **Model:** `llama3.2:3b`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 20 |
| Extracted ok | 19 |
| Failed | 1 |
| Proposals created | 0 |
| Total tokens | 44,639 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 13 |
| `operational-glue` | 7 |
| `algebraic-lawful` | 6 |
| `io-bound` | 3 |
| `prompt-sensitive` | 1 |
| `adapter-boundary` | 1 |

```
pure-transform    ████████████████████  13
operational-glue  ███████████░░░░░░░░░  7
algebraic-lawful  █████████░░░░░░░░░░░  6
io-bound          █████░░░░░░░░░░░░░░░  3
prompt-sensitive  ██░░░░░░░░░░░░░░░░░░  1
adapter-boundary  ██░░░░░░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  █▄▃█▄▃▄▅▅▅▅▇▆▇█▁▄▄▅▆
               total: 44,639
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 24 |
| Files with >1 attempt | 4 |
| Files with H1 schema retry | 4 |
| Mean wall-clock per file | 25.80s |
| First-file wall-clock | 34.69s |
| Mean wall-clock after first | 25.33s |
| Warmup overhead (heuristic) | 9.35s |

```
wall-clock per file:  ▅▂▁▅▁▁▁▃▃▁▂▅▃██▇▂▁▃▃
                             total: 516.0s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `kind_invalid_value` | 2 |
| `level_invalid_value` | 2 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/llm/anthropic/adapter.ts` | 48.93s | 2 | ✓ |
| `src/src/runtime/legend/vocab-gap.ts` | 46.82s | 2 | ✓ |
| `src/src/runtime/llm/ollama/adapter.ts` | 44.46s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | ok | 3,798 | — | 1 | 34.69s |
| `src/src/commands/runs/show.ts` | ok | 1,852 | — | 1 | 20.22s |
| `src/src/commands/walk.ts` | ok | 1,379 | — | 1 | 16.96s |
| `src/src/core/fs/lock.ts` | ok | 3,804 | — | 1 | 33.95s |
| `src/src/core/integrity/hash.ts` | ok | 1,701 | — | 1 | 17.34s |
| `src/src/core/state/state-store.ts` | ok | 1,369 | — | 1 | 15.15s |
| `src/src/runtime/effects/index.ts` | ok | 1,472 | — | 1 | 13.48s |
| `src/src/runtime/effects/laws.ts` | ok | 2,002 | — | 2 | 25.05s |
| `src/src/runtime/effects/result.ts` | ok | 2,219 | — | 1 | 24.57s |
| `src/src/runtime/graph/poset.ts` | ok | 2,008 | — | 1 | 15.05s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 2,376 | — | 1 | 19.67s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 2,871 | — | 1 | 31.51s |
| `src/src/runtime/legend/translator.ts` | ok | 2,833 | — | 1 | 24.52s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,294 | — | 2 | 46.82s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 3,728 | — | 2 | 48.93s |
| `src/src/runtime/llm/ollama/adapter.ts` | failed (schema_failed) | — | — | 2 | 44.46s |
| `src/src/runtime/static/edges.ts` | ok | 1,653 | — | 1 | 20.48s |
| `src/src/runtime/topos/index.ts` | ok | 1,507 | — | 1 | 13.62s |
| `src/src/runtime/topos/omega.ts` | ok | 1,967 | — | 1 | 23.24s |
| `src/src/runtime/topos/predicate.ts` | ok | 2,806 | — | 1 | 26.29s |
