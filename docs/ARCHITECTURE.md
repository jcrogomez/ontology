# Ontology Architecture

This document describes the real, current architectural state of the Ontology project as of Bootstrap 0.2. It explicitly outlines how the different core modules relate and separates existing foundational elements from future planned systems.

## Core Architectural Modules

### 1. The Kernel
The Kernel is the foundational backbone of Ontology. It strictly manages the physical and semantic integrity of the `.ontology` intention network.
- **Pure Core Logic (`src/core/`)**: Handles file-system abstractions, topological state mutations, and cryptographic hashing (using `node:crypto`). It has no side effects related to presentation or process termination.
- **Strict Validation (`src/schemas/`)**: All network domains, events, nodes, and states are rigorously typed and validated via Zod schemas.
- **Temporal Event Log**: A strictly append-only `events.jsonl` file tracks every mutation (e.g., `node_created`), forming the basis for auditability, replay, and temporal invariants.
- **State Management**: Maintains `state.json` as the high-level summary (counts, last events, metadata) of the physical network.

### 2. Observability
Observability in Ontology is strictly functional, terminal-first, and built into the CLI presentation layer.
- **Design Philosophy**: Adheres to a stark, brutalist, and industrial design. It avoids complex UI rendering in favor of clear, monospaced typography, structural contrast, and simple unicode markers (✔, ✖).
- **Inspection**: Centralized data loaders in `src/core/project/load.ts` perform read-only operations to load the topological state and output structural summaries.
- **Error Handling**: Uses clear relative paths for missing files and synthesizes Zod validation issues into concise, readable formats. If a process fails, it fails loudly and exits explicitly with code 1.

### 3. LLM Runtime
*(Isolated Integration Layer)*
The LLM runtime handles the interface with external models.
- **Isolation**: Housed strictly under `src/runtime/llm/`. It is entirely decoupled from the core structural graph commands (e.g., node creation).
- **Safety**: Direct parsing of LLM outputs enforces robustness. All external model outputs are wrapped in `try/catch` blocks, re-throwing formatted errors that include raw content to assist with debugging.
- **Current State**: The loop `graph → context → mock LLM → deterministic validation` is complete and operational. Note that this loop currently operates strictly read-only and does not mutate the network or invoke real models yet. The deterministic validation includes the intent validator and presheaf/gluing pipeline as a minimal implementation. **Real external model integration (like a functioning Ollama bridge) is Planned / Not yet implemented.**

**Known limitations:**
- no Ollama real in CLI yet
- no compiler
- no PromptAST
- no advanced SemanticLinker graph reasoning
- no edge create/node link yet

### 4. Context Assembler
The Context Assembler is responsible for organizing the local graph state that bounds the constraints of a node.
- **Mechanism**: In Ontology, context is defined locally as a presheaf over graph neighborhoods. The assembler calculates "requires", "provides", "forbids", and "optional" relationships based on a node's topological position.
- **Data Flow**: Outputs structured, nested arrays of contextual strings formatted cleanly for terminal presentation. It does not act globally but defines the immediate boundaries required to parse intention.

---

## Module Relationships and Execution Flow

1. **Presentation Layer (`src/cli.ts`)**: Acts strictly as a router. It accepts terminal commands, parses arguments, and delegates to the appropriate command module.
2. **Command Layer (`src/commands/`)**: Translates user intent (e.g., "create a domain node") into structured requests for the Kernel.
3. **The Kernel (`src/core/`)**: Processes the request. It validates the inputs against the schemas, appends the action to the temporal `events.jsonl` log, mutates the graph (e.g., saving a new node file), and updates `state.json`.
4. **Context & Runtime**: If the command requires contextual awareness or model validation, the Kernel queries the Context Assembler and delegates external parsing logic to the isolated LLM Runtime.
5. **Observability**: Finally, the CLI presentation layer reads the resulting state (via observability loaders) and prints a brutalist, strictly formatted summary to the user.

---

## Future Systems

To maintain absolute clarity on the current state of the architecture, the following modules are **Planned / Not yet implemented**:

- **SemanticLinker**: Planned to automatically bind context and dependencies across the network.
- **Compiler**: Planned to transform the `.ontology` graph into executable code artifacts. Currently, Ontology does not generate code.
- **Visual DAG Studio**: Planned web-based UI.
- **Real Ollama Execution**: The pure runtime wrappers exist, but live model execution and PromptAST parsing do not yet exist.
