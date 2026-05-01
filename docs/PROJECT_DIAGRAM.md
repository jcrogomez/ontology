# Ontology Project Diagram

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
- **`src/commands/`**: Specific commands (`init`, `validate`, `inspect`) that wire core functionality to the CLI.

## B. Generated `.ontology` State

```text
.ontology/
  state.json
  events.jsonl
  edges.jsonl
  nodes/node_0000_canon.json
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
- **`events.jsonl`**: The append-only temporal log of every mutation that happened in the network.
- **`edges.jsonl`**: Storage for all typed semantic relations between nodes.
- **`nodes/node_0000_canon.json`**: The genesis root node establishing the absolute mathematical axiom.
- **`assets/`**: Directory for handling external multimodal assets.
- **`models/registry.json`**: Registry connecting intentional model requests to available model nodes.
- **`processors/registry.json`**: Registry holding pure transformation logic metadata.
- **`presets/`**: Shared configurations and graph constraints.
- **`contexts/snapshots/`**: Presheaf local states captured during specific moments in the timeline.
- **`artifacts/generated/`**: The compiled shadows—where runnable code eventually emerges.
- **`builds/` / `reports/`**: Logs and artifacts related to validation or compilation runs.

## Execution Flow

```text
USER -> cli.ts -> command -> core helpers -> .ontology
```

1. The **User** interacts via terminal (`npm run dev -- <command>`).
2. **`cli.ts`** intercepts the invocation, handling inputs and terminal UI wrappers.
3. The specific **`command`** (e.g., `init.ts`) takes over, mapping the intent to core logic.
4. **`core helpers`** execute the actual data manipulation, hash calculations, and integrity checks.
5. The result modifies or reads from the **`.ontology`** state, returning success or bubbling errors up to the CLI.
