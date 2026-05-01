# Ontology Project Diagram

Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts.

## A. Repo Source Tree

```text
ontology/
  package.json
  tsconfig.json
  docs/
  src/
    cli.ts
    schemas/
    core/
    commands/
```

- **`package.json` / `tsconfig.json`**: Standard Node/TypeScript config. Enforces ESM and strict typings.
- **`docs/`**: Holds documentation describing the semantic intention, definitions, and mathematical models of Ontology.
- **`src/cli.ts`**: The CLI presentation layer. Handles process exiting and command invocation.
- **`src/schemas/`**: Zod schemas defining the strict boundaries and types of the intention network.
- **`src/core/`**: Pure functions containing integrity hashing, validation, and file-system abstraction.
- **`src/commands/`**: Specific commands (`init`, `validate`, `inspect`, `node create`) that wire core functionality to the CLI.

## B. Generated `.ontology` State

```text
.ontology/
  state.json
  events.jsonl
  edges.jsonl
  nodes/
    node_0000_canon.json
    node_0001.json
  assets/
  models/registry.json
  processors/registry.json
  presets/
  contexts/snapshots/
  artifacts/generated/
  builds/
  reports/
```

- **`state.json`**: High-level metadata of the network's current state.
- **`events.jsonl`**: The append-only temporal log of every mutation (e.g., `system_init`, `node_created`).
- **`edges.jsonl`**: Storage for all typed semantic relations between nodes (empty until Bootstrap 0.3).
- **`nodes/`**: Directory containing the semantic nodes.
  - **`node_0000_canon.json`**: The genesis root node establishing the absolute mathematical axiom.
  - **`node_0001.json`**: A user-created domain entity node.
- **`assets/`**: Directory for handling external multimodal assets.
- **`models/registry.json`**: Registry connecting intentional model requests to available model nodes.
- **`processors/registry.json`**: Registry holding pure transformation logic metadata.
- **`presets/`**: Shared configurations and graph constraints.
- **`contexts/snapshots/`**: Presheaf local states captured during specific moments in the timeline.
- **`artifacts/generated/`**: The compiled shadows—where runnable code eventually emerges.
- **`builds/` / `reports/`**: Logs and artifacts related to validation or compilation runs.

## Execution Flow

```text
USER
  |
  | onto node create
  v
cli.ts
  |
  v
commands/node/create.ts
  |
  v
core/nodes/create-node.ts
  |
  +--> events.jsonl appends node_created
  +--> nodes/node_0001.json writes semantic node
  +--> state.json updates counts
```

1. The **User** interacts via terminal (e.g., `onto node create ...`).
2. **`cli.ts`** intercepts the invocation, handling inputs and terminal UI wrappers.
3. The specific **`command`** (e.g., `create.ts`) takes over, mapping the intent to core logic.
4. **`core helpers`** execute the actual data manipulation, hash calculations, and integrity checks.
5. The outcome explicitly mutates the **`.ontology`** state (generating a node, logging the temporal event, updating summary) and returns success or bubbles errors up to the CLI.
