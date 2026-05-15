# ingest report — run_24130aa2

**Generated:** 2026-05-15T18:37:53.803Z
**Root:** `/private/tmp/ontology-bakeoff/runs/llama3.2_3b_1`
**Branch:** —
**Provider:** ollama · **Model:** `llama3.2:3b`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 20 |
| Extracted ok | 18 |
| Failed | 2 |
| Proposals created | 0 |
| Total tokens | 40,733 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 11 |
| `operational-glue` | 7 |
| `algebraic-lawful` | 6 |
| `io-bound` | 4 |
| `adapter-boundary` | 2 |

```
pure-transform    ████████████████████  11
operational-glue  █████████████░░░░░░░  7
algebraic-lawful  ███████████░░░░░░░░░  6
io-bound          ███████░░░░░░░░░░░░░  4
adapter-boundary  ████░░░░░░░░░░░░░░░░  2
```

## Token usage per file (in order)

```
tokens  █▅▃█▄▃▄▄▅▅▁▇▁▇█▅▄▄▅▆
               total: 40,733
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 22 |
| Files with >1 attempt | 2 |
| Files with H1 schema retry | 2 |
| Mean wall-clock per file | 19.11s |
| First-file wall-clock | 28.58s |
| Mean wall-clock after first | 18.61s |
| Warmup overhead (heuristic) | 9.97s |

```
wall-clock per file:  █▅▂█▃▂▁▁▆▂▇▅█▆▆▅▃▁▄▅
                             total: 382.2s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `level_invalid_value` | 2 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/core/fs/lock.ts` | 28.96s | 1 |  |
| `src/src/commands/init.ts` | 28.58s | 1 |  |
| `src/src/runtime/legend/translator.ts` | 28.10s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | ok | 3,790 | — | 1 | 28.58s |
| `src/src/commands/runs/show.ts` | ok | 1,925 | — | 1 | 20.10s |
| `src/src/commands/walk.ts` | ok | 1,370 | — | 1 | 13.41s |
| `src/src/core/fs/lock.ts` | ok | 3,809 | — | 1 | 28.96s |
| `src/src/core/integrity/hash.ts` | ok | 1,691 | — | 1 | 16.75s |
| `src/src/core/state/state-store.ts` | ok | 1,344 | — | 1 | 12.90s |
| `src/src/runtime/effects/index.ts` | ok | 1,478 | — | 1 | 10.86s |
| `src/src/runtime/effects/laws.ts` | ok | 1,652 | — | 1 | 9.91s |
| `src/src/runtime/effects/result.ts` | ok | 2,269 | — | 1 | 22.08s |
| `src/src/runtime/graph/poset.ts` | ok | 2,046 | — | 1 | 14.33s |
| `src/src/runtime/legend/matrix-intersections.ts` | failed (schema_failed) | — | — | 2 | 26.19s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 2,874 | — | 1 | 21.71s |
| `src/src/runtime/legend/translator.ts` | failed (schema_failed) | — | — | 2 | 28.10s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,044 | — | 1 | 22.21s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 3,461 | — | 1 | 22.50s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 2,069 | — | 1 | 21.43s |
| `src/src/runtime/static/edges.ts` | ok | 1,643 | — | 1 | 14.60s |
| `src/src/runtime/topos/index.ts` | ok | 1,507 | — | 1 | 9.67s |
| `src/src/runtime/topos/omega.ts` | ok | 1,945 | — | 1 | 17.01s |
| `src/src/runtime/topos/predicate.ts` | ok | 2,816 | — | 1 | 20.86s |
