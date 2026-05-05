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

### Known limitations

- run context --include-edges does not yet support persistence-of-cached behavior across edge-types filter changes (works correctly; just noting the cache key includes the filter)
- SemanticLinker is a skeleton (no edge-aware graph reasoning yet)
- Poset enforcement covers refinement-family edges (`refines`, `inherits_from`, `implements`, `belongs_to`); other edges remain direction-agnostic
- no PromptAST
- no compiler
- no Visual DAG Studio
- single-writer assumption: state.json updates assume the CLI runs single-shot. Concurrent invocations are not protected by a lock.
