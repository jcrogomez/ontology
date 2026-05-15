# ingest report — run_7408b980

**Generated:** 2026-05-15T20:41:14.078Z
**Root:** `/private/tmp/ontology-bakeoff/runs/deepseek-r1_1.5b_3`
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
| Total tokens | 13,404 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `operational-glue` | 3 |
| `io-bound` | 2 |
| `pure-transform` | 2 |
| `adapter-boundary` | 1 |
| `algebraic-lawful` | 1 |

```
operational-glue  ████████████████████  3
io-bound          █████████████░░░░░░░  2
pure-transform    █████████████░░░░░░░  2
adapter-boundary  ███████░░░░░░░░░░░░░  1
algebraic-lawful  ███████░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  ▁▁▄▁▁▅▁▁▁▁▁▁▁█▁█▁▁▆▁
               total: 13,404
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 37 |
| Files with >1 attempt | 17 |
| Files with H1 schema retry | 17 |
| Mean wall-clock per file | 38.41s |
| First-file wall-clock | 25.40s |
| Mean wall-clock after first | 39.10s |
| Warmup overhead (heuristic) | 0.00s |

```
wall-clock per file:  ▂▃▁▃▃▃▄▃▅▄▃▅▅▃▁▆█▄▃▅
                             total: 768.3s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `level_invalid_value` | 7 |
| `required_missing` | 6 |
| `kind_invalid_value` | 3 |
| `invalid_json` | 1 |
| `other` | 1 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/static/edges.ts` | 73.21s | 2 | ✓ |
| `src/src/runtime/llm/ollama/adapter.ts` | 56.58s | 1 |  |
| `src/src/runtime/legend/translator.ts` | 45.92s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | failed (schema_failed) | — | — | 2 | 25.40s |
| `src/src/commands/runs/show.ts` | failed (schema_failed) | — | — | 2 | 36.86s |
| `src/src/commands/walk.ts` | ok | 1,776 | — | 1 | 16.41s |
| `src/src/core/fs/lock.ts` | failed (schema_failed) | — | — | 2 | 36.77s |
| `src/src/core/integrity/hash.ts` | failed (schema_failed) | — | — | 2 | 36.14s |
| `src/src/core/state/state-store.ts` | ok | 1,997 | — | 2 | 33.11s |
| `src/src/runtime/effects/index.ts` | failed (schema_failed) | — | — | 2 | 39.24s |
| `src/src/runtime/effects/laws.ts` | failed (schema_failed) | — | — | 2 | 34.13s |
| `src/src/runtime/effects/result.ts` | failed (schema_failed) | — | — | 2 | 45.85s |
| `src/src/runtime/graph/poset.ts` | failed (schema_failed) | — | — | 2 | 37.97s |
| `src/src/runtime/legend/matrix-intersections.ts` | failed (schema_failed) | — | — | 2 | 31.34s |
| `src/src/runtime/legend/render-ascii.ts` | failed (schema_failed) | — | — | 2 | 45.69s |
| `src/src/runtime/legend/translator.ts` | failed (schema_failed) | — | — | 2 | 45.92s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,622 | — | 2 | 33.84s |
| `src/src/runtime/llm/anthropic/adapter.ts` | failed (invalid_json) | — | — | 1 | 17.24s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 3,410 | — | 1 | 56.58s |
| `src/src/runtime/static/edges.ts` | failed (schema_failed) | — | — | 2 | 73.21s |
| `src/src/runtime/topos/index.ts` | failed (schema_failed) | — | — | 2 | 44.27s |
| `src/src/runtime/topos/omega.ts` | ok | 2,599 | — | 2 | 33.46s |
| `src/src/runtime/topos/predicate.ts` | failed (schema_failed) | — | — | 2 | 44.84s |
