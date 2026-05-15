# ingest report — run_d2249455

**Generated:** 2026-05-15T19:48:40.594Z
**Root:** `/private/tmp/ontology-bakeoff/runs/phi3_mini_3`
**Branch:** —
**Provider:** ollama · **Model:** `phi3:mini`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 20 |
| Extracted ok | 16 |
| Failed | 4 |
| Proposals created | 0 |
| Total tokens | 49,531 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 9 |
| `operational-glue` | 7 |
| `algebraic-lawful` | 5 |
| `io-bound` | 4 |
| `adapter-boundary` | 2 |

```
pure-transform    ████████████████████  9
operational-glue  ████████████████░░░░  7
algebraic-lawful  ███████████░░░░░░░░░  5
io-bound          █████████░░░░░░░░░░░  4
adapter-boundary  ████░░░░░░░░░░░░░░░░  2
```

## Token usage per file (in order)

```
tokens  █▅▃█▄▃▁▄▅▁▆▇▁▇█▅▁▄▅▇
               total: 49,531
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 35 |
| Files with >1 attempt | 15 |
| Files with H1 schema retry | 15 |
| Mean wall-clock per file | 60.03s |
| First-file wall-clock | 109.46s |
| Mean wall-clock after first | 57.43s |
| Warmup overhead (heuristic) | 52.03s |

```
wall-clock per file:  ▅▂▁▆▂▁▂▁▁▂▂▂▂▂▃▂▃▃▄█
                            total: 1200.7s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `level_invalid_value` | 11 |
| `kind_invalid_value` | 3 |
| `other` | 1 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/topos/predicate.ts` | 177.35s | 2 | ✓ |
| `src/src/core/fs/lock.ts` | 131.81s | 2 | ✓ |
| `src/src/commands/init.ts` | 109.46s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | ok | 4,999 | — | 2 | 109.46s |
| `src/src/commands/runs/show.ts` | ok | 2,606 | — | 2 | 49.44s |
| `src/src/commands/walk.ts` | ok | 1,629 | — | 1 | 20.53s |
| `src/src/core/fs/lock.ts` | ok | 4,934 | — | 2 | 131.81s |
| `src/src/core/integrity/hash.ts` | ok | 2,343 | — | 2 | 41.25s |
| `src/src/core/state/state-store.ts` | ok | 1,661 | — | 1 | 22.73s |
| `src/src/runtime/effects/index.ts` | failed (schema_failed) | — | — | 2 | 45.26s |
| `src/src/runtime/effects/laws.ts` | ok | 1,945 | — | 1 | 14.35s |
| `src/src/runtime/effects/result.ts` | ok | 2,703 | — | 1 | 33.17s |
| `src/src/runtime/graph/poset.ts` | failed (schema_failed) | — | — | 2 | 41.30s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 3,227 | — | 2 | 40.97s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 3,788 | — | 2 | 50.16s |
| `src/src/runtime/legend/translator.ts` | failed (schema_failed) | — | — | 2 | 47.49s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,815 | — | 1 | 51.70s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 4,555 | — | 2 | 70.35s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 2,778 | — | 2 | 45.35s |
| `src/src/runtime/static/edges.ts` | failed (schema_failed) | — | — | 2 | 59.53s |
| `src/src/runtime/topos/index.ts` | ok | 2,187 | — | 2 | 61.26s |
| `src/src/runtime/topos/omega.ts` | ok | 2,556 | — | 2 | 87.22s |
| `src/src/runtime/topos/predicate.ts` | ok | 3,805 | — | 2 | 177.35s |
