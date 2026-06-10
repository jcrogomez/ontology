# verify-homeomorphism report

**Generated:** 2026-06-10T03:44:46.057Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Model override:** `qwen2.5-coder:7b`
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 10 | 8% |
| divergent_loc | 73 | 58% |
| divergent_structural | 4 | 3% |
| divergent_both | 38 | 30% |
| unrecoverable | 0 | 0% |
| **Total** | **125** | |

```
epsilon_equivalent    ██░░░░░░░░░░░░░░░░░░  10
divergent_loc         ████████████░░░░░░░░  73
divergent_structural  █░░░░░░░░░░░░░░░░░░░  4
divergent_both        ██████░░░░░░░░░░░░░░  38
unrecoverable         ░░░░░░░░░░░░░░░░░░░░  0
```

**Aggregate dispatch:**
- Input tokens: 88,452
- Output tokens: 53,627
- Total tokens: 142,079

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `pass`=85, `fail`=32, `unknown`=8 |
| structural | `partial`=73, `fail`=42, `pass`=10 |
| behavior | `untested`=125 |
| intent | `not-reviewed`=125 |
| literalRequired | `false`=125 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.490 | 125 | 100% |
| contract | 0.726 | 117 | 94% |
| behavior | — | 0 | 0% |
| intent | — | 0 | 0% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=125)
▃▃▅▇▃▆▅▆▅▆██▇▇▅▄▂▂▂▃
           0.02─1.00
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 125 |
| Nodes with any gap | 43 |
| Missing exports (G said, F skipped) | 106 |
| Unexpected exports (F invented, G silent) | 113 |

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
| `EdgeTypeSchema` | 2 |
| `CompileNodeFailureReason` | 1 |
| `CompileNodeOptions` | 1 |
| `CompileNodeResult` | 1 |
| `RuntimeCheckOptions` | 1 |
| `RuntimeCheckResult` | 1 |
| `runtimeCheck` | 1 |
| `calculateScore` | 1 |
| `identifyViolations` | 1 |
| `AssembleContextOptions` | 1 |
| `AssembleContextResult` | 1 |
| `ContextFragment` | 1 |
| `ContextNode` | 1 |
| `GlueResult` | 1 |
| `GluingConflict` | 1 |
| `SemanticLinkInput` | 1 |
| `SemanticLinkResult` | 1 |
| `ValidationResult` | 1 |
| `assembleContext` | 1 |
| `buildFragment` | 1 |

*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*

## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)

| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |
|---|---|---|---:|---:|---:|---:|---:|:---:|
| code_sketch | ollama | `qwen2.5-coder:7b` | 125 | 0.490 (n=125) | $0 | 708 | 429 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `not-reviewed` | 125 |
| `operational-glue` | 88 |
| `vocab-gap` | 43 |
| `structural-drift` | 42 |
| `contract-missing` | 40 |
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
vocab-gap              ███████░░░░░░░░░░░░░  43
structural-drift       ███████░░░░░░░░░░░░░  42
contract-missing       ██████░░░░░░░░░░░░░░  40
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
| schema-driven ∧ contract-equivalent | 3 |
| pure-transform ∧ behavior-equivalent | 0 |
| contract-missing ∧ not-reviewed | 40 |

## Per-node

