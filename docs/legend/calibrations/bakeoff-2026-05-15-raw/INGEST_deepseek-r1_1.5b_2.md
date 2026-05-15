# ingest report — run_4b7a4320

**Generated:** 2026-05-15T20:28:22.935Z
**Root:** `/private/tmp/ontology-bakeoff/runs/deepseek-r1_1.5b_2`
**Branch:** —
**Provider:** ollama · **Model:** `deepseek-r1:1.5b`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 20 |
| Extracted ok | 5 |
| Failed | 15 |
| Proposals created | 0 |
| Total tokens | 14,362 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 3 |
| `io-bound` | 2 |
| `operational-glue` | 2 |
| `algebraic-lawful` | 2 |
| `adapter-boundary` | 1 |

```
pure-transform    ████████████████████  3
io-bound          █████████████░░░░░░░  2
operational-glue  █████████████░░░░░░░  2
algebraic-lawful  █████████████░░░░░░░  2
adapter-boundary  ███████░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  ▁▁▁▁▁▅▁▁██▁▁▁▁▁▇▁▁▇▁
               total: 14,362
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 40 |
| Files with >1 attempt | 20 |
| Files with H1 schema retry | 20 |
| Mean wall-clock per file | 41.12s |
| First-file wall-clock | 36.42s |
| Mean wall-clock after first | 41.37s |
| Warmup overhead (heuristic) | 0.00s |

```
wall-clock per file:  ▂▂▂▃▂▁█▂▃▇▃▂▃▄▁▂▂▂▄▂
                             total: 822.5s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `level_invalid_value` | 7 |
| `kind_invalid_value` | 6 |
| `required_missing` | 4 |
| `other` | 3 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/effects/index.ts` | 69.36s | 2 | ✓ |
| `src/src/runtime/graph/poset.ts` | 60.43s | 2 | ✓ |
| `src/src/runtime/topos/omega.ts` | 47.21s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | failed (schema_failed) | — | — | 2 | 36.42s |
| `src/src/commands/runs/show.ts` | failed (schema_failed) | — | — | 2 | 37.90s |
| `src/src/commands/walk.ts` | failed (schema_failed) | — | — | 2 | 36.46s |
| `src/src/core/fs/lock.ts` | failed (schema_failed) | — | — | 2 | 40.58s |
| `src/src/core/integrity/hash.ts` | failed (schema_failed) | — | — | 2 | 38.68s |
| `src/src/core/state/state-store.ts` | ok | 2,055 | — | 2 | 33.71s |
| `src/src/runtime/effects/index.ts` | failed (schema_failed) | — | — | 2 | 69.36s |
| `src/src/runtime/effects/laws.ts` | failed (schema_failed) | — | — | 2 | 38.86s |
| `src/src/runtime/effects/result.ts` | ok | 3,037 | — | 2 | 39.87s |
| `src/src/runtime/graph/poset.ts` | ok | 3,462 | — | 2 | 60.43s |
| `src/src/runtime/legend/matrix-intersections.ts` | failed (schema_failed) | — | — | 2 | 41.31s |
| `src/src/runtime/legend/render-ascii.ts` | failed (schema_failed) | — | — | 2 | 37.21s |
| `src/src/runtime/legend/translator.ts` | failed (schema_failed) | — | — | 2 | 41.84s |
| `src/src/runtime/legend/vocab-gap.ts` | failed (schema_failed) | — | — | 2 | 44.34s |
| `src/src/runtime/llm/anthropic/adapter.ts` | failed (schema_failed) | — | — | 2 | 29.33s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 2,847 | — | 2 | 37.71s |
| `src/src/runtime/static/edges.ts` | failed (schema_failed) | — | — | 2 | 36.82s |
| `src/src/runtime/topos/index.ts` | failed (schema_failed) | — | — | 2 | 38.25s |
| `src/src/runtime/topos/omega.ts` | ok | 2,961 | — | 2 | 47.21s |
| `src/src/runtime/topos/predicate.ts` | failed (schema_failed) | — | — | 2 | 36.18s |
