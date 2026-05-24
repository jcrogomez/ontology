# verify-homeomorphism report

**Generated:** 2026-05-23T22:20:03.252Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Model override:** `qwen2.5-coder:7b`
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 12 | 10% |
| divergent_loc | 71 | 57% |
| divergent_structural | 5 | 4% |
| divergent_both | 37 | 30% |
| unrecoverable | 0 | 0% |
| **Total** | **125** | |

```
epsilon_equivalent    ██░░░░░░░░░░░░░░░░░░  12
divergent_loc         ███████████░░░░░░░░░  71
divergent_structural  █░░░░░░░░░░░░░░░░░░░  5
divergent_both        ██████░░░░░░░░░░░░░░  37
unrecoverable         ░░░░░░░░░░░░░░░░░░░░  0
```

**Aggregate dispatch:**
- Input tokens: 88,365
- Output tokens: 53,413
- Total tokens: 141,778

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=125 |
| structural | `partial`=71, `fail`=42, `pass`=12 |
| behavior | `untested`=125 |
| intent | `not-reviewed`=125 |
| literalRequired | `false`=125 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.496 | 125 | 100% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | — | 0 | 0% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=125)
▃▃▃█▃▅▆▆▄▆███▇▅▄▁▃▂▃
           0.02─1.00
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 125 |
| Nodes with any gap | 44 |
| Missing exports (G said, F skipped) | 106 |
| Unexpected exports (F invented, G silent) | 116 |

**Top missing-export keys (declared in provides, no matching export):**

| Key | Nodes |
|---|---:|
| `getOntologyPaths` | 3 |
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
| `loadEdges` | 2 |
| `registerProject` | 2 |
| `failWith` | 2 |
| `buildRefinementParentsIndex` | 1 |
| `collectUpstream` | 1 |
| `extractCodeFence` | 1 |
| `fenceInfoMatches` | 1 |
| `buildFragment` | 1 |
| `Result` | 1 |

**Top unexpected exports (regen surfaced, no matching provides key):**

| Export | Nodes |
|---|---:|
| `GluingConflict` | 2 |
| `EdgeTypeSchema` | 2 |
| `CompileNodeFailureReason` | 1 |
| `CompileNodeOptions` | 1 |
| `CompileNodeResult` | 1 |
| `RuntimeCheckOptions` | 1 |
| `RuntimeCheckResult` | 1 |
| `runtimeCheck` | 1 |
| `GluingConflictType` | 1 |
| `GluingResult` | 1 |
| `calculateScore` | 1 |
| `identifyViolations` | 1 |
| `AssembleContextOptions` | 1 |
| `AssembleContextResult` | 1 |
| `ContextFragment` | 1 |
| `ContextNode` | 1 |
| `GlueResult` | 1 |
| `SemanticLinkInput` | 1 |
| `SemanticLinkResult` | 1 |
| `ValidationResult` | 1 |

*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*

## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)

| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |
|---|---|---|---:|---:|---:|---:|---:|:---:|
| code_sketch | ollama | `qwen2.5-coder:7b` | 125 | 0.496 (n=125) | $0 | 707 | 427 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `not-reviewed` | 125 |
| `operational-glue` | 88 |
| `vocab-gap` | 44 |
| `structural-drift` | 42 |
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
operational-glue       ██████████████░░░░░░  88
vocab-gap              ███████░░░░░░░░░░░░░  44
structural-drift       ███████░░░░░░░░░░░░░  42
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
| io-bound ∧ structural-drift | 11 |
| io-bound ∧ behavior-drift | 0 |
| literal-required ∧ prompt-sensitive | 0 |
| cli-parsing ∧ behavior-drift | 0 |
| schema-driven ∧ contract-equivalent | 0 |
| pure-transform ∧ behavior-equivalent | 0 |
| contract-missing ∧ not-reviewed | 0 |

## Per-node

