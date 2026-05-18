# verify-homeomorphism report

**Generated:** 2026-05-17T06:30:27.299Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 0 | 0% |
| divergent_loc | 2 | 2% |
| divergent_structural | 15 | 12% |
| divergent_both | 77 | 61% |
| unrecoverable | 32 | 25% |
| **Total** | **126** | |

```
epsilon_equivalent    ░░░░░░░░░░░░░░░░░░░░  0
divergent_loc         ░░░░░░░░░░░░░░░░░░░░  2
divergent_structural  ██░░░░░░░░░░░░░░░░░░  15
divergent_both        ████████████░░░░░░░░  77
unrecoverable         █████░░░░░░░░░░░░░░░  32
```

**Aggregate dispatch:**
- Input tokens: 7,503
- Output tokens: 53,380
- Total tokens: 60,883

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=126 |
| structural | `fail`=92, `not-measured`=32, `partial`=2 |
| behavior | `untested`=94, `not-applicable`=32 |
| intent | `not-reviewed`=94, `needs-human`=32 |
| literalRequired | `false`=126 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.187 | 94 | 75% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | 0.500 | 32 | 25% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=94)
█▇▆▆▄▅▃▁▂▂▂▂▁▁▁▁▁▁▁▁
           0.00─0.83
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 126 |
| Nodes with any gap | 122 |
| Missing exports (G said, F skipped) | 523 |
| Unexpected exports (F invented, G silent) | 2 |

**Top missing-export keys (declared in provides, no matching export):**

| Key | Nodes |
|---|---:|
| `ok` | 3 |
| `err` | 3 |
| `isOk` | 3 |
| `isErr` | 3 |
| `pureWithLog` | 3 |
| `failWithLog` | 3 |
| `logEntry` | 3 |
| `logInfo` | 3 |
| `logWarn` | 3 |
| `logError` | 3 |
| `mapWithLog` | 3 |
| `bindWithLog` | 3 |
| `runWithLog` | 3 |
| `failWith` | 3 |
| `mapResult` | 2 |
| `bindResult` | 2 |
| `mapErrResult` | 2 |
| `traverseResult` | 2 |
| `sequenceResult` | 2 |
| `unwrapResult` | 2 |

**Top unexpected exports (regen surfaced, no matching provides key):**

| Export | Nodes |
|---|---:|
| `black` | 1 |
| `red` | 1 |

*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*

## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)

| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |
|---|---|---|---:|---:|---:|---:|---:|:---:|
| code_sketch | ollama | `mock_default` | 126 | 0.187 (n=94) | $0 | 60 | 424 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `vocab-gap` | 122 |
| `not-reviewed` | 94 |
| `structural-drift` | 92 |
| `operational-glue` | 88 |
| `pure-transform` | 35 |
| `io-bound` | 19 |
| `algebraic-lawful` | 9 |
| `schema-driven` | 5 |
| `cli-parsing` | 3 |
| `declarative-validator` | 2 |
| `adapter-boundary` | 2 |
| `human-authored` | 1 |
| `literal-required` | 1 |
| `prompt-sensitive` | 1 |