| Node | Source | Verdict | LoC dist | Jaccard | Honesty | Tokens | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| `node_0001` | compile/artifact-writer.ts | divergent_loc | 0.853 | 1.000 | 0.574 | 799 (cached) | — |
| `node_0002` | compile/compile-node.ts | divergent_loc | 0.910 | 0.600 | 0.345 | 1419 (cached) | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_loc | 0.616 | 1.000 | 0.692 | 1705 (cached) | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_loc | 0.634 | 0.800 | 0.583 | 934 | — |
| `node_0005` | post/extract-code-fence.ts | divergent_both | 0.602 | 0.000 | 0.199 | 863 (cached) | — |
| `node_0006` | post/runtime-check.ts | divergent_loc | 0.649 | 1.000 | 0.675 | 743 (cached) | — |
| `node_0007` | post/validate-language.ts | divergent_loc | 0.742 | 0.500 | 0.379 | 805 (cached) | — |
| `node_0008` | compile/upstream-context.ts | divergent_loc | 0.709 | 1.000 | 0.646 | 801 (cached) | — |
| `node_0009` | context/assembler.ts | divergent_both | 0.684 | 0.000 | 0.158 | 1164 (cached) | — |
| `node_0010` | context/edge-suggester.ts | divergent_loc | 0.715 | 0.750 | 0.517 | 1161 (cached) | — |
| `node_0011` | context/gluing.ts | divergent_both | 0.815 | 0.167 | 0.176 | 1090 | — |
| `node_0012` | context/intent-validator.ts | divergent_loc | 0.746 | 0.500 | 0.377 | 1131 (cached) | — |
| `node_0013` | context/presheaf.ts | divergent_both | 0.371 | 0.000 | 0.314 | 629 (cached) | — |
| `node_0014` | context/semantic-linker.ts | divergent_both | 0.421 | 0.214 | 0.396 | 1210 (cached) | — |
| `node_0015` | context/types.ts | divergent_loc | 0.600 | 1.000 | 0.700 | 699 (cached) | — |
| `node_0016` | effects/async.ts | divergent_loc | 0.402 | 0.667 | 0.633 | 1783 (cached) | — |
| `node_0017` | effects/index.ts | divergent_loc | 0.963 | 1.000 | 0.519 | 1246 (cached) | — |
| `node_0018` | effects/laws.ts | divergent_both | 0.382 | 0.000 | 0.309 | 1662 (cached) | — |
| `node_0019` | effects/result.ts | divergent_both | 0.342 | 0.000 | 0.329 | 1540 (cached) | — |
| `node_0020` | runtime/errors.ts | divergent_loc | 0.782 | 1.000 | 0.609 | 828 (cached) | — |
| `node_0021` | fibration/branch-fiber.ts | divergent_both | 0.755 | 0.000 | 0.122 | 1518 (cached) | — |
| `node_0022` | fibration/index.ts | epsilon_equivalent | 0.261 | 1.000 | 0.870 | 967 (cached) | — |
| `node_0023` | fibration/types.ts | divergent_loc | 0.674 | 1.000 | 0.663 | 850 (cached) | — |
| `node_0024` | graph/compile-plan.ts | divergent_loc | 0.614 | 0.714 | 0.550 | 1578 (cached) | — |
| `node_0025` | graph/edges.ts | divergent_loc | 0.569 | 0.600 | 0.516 | 724 (cached) | — |
| `node_0026` | graph/poset.ts | divergent_loc | 0.524 | 1.000 | 0.738 | 1032 (cached) | — |
| `node_0027` | graph/traversal.ts | divergent_loc | 0.598 | 1.000 | 0.701 | 1325 (cached) | — |
| `node_0028` | legend/frontier-tagger.ts | divergent_loc | 0.917 | 0.875 | 0.479 | 916 (cached) | — |
| `node_0029` | legend/matrix-intersections.ts | divergent_loc | 0.621 | 0.800 | 0.590 | 1381 (cached) | — |
| `node_0030` | legend/matrix.ts | divergent_loc | 0.928 | 1.000 | 0.536 | 1194 (cached) | — |
| `node_0031` | legend/pareto.ts | divergent_loc | 0.883 | 0.750 | 0.434 | 945 (cached) | — |
| `node_0032` | legend/progress-report.ts | divergent_loc | 0.955 | 1.000 | 0.522 | 993 (cached) | — |
| `node_0033` | legend/render-ascii.ts | divergent_loc | 0.588 | 0.833 | 0.623 | 1438 (cached) | — |
| `node_0034` | legend/static-summary.ts | divergent_both | 0.826 | 0.167 | 0.170 | 1490 (cached) | — |
| `node_0035` | legend/structural-classifier.ts | divergent_both | 0.883 | 0.067 | 0.092 | 1745 (cached) | — |
| `node_0036` | legend/translator.ts | divergent_loc | 0.805 | 1.000 | 0.597 | 855 (cached) | — |
| `node_0037` | legend/verify-homeomorphism.ts | divergent_both | 0.874 | 0.286 | 0.206 | 1292 (cached) | — |
| `node_0038` | legend/vocab-gap.ts | divergent_loc | 0.498 | 1.000 | 0.751 | 2221 (cached) | — |
| `node_0039` | anthropic/adapter.ts | divergent_both | 0.748 | 0.200 | 0.226 | 1205 (cached) | — |
| `node_0040` | llm/dispatcher.ts | divergent_loc | 0.667 | 0.800 | 0.567 | 1130 (cached) | — |
| `node_0041` | llm/mock.ts | divergent_both | 0.412 | 0.000 | 0.294 | 1226 (cached) | — |
| `node_0042` | llm/model-capabilities.ts | divergent_both | 0.954 | 0.000 | 0.023 | 666 (cached) | — |
| `node_0043` | ollama/adapter.ts | divergent_structural | 0.210 | 0.250 | 0.520 | 1581 (cached) | — |
| `node_0044` | llm/registry.ts | divergent_loc | 0.718 | 1.000 | 0.641 | 1176 (cached) | — |
| `node_0045` | llm/resolve-node-model.ts | divergent_both | 0.545 | 0.333 | 0.394 | 811 (cached) | — |
| `node_0046` | llm/types.ts | divergent_loc | 0.369 | 1.000 | 0.816 | 1000 (cached) | — |
| `node_0047` | prompt/parse.ts | divergent_loc | 0.373 | 0.667 | 0.647 | 907 (cached) | — |
| `node_0048` | prompt/types.ts | divergent_both | 0.691 | 0.000 | 0.155 | 629 (cached) | — |
| `node_0049` | query/representable.ts | divergent_loc | 0.631 | 0.500 | 0.435 | 1417 (cached) | — |
| `node_0050` | query/types.ts | epsilon_equivalent | 0.120 | 1.000 | 0.940 | 1340 (cached) | — |
| `node_0051` | static/edges.ts | divergent_loc | 0.520 | 0.500 | 0.490 | 735 (cached) | — |
| `node_0052` | static/python.ts | divergent_both | 0.852 | 0.000 | 0.074 | 1360 (cached) | — |
| `node_0053` | static/typescript.ts | divergent_both | 0.915 | 0.250 | 0.168 | 1136 (cached) | — |
| `node_0054` | topos/index.ts | divergent_loc | 0.946 | 1.000 | 0.527 | 1120 (cached) | — |
| `node_0055` | topos/omega.ts | divergent_loc | 0.685 | 1.000 | 0.658 | 1088 (cached) | — |
| `node_0056` | topos/predicate.ts | divergent_loc | 0.576 | 0.882 | 0.653 | 1697 (cached) | — |
| `node_0057` | topos/rule-compiler.ts | divergent_loc | 0.812 | 0.750 | 0.469 | 716 (cached) | — |
| `node_0058` | drafts/persist.ts | epsilon_equivalent | 0.044 | 1.000 | 0.978 | 1468 (cached) | — |
| `node_0059` | edges/create-edge.ts | epsilon_equivalent | 0.193 | 0.667 | 0.737 | 1322 (cached) | — |
| `node_0060` | edges/remove-edge.ts | divergent_structural | 0.035 | 0.000 | 0.483 | 1303 (cached) | — |
| `node_0061` | edges/update-edge.ts | divergent_both | 0.491 | 0.000 | 0.255 | 1055 (cached) | — |
| `node_0062` | core/errors.ts | epsilon_equivalent | 0.000 | 1.000 | 1.000 | 590 (cached) | — |
| `node_0063` | fs/json.ts | divergent_loc | 0.650 | 1.000 | 0.675 | 1184 (cached) | — |
| `node_0064` | fs/lock.ts | divergent_both | 0.638 | 0.400 | 0.381 | 1702 (cached) | — |
| `node_0065` | integrity/hash.ts | divergent_loc | 0.316 | 1.000 | 0.842 | 1132 (cached) | — |
| `node_0066` | nodes/create-node.ts | divergent_loc | 0.487 | 0.500 | 0.507 | 1505 (cached) | — |
| `node_0067` | nodes/node-id.ts | divergent_both | 0.571 | 0.000 | 0.214 | 609 (cached) | — |
| `node_0068` | nodes/remove-node.ts | divergent_loc | 0.404 | 1.000 | 0.798 | 1031 (cached) | — |
| `node_0069` | nodes/update-node.ts | divergent_both | 0.812 | 0.333 | 0.261 | 995 (cached) | — |
| `node_0070` | project/load.ts | divergent_structural | 0.234 | 0.000 | 0.383 | 2011 (cached) | — |
| `node_0071` | project/paths.ts | divergent_structural | 0.284 | 0.000 | 0.358 | 1145 (cached) | — |
| `node_0072` | projects/registry.ts | divergent_both | 0.409 | 0.000 | 0.295 | 1839 (cached) | — |
| `node_0073` | proposals/persist.ts | divergent_both | 0.917 | 0.000 | 0.042 | 1720 (cached) | — |
| `node_0074` | render/box.ts | divergent_loc | 0.685 | 1.000 | 0.657 | 961 (cached) | — |
| `node_0075` | render/style.ts | divergent_loc | 0.510 | 0.667 | 0.578 | 1916 (cached) | — |
| `node_0076` | render/table.ts | epsilon_equivalent | 0.241 | 1.000 | 0.879 | 1300 (cached) | — |
| `node_0077` | runs/persist.ts | divergent_loc | 0.746 | 0.667 | 0.460 | 1362 (cached) | — |
| `node_0078` | state/state-store.ts | epsilon_equivalent | 0.048 | 1.000 | 0.976 | 703 (cached) | — |
| `node_0079` | branch/fiber.ts | divergent_loc | 0.525 | 0.500 | 0.487 | 916 (cached) | — |
| `node_0080` | branch/list.ts | divergent_loc | 0.574 | 0.500 | 0.463 | 613 (cached) | — |
| `node_0081` | compile/plan.ts | divergent_both | 0.653 | 0.333 | 0.340 | 833 (cached) | — |
| `node_0082` | compile/run-batch.ts | divergent_both | 0.859 | 0.250 | 0.196 | 1014 (cached) | — |
| `node_0083` | compile/run.ts | divergent_both | 0.809 | 0.000 | 0.096 | 917 (cached) | — |
| `node_0084` | context/assemble.ts | divergent_loc | 0.560 | 1.000 | 0.720 | 723 (cached) | — |
| `node_0085` | commands/doctor.ts | divergent_loc | 0.745 | 0.500 | 0.377 | 781 (cached) | — |
| `node_0086` | edge/remove.ts | divergent_loc | 0.756 | 1.000 | 0.622 | 632 (cached) | — |
| `node_0087` | edge/update.ts | divergent_loc | 0.492 | 0.667 | 0.588 | 837 (cached) | — |
| `node_0088` | frontier/index.ts | divergent_both | 0.923 | 0.000 | 0.038 | 708 (cached) | — |
| `node_0089` | graph/infer-edges.ts | divergent_both | 0.917 | 0.250 | 0.166 | 1164 (cached) | — |
| `node_0090` | graph/neighbors.ts | divergent_loc | 0.333 | 0.500 | 0.583 | 1051 (cached) | — |
| `node_0091` | graph/path.ts | divergent_loc | 0.475 | 1.000 | 0.763 | 868 (cached) | — |
| `node_0092` | graph/subgraph.ts | divergent_loc | 0.734 | 1.000 | 0.633 | 658 (cached) | — |
| `node_0093` | ingest/cost-estimate.ts | divergent_loc | 0.715 | 0.600 | 0.442 | 1687 (cached) | — |
| `node_0095` | ingest/static-classifier-policy.ts | divergent_loc | 0.844 | 0.500 | 0.328 | 739 (cached) | — |
| `node_0096` | commands/init.ts | divergent_both | 0.671 | 0.000 | 0.164 | 1933 (cached) | — |
| `node_0097` | commands/inspect.ts | divergent_both | 0.393 | 0.077 | 0.342 | 1475 (cached) | — |
| `node_0098` | link/index.ts | divergent_loc | 0.927 | 0.500 | 0.286 | 860 (cached) | — |
| `node_0099` | model/doctor.ts | divergent_both | 0.655 | 0.000 | 0.172 | 996 (cached) | — |
| `node_0100` | model/list.ts | divergent_both | 0.468 | 0.000 | 0.266 | 903 (cached) | — |
| `node_0101` | node/create.ts | divergent_loc | 0.512 | 1.000 | 0.744 | 1062 (cached) | — |
| `node_0102` | node/inspect.ts | divergent_both | 0.898 | 0.286 | 0.194 | 926 (cached) | — |
| `node_0103` | node/link.ts | divergent_loc | 0.590 | 0.500 | 0.455 | 900 (cached) | — |
| `node_0104` | node/list.ts | divergent_loc | 0.513 | 1.000 | 0.744 | 783 (cached) | — |
| `node_0105` | node/remove.ts | epsilon_equivalent | 0.262 | 0.667 | 0.702 | 816 (cached) | — |
| `node_0106` | node/show.ts | divergent_loc | 0.485 | 1.000 | 0.758 | 901 (cached) | — |
| `node_0107` | commands/open.tsx | divergent_both | 0.822 | 0.200 | 0.189 | 1143 (cached) | — |
| `node_0108` | projects/forget.ts | divergent_loc | 0.408 | 0.500 | 0.546 | 717 (cached) | — |
| `node_0109` | projects/list.ts | epsilon_equivalent | 0.041 | 1.000 | 0.980 | 821 (cached) | — |
| `node_0110` | proposal/apply.ts | divergent_loc | 0.917 | 0.500 | 0.291 | 818 (cached) | — |
| `node_0111` | proposal/list.ts | divergent_loc | 0.345 | 0.500 | 0.578 | 944 (cached) | — |
| `node_0112` | proposal/propose-link.ts | divergent_loc | 0.611 | 0.667 | 0.528 | 1127 (cached) | — |
| `node_0113` | proposal/propose-node.ts | divergent_loc | 0.617 | 1.000 | 0.691 | 843 (cached) | — |
| `node_0114` | proposal/reject.ts | divergent_loc | 0.460 | 0.667 | 0.603 | 1122 (cached) | — |
| `node_0115` | proposal/show.ts | divergent_both | 0.460 | 0.333 | 0.437 | 1069 (cached) | — |
| `node_0116` | query/index.ts | divergent_loc | 0.659 | 1.000 | 0.671 | 676 (cached) | — |
| `node_0117` | query/run-query.ts | divergent_both | 0.654 | 0.200 | 0.273 | 1332 (cached) | — |
| `node_0118` | run/context.ts | divergent_both | 0.676 | 0.333 | 0.329 | 2075 (cached) | — |
| `node_0119` | run/prompt.ts | divergent_loc | 0.720 | 0.500 | 0.390 | 1437 (cached) | — |
| `node_0120` | runs/list.ts | divergent_loc | 0.483 | 1.000 | 0.758 | 791 (cached) | — |
| `node_0121` | runs/show.ts | divergent_loc | 0.478 | 1.000 | 0.761 | 794 (cached) | — |
| `node_0122` | runs/verify.ts | divergent_loc | 0.420 | 0.500 | 0.540 | 981 (cached) | — |
| `node_0123` | commands/validate.ts | divergent_loc | 0.941 | 1.000 | 0.529 | 653 (cached) | — |
| `node_0124` | verify/homeomorphism.ts | divergent_loc | 0.945 | 0.529 | 0.292 | 1463 (cached) | — |
| `node_0125` | commands/walk.ts | epsilon_equivalent | 0.103 | 1.000 | 0.948 | 695 (cached) | — |
| `node_0126` | schemas/ontology.ts | divergent_loc | 0.527 | 0.514 | 0.494 | 4413 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