| Node | Source | Verdict | LoC dist | Jaccard | Honesty | Tokens | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| `node_0001` | compile/artifact-writer.ts | divergent_loc | 0.853 | 1.000 | 0.574 | 799 | — |
| `node_0002` | compile/compile-node.ts | divergent_loc | 0.909 | 0.600 | 0.346 | 1419 | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_loc | 0.616 | 1.000 | 0.692 | 1705 | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_both | 0.861 | 0.250 | 0.195 | 726 | — |
| `node_0005` | post/extract-code-fence.ts | divergent_both | 0.602 | 0.000 | 0.199 | 863 | — |
| `node_0006` | post/runtime-check.ts | divergent_loc | 0.649 | 1.000 | 0.675 | 743 | — |
| `node_0007` | post/validate-language.ts | divergent_loc | 0.742 | 0.500 | 0.379 | 805 | — |
| `node_0008` | compile/upstream-context.ts | divergent_loc | 0.709 | 1.000 | 0.646 | 801 | — |
| `node_0009` | context/assembler.ts | divergent_both | 0.684 | 0.000 | 0.158 | 1164 | — |
| `node_0010` | context/edge-suggester.ts | divergent_loc | 0.715 | 0.750 | 0.517 | 1161 | — |
| `node_0011` | context/gluing.ts | divergent_loc | 0.639 | 1.000 | 0.680 | 830 | — |
| `node_0012` | context/intent-validator.ts | divergent_loc | 0.746 | 0.500 | 0.377 | 1131 | — |
| `node_0013` | context/presheaf.ts | divergent_structural | 0.043 | 0.000 | 0.478 | 629 | — |
| `node_0014` | context/semantic-linker.ts | divergent_both | 0.421 | 0.214 | 0.396 | 1210 | — |
| `node_0015` | context/types.ts | divergent_loc | 0.600 | 1.000 | 0.700 | 699 | — |
| `node_0016` | effects/async.ts | divergent_loc | 0.402 | 0.667 | 0.633 | 1783 | — |
| `node_0017` | effects/index.ts | divergent_loc | 0.963 | 1.000 | 0.519 | 1246 | — |
| `node_0018` | effects/laws.ts | divergent_both | 0.382 | 0.000 | 0.309 | 1662 | — |
| `node_0019` | effects/result.ts | divergent_both | 0.342 | 0.000 | 0.329 | 1540 | — |
| `node_0020` | runtime/errors.ts | divergent_loc | 0.782 | 1.000 | 0.609 | 828 | — |
| `node_0021` | fibration/branch-fiber.ts | divergent_both | 0.755 | 0.000 | 0.122 | 1518 | — |
| `node_0022` | fibration/index.ts | epsilon_equivalent | 0.261 | 1.000 | 0.870 | 967 | — |
| `node_0023` | fibration/types.ts | divergent_loc | 0.674 | 1.000 | 0.663 | 850 | — |
| `node_0024` | graph/compile-plan.ts | divergent_loc | 0.614 | 0.714 | 0.550 | 1578 | — |
| `node_0025` | graph/edges.ts | divergent_loc | 0.569 | 0.600 | 0.516 | 724 | — |
| `node_0026` | graph/poset.ts | divergent_loc | 0.524 | 1.000 | 0.738 | 1032 | — |
| `node_0027` | graph/traversal.ts | divergent_loc | 0.598 | 1.000 | 0.701 | 1325 | — |
| `node_0028` | legend/frontier-tagger.ts | divergent_loc | 0.917 | 0.875 | 0.479 | 916 | — |
| `node_0029` | legend/matrix-intersections.ts | divergent_loc | 0.621 | 0.800 | 0.590 | 1381 | — |
| `node_0030` | legend/matrix.ts | divergent_loc | 0.921 | 1.000 | 0.539 | 1194 | — |
| `node_0031` | legend/pareto.ts | divergent_loc | 0.883 | 0.750 | 0.434 | 945 | — |
| `node_0032` | legend/progress-report.ts | divergent_loc | 0.955 | 1.000 | 0.522 | 993 | — |
| `node_0033` | legend/render-ascii.ts | divergent_loc | 0.588 | 0.833 | 0.623 | 1438 | — |
| `node_0034` | legend/static-summary.ts | divergent_both | 0.816 | 0.167 | 0.176 | 1490 | — |
| `node_0035` | legend/structural-classifier.ts | divergent_both | 0.882 | 0.067 | 0.092 | 1745 | — |
| `node_0036` | legend/translator.ts | divergent_loc | 0.805 | 1.000 | 0.597 | 855 | — |
| `node_0037` | legend/verify-homeomorphism.ts | divergent_both | 0.868 | 0.286 | 0.209 | 1292 | — |
| `node_0038` | legend/vocab-gap.ts | divergent_loc | 0.498 | 1.000 | 0.751 | 2221 | — |
| `node_0039` | anthropic/adapter.ts | divergent_both | 0.702 | 0.200 | 0.249 | 1205 | — |
| `node_0040` | llm/dispatcher.ts | divergent_loc | 0.627 | 0.800 | 0.587 | 1130 | — |
| `node_0041` | llm/mock.ts | divergent_both | 0.412 | 0.000 | 0.294 | 1226 | — |
| `node_0042` | llm/model-capabilities.ts | divergent_both | 0.954 | 0.000 | 0.023 | 666 | — |
| `node_0043` | ollama/adapter.ts | divergent_structural | 0.017 | 0.250 | 0.616 | 1581 | — |
| `node_0044` | llm/registry.ts | divergent_loc | 0.718 | 1.000 | 0.641 | 1176 | — |
| `node_0045` | llm/resolve-node-model.ts | divergent_both | 0.545 | 0.333 | 0.394 | 811 | — |
| `node_0046` | llm/types.ts | epsilon_equivalent | 0.286 | 1.000 | 0.857 | 1000 | — |
| `node_0047` | prompt/parse.ts | divergent_loc | 0.373 | 0.667 | 0.647 | 907 | — |
| `node_0048` | prompt/types.ts | divergent_both | 0.691 | 0.000 | 0.155 | 629 | — |
| `node_0049` | query/representable.ts | divergent_loc | 0.631 | 0.500 | 0.435 | 1417 | — |
| `node_0050` | query/types.ts | epsilon_equivalent | 0.120 | 1.000 | 0.940 | 1340 | — |
| `node_0051` | static/edges.ts | divergent_loc | 0.520 | 0.500 | 0.490 | 735 | — |
| `node_0052` | static/python.ts | divergent_both | 0.852 | 0.000 | 0.074 | 1360 | — |
| `node_0053` | static/typescript.ts | divergent_both | 0.892 | 0.250 | 0.179 | 1136 | — |
| `node_0054` | topos/index.ts | divergent_loc | 0.946 | 1.000 | 0.527 | 1120 | — |
| `node_0055` | topos/omega.ts | divergent_loc | 0.685 | 1.000 | 0.658 | 1088 | — |
| `node_0056` | topos/predicate.ts | divergent_loc | 0.576 | 0.882 | 0.653 | 1697 | — |
| `node_0057` | topos/rule-compiler.ts | divergent_loc | 0.812 | 0.750 | 0.469 | 716 | — |
| `node_0058` | drafts/persist.ts | epsilon_equivalent | 0.044 | 1.000 | 0.978 | 1468 | — |
| `node_0059` | edges/create-edge.ts | epsilon_equivalent | 0.193 | 0.667 | 0.737 | 1322 | — |
| `node_0060` | edges/remove-edge.ts | divergent_structural | 0.035 | 0.000 | 0.483 | 1303 | — |
| `node_0061` | edges/update-edge.ts | divergent_both | 0.491 | 0.000 | 0.255 | 1055 | — |
| `node_0062` | core/errors.ts | epsilon_equivalent | 0.000 | 1.000 | 1.000 | 590 | — |
| `node_0063` | fs/json.ts | divergent_loc | 0.650 | 1.000 | 0.675 | 1184 | — |
| `node_0064` | fs/lock.ts | divergent_both | 0.638 | 0.400 | 0.381 | 1702 | — |
| `node_0065` | integrity/hash.ts | divergent_loc | 0.316 | 1.000 | 0.842 | 1132 | — |
| `node_0066` | nodes/create-node.ts | divergent_loc | 0.452 | 0.500 | 0.524 | 1505 | — |
| `node_0067` | nodes/node-id.ts | divergent_both | 0.571 | 0.000 | 0.214 | 609 | — |
| `node_0068` | nodes/remove-node.ts | divergent_loc | 0.404 | 1.000 | 0.798 | 1031 | — |
| `node_0069` | nodes/update-node.ts | divergent_both | 0.794 | 0.333 | 0.270 | 995 | — |
| `node_0070` | project/load.ts | divergent_structural | 0.234 | 0.000 | 0.383 | 2011 | — |
| `node_0071` | project/paths.ts | divergent_structural | 0.284 | 0.000 | 0.358 | 1145 | — |
| `node_0072` | projects/registry.ts | divergent_both | 0.409 | 0.000 | 0.295 | 1839 | — |
| `node_0073` | proposals/persist.ts | divergent_both | 0.905 | 0.000 | 0.048 | 1720 | — |
| `node_0074` | render/box.ts | divergent_loc | 0.685 | 1.000 | 0.657 | 961 | — |
| `node_0075` | render/style.ts | divergent_loc | 0.510 | 0.667 | 0.578 | 1916 | — |
| `node_0076` | render/table.ts | epsilon_equivalent | 0.241 | 1.000 | 0.879 | 1300 | — |
| `node_0077` | runs/persist.ts | divergent_loc | 0.746 | 0.667 | 0.460 | 1362 | — |
| `node_0078` | state/state-store.ts | epsilon_equivalent | 0.048 | 1.000 | 0.976 | 703 | — |
| `node_0079` | branch/fiber.ts | divergent_loc | 0.525 | 0.500 | 0.487 | 916 | — |
| `node_0080` | branch/list.ts | divergent_loc | 0.574 | 0.500 | 0.463 | 613 | — |
| `node_0081` | compile/plan.ts | divergent_both | 0.653 | 0.333 | 0.340 | 833 | — |
| `node_0082` | compile/run-batch.ts | divergent_both | 0.858 | 0.250 | 0.196 | 1014 | — |
| `node_0083` | compile/run.ts | divergent_both | 0.808 | 0.000 | 0.096 | 917 | — |
| `node_0084` | context/assemble.ts | divergent_loc | 0.560 | 1.000 | 0.720 | 723 | — |
| `node_0085` | commands/doctor.ts | divergent_loc | 0.745 | 0.500 | 0.377 | 781 | — |
| `node_0086` | edge/remove.ts | divergent_loc | 0.756 | 1.000 | 0.622 | 632 | — |
| `node_0087` | edge/update.ts | divergent_loc | 0.492 | 0.667 | 0.588 | 837 | — |
| `node_0088` | frontier/index.ts | divergent_both | 0.923 | 0.000 | 0.038 | 708 | — |
| `node_0089` | graph/infer-edges.ts | divergent_both | 0.917 | 0.250 | 0.166 | 1164 | — |
| `node_0090` | graph/neighbors.ts | divergent_loc | 0.333 | 0.500 | 0.583 | 1051 | — |
| `node_0091` | graph/path.ts | divergent_loc | 0.475 | 1.000 | 0.763 | 868 | — |
| `node_0092` | graph/subgraph.ts | divergent_loc | 0.734 | 1.000 | 0.633 | 658 | — |
| `node_0093` | ingest/cost-estimate.ts | divergent_loc | 0.715 | 0.600 | 0.442 | 1687 | — |
| `node_0095` | ingest/static-classifier-policy.ts | divergent_loc | 0.844 | 0.500 | 0.328 | 739 | — |
| `node_0096` | commands/init.ts | divergent_both | 0.631 | 0.000 | 0.185 | 1933 | — |
| `node_0097` | commands/inspect.ts | divergent_both | 0.393 | 0.077 | 0.342 | 1475 | — |
| `node_0098` | link/index.ts | divergent_loc | 0.927 | 0.500 | 0.286 | 860 | — |
| `node_0099` | model/doctor.ts | divergent_both | 0.655 | 0.000 | 0.172 | 996 | — |
| `node_0100` | model/list.ts | divergent_both | 0.468 | 0.000 | 0.266 | 903 | — |
| `node_0101` | node/create.ts | divergent_loc | 0.512 | 1.000 | 0.744 | 1062 | — |
| `node_0102` | node/inspect.ts | divergent_both | 0.898 | 0.286 | 0.194 | 926 | — |
| `node_0103` | node/link.ts | divergent_loc | 0.590 | 0.500 | 0.455 | 900 | — |
| `node_0104` | node/list.ts | divergent_loc | 0.513 | 1.000 | 0.744 | 783 | — |
| `node_0105` | node/remove.ts | epsilon_equivalent | 0.262 | 0.667 | 0.702 | 816 | — |
| `node_0106` | node/show.ts | divergent_loc | 0.485 | 1.000 | 0.758 | 901 | — |
| `node_0107` | commands/open.tsx | divergent_both | 0.822 | 0.200 | 0.189 | 1143 | — |
| `node_0108` | projects/forget.ts | divergent_loc | 0.408 | 0.500 | 0.546 | 717 | — |
| `node_0109` | projects/list.ts | epsilon_equivalent | 0.041 | 1.000 | 0.980 | 821 | — |
| `node_0110` | proposal/apply.ts | divergent_loc | 0.790 | 0.500 | 0.355 | 818 | — |
| `node_0111` | proposal/list.ts | epsilon_equivalent | 0.283 | 0.500 | 0.608 | 944 | — |
| `node_0112` | proposal/propose-link.ts | divergent_loc | 0.611 | 0.667 | 0.528 | 1127 | — |
| `node_0113` | proposal/propose-node.ts | divergent_loc | 0.617 | 1.000 | 0.691 | 843 | — |
| `node_0114` | proposal/reject.ts | divergent_loc | 0.460 | 0.667 | 0.603 | 1122 | — |
| `node_0115` | proposal/show.ts | divergent_both | 0.357 | 0.333 | 0.488 | 1069 | — |
| `node_0116` | query/index.ts | divergent_loc | 0.659 | 1.000 | 0.671 | 676 | — |
| `node_0117` | query/run-query.ts | divergent_both | 0.654 | 0.200 | 0.273 | 1332 | — |
| `node_0118` | run/context.ts | divergent_both | 0.668 | 0.333 | 0.333 | 2075 | — |
| `node_0119` | run/prompt.ts | divergent_loc | 0.720 | 0.500 | 0.390 | 1437 | — |
| `node_0120` | runs/list.ts | divergent_loc | 0.483 | 1.000 | 0.758 | 791 | — |
| `node_0121` | runs/show.ts | divergent_loc | 0.478 | 1.000 | 0.761 | 794 | — |
| `node_0122` | runs/verify.ts | divergent_loc | 0.420 | 0.500 | 0.540 | 981 | — |
| `node_0123` | commands/validate.ts | divergent_loc | 0.941 | 1.000 | 0.529 | 653 | — |
| `node_0124` | verify/homeomorphism.ts | divergent_loc | 0.938 | 0.529 | 0.296 | 1463 | — |
| `node_0125` | commands/walk.ts | epsilon_equivalent | 0.103 | 1.000 | 0.948 | 695 | — |
| `node_0126` | schemas/ontology.ts | divergent_loc | 0.456 | 0.600 | 0.572 | 4580 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.

