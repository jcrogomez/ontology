# verify-homeomorphism report

**Generated:** 2026-05-24T13:05:51.971Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Model override:** `starcoder2:7b`
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 0 | 0% |
| divergent_loc | 0 | 0% |
| divergent_structural | 0 | 0% |
| divergent_both | 57 | 46% |
| unrecoverable | 68 | 54% |
| **Total** | **125** | |

```
epsilon_equivalent    ░░░░░░░░░░░░░░░░░░░░  0
divergent_loc         ░░░░░░░░░░░░░░░░░░░░  0
divergent_structural  ░░░░░░░░░░░░░░░░░░░░  0
divergent_both        █████████░░░░░░░░░░░  57
unrecoverable         ███████████░░░░░░░░░  68
```

**Aggregate dispatch:**
- Input tokens: 10,423
- Output tokens: 6,655
- Total tokens: 17,078

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=125 |
| structural | `not-measured`=68, `fail`=57 |
| behavior | `not-applicable`=68, `untested`=57 |
| intent | `needs-human`=68, `not-reviewed`=57 |
| literalRequired | `false`=125 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.033 | 57 | 46% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | 0.500 | 68 | 54% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=57)
█▄▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
           0.00─0.33
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 125 |
| Nodes with any gap | 117 |
| Missing exports (G said, F skipped) | 510 |
| Unexpected exports (F invented, G silent) | 0 |

**Top missing-export keys (declared in provides, no matching export):**

| Key | Nodes |
|---|---:|
| `failWith` | 7 |
| `getOntologyPaths` | 5 |
| `loadEdges` | 5 |
| `fail` | 4 |
| `ok` | 3 |
| `err` | 3 |
| `isOk` | 3 |
| `isErr` | 3 |
| `mapResult` | 3 |
| `bindResult` | 3 |
| `mapErrResult` | 3 |
| `traverseResult` | 3 |
| `sequenceResult` | 3 |
| `unwrapResult` | 3 |
| `readState` | 3 |
| `writeJson` | 3 |
| `appendJsonl` | 3 |
| `loadState` | 3 |
| `loadNodes` | 3 |
| `loadNodeById` | 3 |

*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*

## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)

| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |
|---|---|---|---:|---:|---:|---:|---:|:---:|
| code_sketch | ollama | `starcoder2:7b` | 125 | 0.033 (n=57) | $0 | 83 | 53 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `vocab-gap` | 117 |
| `operational-glue` | 88 |
| `not-reviewed` | 57 |
| `structural-drift` | 57 |
| `pure-transform` | 35 |
| `io-bound` | 19 |
| `algebraic-lawful` | 8 |
| `schema-driven` | 5 |
| `cli-parsing` | 3 |
| `declarative-validator` | 2 |
| `prompt-sensitive` | 2 |
| `adapter-boundary` | 2 |
| `human-authored` | 1 |
| `literal-required` | 1 |

```
vocab-gap              ████████████████████  117
operational-glue       ███████████████░░░░░  88
not-reviewed           ██████████░░░░░░░░░░  57
structural-drift       ██████████░░░░░░░░░░  57
pure-transform         ██████░░░░░░░░░░░░░░  35
io-bound               ███░░░░░░░░░░░░░░░░░  19
algebraic-lawful       █░░░░░░░░░░░░░░░░░░░  8
schema-driven          █░░░░░░░░░░░░░░░░░░░  5
cli-parsing            █░░░░░░░░░░░░░░░░░░░  3
declarative-validator  ░░░░░░░░░░░░░░░░░░░░  2
prompt-sensitive       ░░░░░░░░░░░░░░░░░░░░  2
adapter-boundary       ░░░░░░░░░░░░░░░░░░░░  2
human-authored         ░░░░░░░░░░░░░░░░░░░░  1
literal-required       ░░░░░░░░░░░░░░░░░░░░  1
```

## Frontier intersections (hypothesis §6 required + discovered)

| Intersection | Count |
|---|---:|
| io-bound ∧ structural-drift | 7 |
| io-bound ∧ behavior-drift | 0 |
| literal-required ∧ prompt-sensitive | 0 |
| cli-parsing ∧ behavior-drift | 0 |
| schema-driven ∧ contract-equivalent | 0 |
| pure-transform ∧ behavior-equivalent | 0 |
| contract-missing ∧ not-reviewed | 0 |

