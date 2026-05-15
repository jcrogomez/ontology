# ingest report — run_ae7bf3c5

**Generated:** 2026-05-15T19:11:03.998Z
**Root:** `/private/tmp/ontology-bakeoff/runs/phi3_mini_1`
**Branch:** —
**Provider:** ollama · **Model:** `phi3:mini`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 20 |
| Extracted ok | 12 |
| Failed | 8 |
| Proposals created | 0 |
| Total tokens | 28,689 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 8 |
| `algebraic-lawful` | 5 |
| `operational-glue` | 4 |
| `io-bound` | 2 |
| `adapter-boundary` | 1 |

```
pure-transform    ████████████████████  8
algebraic-lawful  █████████████░░░░░░░  5
operational-glue  ██████████░░░░░░░░░░  4
io-bound          █████░░░░░░░░░░░░░░░  2
adapter-boundary  ███░░░░░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  ▁▅▄▁▅▄▄▅▇▁▁█▁▁▁▆▅▁▆█
               total: 28,689
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 31 |
| Files with >1 attempt | 11 |
| Files with H1 schema retry | 11 |
| Mean wall-clock per file | 48.79s |
| First-file wall-clock | 122.87s |
| Mean wall-clock after first | 44.89s |
| Warmup overhead (heuristic) | 77.98s |

```
wall-clock per file:  █▁▁▇▁▁▁▁▃▂▄▃▃▇▆▂▁▂▃▄
                             total: 975.7s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `level_invalid_value` | 10 |
| `kind_invalid_value` | 1 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/commands/init.ts` | 122.87s | 2 | ✓ |
| `src/src/core/fs/lock.ts` | 105.39s | 2 | ✓ |
| `src/src/runtime/legend/vocab-gap.ts` | 97.48s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | failed (schema_failed) | — | — | 2 | 122.87s |
| `src/src/commands/runs/show.ts` | ok | 2,252 | — | 1 | 22.32s |
| `src/src/commands/walk.ts` | ok | 1,617 | — | 1 | 17.09s |
| `src/src/core/fs/lock.ts` | failed (schema_failed) | — | — | 2 | 105.39s |
| `src/src/core/integrity/hash.ts` | ok | 2,105 | — | 1 | 28.09s |
| `src/src/core/state/state-store.ts` | ok | 1,581 | — | 1 | 15.96s |
| `src/src/runtime/effects/index.ts` | ok | 1,789 | — | 1 | 17.52s |
| `src/src/runtime/effects/laws.ts` | ok | 2,016 | — | 1 | 19.02s |
| `src/src/runtime/effects/result.ts` | ok | 2,985 | — | 2 | 48.24s |
| `src/src/runtime/graph/poset.ts` | failed (schema_failed) | — | — | 2 | 39.29s |
| `src/src/runtime/legend/matrix-intersections.ts` | failed (schema_failed) | — | — | 2 | 56.66s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 3,462 | — | 1 | 44.52s |
| `src/src/runtime/legend/translator.ts` | failed (schema_failed) | — | — | 2 | 53.90s |
| `src/src/runtime/legend/vocab-gap.ts` | failed (schema_failed) | — | — | 2 | 97.48s |
| `src/src/runtime/llm/anthropic/adapter.ts` | failed (schema_failed) | — | — | 2 | 83.06s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 2,509 | — | 1 | 35.77s |
| `src/src/runtime/static/edges.ts` | ok | 1,979 | — | 1 | 24.72s |
| `src/src/runtime/topos/index.ts` | failed (schema_failed) | — | — | 2 | 38.26s |
| `src/src/runtime/topos/omega.ts` | ok | 2,605 | — | 2 | 46.34s |
| `src/src/runtime/topos/predicate.ts` | ok | 3,789 | — | 2 | 59.22s |
