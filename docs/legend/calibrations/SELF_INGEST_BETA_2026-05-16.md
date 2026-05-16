# verify-homeomorphism report

**Generated:** 2026-05-16T08:10:27.703Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Model override:** `qwen2.5-coder:3b`
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 0 | 0% |
| divergent_loc | 1 | 1% |
| divergent_structural | 9 | 7% |
| divergent_both | 90 | 73% |
| unrecoverable | 24 | 19% |
| **Total** | **124** | |

```
epsilon_equivalent    ░░░░░░░░░░░░░░░░░░░░  0
divergent_loc         ░░░░░░░░░░░░░░░░░░░░  1
divergent_structural  █░░░░░░░░░░░░░░░░░░░  9
divergent_both        ███████████████░░░░░  90
unrecoverable         ████░░░░░░░░░░░░░░░░  24
```

**Aggregate dispatch:**
- Input tokens: 8,028
- Output tokens: 55,665
- Total tokens: 63,693

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=124 |
| structural | `fail`=99, `not-measured`=24, `partial`=1 |
| behavior | `untested`=100, `not-applicable`=24 |
| intent | `not-reviewed`=100, `needs-human`=24 |
| literalRequired | `false`=124 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.166 | 100 | 81% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | 0.500 | 24 | 19% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=100)
█▅▃▄▆▂▆▃▃▂▄▁▁▁▂▁▁▁▁▁
           0.00─0.56
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 124 |
| Nodes with any gap | 113 |
| Missing exports (G said, F skipped) | 419 |
| Unexpected exports (F invented, G silent) | 16 |

**Top missing-export keys (declared in provides, no matching export):**

| Key | Nodes |
|---|---:|
| `failWith` | 6 |
| `suggestEdgeProposals` | 2 |
| `semanticLink` | 2 |
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
| `errorMessage` | 2 |
| `fail` | 2 |
| `AbstractionLevelSchema` | 2 |
| `ManifestationSchema` | 2 |
| `NodeKindSchema` | 2 |
| `writeArtifactPending` | 1 |
| `WriteArtifactResult` | 1 |

**Top unexpected exports (regen surfaced, no matching provides key):**

| Export | Nodes |
|---|---:|
| `User` | 2 |
| `UserID` | 1 |
| `UserRole` | 1 |
| `ComponentA` | 1 |
| `ComponentB` | 1 |
| `ServiceA` | 1 |
| `StoreA` | 1 |
| `BlogPost` | 1 |
| `Permission` | 1 |
| `SumFunction` | 1 |
| `TagList` | 1 |
| `UserProfile` | 1 |
| `Edge` | 1 |
| `DateFormat` | 1 |
| `Role` | 1 |

*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*

## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)

| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |
|---|---|---|---:|---:|---:|---:|---:|:---:|
| code_sketch | ollama | `qwen2.5-coder:3b` | 124 | 0.166 (n=100) | $0 | 65 | 449 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `vocab-gap` | 113 |
| `not-reviewed` | 100 |
| `structural-drift` | 99 |
| `operational-glue` | 88 |
| `pure-transform` | 34 |
| `io-bound` | 18 |
| `algebraic-lawful` | 8 |
| `schema-driven` | 5 |
| `prompt-sensitive` | 4 |
| `cli-parsing` | 4 |
| `declarative-validator` | 2 |
| `adapter-boundary` | 2 |
| `human-authored` | 1 |
| `literal-required` | 1 |

