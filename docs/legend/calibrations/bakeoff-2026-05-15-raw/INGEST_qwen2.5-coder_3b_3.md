# ingest report — run_624bcd52

**Generated:** 2026-05-15T18:31:27.261Z
**Root:** `/private/tmp/ontology-bakeoff/runs/qwen2.5-coder_3b_3`
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
| Total tokens | 45,138 |
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
tokens  █▄▃█▄▃▁▄▅▅▆▆▆▇█▅▄▄▅▇
               total: 45,138
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 22 |
| Files with >1 attempt | 2 |
| Files with H1 schema retry | 2 |
| Mean wall-clock per file | 20.05s |
| First-file wall-clock | 27.84s |
| Mean wall-clock after first | 19.64s |
| Warmup overhead (heuristic) | 8.20s |

```
wall-clock per file:  ▆▂▁▆▂▁█▄▅▁▁▃▁▄▂▁▁▆▃▄
                             total: 401.1s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `kind_invalid_value` | 2 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/effects/index.ts` | 34.00s | 2 | ✓ |
| `src/src/runtime/topos/index.ts` | 28.19s | 2 | ✓ |
| `src/src/commands/init.ts` | 27.84s | 1 |  |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | ok | 3,808 | — | 1 | 27.84s |
| `src/src/commands/runs/show.ts` | ok | 1,871 | — | 1 | 16.17s |
| `src/src/commands/walk.ts` | ok | 1,391 | — | 1 | 14.44s |
| `src/src/core/fs/lock.ts` | ok | 3,800 | — | 1 | 26.55s |
| `src/src/core/integrity/hash.ts` | ok | 1,706 | — | 1 | 16.03s |
| `src/src/core/state/state-store.ts` | ok | 1,367 | — | 1 | 13.69s |
| `src/src/runtime/effects/index.ts` | failed (schema_failed) | — | — | 2 | 34.00s |
| `src/src/runtime/effects/laws.ts` | ok | 1,889 | — | 1 | 23.08s |
| `src/src/runtime/effects/result.ts` | ok | 2,329 | — | 1 | 25.03s |
| `src/src/runtime/graph/poset.ts` | ok | 2,032 | — | 1 | 13.43s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 2,381 | — | 1 | 14.33s |
| `src/src/runtime/legend/render-ascii.ts` | ok | 2,850 | — | 1 | 19.20s |
| `src/src/runtime/legend/translator.ts` | ok | 2,823 | — | 1 | 15.17s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,058 | — | 1 | 21.96s |
| `src/src/runtime/llm/anthropic/adapter.ts` | ok | 3,449 | — | 1 | 18.28s |
| `src/src/runtime/llm/ollama/adapter.ts` | ok | 1,989 | — | 1 | 14.93s |
| `src/src/runtime/static/edges.ts` | ok | 1,662 | — | 1 | 15.80s |
| `src/src/runtime/topos/index.ts` | ok | 1,868 | — | 2 | 28.19s |
| `src/src/runtime/topos/omega.ts` | ok | 2,008 | — | 1 | 20.02s |
| `src/src/runtime/topos/predicate.ts` | ok | 2,857 | — | 1 | 22.92s |
