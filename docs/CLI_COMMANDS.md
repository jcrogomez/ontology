# CLI Commands

This document outlines the available CLI commands across current Bootstrap phases.

> **Note on Usage:**
> For local development, execute commands via `npm run dev -- <command>`.
> In production or as an installed package, the alias `onto <command>` is used.
> The examples below use the development format.

## Bootstrap 0.1 Commands

### `doctor`

- **Purpose:** Analyzes the physical structure of the `.ontology` folder and returns a health report.
- **Example:** `npm run dev -- doctor` (or `npm run dev -- doctor --json`)

### `init`

- **Purpose:** Initializes the minimal `.ontology` network. Creates the kernel boundaries, mathematical canon node, temporal event log, structural edge log, and overall state tracking.
- **Example:** `npm run dev -- init`
- **Files Touched:**
  - `.ontology/state.json` (Creates)
  - `.ontology/events.jsonl` (Creates, appends `system_init`)
  - `.ontology/edges.jsonl` (Creates, empty)
  - `.ontology/nodes/node_0000_canon.json` (Creates)
- **What it does not do:** It does not overwrite an existing valid `.ontology` network.

### `validate`

- **Purpose:** Verifies the cryptographic hashes, strict schemas, and referential integrity of the intention network.
- **Example:** `npm run dev -- validate`
- **Files Touched:** Reads `.ontology/state.json`, `.ontology/events.jsonl`, `.ontology/edges.jsonl`, and all `.ontology/nodes/*.json` files.
- **What it does not do:** It does not mutate or fix any files. If validations fail, it exits loudly with a non-zero code.

### `inspect`

- **Purpose:** Summarizes the current topological state, detailing nodes, events, and edge counts.
- **Example:** `npm run dev -- inspect` (or `npm run dev -- inspect --json`)
- **Files Touched:** Reads `.ontology/state.json`.
- **What it does not do:** It does not list granular details of the nodes, only an aggregate summary.

## Bootstrap 0.2 Commands

### `node create`

- **Purpose:** A semantic and temporal mutation that generates a new structured node in the intention network based on a text prompt.
- **Example:** `npm run dev -- node create --level domain --kind entity --prompt "Harvest has seededQuantity, harvestedQuantity and status."`
- **Files Touched:**
  - `.ontology/nodes/node_0001.json` (Creates the node file)
  - `.ontology/events.jsonl` (Appends a `node_created` event)
  - `.ontology/state.json` (Updates summary counters and timestamp)
- **What it does not do:** It does not create typed edges between nodes. It does not parse the prompt into PromptAST. It does not execute models or processors to generate subgraphs or code.

### `node list`

- **Purpose:** Lists all nodes in the network.
- **Example:** `npm run dev -- node list` (or `npm run dev -- node list --json`)

### `node show`

- **Purpose:** Displays detailed information for a specific node.
- **Example:** `npm run dev -- node show <id>` (or `npm run dev -- node show <id> --json`)

### `events tail`

- **Purpose:** Streams or lists the most recent events from the event log.
- **Example:** `npm run dev -- events tail` (or `npm run dev -- events tail --json`)

### `context assemble`

- **Purpose:** Deterministically computes the local context for a specific node.
- **Example:** `npm run dev -- context assemble <nodeId>` (or `npm run dev -- context assemble <nodeId> --json`)

### `run prompt`

- **Purpose:** Runs an LLM task directly with a given prompt.
- **Example:** `npm run dev -- run prompt --task <task> --prompt <text> --provider mock` (or `npm run dev -- run prompt --task <task> --prompt <text> --provider mock --json`)

### `run context`

- **Purpose:** Runs an LLM task against an assembled context for a given node.
- **Example:** `npm run dev -- run context <nodeId> --provider mock` (or `npm run dev -- run context <nodeId> --provider mock --json`)

### `run context --validate`

- **Purpose:** Runs an LLM task against an assembled context and strictly validates the response via the intentional validation pipeline.
- **Example:** `npm run dev -- run context <nodeId> --provider mock --validate`

## Planned Commands

The following commands are *Planned / Not yet implemented*:
- `model doctor`
- `model list`
