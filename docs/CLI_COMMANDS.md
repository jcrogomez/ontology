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

### `node link`

- **Purpose:** Creates a typed semantic edge between two existing nodes and appends an `edge_created` event to the temporal log.
- **Example:** `npm run dev -- node link --from node_0000_canon --to node_0001 --type documents` (or with `--json`)
- **Files Touched:**
  - `.ontology/edges.jsonl` (Appends the typed edge)
  - `.ontology/events.jsonl` (Appends an `edge_created` event)
  - `.ontology/state.json` (Updates summary counters and timestamp)
- **Validation at link time:**
  - Self-loops (`from === to`) are rejected.
  - The four refinement-family edges (`refines`, `inherits_from`, `implements`, `belongs_to`) must climb the abstraction poset; an inversion (e.g. `canon refines domain`) is rejected with `✖ Edge type ... points against the abstraction poset`. Other edge types are direction-agnostic.
- **What it does not do:** It does not delete or modify existing edges.

### `events tail`

- **Purpose:** Streams or lists the most recent events from the event log.
- **Example:** `npm run dev -- events tail` (or `npm run dev -- events tail --json`)

### `context assemble`

- **Purpose:** Deterministically computes the local context for a specific node.
- **Example:** `npm run dev -- context assemble <nodeId>` (or `npm run dev -- context assemble <nodeId> --json`)
- **Edge-aware Example:** `npm run dev -- context assemble <nodeId> --include-edges`
- **Filtered Edge Example:** `npm run dev -- context assemble <nodeId> --include-edges --edge-types documents,validates_against`
- **Notes:** Without `--include-edges`, the assembler returns the parent path only. With it, the assembler projects typed edges incident to the node into an `edgeContext` block. Edge type values are validated against `EdgeTypeSchema`; an invalid type fails loudly with `✖ Invalid edge type: <type>`. The command never mutates `.ontology`.

### `run prompt`

- **Purpose:** Runs an LLM task directly with a given prompt.
- **Example:** `npm run dev -- run prompt --task <task> --prompt <text> --provider mock` (or `npm run dev -- run prompt --task <task> --prompt <text> --provider mock --json`)
- **Example (Ollama):** `npm run dev -- run prompt --task <task> --prompt <text> --provider ollama --model llama3.1:8b`
- **Notes:** Models may speak. Only explicit graph commands may mutate `.ontology`. Ollama execution is local and will fail gracefully if unavailable.



### `run context`

- **Purpose:** Runs an LLM task against an assembled context for a given node.
- **Example:** `npm run dev -- run context <nodeId> --provider mock` (or `npm run dev -- run context <nodeId> --provider mock --json`)
- **Example (Ollama):** `npm run dev -- run context <nodeId> --provider ollama --model llama3.1:8b`
- **Edge-aware Example:** `npm run dev -- run context <nodeId> --provider mock --include-edges`
- **Filtered Edge Example:** `npm run dev -- run context <nodeId> --provider mock --include-edges --edge-types depends_on,validates_against`
- **Notes:** Reads the assembled context but never writes back. With `--include-edges`, the run consumes the same edge context that `context assemble --include-edges` produces. Edge type values are validated against `EdgeTypeSchema`; an invalid type fails loudly with `✖ Invalid edge type: <type>`. When combined with `--persist`, the cache key incorporates the edge configuration: an edge-aware run produces a different `runId` than a plain run on the same node.

### `run context --validate`

- **Purpose:** Runs an LLM task against an assembled context and strictly validates the response via the intentional validation pipeline.
- **Example:** `npm run dev -- run context <nodeId> --provider mock --validate`

### `run prompt --persist` and `run context --persist`

- **Purpose:** Persist the run as a content-addressed record under `.ontology/runs/`. Two structurally identical runs share the same id; the second invocation reads the cached record and reports `(cached)` instead of re-dispatching.
- **Example:** `npm run dev -- run prompt --task semantic_parse --prompt "Hello" --provider mock --persist`
- **Example:** `npm run dev -- run context <nodeId> --provider mock --persist --validate`
- **Files Touched:**
  - `.ontology/runs/run_<id>.json` (Creates the persisted run record)
  - `.ontology/events.jsonl` (Appends a `run_persisted` event)
  - `.ontology/state.json` (Updates summary counters)
- **Notes:** Without `--persist`, runs remain ephemeral. See `docs/RUN_PERSISTENCE.md`.

### `runs list`

- **Purpose:** List persisted run records.
- **Example:** `npm run dev -- runs list` (or `... --json`, `... --kind prompt`, `... --kind context`)

### `runs show <runId>`

- **Purpose:** Display a single persisted run record.
- **Example:** `npm run dev -- runs show run_ef9dd6aa` (or `... --json`)

### `runs verify <runId>`

- **Purpose:** Recompute the deterministic id and body hash of a persisted run and report any divergence. Read-only audit primitive.
- **Example:** `npm run dev -- runs verify run_ef9dd6aa` (or `... --json`). Exits non-zero on mismatch.

### `walk <nodeId>` *(v0, read-only)*

- **Purpose:** Open the Walker, an interactive focal-cell terminal interface for the intention graph. Color encodes the abstraction level, tokens shared across the local neighborhood are underlined (presheaf overlap), and the path bar renders a colored breadcrumb from canon to focal.
- **Example:** `npm run dev -- walk node_0000_canon`
- **v0 keys:** `↑` parent · `↓` child · `←/→` siblings · `:q` / `q` quit · `:help` flash help.
- **Notes:** Requires an interactive TTY. Future versions will add edit mode, `:run`, `:propose`, and `:compile`. See `docs/WALKER_INTERFACE.md`.

### `propose node` *(Bootstrap 0.5, PR #92)*

- **Purpose:** Create a typed candidate node mutation — a *proposal* — without touching the graph. Writes a record under `.ontology/proposals/proposal_<id>.json` and appends a `proposal_created` event to the temporal log.
- **Example:** `npm run dev -- propose node --level domain --kind entity --prompt "Harvest entity"`
- **Optional flags:** `--label`, `--parent <nodeId>` (defaults to root canon), `--rationale <text>`, `--json`.
- **Files Touched:**
  - `.ontology/proposals/proposal_<id>.json` (Creates the proposal record)
  - `.ontology/events.jsonl` (Appends a `proposal_created` event)
  - `.ontology/state.json` (Updates summary counters and timestamp)
- **What it does not do (yet):** It does not create the node. The proposal lives in `pending` status. `onto proposal apply` (planned, PR #94) will translate it into a real `node_create`. See `docs/PROPOSAL_SYSTEM.md`.

### Model Observability
- `onto model doctor`
- `onto model doctor --json`
- `onto model list`
- `onto model list --json`
- `onto model list --provider mock`
- `onto model list --provider ollama`

## Planned Commands

The following commands are *Planned / Not yet implemented*:

### Proposal System (next PRs)
- `onto propose link` (typed candidate edge mutation)
- `onto proposal list` / `onto proposal show` / `onto proposal reject` (PR #93)
- `onto proposal apply` with `parentHash` re-validation (PR #94)
- `--as-proposal` integration with `run prompt` / `run context` (PR #95)

### Walker v1
- `onto walk` edit mode, `:run`, `:propose`, `:compile --plan`
