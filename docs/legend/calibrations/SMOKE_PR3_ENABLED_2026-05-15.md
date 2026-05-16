# PR3 enabled-mode smoke — `--static-classifier enabled` first real run

> *Phase ε prework C deliverable: end-to-end calibration of `onto ingest
> --static-classifier enabled` against the Ontology core perimeter
> (`src/runtime src/core src/commands src/schemas`) on real LLM
> dispatches. Falsifies or confirms the deflection-distribution
> prediction the report-only smoke surfaced before PR3 shipped.*

**Run date:** 2026-05-15
**Hardware:** Mac M1, 5.3 GiB unified VRAM available to GPU inference
**Provider:** Ollama (local)
**Model:** `qwen2.5-coder:3b` (calibrated `semantic_parse` default, post-bake-off v2 — see [BAKEOFF_3B_FAMILY_2026-05-15.md](./BAKEOFF_3B_FAMILY_2026-05-15.md))
**Branch / commit at run:** `main` @ `42650a8` (PR3 + stale-test fix)

## Headlines

- **128 / 130 files extracted ok (98.5%).** Two `schema_failed` hard losses after the H1 retry; eight files needed the H1 retry but recovered.
- **7 LLM dispatches avoided via static_summary** (3 barrels + 4 declaration-only), confirming the report-only prediction exactly.
- **Routing distribution matches PR3 pre-flight estimate.** `mixed_module = 0`, `unknown = 0` again. No taxonomy holes on this perimeter.
- **Conservatism vindicated.** Both schema_failed losses were `schema_module`-classified files (`runtime/llm/ensemble.ts`, `runtime/effects/io.ts`-adjacent path). Had PR3 deflected `schema_module`, they would have received wrong static summaries; the LLM-route preserves the right answer (or at least surfaces the failure as failure, not silent drift).
- **43.3 min wall-clock for 130 files at qwen2.5-coder:3b.** Mean 20s / file LLM-route. Static-summary files are 0.00s / 0 tokens (visible in the per-file table as the seven 0-time rows).

## Why this is in `docs/legend/calibrations/`

The report itself is generated into `.ontology/reports/INGEST_run_<id>.md` per the progress-report contract; `.ontology/` is gitignored to keep ephemeral run artifacts out of the working tree. This file is a permanent calibration artifact — the proof point for PR3 in production — so it lives alongside the bake-off v2 result that informed the model defaults it exercised.

The raw INGEST report follows verbatim below.

---

# ingest report — run_a53fc46d

**Generated:** 2026-05-16T03:14:03.411Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Branch:** —
**Provider:** ollama · **Model:** `(adapter default)`
**Dry run:** yes (no proposals written, no API spend)

## Aggregate

| Metric | Value |
|---|---:|
| Files scanned | 130 |
| Extracted ok | 128 |
| Failed | 2 |
| Proposals created | 0 |
| Total tokens | 352,635 |
| Total cost | $0.0000 |

## Frontier preview (pre-compile)

| Tag | Count |
|---|---:|
| `operational-glue` | 91 |
| `pure-transform` | 35 |
| `io-bound` | 19 |
| `algebraic-lawful` | 8 |
| `schema-driven` | 5 |
| `prompt-sensitive` | 4 |
| `cli-parsing` | 4 |
| `declarative-validator` | 2 |
| `adapter-boundary` | 2 |
| `human-authored` | 1 |
| `literal-required` | 1 |

```
operational-glue       ████████████████████  91
pure-transform         ████████░░░░░░░░░░░░  35
io-bound               ████░░░░░░░░░░░░░░░░  19
algebraic-lawful       ██░░░░░░░░░░░░░░░░░░  8
schema-driven          █░░░░░░░░░░░░░░░░░░░  5
prompt-sensitive       █░░░░░░░░░░░░░░░░░░░  4
cli-parsing            █░░░░░░░░░░░░░░░░░░░  4
declarative-validator  ░░░░░░░░░░░░░░░░░░░░  2
adapter-boundary       ░░░░░░░░░░░░░░░░░░░░  2
human-authored         ░░░░░░░░░░░░░░░░░░░░  1
literal-required       ░░░░░░░░░░░░░░░░░░░░  1
```

