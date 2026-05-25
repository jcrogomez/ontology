# Move 3α bake-off synthesis

Cross-arm comparison of 4 arms. Baseline: `A`. All deltas are (arm − baseline).

## Arms

| Arm | Provider | Model | Nodes | Mean Jaccard | Mean LoC dist |
|---|---|---|---:|---:|---:|
| A | ollama | `qwen2.5-coder:7b` | 125 | 0.581 | 0.589 |
| A0-control | ollama | `qwen2.5-coder:7b (no --ast-grounding)` | 125 | 0.226 | 0.563 |
| B | ollama | `granite4.1:8b` | 125 | 0.000 | 0.067 |
| C-local | ollama | `starcoder2:7b` | 125 | 0.000 | 0.933 |

## Verdict distribution

| Arm | epsilon_equivalent | divergent_loc | divergent_structural | divergent_both | unrecoverable |
|---|---:|---:|---:|---:|---:|
| A | 12 | 71 | 5 | 37 | 0 |
| A0-control | 6 | 23 | 18 | 78 | 0 |
| B | 0 | 0 | 1 | 0 | 124 |
| C-local | 0 | 0 | 0 | 57 | 68 |

## Export recovery (Move 3α candado #2)

| Arm | Micro | Δ micro | Macro | Δ macro | Exact-match files |
|---|---:|---:|---:|---:|---:|
| A | 68.6% | 0.000 | 70.0% | 0.000 | 43 |
| A0-control | 25.6% | -0.430 | 25.6% | -0.443 | 16 |
| B | 0.0% | -0.686 | 0.0% | -0.700 | 0 |
| C-local | 0.0% | -0.686 | 0.0% | -0.700 | 0 |

## Failure modes (counts; Δ vs baseline)

| Arm | missing_exports | hallucinated_exports | empty_regen | compile_back_failed | gluing_rejected | schema_invalid |
|---|---:|---:|---:|---:|---:|---:|
| A | 35 (0) | 44 (0) | 21 (0) | 0 (0) | 0 (0) | 0 (0) |
| A0-control | 30 (-5) | 13 (-31) | 77 (+56) | 0 (0) | 0 (0) | 0 (0) |
| B | 0 (-35) | 0 (-44) | 1 (-20) | 124 (+124) | 0 (0) | 0 (0) |
| C-local | 0 (-35) | 0 (-44) | 57 (+36) | 68 (+68) | 0 (0) | 0 (0) |

## Pareto frontier (per arm, by task)

**Arm A:**

| Task | Provider | Model | Mean honesty | Mean $/node |
|---|---|---|---:|---:|
| code_sketch | ollama | `qwen2.5-coder:7b` | 0.496 | $0.0000 |

**Arm A0-control:**

| Task | Provider | Model | Mean honesty | Mean $/node |
|---|---|---|---:|---:|
| code_sketch | ollama | `qwen2.5-coder:7b` | 0.332 | $0.0000 |

**Arm B:**

| Task | Provider | Model | Mean honesty | Mean $/node |
|---|---|---|---:|---:|
| code_sketch | ollama | `granite4.1:8b` | 0.467 | $0.0000 |

**Arm C-local:**

| Task | Provider | Model | Mean honesty | Mean $/node |
|---|---|---|---:|---:|
| code_sketch | ollama | `starcoder2:7b` | 0.033 | $0.0000 |

## H1 read — mean structural Jaccard ≥ 0.1

| Arm | Mean Jaccard | Clears floor? |
|---|---:|---|
| A | 0.581 | ✅ yes |
| A0-control | 0.226 | ✅ yes |
| B | 0.000 | ❌ no |
| C-local | 0.000 | ❌ no |

**Decision-tree gate:** at least one arm clears the floor but not all → inspect per-mode deltas before routing; partial signal.

## Per-file rebuild status

Trend summary (non-baseline arms vs baseline `A`): improved 0, regressed 112, stable 0, mixed 13, incomparable 0.

