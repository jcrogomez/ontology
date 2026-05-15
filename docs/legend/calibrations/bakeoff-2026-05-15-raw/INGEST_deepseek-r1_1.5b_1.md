# ingest report — run_62cea963

**Generated:** 2026-05-15T20:14:37.633Z
**Root:** `/private/tmp/ontology-bakeoff/runs/deepseek-r1_1.5b_1`
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
| Total tokens | 12,286 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `pure-transform` | 5 |
| `algebraic-lawful` | 2 |

```
pure-transform    ████████████████████  5
algebraic-lawful  ████████░░░░░░░░░░░░  2
```

## Token usage per file (in order)

```
tokens  ▁▁▁▁▁▁▁▆▁▁▆▁▁█▁▁▅▅▁▁
               total: 12,286
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 35 |
| Files with >1 attempt | 15 |
| Files with H1 schema retry | 15 |
| Mean wall-clock per file | 70.60s |
| First-file wall-clock | 140.69s |
| Mean wall-clock after first | 66.91s |
| Warmup overhead (heuristic) | 73.78s |

```
wall-clock per file:  ▅▅▄▃▂▃▂▁▂▄▁▂▂▁▂▂▁▁█▁
                            total: 1412.0s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `required_missing` | 6 |
| `other` | 3 |
| `level_invalid_value` | 3 |
| `kind_invalid_value` | 3 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/src/runtime/topos/omega.ts` | 223.42s | 2 | ✓ |
| `src/src/commands/init.ts` | 140.69s | 2 | ✓ |
| `src/src/commands/runs/show.ts` | 125.74s | 2 | ✓ |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/src/commands/init.ts` | failed (schema_failed) | — | — | 2 | 140.69s |
| `src/src/commands/runs/show.ts` | failed (schema_failed) | — | — | 2 | 125.74s |
| `src/src/commands/walk.ts` | failed (schema_failed) | — | — | 2 | 99.86s |
| `src/src/core/fs/lock.ts` | failed (schema_failed) | — | — | 2 | 81.99s |
| `src/src/core/integrity/hash.ts` | failed (schema_failed) | — | — | 2 | 65.58s |
| `src/src/core/state/state-store.ts` | failed (schema_failed) | — | — | 2 | 86.69s |
| `src/src/runtime/effects/index.ts` | failed (schema_failed) | — | — | 2 | 66.98s |
| `src/src/runtime/effects/laws.ts` | ok | 2,188 | — | 1 | 26.52s |
| `src/src/runtime/effects/result.ts` | failed (schema_failed) | — | — | 2 | 61.12s |
| `src/src/runtime/graph/poset.ts` | failed (schema_failed) | — | — | 2 | 95.07s |
| `src/src/runtime/legend/matrix-intersections.ts` | ok | 2,556 | — | 1 | 15.57s |
| `src/src/runtime/legend/render-ascii.ts` | failed (schema_failed) | — | — | 2 | 62.86s |
| `src/src/runtime/legend/translator.ts` | failed (schema_failed) | — | — | 2 | 57.95s |
| `src/src/runtime/legend/vocab-gap.ts` | ok | 3,490 | — | 1 | 28.06s |
| `src/src/runtime/llm/anthropic/adapter.ts` | failed (schema_failed) | — | — | 2 | 42.39s |
| `src/src/runtime/llm/ollama/adapter.ts` | failed (schema_failed) | — | — | 2 | 60.18s |
| `src/src/runtime/static/edges.ts` | ok | 2,168 | — | 1 | 25.56s |
| `src/src/runtime/topos/index.ts` | ok | 1,884 | — | 1 | 17.66s |
| `src/src/runtime/topos/omega.ts` | failed (schema_failed) | — | — | 2 | 223.42s |
| `src/src/runtime/topos/predicate.ts` | failed (schema_failed) | — | — | 2 | 28.15s |
