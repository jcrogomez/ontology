# verify-homeomorphism report

**Generated:** 2026-05-18T22:00:01.372Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 0 | 0% |
| divergent_loc | 0 | 0% |
| divergent_structural | 16 | 13% |
| divergent_both | 90 | 72% |
| unrecoverable | 19 | 15% |
| **Total** | **125** | |

```
epsilon_equivalent    ░░░░░░░░░░░░░░░░░░░░  0
divergent_loc         ░░░░░░░░░░░░░░░░░░░░  0
divergent_structural  ███░░░░░░░░░░░░░░░░░  16
divergent_both        ██████████████░░░░░░  90
unrecoverable         ███░░░░░░░░░░░░░░░░░  19
```

**Aggregate dispatch:**
- Input tokens: 8,651
- Output tokens: 59,167
- Total tokens: 67,818

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=125 |
| structural | `fail`=106, `not-measured`=19 |
| behavior | `untested`=106, `not-applicable`=19 |
| intent | `not-reviewed`=106, `needs-human`=19 |
| literalRequired | `false`=125 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.182 | 106 | 85% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | 0.500 | 19 | 15% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=106)
█▄▄▆▅▅▄▃▄▃▃▂▃▃▂▂▂▁▂▁
           0.00─0.53
```

## Vocab gaps — provides ⊖ exports (Phase ε prework J)

| Metric | Value |
|---|---:|
| Nodes inspected | 125 |
| Nodes with any gap | 123 |
| Missing exports (G said, F skipped) | 558 |
| Unexpected exports (F invented, G silent) | 2 |

**Top missing-export keys (declared in provides, no matching export):**

| Key | Nodes |
|---|---:|
| `failWith` | 5 |
| `Result` | 3 |
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
| `Effect` | 3 |
| `pureEffect` | 3 |
| `failEffect` | 3 |
| `mapEffect` | 3 |
| `bindEffect` | 3 |
| `runEffect` | 3 |
| `EffectWithLog` | 3 |
| `pureWithLog` | 3 |

**Top unexpected exports (regen surfaced, no matching provides key):**

| Export | Nodes |
|---|---:|
| `LLMDispatcher` | 1 |
| `classifyAndDispatch` | 1 |

*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*

## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)

| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |
|---|---|---|---:|---:|---:|---:|---:|:---:|
| code_sketch | ollama | `mock_default` | 125 | 0.182 (n=106) | $0 | 69 | 473 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `vocab-gap` | 123 |
| `not-reviewed` | 106 |
| `structural-drift` | 106 |
| `operational-glue` | 88 |
| `pure-transform` | 35 |
| `io-bound` | 18 |
| `algebraic-lawful` | 9 |
| `schema-driven` | 5 |
| `cli-parsing` | 3 |
| `declarative-validator` | 2 |
| `prompt-sensitive` | 2 |
| `adapter-boundary` | 2 |
| `human-authored` | 1 |
| `literal-required` | 1 |

```
vocab-gap              ████████████████████  123
not-reviewed           █████████████████░░░  106
structural-drift       █████████████████░░░  106
operational-glue       ██████████████░░░░░░  88
pure-transform         ██████░░░░░░░░░░░░░░  35
io-bound               ███░░░░░░░░░░░░░░░░░  18
algebraic-lawful       █░░░░░░░░░░░░░░░░░░░  9
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
| io-bound ∧ structural-drift | 15 |
| io-bound ∧ behavior-drift | 0 |
| literal-required ∧ prompt-sensitive | 0 |
| cli-parsing ∧ behavior-drift | 0 |
| schema-driven ∧ contract-equivalent | 0 |
| pure-transform ∧ behavior-equivalent | 0 |
| contract-missing ∧ not-reviewed | 0 |

## Per-node