---

## Post-publication addendum (2026-05-24)

### Silent perimeter under-count: 125/126, not 125/125

The aggregate above reports `Total: 125`. The actual code perimeter at ingest time was **126** files (`node_0001`…`node_0126`). The missing entry is `node_0094` → `src/commands/ingest/index.ts` — the entry point of the `ingest` command itself.

Root cause: the LLM extractor at ingest time emitted `coordinates.manifestation: "intent"` for that node (a degenerate extraction — `prompt.raw: "- example"`, `provides: []`), and `verify-homeomorphism --all-artifacts` filters candidates by `manifestation === "code"`. The node was silently excluded; the run reported 125 with no warning.

Materiality:

- **Coverage:** 125 / 126 = 99.2% (not 100% as the aggregate suggests).
- **`perimeterHash`** (event-log replay anchor from `00b8100`) is computed over the 125 verified files. Future replays of this report will produce the same hash; a "126-node" replay is a different anchor.
- **Headline metrics are unchanged.** Even if `node_0094` re-verifies as `unrecoverable` (likely — the extraction stub is too thin to reconstruct a 2300-line module), the means shift at the third decimal: mean Jaccard from 0.581 to ~0.576, structural honesty from 0.496 to ~0.492. H1's six falsifiers (all confirmed by ≥10×) remain confirmed.

