# Release Notes

## Phase: Alpha

### Loop State
`graph → context → mock LLM → deterministic validation`

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
- model doctor / model list
- node create / node list / node show / node link
- context assemble --include-edges (edge-aware context, with --edge-types filter)
- Semantic Linker (skeleton)

### Known limitations

- run context --include-edges not yet exposed
- SemanticLinker is a skeleton (no edge-aware graph reasoning yet)
- no PromptAST
- no compiler
- no Visual DAG Studio
