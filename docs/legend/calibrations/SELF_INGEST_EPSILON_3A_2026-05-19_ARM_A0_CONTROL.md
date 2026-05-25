# verify-homeomorphism report

**Generated:** 2026-05-25T02:10:35.673Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Model override:** `qwen2.5-coder:7b`
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 6 | 5% |
| divergent_loc | 23 | 18% |
| divergent_structural | 18 | 14% |
| divergent_both | 78 | 62% |
| unrecoverable | 0 | 0% |
| **Total** | **125** | |

```
epsilon_equivalent    █░░░░░░░░░░░░░░░░░░░  6
divergent_loc         ████░░░░░░░░░░░░░░░░  23
divergent_structural  ███░░░░░░░░░░░░░░░░░  18
divergent_both        ████████████░░░░░░░░  78
unrecoverable         ░░░░░░░░░░░░░░░░░░░░  0
```

**Aggregate dispatch:**
- Input tokens: 72,104
- Output tokens: 74,855
- Total tokens: 146,959

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=125 |
| structural | `fail`=96, `partial`=23, `pass`=6 |
| behavior | `untested`=125 |
| intent | `not-reviewed`=125 |
| literalRequired | `false`=125 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.332 | 125 | 100% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | — | 0 | 0% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=125)
▄▇▄▇▇█▂▂▆▆▂▂▁▁▃▁▁▁▁▁
           0.02─0.98
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 125 |
| Nodes with any gap | 78 |
| Missing exports (G said, F skipped) | 297 |
| Unexpected exports (F invented, G silent) | 16 |

**Top missing-export keys (declared in provides, no matching export):**

| Key | Nodes |
|---|---:|
| `failWith` | 5 |
| `getOntologyPaths` | 4 |
| `loadState` | 3 |
| `loadEdges` | 3 |
| `EdgeSuggestion` | 2 |
| `ok` | 2 |
| `err` | 2 |
| `isOk` | 2 |
| `isErr` | 2 |
| `mapResult` | 2 |
| `bindResult` | 2 |
| `mapErrResult` | 2 |
| `traverseResult` | 2 |
| `sequenceResult` | 2 |
| `unwrapResult` | 2 |
| `health` | 2 |
| `listModels` | 2 |
| `generate` | 2 |
| `hashObject` | 2 |
| `writeJson` | 2 |

**Top unexpected exports (regen surfaced, no matching provides key):**

| Export | Nodes |
|---|---:|
| `EdgeTypeSchema` | 2 |
| `createProposal` | 2 |
| `errorMessage` | 2 |
| `failJson` | 2 |
| `loadNodeById` | 2 |
| `loadState` | 2 |
| `validateEdgeDirection` | 2 |
| `compileNode` | 1 |
| `ParsedTSFile` | 1 |

*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*

## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)

| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |
|---|---|---|---:|---:|---:|---:|---:|:---:|
| code_sketch | ollama | `qwen2.5-coder:7b` | 125 | 0.332 (n=125) | $0 | 577 | 599 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `not-reviewed` | 125 |
| `structural-drift` | 96 |
| `operational-glue` | 88 |
| `vocab-gap` | 78 |
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
not-reviewed           ████████████████████  125
structural-drift       ███████████████░░░░░  96
operational-glue       ██████████████░░░░░░  88
vocab-gap              ████████████░░░░░░░░  78
pure-transform         ██████░░░░░░░░░░░░░░  35
io-bound               ███░░░░░░░░░░░░░░░░░  19
algebraic-lawful       █░░░░░░░░░░░░░░░░░░░  8
schema-driven          █░░░░░░░░░░░░░░░░░░░  5
cli-parsing            ░░░░░░░░░░░░░░░░░░░░  3
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
| `node_0001` | compile/artifact-writer.ts | divergent_both | 0.632 | 0.000 | 0.184 | 928 | — |
| `node_0002` | compile/compile-node.ts | divergent_both | 0.940 | 0.200 | 0.130 | 1124 | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_both | 0.849 | 0.000 | 0.076 | 1612 | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_both | 0.856 | 0.400 | 0.272 | 766 | — |
| `node_0005` | post/extract-code-fence.ts | divergent_both | 0.469 | 0.000 | 0.265 | 1214 | — |
| `node_0006` | post/runtime-check.ts | divergent_both | 0.448 | 0.000 | 0.276 | 845 | — |
| `node_0007` | post/validate-language.ts | divergent_loc | 0.899 | 0.500 | 0.301 | 1462 | — |
| `node_0008` | compile/upstream-context.ts | divergent_both | 0.658 | 0.000 | 0.171 | 987 | — |
| `node_0009` | context/assembler.ts | divergent_loc | 0.823 | 1.000 | 0.589 | 1069 | — |
| `node_0010` | context/edge-suggester.ts | divergent_both | 0.609 | 0.000 | 0.196 | 1453 | — |
| `node_0011` | context/gluing.ts | divergent_both | 0.865 | 0.000 | 0.068 | 601 | — |
| `node_0012` | context/intent-validator.ts | divergent_both | 0.838 | 0.000 | 0.081 | 1583 | — |
| `node_0013` | context/presheaf.ts | divergent_both | 0.511 | 0.000 | 0.245 | 756 | — |
| `node_0014` | context/semantic-linker.ts | divergent_both | 0.400 | 0.000 | 0.300 | 1216 | — |
| `node_0015` | context/types.ts | epsilon_equivalent | 0.280 | 1.000 | 0.860 | 573 | — |
| `node_0016` | effects/async.ts | divergent_loc | 0.462 | 0.667 | 0.602 | 1418 | — |
| `node_0017` | effects/index.ts | divergent_loc | 0.852 | 1.000 | 0.574 | 995 | — |
| `node_0018` | effects/laws.ts | divergent_structural | 0.093 | 0.000 | 0.453 | 1349 | — |
| `node_0019` | effects/result.ts | divergent_structural | 0.084 | 0.000 | 0.458 | 2059 | — |
| `node_0020` | runtime/errors.ts | divergent_both | 0.636 | 0.000 | 0.182 | 726 | — |
| `node_0021` | fibration/branch-fiber.ts | divergent_loc | 0.641 | 1.000 | 0.679 | 1823 | — |
| `node_0022` | fibration/index.ts | epsilon_equivalent | 0.261 | 1.000 | 0.870 | 780 | — |
| `node_0023` | fibration/types.ts | divergent_loc | 0.685 | 1.000 | 0.658 | 688 | — |
| `node_0024` | graph/compile-plan.ts | divergent_loc | 0.606 | 0.714 | 0.554 | 1607 | — |
| `node_0025` | graph/edges.ts | divergent_structural | 0.121 | 0.000 | 0.439 | 1196 | — |
| `node_0026` | graph/poset.ts | divergent_both | 0.544 | 0.375 | 0.416 | 1006 | — |
| `node_0027` | graph/traversal.ts | divergent_both | 0.376 | 0.000 | 0.312 | 1519 | — |
| `node_0028` | legend/frontier-tagger.ts | divergent_both | 0.922 | 0.000 | 0.039 | 772 | — |
| `node_0029` | legend/matrix-intersections.ts | divergent_both | 0.490 | 0.000 | 0.255 | 1340 | — |
| `node_0030` | legend/matrix.ts | divergent_both | 0.948 | 0.000 | 0.026 | 1105 | — |
| `node_0031` | legend/pareto.ts | divergent_both | 0.944 | 0.333 | 0.195 | 1278 | — |
| `node_0032` | legend/progress-report.ts | divergent_both | 0.959 | 0.182 | 0.111 | 759 | — |
| `node_0033` | legend/render-ascii.ts | divergent_both | 0.446 | 0.000 | 0.277 | 1398 | — |
| `node_0034` | legend/static-summary.ts | divergent_both | 0.827 | 0.000 | 0.087 | 1198 | — |
| `node_0035` | legend/structural-classifier.ts | divergent_both | 0.701 | 0.000 | 0.149 | 2562 | — |
| `node_0036` | legend/translator.ts | divergent_loc | 0.862 | 0.600 | 0.369 | 1047 | — |
| `node_0037` | legend/verify-homeomorphism.ts | divergent_both | 0.846 | 0.286 | 0.220 | 1455 | — |
| `node_0038` | legend/vocab-gap.ts | divergent_both | 0.479 | 0.000 | 0.260 | 1958 | — |
| `node_0039` | anthropic/adapter.ts | divergent_both | 0.726 | 0.333 | 0.304 | 1280 | — |
| `node_0040` | llm/dispatcher.ts | divergent_both | 0.759 | 0.000 | 0.120 | 854 | — |
| `node_0041` | llm/mock.ts | divergent_loc | 0.610 | 1.000 | 0.695 | 989 | — |
| `node_0042` | llm/model-capabilities.ts | divergent_both | 0.959 | 0.000 | 0.021 | 583 | — |
| `node_0043` | ollama/adapter.ts | divergent_both | 0.670 | 0.000 | 0.165 | 1001 | — |
| `node_0044` | llm/registry.ts | divergent_both | 0.936 | 0.429 | 0.246 | 677 | — |
| `node_0045` | llm/resolve-node-model.ts | divergent_both | 0.515 | 0.000 | 0.242 | 675 | — |
| `node_0046` | llm/types.ts | divergent_loc | 0.527 | 1.000 | 0.736 | 848 | — |
| `node_0047` | prompt/parse.ts | divergent_both | 0.960 | 0.000 | 0.020 | 1021 | — |
| `node_0048` | prompt/types.ts | divergent_loc | 0.600 | 1.000 | 0.700 | 583 | — |
| `node_0049` | query/representable.ts | divergent_both | 0.859 | 0.000 | 0.070 | 1473 | — |
| `node_0050` | query/types.ts | divergent_structural | 0.000 | 0.000 | 0.500 | 738 | — |
| `node_0051` | static/edges.ts | divergent_both | 0.390 | 0.250 | 0.430 | 1318 | — |
| `node_0052` | static/python.ts | divergent_both | 0.726 | 0.000 | 0.137 | 1626 | — |
| `node_0053` | static/typescript.ts | divergent_both | 0.932 | 0.250 | 0.159 | 1291 | — |
| `node_0054` | topos/index.ts | divergent_loc | 0.911 | 1.000 | 0.545 | 905 | — |
| `node_0055` | topos/omega.ts | divergent_both | 0.658 | 0.000 | 0.171 | 1263 | — |
| `node_0056` | topos/predicate.ts | divergent_both | 0.453 | 0.000 | 0.273 | 1804 | — |
| `node_0057` | topos/rule-compiler.ts | divergent_both | 0.412 | 0.000 | 0.294 | 862 | — |
| `node_0058` | drafts/persist.ts | epsilon_equivalent | 0.044 | 1.000 | 0.978 | 1405 | — |
| `node_0059` | edges/create-edge.ts | divergent_structural | 0.064 | 0.000 | 0.468 | 1588 | — |
| `node_0060` | edges/remove-edge.ts | divergent_both | 0.314 | 0.143 | 0.414 | 1472 | — |
| `node_0061` | edges/update-edge.ts | divergent_loc | 0.415 | 0.500 | 0.542 | 1164 | — |
| `node_0062` | core/errors.ts | divergent_structural | 0.133 | 0.000 | 0.433 | 836 | — |
| `node_0063` | fs/json.ts | divergent_loc | 0.605 | 1.000 | 0.697 | 1073 | — |
| `node_0064` | fs/lock.ts | divergent_both | 0.592 | 0.000 | 0.204 | 1710 | — |
| `node_0065` | integrity/hash.ts | divergent_structural | 0.140 | 0.000 | 0.430 | 1019 | — |
| `node_0066` | nodes/create-node.ts | divergent_loc | 0.582 | 0.500 | 0.459 | 1534 | — |
| `node_0067` | nodes/node-id.ts | divergent_both | 0.824 | 0.000 | 0.088 | 752 | — |
| `node_0068` | nodes/remove-node.ts | divergent_both | 0.394 | 0.333 | 0.470 | 924 | — |
| `node_0069` | nodes/update-node.ts | divergent_both | 0.781 | 0.000 | 0.110 | 845 | — |
| `node_0070` | project/load.ts | divergent_structural | 0.036 | 0.000 | 0.482 | 2337 | — |
| `node_0071` | project/paths.ts | divergent_structural | 0.262 | 0.000 | 0.369 | 1037 | — |
| `node_0072` | projects/registry.ts | divergent_both | 0.487 | 0.000 | 0.256 | 1750 | — |
| `node_0073` | proposals/persist.ts | divergent_both | 0.814 | 0.000 | 0.093 | 2368 | — |
| `node_0074` | render/box.ts | divergent_loc | 0.860 | 0.667 | 0.403 | 789 | — |
| `node_0075` | render/style.ts | divergent_both | 0.538 | 0.000 | 0.231 | 1846 | — |
| `node_0076` | render/table.ts | divergent_both | 0.560 | 0.000 | 0.220 | 1156 | — |
| `node_0077` | runs/persist.ts | divergent_both | 0.429 | 0.000 | 0.285 | 1929 | — |
| `node_0078` | state/state-store.ts | divergent_loc | 0.724 | 1.000 | 0.638 | 951 | — |
| `node_0079` | branch/fiber.ts | divergent_loc | 0.938 | 0.500 | 0.281 | 516 | — |
| `node_0080` | branch/list.ts | divergent_structural | 0.041 | 0.000 | 0.480 | 1013 | — |
| `node_0081` | compile/plan.ts | divergent_both | 0.632 | 0.333 | 0.351 | 947 | — |
| `node_0082` | compile/run-batch.ts | divergent_both | 0.692 | 0.000 | 0.154 | 1219 | — |
| `node_0083` | compile/run.ts | divergent_both | 0.778 | 0.000 | 0.111 | 1205 | — |
| `node_0084` | context/assemble.ts | divergent_both | 0.853 | 0.000 | 0.073 | 1156 | — |
| `node_0085` | commands/doctor.ts | divergent_both | 0.594 | 0.000 | 0.203 | 836 | — |
| `node_0086` | edge/remove.ts | divergent_both | 0.659 | 0.000 | 0.171 | 536 | — |
| `node_0087` | edge/update.ts | divergent_both | 0.390 | 0.000 | 0.305 | 1079 | — |
| `node_0088` | frontier/index.ts | divergent_both | 0.770 | 0.200 | 0.215 | 825 | — |
| `node_0089` | graph/infer-edges.ts | divergent_both | 0.859 | 0.000 | 0.071 | 1418 | — |
| `node_0090` | graph/neighbors.ts | divergent_both | 0.512 | 0.000 | 0.244 | 826 | — |
| `node_0091` | graph/path.ts | divergent_both | 0.596 | 0.000 | 0.202 | 746 | — |
| `node_0092` | graph/subgraph.ts | divergent_structural | 0.228 | 0.000 | 0.386 | 1220 | — |
| `node_0093` | ingest/cost-estimate.ts | divergent_both | 0.611 | 0.000 | 0.195 | 1936 | — |
| `node_0095` | ingest/static-classifier-policy.ts | divergent_both | 0.571 | 0.400 | 0.414 | 924 | — |
| `node_0096` | commands/init.ts | divergent_both | 0.960 | 0.000 | 0.020 | 1749 | — |
| `node_0097` | commands/inspect.ts | divergent_structural | 0.083 | 0.000 | 0.459 | 1914 | — |
| `node_0098` | link/index.ts | divergent_loc | 0.927 | 0.500 | 0.286 | 754 | — |
| `node_0099` | model/doctor.ts | divergent_both | 0.509 | 0.000 | 0.246 | 911 | — |
| `node_0100` | model/list.ts | divergent_structural | 0.242 | 0.000 | 0.379 | 1023 | — |
| `node_0101` | node/create.ts | divergent_both | 0.496 | 0.000 | 0.252 | 1020 | — |
| `node_0102` | node/inspect.ts | divergent_both | 0.864 | 0.143 | 0.140 | 965 | — |
| `node_0103` | node/link.ts | divergent_both | 0.440 | 0.000 | 0.280 | 1056 | — |
| `node_0104` | node/list.ts | divergent_loc | 0.359 | 1.000 | 0.821 | 959 | — |
| `node_0105` | node/remove.ts | divergent_structural | 0.164 | 0.000 | 0.418 | 867 | — |
| `node_0106` | node/show.ts | epsilon_equivalent | 0.224 | 1.000 | 0.888 | 1224 | — |
| `node_0107` | commands/open.tsx | divergent_both | 0.815 | 0.000 | 0.092 | 916 | — |
| `node_0108` | projects/forget.ts | epsilon_equivalent | 0.041 | 0.500 | 0.730 | 1084 | — |
| `node_0109` | projects/list.ts | divergent_structural | 0.020 | 0.000 | 0.490 | 910 | — |
| `node_0110` | proposal/apply.ts | divergent_both | 0.540 | 0.000 | 0.230 | 755 | — |
| `node_0111` | proposal/list.ts | divergent_loc | 0.415 | 0.500 | 0.542 | 936 | — |
| `node_0112` | proposal/propose-link.ts | divergent_structural | 0.229 | 0.222 | 0.497 | 1397 | — |
| `node_0113` | proposal/propose-node.ts | divergent_loc | 0.626 | 0.500 | 0.437 | 991 | — |
| `node_0114` | proposal/reject.ts | divergent_structural | 0.074 | 0.000 | 0.463 | 1067 | — |
| `node_0115` | proposal/show.ts | divergent_both | 0.643 | 0.000 | 0.179 | 650 | — |
| `node_0116` | query/index.ts | epsilon_equivalent | 0.098 | 1.000 | 0.951 | 1103 | — |
| `node_0117` | query/run-query.ts | divergent_both | 0.596 | 0.200 | 0.302 | 1572 | — |
| `node_0118` | run/context.ts | divergent_both | 0.699 | 0.000 | 0.151 | 1645 | — |
| `node_0119` | run/prompt.ts | divergent_loc | 0.645 | 0.500 | 0.427 | 1554 | — |
| `node_0120` | runs/list.ts | divergent_both | 0.400 | 0.000 | 0.300 | 671 | — |
| `node_0121` | runs/show.ts | divergent_both | 0.319 | 0.000 | 0.341 | 1041 | — |
| `node_0122` | runs/verify.ts | divergent_structural | 0.140 | 0.000 | 0.430 | 955 | — |
| `node_0123` | commands/validate.ts | divergent_both | 0.805 | 0.000 | 0.098 | 1010 | — |
| `node_0124` | verify/homeomorphism.ts | divergent_both | 0.897 | 0.118 | 0.110 | 1702 | — |
| `node_0125` | commands/walk.ts | divergent_both | 0.366 | 0.000 | 0.317 | 1096 | — |
| `node_0126` | schemas/ontology.ts | divergent_both | 0.935 | 0.000 | 0.033 | 2557 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
