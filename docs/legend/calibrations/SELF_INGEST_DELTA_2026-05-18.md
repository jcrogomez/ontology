# verify-homeomorphism report

**Generated:** 2026-05-19T06:30:44.745Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 0 | 0% |
| divergent_loc | 2 | 2% |
| divergent_structural | 19 | 15% |
| divergent_both | 80 | 64% |
| unrecoverable | 24 | 19% |
| **Total** | **125** | |

```
epsilon_equivalent    ░░░░░░░░░░░░░░░░░░░░  0
divergent_loc         ░░░░░░░░░░░░░░░░░░░░  2
divergent_structural  ███░░░░░░░░░░░░░░░░░  19
divergent_both        █████████████░░░░░░░  80
unrecoverable         ████░░░░░░░░░░░░░░░░  24
```

**Aggregate dispatch:**
- Input tokens: 23,611
- Output tokens: 70,892
- Total tokens: 94,503

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=125 |
| structural | `fail`=99, `not-measured`=24, `partial`=2 |
| behavior | `untested`=101, `not-applicable`=24 |
| intent | `not-reviewed`=101, `needs-human`=24 |
| literalRequired | `false`=125 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.246 | 101 | 81% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | 0.500 | 24 | 19% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=101)
▄█▃▇▆█▄▇█▇▃▆▂▂▃▁▁▁▁▁
           0.01─0.69
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 125 |
| Nodes with any gap | 115 |
| Missing exports (G said, F skipped) | 488 |
| Unexpected exports (F invented, G silent) | 0 |

**Top missing-export keys (declared in provides, no matching export):**

| Key | Nodes |
|---|---:|
| `failWith` | 7 |
| `loadEdges` | 5 |
| `getOntologyPaths` | 4 |
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
| code_sketch | ollama | `mock_default` | 125 | 0.246 (n=101) | $0 | 189 | 567 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `vocab-gap` | 115 |
| `not-reviewed` | 101 |
| `structural-drift` | 99 |
| `operational-glue` | 88 |
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
vocab-gap              ████████████████████  115
not-reviewed           ██████████████████░░  101
structural-drift       █████████████████░░░  99
operational-glue       ███████████████░░░░░  88
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
| io-bound ∧ structural-drift | 14 |
| io-bound ∧ behavior-drift | 0 |
| literal-required ∧ prompt-sensitive | 0 |
| cli-parsing ∧ behavior-drift | 0 |
| schema-driven ∧ contract-equivalent | 0 |
| pure-transform ∧ behavior-equivalent | 0 |
| contract-missing ∧ not-reviewed | 0 |

## Per-node