```
vocab-gap              ████████████████████  113
not-reviewed           ██████████████████░░  100
structural-drift       ██████████████████░░  99
operational-glue       ████████████████░░░░  88
pure-transform         ██████░░░░░░░░░░░░░░  34
io-bound               ███░░░░░░░░░░░░░░░░░  18
algebraic-lawful       █░░░░░░░░░░░░░░░░░░░  8
schema-driven          █░░░░░░░░░░░░░░░░░░░  5
prompt-sensitive       █░░░░░░░░░░░░░░░░░░░  4
cli-parsing            █░░░░░░░░░░░░░░░░░░░  4
declarative-validator  ░░░░░░░░░░░░░░░░░░░░  2
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
| `node_0001` | compile/artifact-writer.ts | divergent_both | 0.824 | 0.000 | 0.088 | 669 | — |
| `node_0002` | compile/compile-node.ts | divergent_both | 0.960 | 0.000 | 0.020 | 650 | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_both | 0.952 | 0.000 | 0.024 | 365 | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_both | 0.608 | 0.000 | 0.196 | 589 | — |
| `node_0005` | post/extract-code-fence.ts | divergent_both | 0.724 | 0.000 | 0.138 | 434 | — |
| `node_0006` | post/runtime-check.ts | divergent_both | 0.806 | 0.000 | 0.097 | 530 | — |
| `node_0007` | post/validate-language.ts | divergent_both | 0.326 | 0.000 | 0.337 | 794 | — |
| `node_0008` | compile/upstream-context.ts | divergent_both | 0.987 | 0.000 | 0.006 | 119 | — |
| `node_0009` | context/assembler.ts | divergent_structural | 0.225 | 0.000 | 0.387 | 1442 | — |
| `node_0010` | context/edge-suggester.ts | divergent_both | 0.654 | 0.000 | 0.173 | 766 | — |
| `node_0011` | context/gluing.ts | divergent_both | 0.744 | 0.000 | 0.128 | 568 | — |
| `node_0012` | context/intent-validator.ts | divergent_both | 0.658 | 0.000 | 0.171 | 920 | — |
| `node_0013` | context/presheaf.ts | divergent_both | 0.540 | 0.000 | 0.230 | 716 | — |
| `node_0014` | context/semantic-linker.ts | divergent_both | 0.993 | 0.000 | 0.004 | 105 | — |
| `node_0015` | context/types.ts | divergent_structural | 0.080 | 0.000 | 0.460 | 659 | — |
| `node_0016` | effects/async.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0016: Intent validation failed… | | | | | |
| `node_0017` | effects/index.ts | divergent_both | 0.889 | 0.000 | 0.056 | 489 | — |
| `node_0018` | effects/io.ts | divergent_both | 0.670 | 0.000 | 0.165 | 816 | — |
| `node_0019` | effects/laws.ts | divergent_both | 0.426 | 0.000 | 0.287 | 825 | — |
| `node_0020` | effects/result.ts | divergent_both | 0.775 | 0.000 | 0.112 | 828 | — |
| `node_0021` | fibration/branch-fiber.ts | divergent_both | 0.865 | 0.000 | 0.068 | 547 | — |
| `node_0022` | fibration/index.ts | divergent_both | 0.826 | 0.000 | 0.087 | 410 | — |
| `node_0023` | fibration/types.ts | divergent_both | 0.565 | 0.000 | 0.217 | 617 | — |
| `node_0024` | graph/compile-plan.ts | divergent_both | 0.880 | 0.000 | 0.060 | 752 | — |
| `node_0025` | graph/edges.ts | divergent_both | 0.379 | 0.000 | 0.310 | 618 | — |
| `node_0026` | graph/poset.ts | divergent_both | 0.602 | 0.000 | 0.199 | 680 | — |
| `node_0027` | graph/traversal.ts | divergent_both | 0.402 | 0.125 | 0.361 | 1147 | — |
| `node_0028` | legend/frontier-tagger.ts | divergent_both | 0.983 | 0.000 | 0.008 | 424 | — |
| `node_0029` | legend/matrix-intersections.ts | divergent_both | 0.972 | 0.000 | 0.014 | 770 | — |
| `node_0030` | legend/pareto.ts | divergent_both | 0.545 | 0.000 | 0.228 | 1087 | — |
| `node_0031` | legend/progress-report.ts | divergent_both | 0.999 | 0.000 | 0.001 | 472 | — |
| `node_0032` | legend/render-ascii.ts | divergent_both | 0.740 | 0.000 | 0.130 | 598 | — |
| `node_0033` | legend/static-summary.ts | divergent_both | 0.737 | 0.000 | 0.132 | 621 | — |
| `node_0034` | legend/structural-classifier.ts | divergent_both | 0.926 | 0.000 | 0.037 | 851 | — |
| `node_0035` | legend/translator.ts | divergent_both | 0.717 | 0.000 | 0.142 | 741 | — |
| `node_0036` | legend/verify-homeomorphism.ts | divergent_both | 0.932 | 0.000 | 0.034 | 435 | — |
| `node_0037` | legend/vocab-gap.ts | divergent_both | 0.888 | 0.000 | 0.056 | 444 | — |
| `node_0038` | anthropic/adapter.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0038: Intent validation failed… | | | | | |
| `node_0039` | llm/dispatcher.ts | divergent_both | 0.624 | 0.000 | 0.188 | 803 | — |
| `node_0040` | llm/mock.ts | divergent_both | 0.456 | 0.000 | 0.272 | 840 | — |
| `node_0041` | llm/model-capabilities.ts | divergent_both | 0.691 | 0.000 | 0.154 | 1506 | — |
| `node_0042` | ollama/adapter.ts | divergent_both | 0.652 | 0.000 | 0.174 | 468 | — |
| `node_0043` | llm/registry.ts | divergent_both | 0.787 | 0.000 | 0.106 | 531 | — |
| `node_0044` | llm/resolve-node-model.ts | divergent_both | 0.591 | 0.000 | 0.205 | 546 | — |
| `node_0045` | llm/types.ts | divergent_both | 0.736 | 0.000 | 0.132 | 400 | — |
| `node_0046` | prompt/parse.ts | divergent_both | 0.413 | 0.000 | 0.293 | 739 | — |
| `node_0047` | prompt/types.ts | divergent_both | 0.982 | 0.000 | 0.009 | 98 | — |
| `node_0048` | query/representable.ts | divergent_both | 0.758 | 0.000 | 0.121 | 663 | — |
| `node_0049` | query/types.ts | divergent_loc | 0.380 | 0.500 | 0.560 | 806 | — |
| `node_0050` | static/edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0050: Intent validation failed… | | | | | |
| `node_0051` | static/python.ts | divergent_both | 0.931 | 0.000 | 0.034 | 463 | — |
| `node_0052` | static/typescript.ts | divergent_both | 0.769 | 0.000 | 0.116 | 1190 | — |
| `node_0053` | topos/index.ts | divergent_both | 0.911 | 0.000 | 0.045 | 625 | — |
| `node_0054` | topos/omega.ts | divergent_both | 0.986 | 0.000 | 0.007 | 140 | — |
| `node_0055` | topos/rule-compiler.ts | divergent_both | 0.965 | 0.000 | 0.018 | 867 | — |
| `node_0056` | drafts/persist.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0056: Intent validation failed… | | | | | |
| `node_0057` | edges/create-edge.ts | divergent_both | 0.505 | 0.000 | 0.248 | 614 | — |
| `node_0058` | edges/remove-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0058: Intent validation failed… | | | | | |
| `node_0059` | edges/update-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0059: Intent validation failed… | | | | | |
| `node_0060` | core/errors.ts | divergent_both | 0.444 | 0.000 | 0.278 | 494 | — |
| `node_0061` | fs/json.ts | divergent_structural | 0.204 | 0.000 | 0.398 | 659 | — |
| `node_0062` | fs/lock.ts | divergent_both | 0.848 | 0.000 | 0.076 | 730 | — |
| `node_0063` | integrity/hash.ts | divergent_structural | 0.017 | 0.000 | 0.491 | 822 | — |
| `node_0064` | nodes/create-node.ts | divergent_both | 0.418 | 0.000 | 0.291 | 1036 | — |
| `node_0065` | nodes/node-id.ts | divergent_both | 0.800 | 0.000 | 0.100 | 393 | — |
| `node_0066` | nodes/remove-node.ts | divergent_both | 0.638 | 0.000 | 0.181 | 600 | — |
| `node_0067` | nodes/update-node.ts | divergent_both | 0.768 | 0.000 | 0.116 | 623 | — |
| `node_0068` | project/load.ts | divergent_both | 0.646 | 0.300 | 0.327 | 792 | — |
| `node_0069` | project/paths.ts | divergent_both | 0.438 | 0.000 | 0.281 | 512 | — |
| `node_0070` | projects/registry.ts | divergent_both | 0.663 | 0.000 | 0.168 | 789 | — |
| `node_0071` | render/box.ts | divergent_both | 0.517 | 0.000 | 0.241 | 942 | — |
| `node_0072` | render/style.ts | divergent_both | 0.765 | 0.000 | 0.118 | 717 | — |
| `node_0073` | render/table.ts | divergent_both | 0.612 | 0.000 | 0.194 | 507 | — |
| `node_0074` | runs/persist.ts | divergent_both | 0.624 | 0.000 | 0.188 | 941 | — |
| `node_0075` | state/state-store.ts | divergent_both | 0.571 | 0.000 | 0.214 | 317 | — |
| `node_0076` | branch/fiber.ts | divergent_both | 0.600 | 0.000 | 0.200 | 726 | — |
| `node_0077` | branch/list.ts | divergent_both | 0.745 | 0.000 | 0.128 | 267 | — |
| `node_0078` | compile/plan.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0078: Intent validation failed… | | | | | |
| `node_0079` | compile/run-batch.ts | divergent_both | 0.886 | 0.000 | 0.057 | 592 | — |
| `node_0080` | compile/run.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0080: Intent validation failed… | | | | | |
| `node_0081` | context/assemble.ts | divergent_both | 0.800 | 0.000 | 0.100 | 218 | — |
| `node_0082` | commands/doctor.ts | divergent_both | 0.868 | 0.000 | 0.066 | 514 | — |
| `node_0083` | edge/remove.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0083: Intent validation failed… | | | | | |
| `node_0084` | edge/update.ts | divergent_both | 0.407 | 0.000 | 0.297 | 617 | — |
| `node_0085` | events/tail.ts | divergent_structural | 0.038 | 0.000 | 0.481 | 638 | — |
| `node_0086` | frontier/index.ts | divergent_both | 0.748 | 0.000 | 0.126 | 892 | — |
| `node_0087` | graph/infer-edges.ts | divergent_both | 0.920 | 0.000 | 0.040 | 627 | — |
| `node_0088` | graph/neighbors.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0088: Intent validation failed… | | | | | |
| `node_0089` | graph/path.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0089: Intent validation failed… | | | | | |
| `node_0090` | graph/subgraph.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0090: Intent validation failed… | | | | | |
| `node_0091` | ingest/cost-estimate.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0091: Intent validation failed… | | | | | |
| `node_0092` | ingest/index.ts | divergent_both | 0.997 | 0.000 | 0.001 | 168 | — |
| `node_0093` | ingest/static-classifier-policy.ts | divergent_both | 0.844 | 0.000 | 0.078 | 377 | — |
| `node_0094` | commands/init.ts | divergent_both | 0.945 | 0.000 | 0.028 | 492 | — |
| `node_0095` | commands/inspect.ts | divergent_both | 0.992 | 0.000 | 0.004 | 323 | — |
| `node_0096` | link/index.ts | divergent_both | 0.976 | 0.000 | 0.012 | 378 | — |
| `node_0097` | model/doctor.ts | divergent_both | 0.397 | 0.000 | 0.302 | 966 | — |
| `node_0098` | model/list.ts | divergent_both | 0.532 | 0.000 | 0.234 | 529 | — |
| `node_0099` | node/create.ts | divergent_both | 0.622 | 0.000 | 0.189 | 936 | — |
| `node_0100` | node/inspect.ts | divergent_both | 0.924 | 0.000 | 0.038 | 412 | — |
| `node_0101` | node/link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0101: Intent validation failed… | | | | | |
| `node_0102` | node/list.ts | divergent_structural | 0.188 | 0.000 | 0.406 | 851 | — |
| `node_0103` | node/remove.ts | divergent_both | 0.984 | 0.000 | 0.008 | 849 | — |
| `node_0104` | node/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0104: Intent validation failed… | | | | | |
| `node_0105` | node/update.ts | divergent_both | 0.614 | 0.000 | 0.193 | 654 | — |
| `node_0106` | commands/open.tsx | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0106: Intent validation failed… | | | | | |
| `node_0107` | projects/forget.ts | divergent_both | 0.612 | 0.000 | 0.194 | 530 | — |
| `node_0108` | projects/list.ts | divergent_structural | 0.082 | 0.000 | 0.459 | 485 | — |
| `node_0109` | proposal/apply.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0109: Intent validation failed… | | | | | |
| `node_0110` | proposal/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0110: Intent validation failed… | | | | | |
| `node_0111` | proposal/propose-link.ts | divergent_structural | 0.214 | 0.000 | 0.393 | 1114 | — |
| `node_0112` | proposal/propose-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0112: Intent validation failed… | | | | | |
| `node_0113` | proposal/reject.ts | divergent_structural | 0.270 | 0.000 | 0.365 | 645 | — |
| `node_0114` | proposal/show.ts | divergent_both | 0.987 | 0.000 | 0.006 | 168 | — |
| `node_0115` | query/index.ts | divergent_both | 0.463 | 0.000 | 0.268 | 543 | — |
| `node_0116` | query/run-query.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0116: Intent validation failed… | | | | | |
| `node_0117` | run/context.ts | divergent_both | 0.805 | 0.000 | 0.097 | 812 | — |
| `node_0118` | run/prompt.ts | divergent_both | 0.733 | 0.333 | 0.300 | 796 | — |
| `node_0119` | runs/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0119: Intent validation failed… | | | | | |
| `node_0120` | runs/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0120: Intent validation failed… | | | | | |
| `node_0121` | runs/verify.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0121: Intent validation failed… | | | | | |
| `node_0122` | commands/validate.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0122: Intent validation failed… | | | | | |
| `node_0124` | commands/walk.ts | divergent_both | 0.962 | 0.000 | 0.019 | 189 | — |
| `node_0125` | schemas/ontology.ts | divergent_both | 0.906 | 0.000 | 0.047 | 714 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