## Per-node

| Node | Source | Verdict | LoC dist | Jaccard | Honesty | Tokens | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| `node_0001` | compile/artifact-writer.ts | divergent_both | 0.892 | 0.000 | 0.054 | 543 | — |
| `node_0002` | compile/compile-node.ts | divergent_both | 0.998 | 0.000 | 0.001 | 256 | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_both | 0.906 | 0.000 | 0.047 | 986 | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_both | 0.975 | 0.000 | 0.013 | 111 | — |
| `node_0005` | post/extract-code-fence.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0005: Intent validation failed… | | | | | |
| `node_0006` | post/runtime-check.ts | divergent_both | 0.978 | 0.000 | 0.011 | 129 | — |
| `node_0007` | post/validate-language.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0007: Intent validation failed… | | | | | |
| `node_0008` | compile/upstream-context.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0008: Intent validation failed… | | | | | |
| `node_0009` | context/assembler.ts | divergent_both | 0.991 | 0.000 | 0.004 | 237 | — |
| `node_0010` | context/edge-suggester.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0010: Intent validation failed… | | | | | |
| `node_0011` | context/gluing.ts | divergent_both | 0.985 | 0.000 | 0.008 | 106 | — |
| `node_0012` | context/intent-validator.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0012: Intent validation failed… | | | | | |
| `node_0013` | context/presheaf.ts | divergent_both | 0.913 | 0.000 | 0.043 | 125 | — |
| `node_0014` | context/semantic-linker.ts | divergent_both | 0.986 | 0.000 | 0.007 | 328 | — |
| `node_0015` | context/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0015: Intent validation failed… | | | | | |
| `node_0016` | effects/async.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0016: Intent validation failed… | | | | | |
| `node_0017` | effects/index.ts | divergent_both | 0.963 | 0.000 | 0.019 | 226 | — |
| `node_0018` | effects/laws.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0018: Intent validation failed… | | | | | |
| `node_0019` | effects/result.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0019: Intent validation failed… | | | | | |
| `node_0020` | runtime/errors.ts | divergent_both | 0.964 | 0.000 | 0.018 | 240 | — |
| `node_0021` | fibration/branch-fiber.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0021: Intent validation failed… | | | | | |
| `node_0022` | fibration/index.ts | divergent_both | 0.435 | 0.000 | 0.283 | 295 | — |
| `node_0023` | fibration/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0023: Intent validation failed… | | | | | |
| `node_0024` | graph/compile-plan.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0024: Intent validation failed… | | | | | |
| `node_0025` | graph/edges.ts | divergent_both | 0.948 | 0.000 | 0.026 | 241 | — |
| `node_0026` | graph/poset.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0026: Intent validation failed… | | | | | |
| `node_0027` | graph/traversal.ts | divergent_both | 0.958 | 0.000 | 0.021 | 296 | — |
| `node_0028` | legend/frontier-tagger.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0028: Intent validation failed… | | | | | |
| `node_0029` | legend/matrix-intersections.ts | divergent_both | 0.972 | 0.000 | 0.014 | 272 | — |
| `node_0030` | legend/matrix.ts | divergent_both | 0.996 | 0.000 | 0.002 | 180 | — |
| `node_0031` | legend/pareto.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0031: Intent validation failed… | | | | | |
| `node_0032` | legend/progress-report.ts | divergent_both | 0.996 | 0.000 | 0.002 | 211 | — |
| `node_0033` | legend/render-ascii.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0033: Intent validation failed… | | | | | |
| `node_0034` | legend/static-summary.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0034: Intent validation failed… | | | | | |
| `node_0035` | legend/structural-classifier.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0035: Intent validation failed… | | | | | |
| `node_0036` | legend/translator.ts | divergent_both | 0.987 | 0.000 | 0.006 | 147 | — |
| `node_0037` | legend/verify-homeomorphism.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0037: Intent validation failed… | | | | | |
| `node_0038` | legend/vocab-gap.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0038: Intent validation failed… | | | | | |
| `node_0039` | anthropic/adapter.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0039: Intent validation failed… | | | | | |
| `node_0040` | llm/dispatcher.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0040: Intent validation failed… | | | | | |
| `node_0041` | llm/mock.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0041: Intent validation failed… | | | | | |
| `node_0042` | llm/model-capabilities.ts | divergent_both | 0.977 | 0.000 | 0.011 | 318 | — |
| `node_0043` | ollama/adapter.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0043: Intent validation failed… | | | | | |
| `node_0044` | llm/registry.ts | divergent_both | 0.975 | 0.000 | 0.012 | 325 | — |
| `node_0045` | llm/resolve-node-model.ts | divergent_both | 0.939 | 0.000 | 0.030 | 526 | — |
| `node_0046` | llm/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0046: Intent validation failed… | | | | | |
| `node_0047` | prompt/parse.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0047: Intent validation failed… | | | | | |
| `node_0048` | prompt/types.ts | divergent_both | 0.909 | 0.000 | 0.045 | 336 | — |
| `node_0049` | query/representable.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0049: Intent validation failed… | | | | | |
| `node_0050` | query/types.ts | divergent_both | 0.940 | 0.000 | 0.030 | 157 | — |
| `node_0051` | static/edges.ts | divergent_both | 0.960 | 0.000 | 0.020 | 146 | — |
| `node_0052` | static/python.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0052: Intent validation failed… | | | | | |
| `node_0053` | static/typescript.ts | divergent_both | 0.989 | 0.000 | 0.005 | 298 | — |
| `node_0054` | topos/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0054: Intent validation failed… | | | | | |
| `node_0055` | topos/omega.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0055: Intent validation failed… | | | | | |
| `node_0056` | topos/predicate.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0056: Intent validation failed… | | | | | |
| `node_0057` | topos/rule-compiler.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0057: Intent validation failed… | | | | | |
| `node_0058` | drafts/persist.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0058: Intent validation failed… | | | | | |
| `node_0059` | edges/create-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0059: Intent validation failed… | | | | | |
| `node_0060` | edges/remove-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0060: Intent validation failed… | | | | | |
| `node_0061` | edges/update-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0061: Intent validation failed… | | | | | |
| `node_0062` | core/errors.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0062: Intent validation failed… | | | | | |
| `node_0063` | fs/json.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0063: Intent validation failed… | | | | | |
| `node_0064` | fs/lock.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0064: Intent validation failed… | | | | | |
| `node_0065` | integrity/hash.ts | divergent_both | 0.965 | 0.000 | 0.018 | 344 | — |
| `node_0066` | nodes/create-node.ts | divergent_both | 0.960 | 0.000 | 0.020 | 378 | — |
| `node_0067` | nodes/node-id.ts | divergent_both | 0.333 | 0.000 | 0.333 | 65 | — |
| `node_0068` | nodes/remove-node.ts | divergent_both | 0.947 | 0.000 | 0.027 | 195 | — |
| `node_0069` | nodes/update-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0069: Intent validation failed… | | | | | |
| `node_0070` | project/load.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0070: Intent validation failed… | | | | | |
| `node_0071` | project/paths.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0071: Intent validation failed… | | | | | |
| `node_0072` | projects/registry.ts | divergent_both | 0.990 | 0.000 | 0.005 | 415 | — |
| `node_0073` | proposals/persist.ts | divergent_both | 0.997 | 0.000 | 0.001 | 723 | — |
| `node_0074` | render/box.ts | divergent_both | 0.951 | 0.000 | 0.024 | 387 | — |
| `node_0075` | render/style.ts | divergent_both | 0.992 | 0.000 | 0.004 | 521 | — |
| `node_0076` | render/table.ts | divergent_both | 0.966 | 0.000 | 0.017 | 307 | — |
| `node_0077` | runs/persist.ts | divergent_both | 0.990 | 0.000 | 0.005 | 396 | — |
| `node_0078` | state/state-store.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0078: Intent validation failed… | | | | | |
| `node_0079` | branch/fiber.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0079: Intent validation failed… | | | | | |
| `node_0080` | branch/list.ts | divergent_both | 0.894 | 0.000 | 0.053 | 273 | — |
| `node_0081` | compile/plan.ts | divergent_both | 0.863 | 0.000 | 0.068 | 167 | — |
| `node_0082` | compile/run-batch.ts | divergent_both | 0.993 | 0.000 | 0.003 | 224 | — |
| `node_0083` | compile/run.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0083: Intent validation failed… | | | | | |
| `node_0084` | context/assemble.ts | divergent_both | 0.973 | 0.000 | 0.013 | 115 | — |
| `node_0085` | commands/doctor.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0085: Intent validation failed… | | | | | |
| `node_0086` | edge/remove.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0086: Intent validation failed… | | | | | |
| `node_0087` | edge/update.ts | divergent_both | 0.864 | 0.000 | 0.068 | 211 | — |
| `node_0088` | frontier/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0088: Intent validation failed… | | | | | |
| `node_0089` | graph/infer-edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0089: Intent validation failed… | | | | | |
| `node_0090` | graph/neighbors.ts | divergent_both | 0.976 | 0.000 | 0.012 | 164 | — |
| `node_0091` | graph/path.ts | divergent_both | 0.919 | 0.000 | 0.040 | 182 | — |
| `node_0092` | graph/subgraph.ts | divergent_both | 0.987 | 0.000 | 0.006 | 135 | — |
| `node_0093` | ingest/cost-estimate.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0093: Intent validation failed… | | | | | |
| `node_0095` | ingest/static-classifier-policy.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0095: Intent validation failed… | | | | | |
| `node_0096` | commands/init.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0096: Intent validation failed… | | | | | |
| `node_0097` | commands/inspect.ts | divergent_both | 0.967 | 0.000 | 0.016 | 442 | — |
| `node_0098` | link/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0098: Intent validation failed… | | | | | |
| `node_0099` | model/doctor.ts | divergent_both | 0.974 | 0.000 | 0.013 | 166 | — |
| `node_0100` | model/list.ts | divergent_both | 0.968 | 0.000 | 0.016 | 97 | — |
| `node_0101` | node/create.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0101: Intent validation failed… | | | | | |
| `node_0102` | node/inspect.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0102: Intent validation failed… | | | | | |
| `node_0103` | node/link.ts | divergent_both | 0.980 | 0.000 | 0.010 | 223 | — |
| `node_0104` | node/list.ts | divergent_both | 0.846 | 0.000 | 0.077 | 149 | — |
| `node_0105` | node/remove.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0105: Intent validation failed… | | | | | |
| `node_0106` | node/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0106: Intent validation failed… | | | | | |
| `node_0107` | commands/open.tsx | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0107: Intent validation failed… | | | | | |
| `node_0108` | projects/forget.ts | divergent_both | 0.878 | 0.000 | 0.061 | 160 | — |
| `node_0109` | projects/list.ts | divergent_both | 0.898 | 0.000 | 0.051 | 211 | — |
| `node_0110` | proposal/apply.ts | divergent_both | 0.970 | 0.000 | 0.015 | 228 | — |
| `node_0111` | proposal/list.ts | divergent_both | 0.887 | 0.000 | 0.057 | 168 | — |
| `node_0112` | proposal/propose-link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0112: Intent validation failed… | | | | | |
| `node_0113` | proposal/propose-node.ts | divergent_both | 0.957 | 0.000 | 0.022 | 198 | — |
| `node_0114` | proposal/reject.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0114: Intent validation failed… | | | | | |
| `node_0115` | proposal/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0115: Intent validation failed… | | | | | |
| `node_0116` | query/index.ts | divergent_both | 0.927 | 0.000 | 0.037 | 193 | — |
| `node_0117` | query/run-query.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0117: Intent validation failed… | | | | | |
| `node_0118` | run/context.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0118: Intent validation failed… | | | | | |
| `node_0119` | run/prompt.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0119: Intent validation failed… | | | | | |
| `node_0120` | runs/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0120: Intent validation failed… | | | | | |
| `node_0121` | runs/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0121: Intent validation failed… | | | | | |
| `node_0122` | runs/verify.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0122: Intent validation failed… | | | | | |
| `node_0123` | commands/validate.ts | divergent_both | 0.976 | 0.000 | 0.012 | 157 | — |
| `node_0124` | verify/homeomorphism.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0124: Intent validation failed… | | | | | |
| `node_0125` | commands/walk.ts | divergent_both | 0.923 | 0.000 | 0.038 | 114 | — |
| `node_0126` | schemas/ontology.ts | divergent_both | 0.957 | 0.000 | 0.021 | 2335 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