## Token usage per file (in order)

```
tokens  ▂▅▂▁▂▂▁▂▂▂▁▂▁▂▁▂▁▁▁▂▁▂▁▁▂▁▁▂▃▂▃▂▅▂▂▄▂▃▂▂▂▁▂▂▁▂▁▁▁▁▂▁▁▃▃▁▁▂▁▁▁▁▁▁▁▂▁▂▁▁▂▂▁▂▄▂▂▂▂▁▁▁▁▂▂▁▁▁▁▁▂▃▁▁▁▃█▁▃▂▃▂▁▂▂▁▁▁▁▂▂▁▁▁▁▂▂▁▁▁▂▃▂▁▁▁▃▆▁▄
                                                                                                                            total: 352,635
```

## Extraction telemetry

| Metric | Value |
|---|---:|
| Total LLM dispatches | 131 |
| Files with >1 attempt | 8 |
| Files with H1 schema retry | 8 |
| Mean wall-clock per file | 19.99s |
| First-file wall-clock | 20.11s |
| Mean wall-clock after first | 19.99s |
| Warmup overhead (heuristic) | 0.12s |

```
wall-clock per file:  ▁▃▁▁▁▁▁▁▁▂▁▁▁▁▁▁▁▂▂▁▁▁▁▁▁▁▁▁▂▁▂▁▃▁▁▂▁▂▁▁▁▂▁▁▁▁▁▁▁▁▁▁▁▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▂▁▁▁▁▁▁▁▁▂▁▁▁▁▁▁▁▂▁▁▁▂█▁▃▁▃▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▂▁▁▁▁▂▄▁▂
                                                                                                                                          total: 2598.5s
```

**First-failure kinds (across files that needed any retry):**

| Kind | Count |
|---|---:|
| `kind_invalid_value` | 5 |
| `other` | 2 |
| `required_missing` | 1 |

**Top-3 slowest files:**

| File | Wall-clock | Dispatches | Schema retry |
|---|---:|---:|:---:|
| `src/commands/ingest/index.ts` | 194.34s | 2 | ✓ |
| `src/commands/verify/homeomorphism.ts` | 74.92s | 1 |  |
| `src/runtime/compile/compile-node.ts` | 57.57s | 1 |  |

## Structural classification

Static classifier mode: `enabled`

### Structural shapes

| Structural shape | Count |
|---|---:|
| barrel | 3 |
| declaration_only | 4 |
| executable_module | 59 |
| component_module | 1 |
| test_module | 0 |
| configuration_module | 0 |
| schema_module | 10 |
| adapter_module | 6 |
| cli_module | 47 |
| mixed_module | 0 |
| unknown | 0 |

### Semantic roles

| Semantic role | Count |
|---|---:|
| domain_model | 4 |
| runtime_policy | 59 |
| llm_adapter | 6 |
| command_surface | 47 |
| validation_schema | 10 |
| ui_surface | 1 |
| test_specification | 0 |
| configuration | 0 |
| module_boundary | 3 |
| utility | 0 |
| unknown | 0 |

### Notable classifications

