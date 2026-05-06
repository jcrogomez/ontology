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

### `graph neighbors <nodeId>` *(read-only graph query)*

- **Purpose:** List direct neighbors of a node along incident edges. Each entry surfaces the edge type and direction.
- **Example:** `npm run dev -- graph neighbors node_0001`
- **Flags:** `--type <a,b,c>` (filter by edge type), `--direction in|out|both` (default `both`), `--json`.
- **Output:** for each neighbor, an arrow (`→` outgoing, `←` incoming), the edge type, and the neighbor node id. The CLI does not load the neighbor's full record — it surfaces id only.

### `graph path <fromId> <toId>` *(read-only graph query)*

- **Purpose:** Find the shortest directed path between two nodes via BFS over outgoing edges.
- **Example:** `npm run dev -- graph path node_0002 node_0000_canon`
- **Flags:** `--type <a,b,c>` (only traverse these edge types), `--max-depth <n>` (default `10`), `--json`.
- **Edge orientation:** edges are walked from → to only. Reverse traversal is not implicit; if a graph requires it, expose the inverse explicitly via `node link`.
- **Output:** the chain of edges connecting `from` to `to`, or `(no path found within N hops)` when disconnected.

### `graph subgraph <nodeId>` *(read-only graph query)*

- **Purpose:** Extract the undirected k-hop neighborhood rooted at a node. Used for "what is this node's local universe?" queries and as the data source for future Walker v1 expand views.
- **Example:** `npm run dev -- graph subgraph node_0001 --depth 2`
- **Flags:** `--depth <n>` (default `2`), `--type <a,b,c>` (filter edges), `--json`.
- **Output:** the focal node (marked `*`) plus all nodes reachable within `depth` hops, and only the edges where both endpoints fall inside the slice. Boundary edges are excluded.

### `walk <nodeId>` *(v0 + v1 PR-A + v1 PR-B)*

- **Purpose:** Open the Walker, an interactive focal-cell terminal interface for the intention graph. Color encodes the abstraction level, tokens shared across the local neighborhood are underlined (presheaf overlap), and the path bar renders a colored breadcrumb from canon to focal.
- **Example:** `npm run dev -- walk node_0000_canon`
- **v0 keys:** `↑` parent · `↓` child · `←/→` siblings · `:q` / `q` quit · `:help` flash help.
- **v1 PR-A — drafts + propose:**
  - `i` enters edit mode. The user composes the prompt for a *candidate child* of the focal (the focal node itself is never edited — only explicit graph commands may mutate the network).
  - `Esc` exits edit mode and saves the buffer as a draft to `.ontology/work/drafts/<focalId>.draft.json`. Re-entering edit mode resumes from the saved draft.
  - The identity bar shows `(draft pending)` when a draft exists for the focal.
  - `:propose` creates a `node_create` proposal from the saved draft (level + kind inherited from focal; the proposal is a child refinement). The draft is cleared on success. The resulting proposal lives in `pending` status; apply it via `onto proposal apply <id>`.
  - `:cleardraft` removes the saved draft for the focal without creating a proposal.
- **v1 PR-B — run from walker:**
  - `:run` dispatches a model run against the focal's assembled context with the `mock` provider by default.
  - `:run ollama` uses the local Ollama adapter (fails loudly if unavailable).
  - The walker stays interactive while the dispatch is in flight: a "running" panel renders synchronously, then the result panel replaces it on resolve.
  - Each `:run` is automatically persisted under `.ontology/runs/run_<id>.json` and emits a `run_persisted` event. Re-running with identical inputs is a cache hit (the panel surfaces `(cached)` and no second dispatch fires).
  - `:clearrun` dismisses the result panel without affecting the persisted record.
- **Notes:** Requires an interactive TTY. PR-C will add `:compile --plan`. See `docs/WALKER_INTERFACE.md`.

### `propose link` *(post-Bootstrap 0.5, PR #96)*

- **Purpose:** Create a typed candidate **edge** mutation — a proposal — without touching the graph. Mirrors the contract of `node link` (rejects self-loops, unknown nodes, invalid edge types, refinement-family poset inversions) but defers the actual edge creation to `proposal apply`.
- **Example:** `npm run dev -- propose link --from node_0001 --to node_0000_canon --type refines --rationale "domain refines canon"` (or `... --json`).
- **Required:** `--from <nodeId>`, `--to <nodeId>`, `--type <edgeType>`.
- **Optional:** `--branch <branch>` (defaults to the active branch at apply time), `--rationale <text>`.
- **Files Touched:**
  - `.ontology/proposals/proposal_<id>.json` (Creates the proposal record with `mutation.kind = "edge_create"`, `mutation.fromHash`, `mutation.toHash`)
  - `.ontology/events.jsonl` (Appends a `proposal_created` event)
  - `.ontology/state.json` (Updates summary counters and timestamp)
- **What it does not do:** It does not create the edge. The proposal lives in `pending` status. `onto proposal apply` translates it into a real `edge_created` mutation iff **both** endpoint hashes still match. If either node mutated since the proposal was created, the proposal transitions to `staled`.

### `propose node` *(Bootstrap 0.5, PR #92)*

- **Purpose:** Create a typed candidate node mutation — a *proposal* — without touching the graph. Writes a record under `.ontology/proposals/proposal_<id>.json` and appends a `proposal_created` event to the temporal log.
- **Example:** `npm run dev -- propose node --level domain --kind entity --prompt "Harvest entity"`
- **Optional flags:** `--label`, `--parent <nodeId>` (defaults to root canon), `--rationale <text>`, `--json`.
- **Files Touched:**
  - `.ontology/proposals/proposal_<id>.json` (Creates the proposal record)
  - `.ontology/events.jsonl` (Appends a `proposal_created` event)
  - `.ontology/state.json` (Updates summary counters and timestamp)
