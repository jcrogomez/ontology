# verify-homeomorphism report

**Generated:** 2026-05-24T10:11:19.355Z
**Root:** `/Users/juancarlosromero/Development/ontology`
**Provider override:** ollama
**Model override:** `granite4.1:8b`
**Thresholds:** LoC < 0.3, Jaccard ≥ 0.5

## Aggregate

| Verdict | Count | % |
|---|---:|---:|
| epsilon_equivalent | 0 | 0% |
| divergent_loc | 0 | 0% |
| divergent_structural | 1 | 1% |
| divergent_both | 0 | 0% |
| unrecoverable | 124 | 99% |
| **Total** | **125** | |

```
epsilon_equivalent    ░░░░░░░░░░░░░░░░░░░░  0
divergent_loc         ░░░░░░░░░░░░░░░░░░░░  0
divergent_structural  ░░░░░░░░░░░░░░░░░░░░  1
divergent_both        ░░░░░░░░░░░░░░░░░░░░  0
unrecoverable         ████████████████████  124
```

**Aggregate dispatch:**
- Input tokens: 510
- Output tokens: 84
- Total tokens: 594

## Matrix by axis (Phase ε prework C)

| Axis | Distribution |
|---|---|
| contract | `not-measured`=125 |
| structural | `not-measured`=124, `fail`=1 |
| behavior | `not-applicable`=124, `untested`=1 |
| intent | `needs-human`=124, `not-reviewed`=1 |
| literalRequired | `false`=125 |

*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*

## Honesty by axis (Phase ε prework F)

| Axis | Mean | n | Coverage |
|---|---:|---:|---:|
| structural | 0.467 | 1 | 1% |
| contract | — | 0 | 0% |
| behavior | — | 0 | 0% |
| intent | 0.500 | 124 | 99% |

*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*