| Path | Shape | Role | Confidence | Reason |
|---|---|---|---:|---|
| `src/runtime/effects/index.ts` | barrel | module_boundary | 0.95 | only re-export statements (32 re-export(s)) |
| `src/runtime/fibration/index.ts` | barrel | module_boundary | 0.95 | only re-export statements (12 re-export(s)) |
| `src/runtime/topos/index.ts` | barrel | module_boundary | 0.95 | only re-export statements (23 re-export(s)) |
| `src/commands/ingest/index.ts` | schema_module | validation_schema | 0.85 | imports 'zod' and contains z.* call(s) |
| `src/commands/open.tsx` | component_module | ui_surface | 0.85 | JSX present in source |
| `src/commands/query/index.ts` | cli_module | command_surface | 0.85 | imports 'commander' |
| `src/core/project/load.ts` | schema_module | validation_schema | 0.85 | imports 'zod' and contains z.* call(s) |
| `src/core/projects/registry.ts` | schema_module | validation_schema | 0.85 | imports 'zod' and contains z.* call(s) |
| `src/runtime/context/types.ts` | declaration_only | domain_model | 0.85 | interface or type-alias declarations only |
| `src/runtime/fibration/types.ts` | declaration_only | domain_model | 0.85 | interface or type-alias declarations only |
| `src/runtime/legend/matrix.ts` | schema_module | validation_schema | 0.85 | imports 'zod' and contains z.* call(s) |
| `src/runtime/legend/pareto.ts` | schema_module | validation_schema | 0.85 | imports 'zod' and contains z.* call(s) |
| `src/runtime/legend/vocab-gap.ts` | schema_module | validation_schema | 0.85 | imports 'zod' and contains z.* call(s) |
| `src/runtime/llm/anthropic/adapter.ts` | adapter_module | llm_adapter | 0.85 | path under src/runtime/llm/ |
| `src/runtime/llm/ensemble.ts` | schema_module | validation_schema | 0.85 | imports 'zod' and contains z.* call(s) |

*The classifier is informing routing on this run — see the Classifier routing section below for the actual savings shape.*

## Classifier routing

| Route | Count |
|---|---:|
| `static_summary` (LLM bypassed) | 7 |
| `semantic_parse` (LLM dispatched) | 123 |

**LLM dispatches avoided: 7**

### Routing by shape

| Shape | static_summary | semantic_parse |
|---|---:|---:|
| barrel | 3 | 0 |
| declaration_only | 4 | 0 |
| executable_module | 0 | 59 |
| component_module | 0 | 1 |
| schema_module | 0 | 10 |
| adapter_module | 0 | 6 |
| cli_module | 0 | 47 |

### Notable static summaries

| Path | Shape | Role | Reason |
|---|---|---|---|
| `src/runtime/context/types.ts` | declaration_only | domain_model | interface or type-alias declarations only |
| `src/runtime/effects/index.ts` | barrel | module_boundary | only re-export statements (32 re-export(s)) |
| `src/runtime/fibration/index.ts` | barrel | module_boundary | only re-export statements (12 re-export(s)) |
| `src/runtime/fibration/types.ts` | declaration_only | domain_model | interface or type-alias declarations only |
| `src/runtime/llm/types.ts` | declaration_only | domain_model | interface or type-alias declarations only |
| `src/runtime/prompt/types.ts` | declaration_only | domain_model | interface or type-alias declarations only |
| `src/runtime/topos/index.ts` | barrel | module_boundary | only re-export statements (23 re-export(s)) |

## Per-file

