# Release Notes

## Phase: Alpha

### Loop State
`graph → context (edge-aware) → LLM (mock | ollama) → deterministic validation → optional persistence`

### Progress

- Kernel + observability
- Context Assembler strict
- Context CLI
- Mock LLM adapter
- Ollama LLM adapter (isolated)
- Multi-provider dispatcher (mock + ollama)
- Runtime errors
- Presheaf/gluing
- Intent Validator
- run prompt (mock + ollama)
- run context (mock + ollama)
- run context --validate
- run context --include-edges / --edge-types (edge-aware run with the same filter as `context assemble`)
- run prompt --persist / run context --persist (content-addressed run records, cache by deterministic id)
- runs list / runs show / runs verify (audit primitives over `.ontology/runs/`)
- model doctor / model list
- node create / node list / node show / node link (with self-loop rejection, unique-edge dedup, and poset direction enforcement on refinement-family edges)
- context assemble --include-edges (edge-aware context, with --edge-types filter)
- Walker v0 (read-only focal-cell terminal interface, color by abstraction, presheaf-overlap underlining)
- Cycle detection in parent-pointer walks (assembler + walker)
- Centralized error message helper across all CLI catches
- Poset enforcement on refinement-family edges (link-time + retroactive in `onto validate`)
- Proposal system Bootstrap 0.5 PR #92: `onto propose node`, schema, storage, `proposal_created` event
- Proposal system Bootstrap 0.5 PR #93: `onto proposal list / show / reject`, `proposal_rejected` event with old/new hash audit chain
- Proposal system Bootstrap 0.5 PR #94: `onto proposal apply` (with `--dry-run`), `parentHash` re-validation, stale detection, `proposal_applied` and `proposal_staled` events. Apply translates a pending proposal into a real `node_create` mutation iff the parent has not changed; otherwise the proposal transitions to `staled`. The resulting `node_created` event carries `sourceProposalId` so any node can be traced back to the proposal that produced it.
- Proposal system Bootstrap 0.5 PR #95: `run prompt --as-proposal` and `run context --as-proposal`. Model runs become typed candidate proposals in one CLI invocation, with `source.runId`, `source.contextHash`, and `source.promptHash` populated from the persisted run record. The full audit chain `run_persisted → proposal_created → node_created → proposal_applied` is replayable from the events log alone.
- Proposal system PR #96: `onto propose link` for `edge_create` proposals. The mutation schema is now a discriminated union with `node_create` and `edge_create` variants. Edge proposals pin BOTH endpoint hashes; if either node mutates between propose and apply, the proposal transitions to `staled`. The kernel's `createEdge` helper is shared between `onto node link` and `proposal apply`, so poset enforcement and dedup behave identically through both paths.
- Edge-aware SemanticLinker (PR #97): the programmatic `semanticLink` API now accepts `includeEdges` and `edgeTypes` and passes them through to the assembler, so neighbor nodes brought in via typed edges contribute to the gluing pool. A focal `requires` can now be satisfied by an edge neighbor's `provides`; an edge neighbor's `provides` can trigger a focal `forbids` that the parent path alone would not catch. The result includes an `edgeContext` block when edge-awareness is on. The provider field is Zod-parsed instead of any-cast.

### Known limitations

- run context --include-edges does not yet support persistence-of-cached behavior across edge-types filter changes (works correctly; just noting the cache key includes the filter)
- SemanticLinker is a skeleton (no edge-aware graph reasoning yet)
- Poset enforcement covers refinement-family edges (`refines`, `inherits_from`, `implements`, `belongs_to`); other edges remain direction-agnostic
- no PromptAST
- no compiler
- no Visual DAG Studio
- single-writer assumption: state.json updates assume the CLI runs single-shot. Concurrent invocations are not protected by a lock.