```
vocab-gap              ████████████████████  122
not-reviewed           ███████████████░░░░░  94
structural-drift       ███████████████░░░░░  92
operational-glue       ██████████████░░░░░░  88
pure-transform         ██████░░░░░░░░░░░░░░  35
io-bound               ███░░░░░░░░░░░░░░░░░  19
algebraic-lawful       █░░░░░░░░░░░░░░░░░░░  9
schema-driven          █░░░░░░░░░░░░░░░░░░░  5
cli-parsing            ░░░░░░░░░░░░░░░░░░░░  3
declarative-validator  ░░░░░░░░░░░░░░░░░░░░  2
adapter-boundary       ░░░░░░░░░░░░░░░░░░░░  2
human-authored         ░░░░░░░░░░░░░░░░░░░░  1
literal-required       ░░░░░░░░░░░░░░░░░░░░  1
prompt-sensitive       ░░░░░░░░░░░░░░░░░░░░  1
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
| `node_0001` | compile/artifact-writer.ts | divergent_both | 0.642 | 0.000 | 0.179 | 763 | — |
| `node_0002` | compile/compile-node.ts | divergent_both | 0.939 | 0.000 | 0.031 | 937 | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_both | 0.946 | 0.000 | 0.027 | 519 | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_both | 0.544 | 0.000 | 0.228 | 514 | — |
| `node_0005` | post/extract-code-fence.ts | divergent_both | 0.704 | 0.000 | 0.148 | 476 | — |
| `node_0006` | post/runtime-check.ts | divergent_both | 0.806 | 0.000 | 0.097 | 418 | — |
| `node_0007` | post/validate-language.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0007: Intent validation failed… | | | | | |
| `node_0008` | compile/upstream-context.ts | divergent_structural | 0.089 | 0.000 | 0.456 | 886 | — |
| `node_0009` | context/assembler.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0009: Intent validation failed… | | | | | |
| `node_0010` | context/edge-suggester.ts | divergent_both | 0.944 | 0.000 | 0.028 | 487 | — |
| `node_0011` | context/gluing.ts | divergent_both | 0.571 | 0.000 | 0.214 | 819 | — |
| `node_0012` | context/intent-validator.ts | divergent_both | 0.778 | 0.000 | 0.111 | 621 | — |
| `node_0013` | context/presheaf.ts | divergent_both | 0.617 | 0.000 | 0.192 | 760 | — |
| `node_0014` | context/semantic-linker.ts | divergent_both | 0.750 | 0.000 | 0.125 | 511 | — |
| `node_0015` | context/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0015: Intent validation failed… | | | | | |
| `node_0016` | effects/async.ts | divergent_both | 0.485 | 0.000 | 0.258 | 750 | — |
| `node_0017` | effects/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0017: Intent validation failed… | | | | | |
| `node_0018` | effects/io.ts | divergent_both | 0.727 | 0.000 | 0.136 | 685 | — |
| `node_0019` | effects/laws.ts | divergent_structural | 0.250 | 0.000 | 0.375 | 807 | — |
| `node_0020` | effects/result.ts | divergent_both | 0.675 | 0.000 | 0.162 | 636 | — |
| `node_0021` | fibration/branch-fiber.ts | divergent_both | 0.840 | 0.000 | 0.080 | 676 | — |
| `node_0022` | fibration/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0022: Intent validation failed… | | | | | |
| `node_0023` | fibration/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0023: Intent validation failed… | | | | | |
| `node_0024` | graph/compile-plan.ts | divergent_both | 0.841 | 0.000 | 0.080 | 497 | — |
| `node_0025` | graph/edges.ts | divergent_structural | 0.086 | 0.000 | 0.457 | 951 | — |
| `node_0026` | graph/poset.ts | divergent_both | 0.680 | 0.000 | 0.160 | 817 | — |
| `node_0027` | graph/traversal.ts | divergent_both | 0.825 | 0.000 | 0.087 | 683 | — |
| `node_0028` | legend/frontier-tagger.ts | divergent_both | 0.915 | 0.000 | 0.042 | 415 | — |
| `node_0029` | legend/matrix-intersections.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0029: Intent validation failed… | | | | | |
| `node_0030` | legend/matrix.ts | divergent_both | 0.967 | 0.000 | 0.016 | 587 | — |
| `node_0031` | legend/pareto.ts | divergent_both | 0.761 | 0.000 | 0.120 | 657 | — |
| `node_0032` | legend/progress-report.ts | divergent_both | 0.973 | 0.000 | 0.013 | 809 | — |
| `node_0033` | legend/render-ascii.ts | divergent_both | 0.740 | 0.000 | 0.130 | 486 | — |
| `node_0034` | legend/static-summary.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0034: Intent validation failed… | | | | | |
| `node_0035` | legend/structural-classifier.ts | divergent_both | 0.999 | 0.000 | 0.001 | 921 | — |
| `node_0037` | legend/verify-homeomorphism.ts | divergent_both | 0.997 | 0.000 | 0.002 | 528 | — |
| `node_0038` | legend/vocab-gap.ts | divergent_both | 0.888 | 0.000 | 0.056 | 626 | — |
| `node_0039` | anthropic/adapter.ts | divergent_both | 0.853 | 0.000 | 0.073 | 648 | — |
| `node_0040` | llm/dispatcher.ts | divergent_loc | 0.333 | 1.000 | 0.833 | 678 | — |
| `node_0041` | llm/ensemble.ts | divergent_both | 0.957 | 0.000 | 0.022 | 476 | — |
| `node_0042` | llm/mock.ts | divergent_both | 0.632 | 0.000 | 0.184 | 622 | — |
| `node_0043` | llm/model-capabilities.ts | divergent_both | 0.623 | 0.000 | 0.188 | 877 | — |
| `node_0044` | ollama/adapter.ts | divergent_both | 0.417 | 0.000 | 0.291 | 594 | — |
| `node_0045` | llm/registry.ts | divergent_both | 0.896 | 0.000 | 0.052 | 1115 | — |
| `node_0046` | llm/resolve-node-model.ts | divergent_both | 0.485 | 0.000 | 0.258 | 729 | — |
| `node_0047` | llm/types.ts | divergent_structural | 0.286 | 0.000 | 0.357 | 403 | — |
| `node_0048` | prompt/parse.ts | divergent_both | 0.547 | 0.000 | 0.227 | 617 | — |
| `node_0049` | prompt/types.ts | divergent_loc | 0.673 | 1.000 | 0.664 | 326 | — |
| `node_0050` | query/representable.ts | divergent_both | 0.819 | 0.000 | 0.091 | 618 | — |
| `node_0051` | query/types.ts | divergent_both | 0.600 | 0.000 | 0.200 | 684 | — |
| `node_0052` | static/edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0052: Intent validation failed… | | | | | |
| `node_0053` | static/python.ts | divergent_both | 0.850 | 0.000 | 0.075 | 870 | — |
| `node_0054` | static/typescript.ts | divergent_both | 0.909 | 0.000 | 0.046 | 650 | — |
| `node_0055` | topos/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0055: Intent validation failed… | | | | | |
| `node_0056` | topos/omega.ts | divergent_structural | 0.205 | 0.000 | 0.397 | 639 | — |
| `node_0057` | topos/predicate.ts | divergent_both | 0.587 | 0.000 | 0.206 | 614 | — |
| `node_0058` | topos/rule-compiler.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0058: Intent validation failed… | | | | | |
| `node_0059` | drafts/persist.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0059: Intent validation failed… | | | | | |
| `node_0060` | edges/create-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0060: Intent validation failed… | | | | | |
| `node_0061` | edges/remove-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0061: Intent validation failed… | | | | | |
| `node_0062` | edges/update-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0062: Intent validation failed… | | | | | |
| `node_0063` | core/errors.ts | divergent_both | 0.500 | 0.000 | 0.250 | 531 | — |
| `node_0064` | fs/json.ts | divergent_structural | 0.296 | 0.000 | 0.352 | 704 | — |
| `node_0065` | fs/lock.ts | divergent_both | 0.958 | 0.000 | 0.021 | 505 | — |
| `node_0066` | integrity/hash.ts | divergent_structural | 0.088 | 0.000 | 0.456 | 594 | — |
| `node_0067` | nodes/create-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0067: Intent validation failed… | | | | | |
| `node_0068` | nodes/node-id.ts | divergent_both | 0.897 | 0.000 | 0.052 | 482 | — |
| `node_0069` | nodes/remove-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0069: Intent validation failed… | | | | | |
| `node_0070` | nodes/update-node.ts | divergent_both | 0.510 | 0.000 | 0.245 | 787 | — |
| `node_0071` | project/load.ts | divergent_both | 0.453 | 0.000 | 0.273 | 1113 | — |
| `node_0072` | project/paths.ts | divergent_both | 0.438 | 0.000 | 0.281 | 525 | — |
| `node_0073` | projects/registry.ts | divergent_both | 0.984 | 0.000 | 0.008 | 173 | — |
| `node_0074` | proposals/persist.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0074: Intent validation failed… | | | | | |
| `node_0075` | render/box.ts | divergent_both | 0.678 | 0.000 | 0.161 | 587 | — |
| `node_0076` | render/style.ts | divergent_both | 0.904 | 0.000 | 0.048 | 652 | — |
| `node_0077` | render/table.ts | divergent_both | 0.638 | 0.000 | 0.181 | 595 | — |
| `node_0078` | runs/persist.ts | divergent_both | 0.805 | 0.000 | 0.098 | 498 | — |
| `node_0079` | state/state-store.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0079: Intent validation failed… | | | | | |
| `node_0080` | branch/fiber.ts | divergent_structural | 0.024 | 0.000 | 0.488 | 987 | — |
| `node_0081` | branch/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0081: Intent validation failed… | | | | | |
| `node_0082` | compile/plan.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0082: Intent validation failed… | | | | | |
| `node_0083` | compile/run-batch.ts | divergent_both | 0.896 | 0.000 | 0.052 | 671 | — |
| `node_0084` | compile/run.ts | divergent_both | 0.927 | 0.000 | 0.036 | 651 | — |
| `node_0085` | context/assemble.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0085: Intent validation failed… | | | | | |
| `node_0086` | commands/doctor.ts | divergent_both | 0.840 | 0.000 | 0.080 | 529 | — |
| `node_0087` | edge/remove.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0087: Intent validation failed… | | | | | |
| `node_0088` | edge/update.ts | divergent_both | 0.441 | 0.000 | 0.280 | 657 | — |
| `node_0089` | events/tail.ts | divergent_structural | 0.131 | 0.000 | 0.434 | 719 | — |
| `node_0090` | frontier/index.ts | divergent_both | 0.824 | 0.000 | 0.088 | 701 | — |
| `node_0091` | graph/infer-edges.ts | divergent_both | 0.925 | 0.000 | 0.038 | 740 | — |
| `node_0092` | graph/neighbors.ts | divergent_both | 0.762 | 0.000 | 0.119 | 572 | — |
| `node_0093` | graph/path.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0093: Intent validation failed… | | | | | |
| `node_0094` | graph/subgraph.ts | divergent_both | 0.532 | 0.000 | 0.234 | 512 | — |
| `node_0095` | ingest/cost-estimate.ts | divergent_both | 0.890 | 0.100 | 0.105 | 848 | — |
| `node_0096` | ingest/static-classifier-policy.ts | divergent_structural | 0.195 | 0.000 | 0.403 | 549 | — |
| `node_0097` | commands/init.ts | divergent_both | 0.985 | 0.000 | 0.008 | 470 | — |
| `node_0098` | commands/inspect.ts | divergent_both | 0.811 | 0.000 | 0.094 | 537 | — |
| `node_0099` | link/index.ts | divergent_both | 0.998 | 0.000 | 0.001 | 583 | — |
| `node_0100` | model/doctor.ts | divergent_both | 0.578 | 0.000 | 0.211 | 668 | — |
| `node_0101` | model/list.ts | divergent_both | 0.516 | 0.000 | 0.242 | 307 | — |
| `node_0102` | node/create.ts | divergent_structural | 0.236 | 0.000 | 0.382 | 671 | — |
| `node_0103` | node/inspect.ts | divergent_both | 0.705 | 0.000 | 0.148 | 777 | — |
| `node_0104` | node/link.ts | divergent_structural | 0.080 | 0.000 | 0.460 | 943 | — |
| `node_0105` | node/list.ts | divergent_structural | 0.077 | 0.000 | 0.462 | 455 | — |
| `node_0106` | node/remove.ts | divergent_structural | 0.082 | 0.000 | 0.459 | 521 | — |
| `node_0107` | node/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0107: Intent validation failed… | | | | | |
| `node_0108` | node/update.ts | divergent_both | 0.523 | 0.000 | 0.239 | 772 | — |
| `node_0109` | commands/open.tsx | divergent_both | 0.844 | 0.000 | 0.078 | 792 | — |
| `node_0110` | projects/forget.ts | divergent_both | 0.388 | 0.000 | 0.306 | 470 | — |
| `node_0111` | projects/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0111: Intent validation failed… | | | | | |
| `node_0112` | proposal/apply.ts | divergent_both | 0.643 | 0.000 | 0.179 | 404 | — |
| `node_0113` | proposal/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0113: Intent validation failed… | | | | | |
| `node_0114` | proposal/propose-link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0114: Intent validation failed… | | | | | |
| `node_0115` | proposal/propose-node.ts | divergent_both | 0.722 | 0.000 | 0.139 | 711 | — |
| `node_0116` | proposal/reject.ts | divergent_both | 0.714 | 0.000 | 0.143 | 591 | — |
| `node_0117` | proposal/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0117: Intent validation failed… | | | | | |
| `node_0118` | query/index.ts | divergent_both | 0.366 | 0.000 | 0.317 | 627 | — |
| `node_0119` | query/run-query.ts | divergent_both | 0.697 | 0.000 | 0.152 | 813 | — |
| `node_0120` | run/context.ts | divergent_both | 0.945 | 0.000 | 0.027 | 638 | — |
| `node_0121` | run/prompt.ts | divergent_both | 0.997 | 0.000 | 0.002 | 668 | — |
| `node_0122` | runs/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0122: Intent validation failed… | | | | | |
| `node_0123` | runs/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0123: Intent validation failed… | | | | | |
| `node_0124` | runs/verify.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0124: Intent validation failed… | | | | | |
| `node_0125` | commands/validate.ts | divergent_both | 0.695 | 0.000 | 0.152 | 1018 | — |
| `node_0126` | commands/walk.ts | divergent_structural | 0.212 | 0.000 | 0.394 | 726 | — |
| `node_0127` | schemas/ontology.ts | divergent_both | 0.985 | 0.000 | 0.008 | 437 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