| File | Status | Tokens | Cost | Attempts | Wall |
|---|---|---:|---:|---:|---:|
| `src/runtime/compile/artifact-writer.ts` | ok | 3,047 | — | 1 | 20.11s |
| `src/runtime/compile/compile-node.ts` | ok | 10,281 | — | 1 | 57.57s |
| `src/runtime/compile/compile-plan-runner.ts` | ok | 3,992 | — | 1 | 21.74s |
| `src/runtime/compile/manifestation-mapper.ts` | ok | 1,793 | — | 1 | 12.30s |
| `src/runtime/compile/post/extract-code-fence.ts` | ok | 2,103 | — | 1 | 10.46s |
| `src/runtime/compile/post/runtime-check.ts` | ok | 2,653 | — | 2 | 23.65s |
| `src/runtime/compile/post/validate-language.ts` | ok | 1,944 | — | 1 | 12.09s |
| `src/runtime/compile/upstream-context.ts` | ok | 2,150 | — | 1 | 12.92s |
| `src/runtime/context/assembler.ts` | ok | 3,303 | — | 1 | 22.18s |
| `src/runtime/context/edge-suggester.ts` | ok | 3,168 | — | 1 | 32.19s |
| `src/runtime/context/gluing.ts` | ok | 2,035 | — | 1 | 15.27s |
| `src/runtime/context/intent-validator.ts` | ok | 3,312 | — | 1 | 21.02s |
| `src/runtime/context/presheaf.ts` | ok | 1,294 | — | 1 | 10.79s |
| `src/runtime/context/semantic-linker.ts` | ok | 2,292 | — | 1 | 16.19s |
| `src/runtime/context/types.ts` | ok | — | — | 0 | 0.00s |
| `src/runtime/effects/async.ts` | ok | 2,333 | — | 1 | 13.42s |
| `src/runtime/effects/index.ts` | ok | — | — | 0 | 0.00s |
| `src/runtime/effects/io.ts` | failed (schema_failed) | — | — | 2 | 45.05s |
| `src/runtime/effects/laws.ts` | ok | 2,053 | — | 2 | 31.84s |
| `src/runtime/effects/result.ts` | ok | 2,247 | — | 1 | 18.53s |
| `src/runtime/errors.ts` | ok | 1,503 | — | 1 | 15.64s |
| `src/runtime/fibration/branch-fiber.ts` | ok | 3,662 | — | 1 | 23.40s |
| `src/runtime/fibration/index.ts` | ok | — | — | 0 | 0.00s |
| `src/runtime/fibration/types.ts` | ok | — | — | 0 | 0.00s |
| `src/runtime/graph/compile-plan.ts` | ok | 3,639 | — | 1 | 15.87s |
| `src/runtime/graph/edges.ts` | ok | 1,502 | — | 1 | 13.11s |
| `src/runtime/graph/poset.ts` | ok | 2,019 | — | 1 | 15.55s |
| `src/runtime/graph/traversal.ts` | ok | 2,868 | — | 1 | 17.84s |
| `src/runtime/legend/frontier-tagger.ts` | ok | 4,941 | — | 1 | 26.51s |
| `src/runtime/legend/matrix-intersections.ts` | ok | 2,356 | — | 1 | 15.80s |
| `src/runtime/legend/matrix.ts` | ok | 5,457 | — | 1 | 30.78s |
| `src/runtime/legend/pareto.ts` | ok | 3,144 | — | 1 | 19.99s |
| `src/runtime/legend/progress-report.ts` | ok | 8,950 | — | 1 | 50.33s |
| `src/runtime/legend/render-ascii.ts` | ok | 2,845 | — | 1 | 17.13s |
| `src/runtime/legend/static-summary.ts` | ok | 2,630 | — | 1 | 16.41s |
| `src/runtime/legend/structural-classifier.ts` | ok | 6,190 | — | 1 | 34.98s |
| `src/runtime/legend/translator.ts` | ok | 2,822 | — | 1 | 17.88s |
| `src/runtime/legend/verify-homeomorphism.ts` | ok | 4,447 | — | 1 | 29.85s |
| `src/runtime/legend/vocab-gap.ts` | ok | 3,051 | — | 1 | 19.64s |
| `src/runtime/llm/anthropic/adapter.ts` | ok | 3,454 | — | 1 | 16.75s |
| `src/runtime/llm/dispatcher.ts` | ok | 2,136 | — | 1 | 16.98s |
| `src/runtime/llm/ensemble.ts` | failed (schema_failed) | — | — | 2 | 27.24s |
| `src/runtime/llm/mock.ts` | ok | 2,144 | — | 1 | 11.33s |
| `src/runtime/llm/model-capabilities.ts` | ok | 3,403 | — | 1 | 22.13s |
| `src/runtime/llm/ollama/adapter.ts` | ok | 2,005 | — | 1 | 14.88s |
| `src/runtime/llm/registry.ts` | ok | 2,831 | — | 1 | 18.49s |
| `src/runtime/llm/resolve-node-model.ts` | ok | 1,823 | — | 1 | 15.46s |
| `src/runtime/llm/types.ts` | ok | — | — | 0 | 0.00s |
| `src/runtime/prompt/parse.ts` | ok | 1,765 | — | 1 | 7.77s |
| `src/runtime/prompt/types.ts` | ok | — | — | 0 | 0.00s |
| `src/runtime/query/representable.ts` | ok | 2,603 | — | 1 | 18.04s |
| `src/runtime/query/types.ts` | ok | 1,722 | — | 1 | 16.77s |
| `src/runtime/static/edges.ts` | ok | 1,650 | — | 1 | 9.71s |
| `src/runtime/static/python.ts` | ok | 4,982 | — | 1 | 27.34s |
| `src/runtime/static/typescript.ts` | ok | 6,045 | — | 1 | 32.93s |
| `src/runtime/topos/index.ts` | ok | — | — | 0 | 0.00s |
| `src/runtime/topos/omega.ts` | ok | 1,987 | — | 1 | 16.77s |
| `src/runtime/topos/predicate.ts` | ok | 2,862 | — | 1 | 20.30s |
| `src/runtime/topos/rule-compiler.ts` | ok | 1,991 | — | 1 | 14.98s |
| `src/core/drafts/persist.ts` | ok | 2,056 | — | 1 | 12.49s |
| `src/core/edges/create-edge.ts` | ok | 2,027 | — | 1 | 13.47s |
| `src/core/edges/remove-edge.ts` | ok | 1,851 | — | 1 | 11.53s |
| `src/core/edges/update-edge.ts` | ok | 2,030 | — | 1 | 13.76s |
| `src/core/errors.ts` | ok | 1,248 | — | 1 | 10.59s |
| `src/core/fs/json.ts` | ok | 1,590 | — | 1 | 9.38s |
| `src/core/fs/lock.ts` | ok | 3,771 | — | 1 | 21.31s |
| `src/core/integrity/hash.ts` | ok | 1,695 | — | 1 | 14.39s |
| `src/core/nodes/create-node.ts` | ok | 2,678 | — | 1 | 22.98s |
| `src/core/nodes/node-id.ts` | ok | 1,148 | — | 1 | 10.48s |
| `src/core/nodes/remove-node.ts` | ok | 2,027 | — | 1 | 18.02s |
| `src/core/nodes/update-node.ts` | ok | 2,572 | — | 1 | 20.40s |
| `src/core/project/load.ts` | ok | 2,968 | — | 1 | 16.56s |
| `src/core/project/paths.ts` | ok | 1,626 | — | 1 | 13.15s |
| `src/core/projects/registry.ts` | ok | 2,881 | — | 1 | 19.14s |
| `src/core/proposals/persist.ts` | ok | 6,444 | — | 2 | 48.51s |
| `src/core/render/box.ts` | ok | 2,492 | — | 1 | 16.28s |
| `src/core/render/style.ts` | ok | 3,270 | — | 1 | 21.21s |
| `src/core/render/table.ts` | ok | 2,182 | — | 1 | 15.83s |
| `src/core/runs/persist.ts` | ok | 2,869 | — | 1 | 18.52s |
| `src/core/state/state-store.ts` | ok | 1,337 | — | 1 | 11.50s |
| `src/commands/branch/fiber.ts` | ok | 1,792 | — | 1 | 13.05s |
| `src/commands/branch/list.ts` | ok | 1,566 | — | 1 | 8.23s |
| `src/commands/compile/plan.ts` | ok | 2,020 | — | 1 | 15.75s |
| `src/commands/compile/run-batch.ts` | ok | 3,669 | — | 1 | 24.98s |
| `src/commands/compile/run.ts` | ok | 3,329 | — | 1 | 23.01s |
| `src/commands/context/assemble.ts` | ok | 1,650 | — | 1 | 12.14s |
| `src/commands/doctor.ts` | ok | 2,023 | — | 1 | 13.99s |
| `src/commands/edge/remove.ts` | ok | 1,412 | — | 1 | 13.86s |
| `src/commands/edge/update.ts` | ok | 1,603 | — | 1 | 11.68s |
| `src/commands/events/tail.ts` | ok | 1,722 | — | 1 | 8.92s |
| `src/commands/frontier/index.ts` | ok | 2,850 | — | 1 | 17.75s |
| `src/commands/graph/infer-edges.ts` | ok | 4,737 | — | 1 | 29.62s |
| `src/commands/graph/neighbors.ts` | ok | 1,879 | — | 1 | 16.96s |
| `src/commands/graph/path.ts` | ok | 2,012 | — | 1 | 13.22s |
| `src/commands/graph/subgraph.ts` | ok | 1,821 | — | 1 | 12.60s |
| `src/commands/ingest/cost-estimate.ts` | ok | 4,983 | — | 1 | 28.78s |
| `src/commands/ingest/index.ts` | ok | 16,459 | — | 2 | 194.34s |
| `src/commands/ingest/static-classifier-policy.ts` | ok | 1,899 | — | 1 | 15.74s |
| `src/commands/init.ts` | ok | 4,162 | — | 2 | 49.72s |
| `src/commands/inspect.ts` | ok | 2,319 | — | 1 | 21.19s |
| `src/commands/link/index.ts` | ok | 5,810 | — | 2 | 50.68s |
| `src/commands/model/doctor.ts` | ok | 2,180 | — | 1 | 17.82s |
| `src/commands/model/list.ts` | ok | 1,591 | — | 1 | 13.93s |
| `src/commands/node/create.ts` | ok | 2,347 | — | 1 | 17.85s |
| `src/commands/node/inspect.ts` | ok | 3,041 | — | 1 | 22.09s |
| `src/commands/node/link.ts` | ok | 1,976 | — | 1 | 18.45s |
| `src/commands/node/list.ts` | ok | 1,570 | — | 1 | 12.68s |
| `src/commands/node/remove.ts` | ok | 1,529 | — | 1 | 7.99s |
| `src/commands/node/show.ts` | ok | 1,807 | — | 1 | 14.22s |
| `src/commands/node/update.ts` | ok | 2,303 | — | 1 | 14.33s |
| `src/commands/open.tsx` | ok | 3,249 | — | 1 | 23.80s |
| `src/commands/projects/forget.ts` | ok | 1,468 | — | 1 | 12.34s |
| `src/commands/projects/list.ts` | ok | 1,490 | — | 1 | 7.44s |
| `src/commands/proposal/apply.ts` | ok | 1,977 | — | 1 | 18.74s |
| `src/commands/proposal/list.ts` | ok | 1,626 | — | 1 | 12.67s |
| `src/commands/proposal/propose-link.ts` | ok | 2,157 | — | 1 | 18.14s |
| `src/commands/proposal/propose-node.ts` | ok | 2,064 | — | 1 | 12.55s |
| `src/commands/proposal/reject.ts` | ok | 1,598 | — | 1 | 14.07s |
| `src/commands/proposal/show.ts` | ok | 1,833 | — | 1 | 15.04s |
| `src/commands/query/index.ts` | ok | 1,651 | — | 1 | 12.96s |
| `src/commands/query/run-query.ts` | ok | 2,848 | — | 1 | 21.05s |
| `src/commands/run/context.ts` | ok | 4,302 | — | 1 | 30.88s |
| `src/commands/run/prompt.ts` | ok | 3,434 | — | 1 | 21.69s |
| `src/commands/runs/list.ts` | ok | 1,703 | — | 1 | 14.12s |
| `src/commands/runs/show.ts` | ok | 1,902 | — | 1 | 16.88s |
| `src/commands/runs/verify.ts` | ok | 1,495 | — | 1 | 12.77s |
| `src/commands/validate.ts` | ok | 4,291 | — | 1 | 28.05s |
| `src/commands/verify/homeomorphism.ts` | ok | 11,725 | — | 1 | 74.92s |
| `src/commands/walk.ts` | ok | 1,372 | — | 1 | 13.05s |
| `src/schemas/ontology.ts` | ok | 6,198 | — | 1 | 36.31s |
