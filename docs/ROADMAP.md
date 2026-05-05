# Ontology Roadmap

## Current State: Bootstrap 0.2.x / Context + Mock Runtime Preparation

Ontology is currently in the **Bootstrap 0.2.x / Context + Mock Runtime Preparation** phase. This phase introduces the foundational capabilities to grow the intention network through controlled CLI mutations—specifically, generating semantic nodes.

## Near-term tactical roadmap

Current Operational Loop: `graph → context → mock LLM → deterministic validation`

1. run prompt mock (completed)
2. run context mock (completed)
3. intent validator deterministic (completed)
4. presheaf/gluing minimum (completed)
5. SemanticLinker
6. Ollama adapter (partially completed)
7. PromptAST
8. Compiler skeleton

Implemented:
- mock run prompt
- dispatcher multi-provider
- isolated Ollama adapter
- run prompt --provider ollama
- run context --provider ollama
- model doctor/list
- node link (typed semantic edge creation)
- context assemble --include-edges (edge-aware context, with --edge-types filter)
- semantic linker skeleton

Planned:
- run context --include-edges (project edge context into LLM run)
- edge-aware SemanticLinker
- PromptAST
- compiler

At this stage, Ontology is a verified network kernel and a node editor. The network is strictly modeled as a typed, temporal directed graph, and all mutations are tracked via an append-only event log.

**Known limitations:**
- run context --include-edges (Planned / Not yet implemented)
- no compiler
- no PromptAST
- no edge-aware SemanticLinker graph reasoning (skeleton only)

## Next Phases

The roadmap outlines a progressive build-up towards a fully functioning semantic compiler and visual editor.

### Bootstrap 0.3: Edges and Graph Queries
- Implement typed semantic relations (edges) between nodes.
- Introduce foundational graph traversal and querying capabilities.

### Bootstrap 0.4: Assets, Models, and Processors
- Integrate real external models (e.g., real Ollama integration).
- Define processors and handlers for multimodal assets.

### Bootstrap 0.5: Presets and Stack Nodes
- Introduce predefined stack configurations and standard node presets to bootstrap projects faster.

### Bootstrap 0.6: Map and Slice
- Implement advanced topology mapping and neighborhood slicing tools.

### Bootstrap 0.7: PromptAST
- Parse natural language prompts into structural Abstract Syntax Trees (AST) as formal rewrite rules.

### Bootstrap 0.8: Minimal Compiler
- Introduce the first foundational compilation passes from intention to executable artifacts.

---

## Future Capabilities (Planned / Not Yet Implemented)

The following components are strictly **planned** and **do not yet exist** in the current architecture. They represent the long-term vision of Ontology as a complete ecosystem.

### SemanticLinker
*(Skeleton Implemented / Advanced features Planned)*
A dynamic linking system designed to automatically resolve and bind context, dependencies, and interfaces across the semantic network during the compilation functor process.

### Compiler
*(Planned / Not yet implemented)*
The ultimate compilation engine responsible for executing the structure-preserving functor from the category of intention (the `.ontology` network) to the category of executable artifacts (the generated codebase). Currently, Ontology generates no code.

### Visual DAG Studio
*(Planned / Not yet implemented)*
A visual, web-based, multidimensional interface to interact with, query, and edit the `.ontology` graph in real-time, moving beyond the current terminal-first CLI implementation.
