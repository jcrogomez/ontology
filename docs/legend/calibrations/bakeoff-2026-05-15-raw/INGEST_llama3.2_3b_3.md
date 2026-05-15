# ingest report — run_23ce0414

**Generated:** 2026-05-15T18:54:43.422Z
**Root:** `/private/tmp/ontology-bakeoff/runs/llama3.2_3b_3`
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
| Total tokens | 42,495 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 13 |
| `operational-glue` | 7 |
| `algebraic-lawful` | 6 |
| `io-bound` | 4 |
| `adapter-boundary` | 2 |
| `prompt-sensitive` | 1 |

```
pure-transform    ████████████████████  13
operational-glue  ███████████░░░░░░░░░  7
algebraic-lawful  █████████░░░░░░░░░░░  6
io-bound          ██████░░░░░░░░░░░░░░  4
adapter-boundary  ███░░░░░░░░░░░░░░░░░  2
prompt-sensitive  ██░░░░░░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  ▁▄▃█▄▃▄▄▅▅▅▇▆▇█▅▄▄▅▆
               total: 42,495
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 22 |
| Files with >1 attempt | 2 |
| Files with H1 schema retry | 2 |
| Mean wall-clock per file | 24.32s |
| First-file wall-clock | 62.39s |
| Mean wall-clock after first | 22.31s |
| Warmup overhead (heuristic) | 40.08s |

```
wall-clock per file:  █▂▁▃▁▁▁▁▂▂▂▄▂▅▃▂▁▁▂▃
                             total: 486.3s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `level_invalid_value` | 1 |
| `other` | 1 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/commands/init.ts` | 62.39s | 2 | ✓ |
| `src/src/runtime/legend/vocab-gap.ts` | 38.55s | 2 | ✓ |
| `src/src/runtime/legend/render-ascii.ts` | 32.48s | 1 |  |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | failed (schema_failed) | — | — | 2 | 62.39s |
| `src/src/commands/runs/show.ts` | ok | 1,905 | — | 1 | 21.41s |
| `src/src/commands/walk.ts` | ok | 1,380 | — | 1 | 15.05s |
| `src/src/core/fs/lock.ts` | ok | 3,815 | — | 1 | 29.91s |
| `src/src/core/integrity/hash.ts` | ok | 1,708 | — | 1 | 17.53s |
| `src/src/core/state/state-store.ts` | ok | 1,359 | — | 1 | 15.96s |
| `src/src/runtime/effects/index.ts` | ok | 1,538 | — | 1 | 19.36s |
| `src/src/runtime/effects/laws.ts` | ok | 1,711 | — | 1 | 17.03s |
| `src/src/runtime/effects/result.ts` | ok | 2,180 | — | 1 | 22.82s |
| `src/src/runtime/graph/poset.ts` | ok | 2,034 | — | 1 | 20.52s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 2,373 | — | 1 | 22.38s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 2,913 | — | 1 | 32.48s |
| `src/src/runtime/legend/translator.ts` | ok | 2,838 | — | 1 | 20.09s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,272 | — | 2 | 38.55s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 3,463 | — | 1 | 25.65s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 2,035 | — | 1 | 21.32s |
| `src/src/runtime/static/edges.ts` | ok | 1,677 | — | 1 | 18.65s |
| `src/src/runtime/topos/index.ts` | ok | 1,503 | — | 1 | 13.37s |
| `src/src/runtime/topos/omega.ts` | ok | 1,957 | — | 1 | 24.08s |
| `src/src/runtime/topos/predicate.ts` | ok | 2,834 | — | 1 | 27.79s |