```
structural honesty (n=1)
████████████████████
           0.47─0.47
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
| code_sketch | ollama | `granite4.1:8b` | 125 | 0.467 (n=1) | $0 | 4 | 1 | ★ |

*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*

## Frontier coverage

| Tag | Count |
|---|---:|
| `vocab-gap` | 117 |
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
| `not-reviewed` | 1 |
| `structural-drift` | 1 |

```
vocab-gap              ████████████████████  117
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
not-reviewed           ░░░░░░░░░░░░░░░░░░░░  1
structural-drift       ░░░░░░░░░░░░░░░░░░░░  1
```

## Frontier intersections (hypothesis §6 required + discovered)

| Intersection | Count |
|---|---:|
| io-bound ∧ structural-drift | 0 |
| io-bound ∧ behavior-drift | 0 |
| literal-required ∧ prompt-sensitive | 0 |
| cli-parsing ∧ behavior-drift | 0 |
| schema-driven ∧ contract-equivalent | 0 |
| pure-transform ∧ behavior-equivalent | 0 |
| contract-missing ∧ not-reviewed | 0 |

## Per-node

| Node | Source | Verdict | LoC dist | Jaccard | Honesty | Tokens | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| `node_0001` | compile/artifact-writer.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0001: fetch failed | | | | | |
| `node_0002` | compile/compile-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0002: fetch failed | | | | | |
| `node_0003` | compile/compile-plan-runner.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0003: fetch failed | | | | | |
| `node_0004` | compile/manifestation-mapper.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0004: fetch failed | | | | | |
| `node_0005` | post/extract-code-fence.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0005: fetch failed | | | | | |
| `node_0006` | post/runtime-check.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0006: fetch failed | | | | | |
| `node_0007` | post/validate-language.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0007: fetch failed | | | | | |
| `node_0008` | compile/upstream-context.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0008: fetch failed | | | | | |
| `node_0009` | context/assembler.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0009: fetch failed | | | | | |
| `node_0010` | context/edge-suggester.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0010: fetch failed | | | | | |
| `node_0011` | context/gluing.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0011: fetch failed | | | | | |
| `node_0012` | context/intent-validator.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0012: fetch failed | | | | | |
| `node_0013` | context/presheaf.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0013: fetch failed | | | | | |
| `node_0014` | context/semantic-linker.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0014: fetch failed | | | | | |
| `node_0015` | context/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0015: fetch failed | | | | | |
| `node_0016` | effects/async.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0016: fetch failed | | | | | |
| `node_0017` | effects/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0017: fetch failed | | | | | |
| `node_0018` | effects/laws.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0018: fetch failed | | | | | |
| `node_0019` | effects/result.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0019: fetch failed | | | | | |
| `node_0020` | runtime/errors.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0020: fetch failed | | | | | |
| `node_0021` | fibration/branch-fiber.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0021: fetch failed | | | | | |
| `node_0022` | fibration/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0022: fetch failed | | | | | |
| `node_0023` | fibration/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0023: fetch failed | | | | | |
| `node_0024` | graph/compile-plan.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0024: fetch failed | | | | | |
| `node_0025` | graph/edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0025: fetch failed | | | | | |
| `node_0026` | graph/poset.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0026: fetch failed | | | | | |
| `node_0027` | graph/traversal.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0027: fetch failed | | | | | |
| `node_0028` | legend/frontier-tagger.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0028: fetch failed | | | | | |
| `node_0029` | legend/matrix-intersections.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0029: fetch failed | | | | | |
| `node_0030` | legend/matrix.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0030: fetch failed | | | | | |
| `node_0031` | legend/pareto.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0031: fetch failed | | | | | |
| `node_0032` | legend/progress-report.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0032: fetch failed | | | | | |
| `node_0033` | legend/render-ascii.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0033: fetch failed | | | | | |
| `node_0034` | legend/static-summary.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0034: fetch failed | | | | | |
| `node_0035` | legend/structural-classifier.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0035: fetch failed | | | | | |
| `node_0036` | legend/translator.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0036: fetch failed | | | | | |
| `node_0037` | legend/verify-homeomorphism.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0037: fetch failed | | | | | |
| `node_0038` | legend/vocab-gap.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0038: fetch failed | | | | | |
| `node_0039` | anthropic/adapter.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0039: fetch failed | | | | | |
| `node_0040` | llm/dispatcher.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0040: fetch failed | | | | | |
| `node_0041` | llm/mock.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0041: fetch failed | | | | | |
| `node_0042` | llm/model-capabilities.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0042: fetch failed | | | | | |
| `node_0043` | ollama/adapter.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0043: fetch failed | | | | | |
| `node_0044` | llm/registry.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0044: fetch failed | | | | | |
| `node_0045` | llm/resolve-node-model.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0045: fetch failed | | | | | |
| `node_0046` | llm/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0046: fetch failed | | | | | |
| `node_0047` | prompt/parse.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0047: fetch failed | | | | | |
| `node_0048` | prompt/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0048: fetch failed | | | | | |
| `node_0049` | query/representable.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0049: fetch failed | | | | | |
| `node_0050` | query/types.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0050: fetch failed | | | | | |
| `node_0051` | static/edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0051: fetch failed | | | | | |
| `node_0052` | static/python.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0052: fetch failed | | | | | |
| `node_0053` | static/typescript.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0053: fetch failed | | | | | |
| `node_0054` | topos/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0054: fetch failed | | | | | |
| `node_0055` | topos/omega.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0055: fetch failed | | | | | |
| `node_0056` | topos/predicate.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0056: fetch failed | | | | | |
| `node_0057` | topos/rule-compiler.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0057: fetch failed | | | | | |
| `node_0058` | drafts/persist.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0058: fetch failed | | | | | |
| `node_0059` | edges/create-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0059: fetch failed | | | | | |
| `node_0060` | edges/remove-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0060: fetch failed | | | | | |
| `node_0061` | edges/update-edge.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0061: fetch failed | | | | | |
| `node_0062` | core/errors.ts | divergent_structural | 0.067 | 0.000 | 0.467 | 594 | — |
| `node_0063` | fs/json.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0063: fetch failed | | | | | |
| `node_0064` | fs/lock.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0064: fetch failed | | | | | |
| `node_0065` | integrity/hash.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0065: fetch failed | | | | | |
| `node_0066` | nodes/create-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0066: fetch failed | | | | | |
| `node_0067` | nodes/node-id.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0067: fetch failed | | | | | |
| `node_0068` | nodes/remove-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0068: fetch failed | | | | | |
| `node_0069` | nodes/update-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0069: fetch failed | | | | | |
| `node_0070` | project/load.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0070: fetch failed | | | | | |
| `node_0071` | project/paths.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0071: fetch failed | | | | | |
| `node_0072` | projects/registry.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0072: fetch failed | | | | | |
| `node_0073` | proposals/persist.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0073: fetch failed | | | | | |
| `node_0074` | render/box.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0074: fetch failed | | | | | |
| `node_0075` | render/style.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0075: fetch failed | | | | | |
| `node_0076` | render/table.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0076: fetch failed | | | | | |
| `node_0077` | runs/persist.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0077: fetch failed | | | | | |
| `node_0078` | state/state-store.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0078: fetch failed | | | | | |
| `node_0079` | branch/fiber.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0079: fetch failed | | | | | |
| `node_0080` | branch/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0080: fetch failed | | | | | |
| `node_0081` | compile/plan.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0081: fetch failed | | | | | |
| `node_0082` | compile/run-batch.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0082: fetch failed | | | | | |
| `node_0083` | compile/run.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0083: fetch failed | | | | | |
| `node_0084` | context/assemble.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0084: fetch failed | | | | | |
| `node_0085` | commands/doctor.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0085: fetch failed | | | | | |
| `node_0086` | edge/remove.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0086: fetch failed | | | | | |
| `node_0087` | edge/update.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0087: fetch failed | | | | | |
| `node_0088` | frontier/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0088: fetch failed | | | | | |
| `node_0089` | graph/infer-edges.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0089: fetch failed | | | | | |
| `node_0090` | graph/neighbors.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0090: fetch failed | | | | | |
| `node_0091` | graph/path.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0091: fetch failed | | | | | |
| `node_0092` | graph/subgraph.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0092: fetch failed | | | | | |
| `node_0093` | ingest/cost-estimate.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0093: fetch failed | | | | | |
| `node_0095` | ingest/static-classifier-policy.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0095: fetch failed | | | | | |
| `node_0096` | commands/init.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0096: fetch failed | | | | | |
| `node_0097` | commands/inspect.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0097: fetch failed | | | | | |
| `node_0098` | link/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0098: fetch failed | | | | | |
| `node_0099` | model/doctor.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0099: fetch failed | | | | | |
| `node_0100` | model/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0100: fetch failed | | | | | |
| `node_0101` | node/create.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0101: fetch failed | | | | | |
| `node_0102` | node/inspect.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0102: fetch failed | | | | | |
| `node_0103` | node/link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0103: fetch failed | | | | | |
| `node_0104` | node/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0104: fetch failed | | | | | |
| `node_0105` | node/remove.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0105: fetch failed | | | | | |
| `node_0106` | node/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0106: fetch failed | | | | | |
| `node_0107` | commands/open.tsx | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0107: fetch failed | | | | | |
| `node_0108` | projects/forget.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0108: fetch failed | | | | | |
| `node_0109` | projects/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0109: fetch failed | | | | | |
| `node_0110` | proposal/apply.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0110: fetch failed | | | | | |
| `node_0111` | proposal/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0111: fetch failed | | | | | |
| `node_0112` | proposal/propose-link.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0112: fetch failed | | | | | |
| `node_0113` | proposal/propose-node.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0113: fetch failed | | | | | |
| `node_0114` | proposal/reject.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0114: fetch failed | | | | | |
| `node_0115` | proposal/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0115: fetch failed | | | | | |
| `node_0116` | query/index.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0116: fetch failed | | | | | |
| `node_0117` | query/run-query.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0117: fetch failed | | | | | |
| `node_0118` | run/context.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0118: fetch failed | | | | | |
| `node_0119` | run/prompt.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0119: fetch failed | | | | | |
| `node_0120` | runs/list.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0120: fetch failed | | | | | |
| `node_0121` | runs/show.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0121: fetch failed | | | | | |
| `node_0122` | runs/verify.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0122: fetch failed | | | | | |
| `node_0123` | commands/validate.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0123: fetch failed | | | | | |
| `node_0124` | verify/homeomorphism.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0124: fetch failed | | | | | |
| `node_0125` | commands/walk.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0125: fetch failed | | | | | |
| `node_0126` | schemas/ontology.ts | unrecoverable | — | — | — | — | — |
| | ↳ failure | compile-back failed: Compile failed at step node_0126: fetch failed | | | | | |

## Methodology

Each node's compile-back artifact is diffed against its source on disk using two distances: `locDistance` (line-count delta normalized into [0,1]) and `structuralJaccard` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See `docs/PROJECT_LEGEND.md` §6 Layer 6 for the formal model.

When `--matrix` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in `docs/POSITIONING.md` §2. The verdict above maps onto the `structural` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see `docs/legend/PREWORK_2026-05-13.md` §C for the mapping table.

Frontier tags come from the path/content tagger (`src/runtime/legend/frontier-tagger.ts`) unioned with verdict-derived tags. Required intersections are pre-registered in `SELF_INGEST_HYPOTHESIS_<date>.md` §6.