### Structural fixes shipped to prevent recurrence

Two code changes landed alongside this addendum:

- `src/runtime/compile/manifestation-mapper.ts` — new `inferManifestationFromSourcePath(path)` exposes the extension → manifestation prior (`*.ts/*.tsx/*.py/...` → `code`, `*.test.ts/*.spec.ts/...` → `test`, `build.sh` → `build`, prose/data → `undefined`).
- `src/commands/ingest/index.ts` — `createNodeProposalForExtraction` now overrides `extracted.manifestation` when the extractor returned `undefined` or `"intent"` for a file whose path implies a richer manifestation. The override is recorded in `provenance.rationale` (`manifestationOverride: { extractorSaid, pathImplies }`) so the decision is auditable.
- `src/commands/verify/homeomorphism.ts` — `--all-artifacts` now emits a `[verify] warning` listing any nodes whose `outputs.files` look like code-extension but whose manifestation excludes them. The under-count is no longer invisible. JSON mode (`--json`) suppresses the warning to keep the sidecar clean.

These guards mean the same misclassification cannot recur on a future ingest, and an already-misclassified graph (like this one) will surface the issue at verify time instead of silently shrinking the perimeter.

### Why this report is not re-run with `node_0094` patched

The verify re-run would (a) require workspace shuffling (`.ontology/` currently holds unrelated scratch state, and `node_0094` lives in `.ontology.self-ingest-epsilon-3a-arm-a-result/`) and (b) almost certainly produce `unrecoverable` because the source node carries a degenerate extraction. The marginal scientific value of the re-run is bounded by the third-decimal shifts above. The pre-registered headline is preserved; the under-count is now visible and documented; future ingests cannot reproduce it.

### Companion: §3.1 circularity check (Arm A0)

A separate control arm — Arm A0 = qwen2.5-coder:7b + safety-net **without** `--ast-grounding`, identical perimeter — is queued. Arm A's 28× margin over the pre-registered floor (mean Jaccard 0.581 vs δ' baseline 0.021) confounds three things: safety-net, AST grounding, and a metric circularity (the intervention injects exactly the declaration names that `structuralJaccard` / `exportRecoveryRate` score). Arm A0 isolates the marginal contribution of grounding. Its report will land at `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A0_CONTROL.md`.