| Source file | A | A0-control | B | C-local | Trend |
|---|---|---|---|---|---|
| `/Users/juancarlosromero/Development/ontology/src/commands/branch/fiber.ts` | divergent_loc (0.500) | divergent_loc (0.500) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/branch/list.ts` | divergent_loc (0.500) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/compile/plan.ts` | divergent_both (0.333) | divergent_both (0.333) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/compile/run-batch.ts` | divergent_both (0.250) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/compile/run.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/context/assemble.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/doctor.ts` | divergent_loc (0.500) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/edge/remove.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/edge/update.ts` | divergent_loc (0.667) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/frontier/index.ts` | divergent_both (0.000) | divergent_both (0.200) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/graph/infer-edges.ts` | divergent_both (0.250) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/graph/neighbors.ts` | divergent_loc (0.500) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/graph/path.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/graph/subgraph.ts` | divergent_loc (1.000) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/ingest/cost-estimate.ts` | divergent_loc (0.600) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/ingest/static-classifier-policy.ts` | divergent_loc (0.500) | divergent_both (0.400) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/init.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/inspect.ts` | divergent_both (0.077) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/commands/link/index.ts` | divergent_loc (0.500) | divergent_loc (0.500) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/model/doctor.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/model/list.ts` | divergent_both (0.000) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/commands/node/create.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/node/inspect.ts` | divergent_both (0.286) | divergent_both (0.143) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/node/link.ts` | divergent_loc (0.500) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/node/list.ts` | divergent_loc (1.000) | divergent_loc (1.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/node/remove.ts` | epsilon_equivalent (0.667) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/node/show.ts` | divergent_loc (1.000) | epsilon_equivalent (1.000) | unrecoverable (—) | unrecoverable (—) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/commands/open.tsx` | divergent_both (0.200) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/projects/forget.ts` | divergent_loc (0.500) | epsilon_equivalent (0.500) | unrecoverable (—) | divergent_both (0.000) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/commands/projects/list.ts` | epsilon_equivalent (1.000) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/proposal/apply.ts` | divergent_loc (0.500) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/proposal/list.ts` | epsilon_equivalent (0.500) | divergent_loc (0.500) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/proposal/propose-link.ts` | divergent_loc (0.667) | divergent_structural (0.222) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/proposal/propose-node.ts` | divergent_loc (1.000) | divergent_loc (0.500) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/proposal/reject.ts` | divergent_loc (0.667) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/proposal/show.ts` | divergent_both (0.333) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/query/index.ts` | divergent_loc (1.000) | epsilon_equivalent (1.000) | unrecoverable (—) | divergent_both (0.000) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/commands/query/run-query.ts` | divergent_both (0.200) | divergent_both (0.200) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/run/context.ts` | divergent_both (0.333) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/run/prompt.ts` | divergent_loc (0.500) | divergent_loc (0.500) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/runs/list.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/runs/show.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/runs/verify.ts` | divergent_loc (0.500) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/validate.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/verify/homeomorphism.ts` | divergent_loc (0.529) | divergent_both (0.118) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/commands/walk.ts` | epsilon_equivalent (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/drafts/persist.ts` | epsilon_equivalent (1.000) | epsilon_equivalent (1.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/edges/create-edge.ts` | epsilon_equivalent (0.667) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/edges/remove-edge.ts` | divergent_structural (0.000) | divergent_both (0.143) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/edges/update-edge.ts` | divergent_both (0.000) | divergent_loc (0.500) | unrecoverable (—) | unrecoverable (—) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/core/errors.ts` | epsilon_equivalent (1.000) | divergent_structural (0.000) | divergent_structural (0.000) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/fs/json.ts` | divergent_loc (1.000) | divergent_loc (1.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/fs/lock.ts` | divergent_both (0.400) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/integrity/hash.ts` | divergent_loc (1.000) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/nodes/create-node.ts` | divergent_loc (0.500) | divergent_loc (0.500) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/nodes/node-id.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/nodes/remove-node.ts` | divergent_loc (1.000) | divergent_both (0.333) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/nodes/update-node.ts` | divergent_both (0.333) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/project/load.ts` | divergent_structural (0.000) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/project/paths.ts` | divergent_structural (0.000) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/projects/registry.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/proposals/persist.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/render/box.ts` | divergent_loc (1.000) | divergent_loc (0.667) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/render/style.ts` | divergent_loc (0.667) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/render/table.ts` | epsilon_equivalent (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/runs/persist.ts` | divergent_loc (0.667) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/core/state/state-store.ts` | epsilon_equivalent (1.000) | divergent_loc (1.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/artifact-writer.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/compile-node.ts` | divergent_loc (0.600) | divergent_both (0.200) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/compile-plan-runner.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/manifestation-mapper.ts` | divergent_both (0.250) | divergent_both (0.400) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/post/extract-code-fence.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/post/runtime-check.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/post/validate-language.ts` | divergent_loc (0.500) | divergent_loc (0.500) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/compile/upstream-context.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/context/assembler.ts` | divergent_both (0.000) | divergent_loc (1.000) | unrecoverable (—) | divergent_both (0.000) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/context/edge-suggester.ts` | divergent_loc (0.750) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/context/gluing.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/context/intent-validator.ts` | divergent_loc (0.500) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/context/presheaf.ts` | divergent_structural (0.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/context/semantic-linker.ts` | divergent_both (0.214) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/context/types.ts` | divergent_loc (1.000) | epsilon_equivalent (1.000) | unrecoverable (—) | unrecoverable (—) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/effects/async.ts` | divergent_loc (0.667) | divergent_loc (0.667) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/effects/index.ts` | divergent_loc (1.000) | divergent_loc (1.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/effects/laws.ts` | divergent_both (0.000) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/effects/result.ts` | divergent_both (0.000) | divergent_structural (0.000) | unrecoverable (—) | unrecoverable (—) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/errors.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/fibration/branch-fiber.ts` | divergent_both (0.000) | divergent_loc (1.000) | unrecoverable (—) | unrecoverable (—) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/fibration/index.ts` | epsilon_equivalent (1.000) | epsilon_equivalent (1.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/fibration/types.ts` | divergent_loc (1.000) | divergent_loc (1.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/graph/compile-plan.ts` | divergent_loc (0.714) | divergent_loc (0.714) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/graph/edges.ts` | divergent_loc (0.600) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/graph/poset.ts` | divergent_loc (1.000) | divergent_both (0.375) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/graph/traversal.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/frontier-tagger.ts` | divergent_loc (0.875) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/matrix-intersections.ts` | divergent_loc (0.800) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/matrix.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/pareto.ts` | divergent_loc (0.750) | divergent_both (0.333) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/progress-report.ts` | divergent_loc (1.000) | divergent_both (0.182) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/render-ascii.ts` | divergent_loc (0.833) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/static-summary.ts` | divergent_both (0.167) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/structural-classifier.ts` | divergent_both (0.067) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/translator.ts` | divergent_loc (1.000) | divergent_loc (0.600) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/verify-homeomorphism.ts` | divergent_both (0.286) | divergent_both (0.286) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/legend/vocab-gap.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/anthropic/adapter.ts` | divergent_both (0.200) | divergent_both (0.333) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/dispatcher.ts` | divergent_loc (0.800) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/mock.ts` | divergent_both (0.000) | divergent_loc (1.000) | unrecoverable (—) | unrecoverable (—) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/model-capabilities.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/ollama/adapter.ts` | divergent_structural (0.250) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/registry.ts` | divergent_loc (1.000) | divergent_both (0.429) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/resolve-node-model.ts` | divergent_both (0.333) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/llm/types.ts` | epsilon_equivalent (1.000) | divergent_loc (1.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/prompt/parse.ts` | divergent_loc (0.667) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/prompt/types.ts` | divergent_both (0.000) | divergent_loc (1.000) | unrecoverable (—) | divergent_both (0.000) | mixed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/query/representable.ts` | divergent_loc (0.500) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/query/types.ts` | epsilon_equivalent (1.000) | divergent_structural (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/static/edges.ts` | divergent_loc (0.500) | divergent_both (0.250) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/static/python.ts` | divergent_both (0.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/static/typescript.ts` | divergent_both (0.250) | divergent_both (0.250) | unrecoverable (—) | divergent_both (0.000) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/topos/index.ts` | divergent_loc (1.000) | divergent_loc (1.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/topos/omega.ts` | divergent_loc (1.000) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/topos/predicate.ts` | divergent_loc (0.882) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/runtime/topos/rule-compiler.ts` | divergent_loc (0.750) | divergent_both (0.000) | unrecoverable (—) | unrecoverable (—) | regressed |
| `/Users/juancarlosromero/Development/ontology/src/schemas/ontology.ts` | divergent_loc (0.600) | divergent_both (0.000) | unrecoverable (—) | divergent_both (0.000) | regressed |
