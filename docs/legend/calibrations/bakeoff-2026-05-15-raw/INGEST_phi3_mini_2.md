# ingest report — run_3b0720f6

**Generated:** 2026-05-15T19:28:35.215Z
**Root:** `/private/tmp/ontology-bakeoff/runs/phi3_mini_2`
**Branch:** —
**Provider:** ollama · **Model:** `phi3:mini`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 20 |
| Extracted ok | 10 |
| Failed | 10 |
| Proposals created | 0 |
| Total tokens | 30,074 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 7 |
| `operational-glue` | 3 |
| `algebraic-lawful` | 3 |
| `io-bound` | 2 |
| `adapter-boundary` | 1 |

```
pure-transform    ████████████████████  7
operational-glue  █████████░░░░░░░░░░░  3
algebraic-lawful  █████████░░░░░░░░░░░  3
io-bound          ██████░░░░░░░░░░░░░░  2
adapter-boundary  ███░░░░░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  █▁▁▁▄▃▄▁▆▅▆▁▁▇█▁▁▄▁▁
               total: 30,074
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 36 |
| Files with >1 attempt | 16 |
| Files with H1 schema retry | 16 |
| Mean wall-clock per file | 52.33s |
| First-file wall-clock | 116.58s |
| Mean wall-clock after first | 48.95s |
| Warmup overhead (heuristic) | 67.63s |

```
wall-clock per file:  ▆▂▁█▁▁▁▂▃▁▂▂▂▄▃▂▁▁▂▄
                            total: 1046.6s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `level_invalid_value` | 12 |
| `kind_invalid_value` | 2 |
| `other` | 2 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/core/fs/lock.ts` | 148.41s | 2 | ✓ |
| `src/src/commands/init.ts` | 116.58s | 1 |  |
| `src/src/runtime/topos/predicate.ts` | 69.88s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | ok | 4,770 | — | 1 | 116.58s |
| `src/src/commands/runs/show.ts` | failed (schema_failed) | — | — | 2 | 41.77s |
| `src/src/commands/walk.ts` | failed (schema_failed) | — | — | 2 | 33.71s |
| `src/src/core/fs/lock.ts` | failed (schema_failed) | — | — | 2 | 148.41s |
| `src/src/core/integrity/hash.ts` | ok | 2,055 | — | 1 | 31.82s |
| `src/src/core/state/state-store.ts` | ok | 1,608 | — | 1 | 21.16s |
| `src/src/runtime/effects/index.ts` | ok | 1,798 | — | 1 | 21.41s |
| `src/src/runtime/effects/laws.ts` | failed (schema_failed) | — | — | 2 | 45.94s |
| `src/src/runtime/effects/result.ts` | ok | 3,018 | — | 2 | 60.44s |
| `src/src/runtime/graph/poset.ts` | ok | 2,724 | — | 2 | 34.05s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 3,283 | — | 2 | 48.03s |
| `src/src/runtime/legend/render-ascii.ts` | failed (schema_failed) | — | — | 2 | 48.43s |
| `src/src/runtime/legend/translator.ts` | failed (schema_failed) | — | — | 2 | 45.06s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 4,089 | — | 2 | 69.20s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 4,551 | — | 2 | 62.96s |
| `src/src/runtime/llm/ollama/adapter.ts` | failed (schema_failed) | — | — | 2 | 40.68s |
| `src/src/runtime/static/edges.ts` | failed (schema_failed) | — | — | 2 | 36.87s |
| `src/src/runtime/topos/index.ts` | ok | 2,178 | — | 2 | 30.87s |
| `src/src/runtime/topos/omega.ts` | failed (schema_failed) | — | — | 2 | 39.34s |
| `src/src/runtime/topos/predicate.ts` | failed (schema_failed) | — | — | 2 | 69.88s |