| Node | Source | Verdict | LoC dist | Jaccard | Honesty | Tokens | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| `node_0001` | compile/artifact-writer.ts | divergent_both | 0.544 | 0.000 | 0.228 | 784 | — |
| `node_0002` | compile/compile-node.ts | divergent_both | 0.913 | 0.000 | 0.044 | 1015 | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_both | 0.597 | 0.000 | 0.202 | 1465 | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_both | 0.709 | 0.000 | 0.146 | 446 | — |
| `node_0005` | post/extract-code-fence.ts | divergent_both | 0.439 | 0.000 | 0.281 | 751 | — |
| `node_0006` | post/runtime-check.ts | divergent_both | 0.493 | 0.000 | 0.254 | 589 | — |
| `node_0007` | post/validate-language.ts | divergent_structural | 0.112 | 0.250 | 0.569 | 1260 | — |
| `node_0008` | compile/upstream-context.ts | divergent_both | 0.506 | 0.000 | 0.247 | 680 | — |
| `node_0009` | context/assembler.ts | divergent_both | 0.623 | 0.000 | 0.188 | 821 | — |
| `node_0010` | context/edge-suggester.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0010: Intent validation failed… | | | | | |
| `node_0011` | context/gluing.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0011: Intent validation failed… | | | | | |
| `node_0012` | context/intent-validator.ts | divergent_both | 0.513 | 0.000 | 0.244 | 997 | — |
| `node_0013` | context/presheaf.ts | divergent_both | 0.652 | 0.000 | 0.174 | 729 | — |
| `node_0014` | context/semantic-linker.ts | divergent_both | 0.300 | 0.000 | 0.350 | 972 | — |
| `node_0015` | context/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0015: Intent validation failed… | | | | | |
| `node_0016` | effects/async.ts | divergent_loc | 0.394 | 0.667 | 0.636 | 1092 | — |
| `node_0017` | effects/index.ts | divergent_both | 0.870 | 0.000 | 0.065 | 273 | — |
| `node_0018` | effects/laws.ts | divergent_both | 0.493 | 0.000 | 0.254 | 1605 | — |
| `node_0019` | effects/result.ts | divergent_both | 0.400 | 0.000 | 0.300 | 1597 | — |
| `node_0020` | runtime/errors.ts | divergent_structural | 0.218 | 0.000 | 0.391 | 569 | — |
| `node_0021` | fibration/branch-fiber.ts | divergent_both | 0.962 | 0.000 | 0.019 | 1397 | — |
| `node_0022` | fibration/index.ts | divergent_both | 0.609 | 0.000 | 0.196 | 248 | — |
| `node_0023` | fibration/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0023: Intent validation failed… | | | | | |
| `node_0024` | graph/compile-plan.ts | divergent_both | 0.554 | 0.000 | 0.223 | 1314 | — |
| `node_0025` | graph/edges.ts | divergent_structural | 0.227 | 0.000 | 0.387 | 1005 | — |
| `node_0026` | graph/poset.ts | divergent_both | 0.350 | 0.000 | 0.325 | 762 | — |
| `node_0027` | graph/traversal.ts | divergent_both | 0.899 | 0.000 | 0.050 | 1508 | — |
| `node_0028` | legend/frontier-tagger.ts | divergent_both | 0.716 | 0.000 | 0.142 | 1071 | — |
| `node_0029` | legend/matrix-intersections.ts | divergent_both | 0.717 | 0.000 | 0.141 | 848 | — |
| `node_0030` | legend/matrix.ts | divergent_both | 0.983 | 0.000 | 0.009 | 936 | — |
| `node_0031` | legend/pareto.ts | divergent_both | 0.869 | 0.000 | 0.066 | 1214 | — |
| `node_0032` | legend/progress-report.ts | divergent_both | 0.946 | 0.182 | 0.118 | 746 | — |
| `node_0033` | legend/render-ascii.ts | divergent_both | 0.492 | 0.000 | 0.254 | 1159 | — |
| `node_0034` | legend/static-summary.ts | divergent_both | 0.855 | 0.000 | 0.073 | 1065 | — |
| `node_0035` | legend/structural-classifier.ts | divergent_both | 0.760 | 0.000 | 0.120 | 1857 | — |
| `node_0036` | legend/translator.ts | divergent_both | 0.503 | 0.000 | 0.248 | 644 | — |
| `node_0037` | legend/verify-homeomorphism.ts | divergent_both | 0.762 | 0.000 | 0.119 | 994 | — |
| `node_0038` | legend/vocab-gap.ts | divergent_both | 0.567 | 0.000 | 0.216 | 1406 | — |
| `node_0039` | anthropic/adapter.ts | divergent_both | 0.639 | 0.000 | 0.181 | 1020 | — |
| `node_0040` | llm/dispatcher.ts | divergent_both | 0.392 | 0.000 | 0.304 | 1019 | — |
| `node_0041` | llm/mock.ts | divergent_loc | 0.625 | 1.000 | 0.688 | 705 | — |
| `node_0042` | llm/model-capabilities.ts | divergent_both | 0.863 | 0.000 | 0.068 | 494 | — |
| `node_0043` | ollama/adapter.ts | divergent_both | 0.339 | 0.000 | 0.330 | 1011 | — |
| `node_0044` | llm/registry.ts | divergent_both | 0.663 | 0.000 | 0.168 | 826 | — |
| `node_0045` | llm/resolve-node-model.ts | divergent_structural | 0.242 | 0.000 | 0.379 | 691 | — |
| `node_0046` | llm/types.ts | divergent_structural | 0.242 | 0.000 | 0.379 | 453 | — |
| `node_0047` | prompt/parse.ts | divergent_both | 0.333 | 0.000 | 0.333 | 772 | — |
| `node_0048` | prompt/types.ts | divergent_structural | 0.236 | 0.000 | 0.382 | 386 | — |
| `node_0049` | query/representable.ts | divergent_both | 0.805 | 0.000 | 0.097 | 1626 | — |
| `node_0050` | query/types.ts | divergent_both | 0.320 | 0.000 | 0.340 | 391 | — |
| `node_0051` | static/edges.ts | divergent_structural | 0.020 | 0.000 | 0.490 | 782 | — |
| `node_0052` | static/python.ts | divergent_both | 0.723 | 0.000 | 0.139 | 1404 | — |
| `node_0053` | static/typescript.ts | divergent_both | 0.923 | 0.000 | 0.039 | 1058 | — |
| `node_0054` | topos/index.ts | divergent_both | 0.875 | 0.000 | 0.063 | 290 | — |
| `node_0055` | topos/omega.ts | divergent_both | 0.315 | 0.000 | 0.342 | 929 | — |
| `node_0056` | topos/predicate.ts | divergent_both | 0.878 | 0.000 | 0.061 | 1712 | — |
| `node_0057` | topos/rule-compiler.ts | divergent_both | 0.412 | 0.000 | 0.294 | 714 | — |
| `node_0058` | drafts/persist.ts | divergent_structural | 0.133 | 0.000 | 0.433 | 1323 | — |
| `node_0059` | edges/create-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0059: Intent validation failed… | | | | | |
| `node_0060` | edges/remove-edge.ts | divergent_both | 0.314 | 0.000 | 0.343 | 1124 | — |
| `node_0061` | edges/update-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0061: Intent validation failed… | | | | | |
| `node_0062` | core/errors.ts | divergent_structural | 0.000 | 0.000 | 0.500 | 164 | — |
| `node_0063` | fs/json.ts | divergent_structural | 0.204 | 0.000 | 0.398 | 985 | — |
| `node_0064` | fs/lock.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0064: Intent validation failed… | | | | | |
| `node_0065` | integrity/hash.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0065: Intent validation failed… | | | | | |
| `node_0066` | nodes/create-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0066: Intent validation failed… | | | | | |
| `node_0067` | nodes/node-id.ts | divergent_both | 0.333 | 0.000 | 0.333 | 270 | — |
| `node_0068` | nodes/remove-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0068: Intent validation failed… | | | | | |
| `node_0069` | nodes/update-node.ts | divergent_both | 0.406 | 0.000 | 0.297 | 1041 | — |
| `node_0070` | project/load.ts | divergent_both | 0.766 | 0.000 | 0.117 | 935 | — |
| `node_0071` | project/paths.ts | divergent_both | 0.324 | 0.000 | 0.338 | 778 | — |
| `node_0072` | projects/registry.ts | divergent_both | 0.580 | 0.000 | 0.210 | 994 | — |
| `node_0073` | proposals/persist.ts | divergent_both | 0.810 | 0.000 | 0.095 | 1716 | — |
| `node_0074` | render/box.ts | divergent_both | 0.594 | 0.000 | 0.203 | 928 | — |
| `node_0075` | render/style.ts | divergent_both | 0.518 | 0.000 | 0.241 | 1530 | — |
| `node_0076` | render/table.ts | divergent_both | 0.353 | 0.000 | 0.323 | 881 | — |
| `node_0077` | runs/persist.ts | divergent_both | 0.415 | 0.000 | 0.293 | 1276 | — |
| `node_0078` | state/state-store.ts | divergent_both | 0.672 | 0.000 | 0.164 | 922 | — |
| `node_0079` | branch/fiber.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0079: Intent validation failed… | | | | | |
| `node_0080` | branch/list.ts | divergent_structural | 0.021 | 0.000 | 0.490 | 572 | — |
| `node_0081` | compile/plan.ts | divergent_both | 0.432 | 0.000 | 0.284 | 882 | — |
| `node_0082` | compile/run-batch.ts | divergent_both | 0.817 | 0.000 | 0.092 | 842 | — |
| `node_0083` | compile/run.ts | divergent_both | 0.752 | 0.000 | 0.124 | 902 | — |
| `node_0084` | context/assemble.ts | divergent_structural | 0.027 | 0.000 | 0.487 | 950 | — |
| `node_0085` | commands/doctor.ts | divergent_both | 0.453 | 0.000 | 0.274 | 482 | — |
| `node_0086` | edge/remove.ts | divergent_both | 0.439 | 0.000 | 0.280 | 595 | — |
| `node_0087` | edge/update.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0087: Intent validation failed… | | | | | |
| `node_0088` | frontier/index.ts | divergent_both | 0.599 | 0.000 | 0.200 | 817 | — |
| `node_0089` | graph/infer-edges.ts | divergent_both | 0.708 | 0.000 | 0.146 | 942 | — |
| `node_0090` | graph/neighbors.ts | divergent_both | 0.417 | 0.000 | 0.292 | 730 | — |
| `node_0091` | graph/path.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0091: Intent validation failed… | | | | | |
| `node_0092` | graph/subgraph.ts | divergent_structural | 0.253 | 0.000 | 0.373 | 1093 | — |
| `node_0093` | ingest/cost-estimate.ts | divergent_both | 0.713 | 0.000 | 0.144 | 1255 | — |
| `node_0095` | ingest/static-classifier-policy.ts | divergent_both | 0.701 | 0.000 | 0.149 | 627 | — |
| `node_0096` | commands/init.ts | divergent_both | 0.978 | 0.000 | 0.011 | 1209 | — |
| `node_0097` | commands/inspect.ts | divergent_structural | 0.098 | 0.000 | 0.451 | 1333 | — |
| `node_0098` | link/index.ts | divergent_both | 0.855 | 0.000 | 0.073 | 680 | — |
| `node_0099` | model/doctor.ts | divergent_both | 0.750 | 0.000 | 0.125 | 557 | — |
| `node_0100` | model/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0100: Intent validation failed… | | | | | |
| `node_0101` | node/create.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0101: Intent validation failed… | | | | | |
| `node_0102` | node/inspect.ts | divergent_both | 0.625 | 0.000 | 0.188 | 1192 | — |
| `node_0103` | node/link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0103: Intent validation failed… | | | | | |
| `node_0104` | node/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0104: Intent validation failed… | | | | | |
| `node_0105` | node/remove.ts | divergent_structural | 0.103 | 0.000 | 0.449 | 663 | — |
| `node_0106` | node/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0106: Intent validation failed… | | | | | |
| `node_0107` | commands/open.tsx | divergent_both | 0.641 | 0.000 | 0.179 | 1163 | — |
| `node_0108` | projects/forget.ts | divergent_both | 0.592 | 0.000 | 0.204 | 474 | — |
| `node_0109` | projects/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0109: Intent validation failed… | | | | | |
| `node_0110` | proposal/apply.ts | divergent_both | 0.500 | 0.000 | 0.250 | 601 | — |
| `node_0111` | proposal/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0111: Intent validation failed… | | | | | |
| `node_0112` | proposal/propose-link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0112: Intent validation failed… | | | | | |
| `node_0113` | proposal/propose-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0113: Intent validation failed… | | | | | |
| `node_0114` | proposal/reject.ts | divergent_structural | 0.045 | 0.000 | 0.477 | 828 | — |
| `node_0115` | proposal/show.ts | divergent_both | 0.390 | 0.000 | 0.305 | 530 | — |
| `node_0116` | query/index.ts | divergent_both | 0.463 | 0.000 | 0.268 | 346 | — |
| `node_0117` | query/run-query.ts | divergent_both | 0.420 | 0.000 | 0.290 | 1353 | — |
| `node_0118` | run/context.ts | divergent_both | 0.455 | 0.000 | 0.273 | 2321 | — |
| `node_0119` | run/prompt.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0119: Intent validation failed… | | | | | |
| `node_0120` | runs/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0120: Intent validation failed… | | | | | |
| `node_0121` | runs/show.ts | divergent_structural | 0.188 | 0.000 | 0.406 | 595 | — |
| `node_0122` | runs/verify.ts | divergent_structural | 0.220 | 0.000 | 0.390 | 517 | — |
| `node_0123` | commands/validate.ts | divergent_both | 0.912 | 0.000 | 0.044 | 570 | — |
| `node_0124` | verify/homeomorphism.ts | divergent_both | 0.868 | 0.000 | 0.066 | 1173 | — |
| `node_0125` | commands/walk.ts | divergent_structural | 0.212 | 0.000 | 0.394 | 536 | — |
| `node_0126` | schemas/ontology.ts | divergent_both | 0.987 | 0.000 | 0.007 | 2204 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