- **What it does not do (yet):** It does not create the node. The proposal lives in `pending` status. `onto proposal apply` (planned, PR #94) will translate it into a real `node_create`. See `docs/PROPOSAL_SYSTEM.md`.

### `proposal list` *(Bootstrap 0.5, PR #93)*

- **Purpose:** List proposals.
- **Example:** `npm run dev -- proposal list` (or `... --json`, `... --status pending`, `... --status rejected`).
- **Filters:** `--status pending|applied|rejected|staled`.

### `proposal show <id>` *(Bootstrap 0.5, PR #93)*

- **Purpose:** Display a single proposal record. Mirrors the layout of `node show` and `runs show`, including the mutation payload, parent hash, source provenance (or `(manual proposal — no model run)`), validation snapshot, and current body hash.
- **Example:** `npm run dev -- proposal show proposal_0001` (or `... --json`).

### `proposal reject <id>` *(Bootstrap 0.5, PR #93)*

- **Purpose:** Lifecycle transition `pending → rejected`. Updates the proposal file with `status: "rejected"` and a freshly recomputed body hash, then appends a `proposal_rejected` event to the temporal log carrying both the old and new hashes.
- **Example:** `npm run dev -- proposal reject proposal_0001 --reason "duplicate of existing node"` (or `... --json`).
- **Constraints:** Refuses unless the current status is `pending`. The proposal directory and event log together preserve the full lifecycle history; the events log is the source of truth for transitions.

### `run prompt --as-proposal` and `run context --as-proposal` *(Bootstrap 0.5, PR #95)*

- **Purpose:** Wrap the model's response into a typed candidate node mutation. Auto-implies `--persist` so the proposal can pin itself to a `runId` for full audit provenance.
- **Run prompt example:** `npm run dev -- run prompt --task semantic_parse --prompt "Design a harvest entity" --provider mock --as-proposal --proposal-level domain --proposal-kind entity`
- **Run context example:** `npm run dev -- run context node_0001 --provider mock --as-proposal --proposal-level workflow --proposal-kind action --validate`
- **Required with `--as-proposal`:** `--proposal-level <level>`, `--proposal-kind <kind>`.
- **Optional:** `--proposal-parent <nodeId>` (defaults: root canon for `run prompt`, focal node for `run context`), `--proposal-label <label>`, `--proposal-rationale <text>`.
- **What lands on disk:** the persisted run record (`.ontology/runs/run_<id>.json`), the proposal record (`.ontology/proposals/proposal_<id>.json` with `source.runId` populated), and two events (`run_persisted`, `proposal_created`).
- **What does not land:** no graph mutation. The proposal lives in `pending` status. To realize it, run `onto proposal apply <id>` — that produces a `node_created` event whose `payload.sourceProposalId` and `payload.sourceRunId` (via the proposal record) trace the new node back to the model run that generated it.
- **Validation:** when `--validate` is set on `run context --as-proposal`, the validation snapshot is stored inside the proposal record so an audit can read the validation result that was current at proposal time, even if the kernel changes later.

### `proposal apply <id>` *(Bootstrap 0.5, PR #94)*

- **Purpose:** Translate a pending proposal into a real graph mutation. Re-validates the dependency snapshot captured at proposal time:
  - For `node_create`: compares `parentHash` against the parent node's current integrity hash.
  - For `edge_create`: compares `fromHash` and `toHash` against both endpoint nodes' current integrity hashes.

  If the snapshot has diverged, the proposal is transitioned to `staled` and refused (no graph mutation occurs). Otherwise the underlying mutation is dispatched (`node_created` or `edge_created`), the proposal is transitioned to `applied`, and both the mutation event and `proposal_applied` are appended to the temporal log.
- **Example:** `npm run dev -- proposal apply proposal_0001` (or `... --json`).
- **Dry run:** `npm run dev -- proposal apply proposal_0001 --dry-run` — validates without writing anything; reports whether the proposal would apply, would stale, or would fail.
- **Failure modes (each exits 1 and reports `kind` in JSON):**
  - `not_found` — the id is unknown
  - `not_pending` — the proposal is already applied / rejected / staled
  - `missing_parent` — the parent node referenced by the proposal disappeared
  - `stale` — parent hash diverged; the proposal is now `staled` (real run) or `pending` still (dry-run)
  - `mutation_failed` — the underlying graph mutation threw
- **Audit chain:** the resulting mutation event (`node_created` or `edge_created`) carries `sourceProposalId` in its payload; the `proposal_applied` event carries `resultingNodeId` (or `resultingEdgeId`), `resultingEventId`, `oldHash`, and `newHash`. An audit can trace any node or edge back to the proposal that produced it, and to the model run that generated the proposal.

### Model Observability
- `onto model doctor`
- `onto model doctor --json`
- `onto model list`
- `onto model list --json`
- `onto model list --provider mock`
- `onto model list --provider ollama`

## Planned Commands

The following commands are *Planned / Not yet implemented*:

### Proposal System (next steps, beyond Bootstrap 0.5)
- Edge-aware SemanticLinker (consume the proposal's edges in compilation)
- `run prompt --as-proposal` for `edge_create` proposals (today only `node_create` is supported via run-driven proposals)

### Walker v1
- `onto walk` edit mode, `:run`, `:propose`, `:compile --plan`