| Node | Source | Verdict | LoC dist | Jaccard | Honesty | Tokens | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| `node_0001` | compile/artifact-writer.ts | divergent_both | 0.750 | 0.000 | 0.125 | 793 | — |
| `node_0002` | compile/compile-node.ts | divergent_both | 0.926 | 0.000 | 0.037 | 1027 | — |
| `node_0003` | compile/compile-plan-runner.ts | divergent_both | 0.921 | 0.000 | 0.040 | 572 | — |
| `node_0004` | compile/manifestation-mapper.ts | divergent_both | 0.354 | 0.000 | 0.323 | 756 | — |
| `node_0005` | post/extract-code-fence.ts | divergent_both | 0.735 | 0.000 | 0.133 | 526 | — |
| `node_0006` | post/runtime-check.ts | divergent_both | 0.769 | 0.000 | 0.116 | 617 | — |
| `node_0007` | post/validate-language.ts | divergent_both | 0.472 | 0.000 | 0.264 | 708 | — |
| `node_0008` | compile/upstream-context.ts | divergent_both | 0.329 | 0.000 | 0.335 | 557 | — |
| `node_0009` | context/assembler.ts | divergent_both | 0.818 | 0.000 | 0.091 | 568 | — |
| `node_0010` | context/edge-suggester.ts | divergent_both | 0.821 | 0.000 | 0.089 | 625 | — |
| `node_0011` | context/gluing.ts | divergent_both | 0.594 | 0.000 | 0.203 | 748 | — |
| `node_0012` | context/intent-validator.ts | divergent_both | 0.953 | 0.000 | 0.024 | 363 | — |
| `node_0013` | context/presheaf.ts | divergent_both | 0.303 | 0.000 | 0.348 | 434 | — |
| `node_0014` | context/semantic-linker.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0014: Intent validation failed… | | | | | |
| `node_0015` | context/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0015: Intent validation failed… | | | | | |
| `node_0016` | effects/async.ts | divergent_both | 0.629 | 0.000 | 0.186 | 661 | — |
| `node_0017` | effects/index.ts | divergent_structural | 0.259 | 0.000 | 0.370 | 406 | — |
| `node_0018` | effects/io.ts | divergent_both | 0.631 | 0.000 | 0.185 | 639 | — |
| `node_0019` | effects/laws.ts | divergent_both | 0.956 | 0.000 | 0.022 | 660 | — |
| `node_0020` | effects/result.ts | divergent_both | 0.808 | 0.000 | 0.096 | 600 | — |
| `node_0021` | fibration/branch-fiber.ts | divergent_both | 0.895 | 0.000 | 0.053 | 711 | — |
| `node_0022` | fibration/index.ts | divergent_both | 0.652 | 0.000 | 0.174 | 280 | — |
| `node_0023` | fibration/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0023: Intent validation failed… | | | | | |
| `node_0024` | graph/compile-plan.ts | divergent_both | 0.805 | 0.000 | 0.098 | 876 | — |
| `node_0025` | graph/edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0025: Intent validation failed… | | | | | |
| `node_0026` | graph/poset.ts | divergent_both | 0.767 | 0.000 | 0.117 | 653 | — |
| `node_0027` | graph/traversal.ts | divergent_both | 0.513 | 0.000 | 0.243 | 886 | — |
| `node_0028` | legend/frontier-tagger.ts | divergent_both | 0.942 | 0.000 | 0.029 | 684 | — |
| `node_0029` | legend/matrix-intersections.ts | divergent_both | 0.814 | 0.000 | 0.093 | 585 | — |
| `node_0030` | legend/matrix.ts | divergent_both | 0.944 | 0.000 | 0.028 | 710 | — |
| `node_0031` | legend/pareto.ts | divergent_both | 0.615 | 0.000 | 0.192 | 944 | — |
| `node_0032` | legend/progress-report.ts | divergent_both | 0.944 | 0.000 | 0.028 | 472 | — |
| `node_0033` | legend/render-ascii.ts | divergent_both | 0.989 | 0.000 | 0.006 | 975 | — |
| `node_0034` | legend/static-summary.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0034: Intent validation failed… | | | | | |
| `node_0035` | legend/structural-classifier.ts | divergent_both | 0.905 | 0.000 | 0.048 | 766 | — |
| `node_0036` | legend/translator.ts | divergent_both | 0.956 | 0.000 | 0.022 | 242 | — |
| `node_0037` | legend/verify-homeomorphism.ts | divergent_both | 0.836 | 0.071 | 0.118 | 968 | — |
| `node_0038` | legend/vocab-gap.ts | divergent_both | 0.847 | 0.000 | 0.077 | 472 | — |
| `node_0039` | anthropic/adapter.ts | divergent_both | 0.694 | 0.000 | 0.153 | 971 | — |
| `node_0040` | llm/dispatcher.ts | divergent_both | 0.464 | 0.000 | 0.268 | 985 | — |
| `node_0041` | llm/ensemble.ts | divergent_structural | 0.033 | 0.000 | 0.483 | 940 | — |
| `node_0042` | llm/mock.ts | divergent_both | 0.721 | 0.000 | 0.140 | 436 | — |
| `node_0043` | llm/model-capabilities.ts | divergent_both | 0.694 | 0.000 | 0.153 | 665 | — |
| `node_0044` | ollama/adapter.ts | divergent_both | 0.626 | 0.000 | 0.187 | 725 | — |
| `node_0045` | llm/registry.ts | divergent_both | 0.921 | 0.000 | 0.040 | 531 | — |
| `node_0046` | llm/resolve-node-model.ts | divergent_both | 0.409 | 0.000 | 0.295 | 686 | — |
| `node_0047` | llm/types.ts | divergent_structural | 0.165 | 0.000 | 0.418 | 452 | — |
| `node_0048` | prompt/parse.ts | divergent_structural | 0.293 | 0.000 | 0.353 | 518 | — |
| `node_0049` | prompt/types.ts | divergent_both | 0.455 | 0.000 | 0.273 | 238 | — |
| `node_0050` | query/representable.ts | divergent_both | 0.597 | 0.000 | 0.201 | 908 | — |
| `node_0051` | query/types.ts | divergent_both | 0.460 | 0.000 | 0.270 | 652 | — |
| `node_0052` | static/edges.ts | divergent_structural | 0.180 | 0.250 | 0.535 | 718 | — |
| `node_0053` | static/typescript.ts | divergent_both | 0.995 | 0.000 | 0.003 | 256 | — |
| `node_0054` | topos/index.ts | divergent_both | 0.875 | 0.000 | 0.063 | 288 | — |
| `node_0055` | topos/omega.ts | divergent_both | 0.575 | 0.000 | 0.212 | 601 | — |
| `node_0056` | topos/predicate.ts | divergent_both | 0.762 | 0.000 | 0.119 | 595 | — |
| `node_0057` | topos/rule-compiler.ts | divergent_structural | 0.235 | 0.000 | 0.382 | 672 | — |
| `node_0058` | drafts/persist.ts | divergent_structural | 0.278 | 0.000 | 0.361 | 631 | — |
| `node_0059` | edges/create-edge.ts | divergent_both | 0.569 | 0.000 | 0.216 | 735 | — |
| `node_0060` | edges/remove-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0060: Intent validation failed… | | | | | |
| `node_0061` | edges/update-edge.ts | divergent_both | 0.698 | 0.000 | 0.151 | 655 | — |
| `node_0062` | core/errors.ts | divergent_both | 0.545 | 0.000 | 0.227 | 469 | — |
| `node_0063` | fs/json.ts | divergent_structural | 0.260 | 0.000 | 0.370 | 668 | — |
| `node_0064` | fs/lock.ts | divergent_both | 0.977 | 0.000 | 0.011 | 893 | — |
| `node_0065` | integrity/hash.ts | divergent_both | 0.509 | 0.000 | 0.246 | 919 | — |
| `node_0066` | nodes/create-node.ts | divergent_both | 0.898 | 0.000 | 0.051 | 500 | — |
| `node_0067` | nodes/node-id.ts | divergent_both | 0.750 | 0.000 | 0.125 | 490 | — |
| `node_0068` | nodes/remove-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0068: Intent validation failed… | | | | | |
| `node_0069` | nodes/update-node.ts | divergent_both | 0.800 | 0.000 | 0.100 | 531 | — |
| `node_0070` | project/load.ts | divergent_both | 0.724 | 0.000 | 0.138 | 711 | — |
| `node_0071` | project/paths.ts | divergent_both | 0.625 | 0.000 | 0.188 | 392 | — |
| `node_0072` | projects/registry.ts | divergent_both | 0.710 | 0.000 | 0.145 | 569 | — |
| `node_0073` | render/box.ts | divergent_both | 0.776 | 0.000 | 0.112 | 765 | — |
| `node_0074` | render/style.ts | divergent_both | 0.673 | 0.000 | 0.163 | 860 | — |
| `node_0075` | render/table.ts | divergent_both | 0.422 | 0.000 | 0.289 | 1040 | — |
| `node_0076` | runs/persist.ts | divergent_both | 0.551 | 0.000 | 0.224 | 840 | — |
| `node_0077` | state/state-store.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0077: Intent validation failed… | | | | | |
| `node_0078` | branch/fiber.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0078: Intent validation failed… | | | | | |
| `node_0079` | branch/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0079: Intent validation failed… | | | | | |
| `node_0080` | compile/plan.ts | divergent_both | 0.947 | 0.000 | 0.026 | 506 | — |
| `node_0081` | compile/run-batch.ts | divergent_both | 0.948 | 0.000 | 0.026 | 330 | — |
| `node_0082` | compile/run.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0082: Intent validation failed… | | | | | |
| `node_0083` | context/assemble.ts | divergent_structural | 0.093 | 0.000 | 0.453 | 813 | — |
| `node_0084` | commands/doctor.ts | divergent_both | 0.594 | 0.000 | 0.203 | 502 | — |
| `node_0085` | edge/remove.ts | divergent_structural | 0.089 | 0.000 | 0.456 | 488 | — |
| `node_0086` | edge/update.ts | divergent_both | 0.322 | 0.000 | 0.339 | 496 | — |
| `node_0087` | events/tail.ts | divergent_structural | 0.131 | 0.000 | 0.434 | 821 | — |
| `node_0088` | frontier/index.ts | divergent_both | 0.811 | 0.000 | 0.095 | 732 | — |
| `node_0089` | graph/infer-edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0089: Intent validation failed… | | | | | |
| `node_0090` | graph/neighbors.ts | divergent_both | 0.988 | 0.000 | 0.006 | 262 | — |
| `node_0091` | graph/path.ts | divergent_both | 0.556 | 0.000 | 0.222 | 609 | — |
| `node_0092` | graph/subgraph.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0092: Intent validation failed… | | | | | |
| `node_0093` | ingest/cost-estimate.ts | divergent_both | 0.974 | 0.000 | 0.013 | 399 | — |
| `node_0095` | ingest/static-classifier-policy.ts | divergent_both | 0.390 | 0.000 | 0.305 | 778 | — |
| `node_0096` | commands/init.ts | divergent_both | 0.794 | 0.000 | 0.103 | 630 | — |
| `node_0097` | commands/inspect.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0097: Intent validation failed… | | | | | |
| `node_0098` | link/index.ts | divergent_both | 0.848 | 0.000 | 0.076 | 983 | — |
| `node_0099` | model/doctor.ts | divergent_both | 0.983 | 0.000 | 0.009 | 683 | — |
| `node_0100` | model/list.ts | divergent_structural | 0.097 | 0.000 | 0.452 | 635 | — |
| `node_0101` | node/create.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0101: Intent validation failed… | | | | | |
| `node_0102` | node/inspect.ts | divergent_both | 0.886 | 0.000 | 0.057 | 837 | — |
| `node_0103` | node/link.ts | divergent_both | 0.810 | 0.000 | 0.095 | 549 | — |
| `node_0104` | node/list.ts | divergent_structural | 0.204 | 0.000 | 0.398 | 589 | — |
| `node_0105` | node/remove.ts | divergent_structural | 0.148 | 0.000 | 0.426 | 523 | — |
| `node_0106` | node/show.ts | divergent_both | 0.561 | 0.000 | 0.220 | 501 | — |
| `node_0107` | node/update.ts | divergent_both | 0.652 | 0.000 | 0.174 | 582 | — |
| `node_0108` | commands/open.tsx | divergent_both | 0.851 | 0.000 | 0.074 | 586 | — |
| `node_0109` | projects/forget.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0109: Intent validation failed… | | | | | |
| `node_0110` | projects/list.ts | divergent_both | 0.531 | 0.000 | 0.235 | 474 | — |
| `node_0111` | proposal/apply.ts | divergent_both | 0.724 | 0.000 | 0.138 | 373 | — |
| `node_0112` | proposal/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0112: Intent validation failed… | | | | | |
| `node_0113` | proposal/propose-link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0113: Intent validation failed… | | | | | |
| `node_0114` | proposal/propose-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0114: Intent validation failed… | | | | | |
| `node_0115` | proposal/reject.ts | divergent_both | 0.778 | 0.000 | 0.111 | 320 | — |
| `node_0116` | proposal/show.ts | divergent_both | 0.429 | 0.000 | 0.286 | 496 | — |
| `node_0117` | query/index.ts | divergent_structural | 0.024 | 0.000 | 0.488 | 575 | — |
| `node_0118` | query/run-query.ts | divergent_both | 0.995 | 0.000 | 0.003 | 1085 | — |
| `node_0119` | run/context.ts | divergent_both | 0.823 | 0.000 | 0.088 | 621 | — |
| `node_0120` | run/prompt.ts | divergent_both | 0.821 | 0.000 | 0.090 | 706 | — |
| `node_0121` | runs/list.ts | divergent_both | 0.533 | 0.000 | 0.233 | 635 | — |
| `node_0122` | runs/verify.ts | divergent_structural | 0.231 | 0.000 | 0.385 | 724 | — |
| `node_0123` | commands/validate.ts | divergent_both | 0.714 | 0.000 | 0.143 | 908 | — |
| `node_0124` | verify/homeomorphism.ts | divergent_both | 0.972 | 0.000 | 0.014 | 599 | — |
| `node_0125` | commands/walk.ts | divergent_both | 0.366 | 0.000 | 0.317 | 782 | — |
| `node_0126` | schemas/ontology.ts | divergent_both | 0.841 | 0.000 | 0.080 | 697 | — |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
