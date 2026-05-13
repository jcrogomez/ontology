# CLI Commands

This document is the full reference for the `onto` CLI surface as of
Bootstrap 0.9 (post-validator-port).

> **Note on Usage:**
> For local development, execute commands via `npm run dev -- <command>`.
> In production or as an installed package, the alias `onto <command>` is used.
> The examples below use the development format.

> **Section organisation.** Headers below are tagged by the Bootstrap
> that introduced each command, for historical traceability. Every
> command listed in §"Bootstrap 0.1" through §"Bootstrap 0.9" is
> *currently shipped* — the Bootstrap tag tells you when it landed,
> not whether it works today. The trailing §"Planned Commands"
> section enumerates what is still unshipped.

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
- **Contract flags (post-0.9):** declare the node's structured contract at creation time so the validator gate has something to enforce.
  - `--requires "tok1,tok2"` — comma-separated tokens that land in `context.requires` (each tagged `nodeType: "declared"`).
  - `--provides "tok1,tok2"` — same for `context.provides` (the canonical key form).
  - `--forbids "tok1,tok2"` — same for `context.forbids`.
  - `--rules "FORBID: x|REQUIRE: y"` — pipe-separated prose rules that land in `node.rules` (pipe rather than comma because rule text often contains commas).
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
- **What it does not do:** It does not delete or modify existing edges. Use `onto edge remove` / `onto edge update` for those (post-0.9).

### `node update <id>` *(post-Bootstrap 0.9 — plasticity primitive)*

- **Purpose:** Edit a node in place: prompt / label / rules / contract tokens. Re-hashes and emits a `node_updated` event with old and new hashes. Closes the iterative-refinement loop without forcing the supersedes ceremony.
- **Example:** `npm run dev -- node update node_0001 --prompt "Refined intent" --requires "new_token"`
- **Flags (all optional, at least one mutating flag required):**
  - `--prompt <text>` — replaces `node.prompt.raw` and mirrors into the `source_prompt` input.
  - `--label <text>` — replaces `node.label`.
  - `--rules "a|b|c"` — replaces `node.rules` wholesale; pass `--rules ""` to clear.
  - `--requires "t1,t2"` / `--provides "t1,t2"` / `--forbids "t1,t2"` — replaces the corresponding `context.*` array wholesale. Pass an empty string to clear.
  - `--json` — machine-readable result.
- **Files Touched:**
  - `.ontology/nodes/<id>.json` (Rewritten with the new hash)
  - `.ontology/events.jsonl` (Appends `node_updated` with `oldHash`, `newHash`)
  - `.ontology/state.json` (Counter increment; `nodeCount` is NOT changed — it is the monotonic id seed)
- **Errors:** `Node not found`, or refuses with "requires at least one mutating flag" if nothing was passed.
- **What it does not do:** It does not change `id`, `coordinates`, or `graph.parentId` — the topology stays fixed. To re-parent a node, use `onto edge update`.

### `node remove <id>` *(post-Bootstrap 0.9)*

- **Purpose:** Delete a node's record from disk and append a `node_removed` event. The event log retains the full history (the node *existed* even if the file no longer does).
- **Example:** `npm run dev -- node remove node_0042`
- **Refuses with edge guard:** if any edge references the node (incoming or outgoing), the command lists the incident edges and asks the user to remove them first with `onto edge remove`. The deletion is rejected — silent removal would leave dangling refs in `edges.jsonl`.
- **`--json`:** on the edge-guard error, emits `{ok: false, error, incidentEdges: [{edgeId, from, to, type}, ...]}` so scripts can resolve the dependency.
- **state.nodeCount stays monotonic:** removed ids are never reused. The audit chain is the recovery surface.

### `edge remove <edgeId>` *(post-Bootstrap 0.9)*

- **Purpose:** Drop an edge by id. Rewrites `edges.jsonl` atomically (temp + rename) and appends an `edge_removed` event.
- **Example:** `npm run dev -- edge remove edge_a1b2c3d4`
- **Atomic write:** a SIGKILL mid-rewrite leaves the original `edges.jsonl` intact.

### `edge update <edgeId>` *(post-Bootstrap 0.9)*

- **Purpose:** Re-classify an edge's type in place. Re-hashes and emits an `edge_updated` event with old/new types and old/new hashes.
- **Example:** `npm run dev -- edge update edge_a1b2c3d4 --type depends_on`
- **Required:** `--type <newType>` — must be one of the `EdgeTypeSchema` enum values.
- **Scope today:** type changes only. Endpoint mutations (`from` / `to`) are out of scope — they are semantically equivalent to "drop and re-link", and asking the user to do both operations explicitly keeps the event log unambiguous.

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

### `compile plan <nodeId>` *(post-Bootstrap 0.5, PR #101)*

- **Purpose:** Print the topological compile plan rooted at the focal node, in dependency order. Read-only preview — no artifact is written, no event is emitted.
- **Example:** `npm run dev -- compile plan node_0042` (or `... --json`).
- **Output (human):** numbered list of node ids in dependency order, with the focal marked `*` and a `depends on N edge(s)` annotation per step.
- **Output (JSON):** `{ ok: true, focal, steps: [{ nodeId, dependsOn: [edgeId,...] }], closure: [...] }` on success; `{ ok: false, reason: "cycle", focal, partialSteps, unresolved }` on a dependency cycle (exit 1).
- **Edges considered:** `depends_on`, `inherits_from`, `refines`, `implements`, `uses_token`. Direction-agnostic edges (`documents`, `tests`, `validates_against`, runtime relations, etc.) do not affect plan order.
- **Notes:** Same kernel helper backs `:plan` in the walker.

### `compile run <nodeId>` *(Bootstrap 0.8, hardened post-0.9, β-1 + γ-0)*

- **Purpose:** Walk the topological compile plan rooted at the focal and produce artifacts on disk. The structure-preserving functor of axiom 6 made concrete.
- **Example:** `npm run dev -- compile run node_0005 --provider mock`
- **Flags:** `--provider mock|ollama|anthropic` (default `mock`; γ-0 adds anthropic), `--model <name>`, `--ollama-host <host>`, `--runtime-check`, `--runtime-check-timeout-ms <ms>`, `--branch <name>` (post-0.9 — restrict the plan to a single fiber), `--target <path>` (β-1 — write the focal artifact to a user-pinned path; default still `.ontology/artifacts/generated/<nodeId>.<ext>`), `--force` (required to overwrite an existing `--target` file), `--max-tokens <n>`, `--no-thinking` (post-γ-7 — suppress adaptive thinking on providers that support it; useful for large prompts where thinking exhausts the output budget and the response comes back empty), `--json`.
- **Post-γ-7 dispatch knobs:** `--max-tokens` and `--no-thinking` now form part of the persisted-run identity. A retry with a different value (e.g. `--max-tokens 16384` after a default-budget failure) deterministically lands on a fresh run id and re-dispatches, instead of hitting the cached empty result. Anthropic adapter retries transient HTTP 429 / 5xx / network errors up to 3 times with exponential backoff (1.5s / 3s / 6s) before surfacing the failure.
- **`--target <path>` (β-1):** redirects the focal step's artifact away from the default `.ontology/artifacts/generated/` tree to a user-pinned path. Relative paths resolve against cwd; missing parent directories are created. **Crash-atomic + clobber-gated:** writes go to a sibling `.tmp.<pid>` first; on every-validator-passed the file is renamed onto the final path. A failed validator (`validateLanguage` / `validateIntent` / `--runtime-check`) triggers a rollback — the staging file is unlinked and the user's pre-existing target survives untouched. Without `--force`, an existing target file fails the focal step with `reason: "target_exists"` before any bytes are written; with `--force`, the rename overwrites. Upstream steps continue to land under `generated/`.
- **`--provider anthropic` (γ-0):** routes through the Anthropic adapter with system-prompt caching (`cache_control: ephemeral`). Reads `ANTHROPIC_API_KEY` from env. Default model is `claude-opus-4-7`; override with `--model`.
- **Post-0.9 gate:** after parse-check + before runtime-check, every artifact passes through `validateIntent` against the focal's contract (`context.requires/provides/forbids` + `node.rules`). A decisive false verdict aborts the compile with `reason: "intent_failed"` and surfaces the violating clause; an `unknown` verdict (open-world callers) passes with a warning. The validator gate runs always — there is no opt-out flag — because a compile that violates its declared contract is by definition broken.
- **`--branch <name>`:** restricts the compile plan to the Grothendieck fiber over `<name>`. Only intra-branch edges participate in the closure. Refuses with `missing_branch` (with a `Known branches: ...` hint) if the name is unknown, and with `focal_off_branch` if the focal lives on a different branch — silent retargeting would surprise CI users.
- **Files Touched:**
  - `.ontology/runs/run_<id>.json` (one per step, content-addressed)
  - `.ontology/events.jsonl` (one `run_persisted` and one `compilation_run` per step)
  - `.ontology/artifacts/generated/<nodeId>.<ext>` (per step; extension from `manifestation` + `technical.language`)
  - `.ontology/state.json` (counters)
- **Audit:** every artifact's `compilation_run` event payload carries `nodeId`, `runId`, `cached`, `artifactRelativePath`, `bytes`. Trace via: `onto events tail | grep compilation_run` → `onto runs show <runId>` → `onto runs verify <runId>`.
- **Cache:** re-running the same compile against the same graph state and provider hits the per-step run cache. Each cached step still emits its own `compilation_run` event, so the artifact path is logged again and the audit trail stays linear.
- **Notes:** See `docs/COMPILER.md` for the implementation. The mock provider acts as the identity functor for `task: code_sketch`, so a leaf node whose `prompt.raw` is literal source compiles to that exact source on disk. Real Ollama is a non-identity functor; the same plan, the same audit chain.

### `walk <nodeId>` *(v0 + v1 complete)*

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
- **v1 PR-C — compile-plan preview:**
  - `:plan` (alias `:compile-plan`) computes the topological compile plan rooted at the focal and renders it in a green panel below the focal cell. Each step lists the node id and the count of dependency edges it resolves; the focal is marked `*`. A cycle in the closure renders the panel in red with the unresolved set.
  - `:clearplan` dismisses the panel.
  - Read-only: no artifact written, no event emitted. The actual compiler ships in Bootstrap 0.8.
- **v1.x — graph-view (post-0.9):**
  - `:graph view [depth]` renders the focal's k-hop subgraph as a structured panel with three buckets — Upstream (`↑`), Downstream (`↓`), Lateral (`↔`) — each row colored by abstraction-level matching `POSET_COLORS`, plus up to 4 connecting edges per row. Default depth 2, capped at 5. Reuses `extractSubgraph` so the slice membership matches `onto graph subgraph` exactly. Read-only; dismiss with `:clearinfo`. This is the terminal-first answer to the "Visual DAG Studio" follow-up — see `docs/WALKER_INTERFACE.md`.
- **Notes:** Requires an interactive TTY. See `docs/WALKER_INTERFACE.md`.

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
- **What it does not do:** It does not create the node. The proposal lives in `pending` status. `onto proposal apply` (PR #94, shipped) translates it into a real `node_create` mutation. See `docs/PROPOSAL_SYSTEM.md`.

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

### `link <nodeId>` *(post-Bootstrap 0.9)*

- **Purpose:** Run the semantic linker against a candidate response: assemble the focal's context, glue the presheaf fragments, validate the candidate via `validateIntent`, and surface the per-token requires/provides/forbids matrix plus edge proposal suggestions for any unsatisfied requirements. Read-only — no graph mutation, no model dispatch, no proposal creation.
- **Required:** exactly one of `--candidate <text>` or `--candidate-file <path>`. The linker validates the candidate against the focal's contract; without one there is nothing to validate. **Binary guard (post-0.9):** if `--candidate-file` resolves to content containing a NUL byte, the command refuses with `must be a readable UTF-8 text file`. `fs.readFileSync(..., "utf8")` would otherwise pass a string of garbled bytes through to the semantic linker.
- **Optional:** `--branch <name>` (override active branch), `--include-edges` + `--edge-types <list>` (project typed edges into the gluing pool — same semantics as `context assemble --include-edges`), `--no-suggest-edges` (suppress the suggester), `--json`.
- **Examples:**
  - `npm run dev -- link node_0042 --candidate "draft response that should satisfy the focal context"`
  - `npm run dev -- link node_0042 --candidate-file ./response.txt --include-edges`
  - `npm run dev -- link node_0042 --candidate "..." --json | jq '.suggestions'`
- **Output (human):** a single LINK card with sections — `Validation` (ok / score / violations / warnings from `validateIntent`), `Requires (N)` (per token: `✓` if a node in scope provides it, `✖` otherwise, with the providers listed), `Provides (N)` (the focal's own provides), `Forbids (N)` (per token: `✖` if a node in scope provides it as a violation), `Relevant Neighbors (N)` (one-hop incident edges), and `Suggested edge proposals (N)` when the suggester finds providers in the wider graph for unsatisfied requires. Each suggestion is a copy-pasteable `onto propose link --from … --to … --type … --rationale …` command.
- **Output (JSON):** `{ ok, focal, branch, contextNodeIds, validation, requires[], provides[], forbids[], neighbors[], conflicts[], suggestions[] }`. Each suggestion carries `{from, to, type, satisfies, rationale, command}`.
- **Edge suggestions:** for each unsatisfied requirement, the suggester finds nodes in the same branch whose `provides` would resolve the token, and emits one suggestion per provider per edge type (defaults to two parallel rows: `depends_on` and `uses_token`). Suggestions skip (a) the focal itself, (b) nodes on a different branch, and (c) edges that already exist with the same `(from, to, type)` tuple. The user picks which (if any) to stage via `onto propose link`; the linker never auto-creates proposals.
- **Notes:** Same kernel helper backs the walker's `:link-analysis` action, which defaults the candidate to `focal.prompt.raw` so the action is usable without typing a candidate.

### `branch list` *(post-Bootstrap 0.9)*

- **Purpose:** Enumerate every distinct branch in the project, with per-branch node counts and total. Read-only wrap over `listBranches` from `src/runtime/fibration/`.
- **Example:** `npm run dev -- branch list` (or `... --json`)
- **Output (human):** `=== ONTOLOGY BRANCHES ===` header, summary line `Branches: N   Total nodes: M`, then one line per branch with its node count. Branches are sorted lexicographically.
- **Output (JSON):** `{ branches: [{name, nodeCount}], totalNodes }`.
- **Edges are NOT consulted:** a branch is defined by the existence of at least one node carrying that label. An edge whose endpoints both live on a branch already implies the branch's nodes are present.

### `branch fiber <name>` *(post-Bootstrap 0.9)*

- **Purpose:** Render the Grothendieck fiber `p^{-1}(name)` — the induced subgraph of nodes whose `coordinates.branch === name`, plus the edges whose both endpoints survive the node filter.
- **Example:** `npm run dev -- branch fiber main`
- **Errors:** refuses with `No such branch: "<name>"` and lists the known branches when the name is absent. Returns an empty fiber report (zero nodes / zero edges) only if the branch exists but is empty — never silently.
- **Output (JSON):** `{ branch, size: {nodes, edges}, nodes: [id, ...], edges: [{edgeId, type, from, to}, ...] }`.
- **What it does not do:** It does not mutate state, does not propose anything, does not run cartesian lifts. Read-only inspection of the fibration.

### `compile run-batch [--all-artifacts | --nodes <ids>]` *(β-1)*

- **Purpose:** Compile many focals in a single invocation. Plans are computed per-focal but share the per-run persisted cache, so shared upstream walks across focals reuse the same content-addressed run records (no second LLM call on the second-and-later focal whose plan touches the same upstream node).
- **Required:** exactly one of `--all-artifacts` (compile every node whose `coordinates.manifestation === "code"`) or `--nodes <id1,id2,...>` (comma-separated explicit list). Mutex.
- **Optional:** `--provider mock|ollama|anthropic`, `--model <name>`, `--ollama-host <host>`, `--runtime-check`, `--runtime-check-timeout-ms <ms>`, `--branch <name>` (filters BOTH the focal list AND the per-plan walk to the named fiber), `--json`.
- **Resolve-time gates (--nodes path only):**
  - Non-code-manifestation focals are refused upfront with an actionable error rather than failing per-step inside the loop.
  - Off-branch focals (when `--branch` is set) are refused upfront with the same shape.
- **Failure policy:** continue past per-focal failures; aggregate per-focal results. Exit code 1 only when every focal failed (so a partial-success batch still surfaces a useful report). Two explicit booleans in the JSON output disambiguate: `allSucceeded` (every focal compiled) vs `anySucceeded` (at least one compiled); the top-level `ok` agrees with the exit code.

### `graph infer-edges <dir>` *(γ-4 preview, γ-6 proposals)*

- **Purpose (γ-4):** walk a source directory and report the import-derived edge graph — which file `depends_on` which (value imports) and which `uses_token` which (type-only `import type` statements). Pure static analysis; zero LLM cost; runs in milliseconds per file. Read-only. TypeScript files use the TS compiler API; Python files use a regex-based parser.
- **Purpose (γ-6, with `--create-proposals`):** in addition to the report, resolve each inferred edge to applied node IDs by matching `outputs.files[0]` on each endpoint, then emit one `edge_create` proposal per resolved pair. Skips edges whose endpoints are not yet on the graph (the user hasn't applied that file's ingest proposal yet — surfaced as `from_node_missing` / `to_node_missing` in the JSON report) and edges that already exist with the same `(from, to, type)` tuple — so γ-6 is idempotent.
- **Flags:** `--create-proposals` (γ-6 mode), `--include <exts>` (comma-separated; default `ts,tsx` — pass `py` for a Python project, `py,ts,tsx` for a mixed-language repo), `--json`.
- **Example (preview, TS):** `npm run dev -- graph infer-edges src/runtime/fibration`
- **Example (preview, Python):** `npm run dev -- graph infer-edges path/to/python/project --include py`
- **Example (γ-6):** `npm run dev -- graph infer-edges src/runtime/fibration --create-proposals --json`
- **Output (human):** one line per edge in the form `from.ts  ──→  to.ts` (or `─type→` for `uses_token`), with the imported tokens listed underneath.
- **Output (JSON, γ-6):** `{ ok, rootDir, edgeCount, createdCount, skippedCount, edges, proposals: [{proposalId, fromNodeId, toNodeId, type}], skipped: [{fromFile, toFile, type, reason, detail}] }`.
- **Edge-type mapping:** `depends_on` for value imports (runtime); `uses_token` for type-only imports. Both are first-class `EdgeType` enum values; γ-6 puts each in `payload.type` on the `edge_create` proposal. Python imports are all classified `depends_on` in v0 — Python has no static type-only import marker (TYPE_CHECKING runtime check is out of scope).
- **Scope of γ-4 v0 (TS):** named imports, default imports, namespace imports, `import type`, named exports, default exports, re-exports. Out of scope: dynamic `import()`, CommonJS `require()`, triple-slash references.
- **Scope of γ-4 v0 (Python):** `import X`, `import X.Y[.Z]`, `import X as Y`, `import X, Y` (multi), `from X import Y[, Z]`, single-line parenthesized form `from X import (Y, Z)`, `from X import Y as W`, wildcard `from X import *`, relative `from . / .X / ..X import Y`. Out of scope: multi-line parenthesized form, `if TYPE_CHECKING:` blocks, conditional imports inside functions. Modules resolve as `X.py` or `X/__init__.py` under the project root.
- **Exit codes:** preview always exits 0. `--create-proposals` exits 0 unless every inferred edge was skipped AND there was at least one edge to process (almost always a sign the user forgot to run `onto proposal apply` first) — in that case exits 1 so CI / scripts notice. An empty walk (no edges at all) is always exit 0.

### `ingest <path>` *(γ-1 single-file, γ-5 multi-file)*

- **Purpose:** the **inverse** of the compile functor. Extract structured intent from existing source code and produce one `node_create` proposal per source file. With γ-3's rich proposal payload, `onto proposal apply` produces a complete node in a single step — no follow-up `onto node update --requires ... --provides ...` ceremony needed.
- **Modes (auto-detected from `<path>`):**
  - **File:** one proposal under the canon parent (or `--parent <nodeId>`).
  - **Directory:** walks the tree (skipping `node_modules` / `dist` / `.ontology` / `__tests__` / `.git` / `coverage` / `__pycache__` / `.venv` / `venv` / `env` / `.pytest_cache` / `.tox`); one proposal per `.ts` / `.tsx` file by default, configurable via `--include`. Also reports static-inferred cross-file edges from γ-4 (TS via the TS compiler API; Python via a regex-based parser) — those don't become proposals automatically, run `onto graph infer-edges <dir> --create-proposals` after `proposal apply` to materialise them (the multi-file cycle).
- **Provider:** defaults to `anthropic` (γ-0 — requires `ANTHROPIC_API_KEY` in env). `--provider ollama` for the local model; `--provider mock` for plumbing tests (identity-functor — only works on files that embed a valid JSON extraction fixture).
- **Cost:** ~$0.08 per file at Opus 4.7 tier; ~$0 with Ollama. The shared system prompt is tagged `cache_control: ephemeral` so per-file calls in the same session reuse the cached prefix once the prompt grows past Opus 4.7's 4096-token cacheable minimum.
- **Flags:** `--provider`, `--model`, `--ollama-host`, `--parent <nodeId>` (default: project root canon), `--include <exts>` (directory mode only — comma-separated extensions; default `ts,tsx`. Use `--include py` for a Python project, `--include py,ts,tsx` for a mixed repo. Static-edge inference (γ-4) stays TS-only — non-TS ingests skip the cross-file edge report), `--dry-run` (preview the extraction without writing proposals — the load-bearing flag for iterating the extraction template and for testing with the mock provider at zero LLM cost), `--cost-estimate` (pre-flight cost guard: walks the inputs, multiplies file sizes by published rates, prints breakdown, exits WITHOUT dispatching the LLM — unlike `--dry-run`, makes zero API calls and works without `ANTHROPIC_API_KEY`), `--json`.
- **Examples:**
  - `npm run dev -- ingest src/runtime/fibration --cost-estimate --provider anthropic   # zero-cost pre-flight`
  - `npm run dev -- ingest src/core/integrity/hash.ts --dry-run`
  - `npm run dev -- ingest src/runtime/fibration --provider anthropic --json`
  - `npm run dev -- ingest path/to/python/project --provider ollama --include py`
- **Output (JSON, file mode):** `{ ok, dryRun, proposal: {id, status, mutationKind, hash}, event, extracted, usage, model, provider }`.
- **Output (JSON, directory mode):** `{ ok, dryRun, rootDir, fileCount, okCount, failedCount, totalTokens, results: [{filePath, ok, reason?, message?, extracted?, proposalId?, tokensUsed?}], edges: [γ-4 inferences] }`.
- **Failure modes:** binary-byte guard (NUL in a `--literal-file` or in the source file refuses upfront with a clear error); JSON-validation failure (the LLM returned something Zod's `ExtractionResultSchema` rejects); empty files; missing parent node. In directory mode, per-file failures don't abort the batch — they land in `results[]` with a `reason` and the walk continues.
- **Provenance:** each proposal's `provenance.rationale` is a JSON blob with `{extractedFrom, extractorModel, extractorProvider}` so the audit chain records WHO produced the proposal off WHICH file. The rich extracted fields (manifestation / language / requires / provides / forbids / rules) ride on `payload.*` directly (γ-3); the source file path lands on `payload.sourceFiles[0]` (γ-5) so γ-6 can resolve file-path edges back to node IDs after apply.

### `verify-homeomorphism [focal]` *(δ-2)*

- **Purpose:** the **publishable measurement** for §3.10 (`F ∘ G ≈ id_Code modulo ε`). For each selected node, compile-back via the same provider chain, diff vs the original source on disk, classify with **two distances** (LoC delta + structural Jaccard over top-level declaration names). The γ-2 and Vibe-Reasoning calibrations both surfaced that LoC and behavior disagree — δ-2 reports both and folds them into a 2D verdict.
- **Selectors (mutually exclusive):**
  - Positional `<focal>` — verify one node.
  - `--nodes id1,id2,...` — verify an explicit list.
  - `--all-artifacts` — verify every node with `coordinates.manifestation === "code"`.
- **Verdict labels:**
  - `epsilon_equivalent` — both metrics pass (LoC < threshold AND Jaccard ≥ threshold).
  - `divergent_loc` — LoC over threshold, structure ok. Usually means docstring drift or whitespace.
  - `divergent_structural` — LoC ok, structure fails. Usually a rename or decomposition change.
  - `divergent_both` — neither passes.
  - `unrecoverable` — compile-back failed (no artifact to diff).
- **Default thresholds:** `--loc-threshold 0.3 --jaccard-threshold 0.5`. Both tunable on the CLI.
- **Flags:** `--provider`, `--model`, `--ollama-host`, `--max-tokens`, `--no-thinking` (suppress adaptive thinking — γ-7 calibration finding for prompts where thinking exhausts the output budget), `--open-world` (default true for verify), `--no-open-world` (force closed-world), `--loc-threshold`, `--jaccard-threshold`, `--cost-estimate` (pre-flight, $0), `--dry-run` (skip compile-back, re-classify existing regen), `--report <path>` (also write a markdown summary to the given path), `--json`.
- **Examples:**
  - `npm run dev -- verify-homeomorphism node_0001 --provider anthropic`
  - `npm run dev -- verify-homeomorphism --all-artifacts --cost-estimate`
  - `npm run dev -- verify-homeomorphism --nodes node_0001,node_0002 --provider anthropic --json`
  - `npm run dev -- verify-homeomorphism --all-artifacts --dry-run --loc-threshold 0.2`
  - `npm run dev -- verify-homeomorphism --all-artifacts --provider anthropic --report docs/legend/calibrations/SWEEP_$(date +%F).md`
  - `npm run dev -- verify-homeomorphism node_0021 --provider anthropic --max-tokens 16384 --no-thinking` (large prompt where adaptive thinking would otherwise return empty text)
- **Staging:** compile-back artifacts land under `.ontology/verify/<nodeId>.<ext>` (separate from `.ontology/artifacts/generated/` to avoid clobbering the audit-chain artifacts). Persistent — `--dry-run` re-uses existing stages.
- **Output (human):** verdict counts + per-node line: `[tag] node_XXXX  loc=N% jac=M%  A→B lines  decl C→D`. For nodes whose declaration sets differ, lost-from-regen and added-by-regen lists surface up to 6 names each. When dispatches happen, also prints `Aggregate dispatch: <N> tokens (~$X.XXXX)`.
- **Output (JSON):** `{ ok, report: { rootDir, thresholds, total, byVerdict: {epsilon_equivalent, divergent_loc, divergent_structural, divergent_both, unrecoverable}, totalUsage?: {promptTokens, completionTokens, totalTokens, costUSD}, results: [{nodeId, sourceFile, regenPath, ok, failure?, metrics?: {locDistance, structuralJaccard, originalLineCount, regenLineCount, originalDeclarations, regenDeclarations}, verdict, thresholds, usage?: {promptTokens, completionTokens, totalTokens, costUSD, cached}}] } }`.
- **Cost:** roughly the same as ingest per file (one LLM dispatch per node). Pre-flight with `--cost-estimate` (no API call). For a 22-node sweep at Opus 4.7, expect ~$0.50–$1.00. The `--json` output now carries per-node `usage` (Anthropic input/output tokens + approximate cost from published rates) and an aggregate `totalUsage`, so the bill is in the report.

### Model Observability
- `onto model doctor` — health probe per provider. With `ANTHROPIC_API_KEY` set, runs a `/v1/models` list as the auth check; without the key, surfaces `not configured` rather than failing. Reports `OLLAMA_HOST` and `ANTHROPIC_API_KEY` env-var status.
- `onto model doctor --json`
- `onto model list`
- `onto model list --json`
- `onto model list --provider mock`
- `onto model list --provider ollama`

### Model Routing (post-γ-7 reviewer fix)

Three layers decide which model dispatches a given LlmRequest, in
order of decreasing priority:

1. **`request.model`** — set explicitly by the caller. Wins over
   everything. Surfaces as `--model <name>` on the CLI.
2. **`options.defaultModel`** — caller-resolved per-node routing.
   `compileNode` populates this from the focal's `node.model.ref`
   through `resolveNodeModel` against `.ontology/models/registry.json`.
   Mixed-provider plans work here: node A pointing at
   `anthropic-opus-critic`, node B at `ollama-qwen-coder`, and node C
   at `anthropic-haiku-fast` will dispatch through three different
   adapters in the same compile plan.
3. **Task-default from the routing registry** — `src/runtime/llm/registry.ts`
   carries a `DefaultRouting` table per supported provider keyed on
   `LlmTask`. When only `--provider <X>` is passed (no `--model`,
   no per-node ref), the dispatcher looks up `task → preferred[0]`
   and uses it as the dispatch default. Today: `ollama` and `anthropic`
   are wired; mock and literal fall through to adapter-internal
   defaults.

Anthropic table (per-task, picked from the published price/intelligence
frontier on the claude-4.x family):

| Task | Tier | Default model | Why |
|---|---|---|---|
| `inspect` | fast | `claude-haiku-4-5` | Inspector translator (short prose) |
| `semantic_parse` | balanced | `claude-sonnet-4-6` | Ingest JSON extraction |
| `code_sketch` | critic | `claude-opus-4-7` | Compile-back, verify-homeomorphism |
| `node_critique` | critic | `claude-opus-4-7` | Deep critique |
| `context_assemble` | fast | `claude-haiku-4-5` | Context glue |
| `documentation` | fast | `claude-haiku-4-5` | Doc generation |
| `node_expand` / `test_generate` | balanced | `claude-sonnet-4-6` | Structured generation |

Result: `onto compile run --provider anthropic` (no `--model`) routes
each step through the right tier without the caller having to know
the model catalogue. Override with `--model <name>` when the table
choice is wrong for a particular run.

The registry seeded by `onto init` carries the three Anthropic tiers
(`anthropic-opus-critic`, `anthropic-sonnet-balanced`,
`anthropic-haiku-fast`) plus an Ollama coder entry (`ollama-qwen-coder`)
and the long-standing `mock_default`. Point any node's `model.ref` at
one of these — or add your own.

## Planned Commands

The following commands are *Planned / Not yet implemented*. The full
roadmap lives in [`ROADMAP.md`](ROADMAP.md) §"Open follow-ups", and
the Project Legend phases are detailed in [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md).

**Project Legend Phase β** — **shipped 2026-05-11/12**. `compile
run --target / --force`, `compile run-batch`, `node.literal`, path
fibration helpers (`computeFiberBy`, `pathProjection`) — all merged.
See the relevant sections above.

**Project Legend Phase γ** — **partially shipped 2026-05-12**.
- ✅ γ-0 Anthropic provider with prompt caching
- ✅ γ-1 `onto ingest <file>`
- ✅ γ-2 hash.ts calibration (5/5 ε-equivalent — `docs/legend/calibrations/HASH_TS_2026-05-12.md`)
- ✅ γ-3 rich proposal payload (manifestation / language / contract / rules / literal / sourceFiles)
- ✅ γ-4 static TS edge inference (`onto graph infer-edges`)
- ✅ γ-5 `onto ingest <directory>` multi-file (with `--include` for non-TS codebases)
- ✅ γ-6 `onto graph infer-edges --create-proposals` (edge proposals from γ-4 inferences)

Remaining γ work:
- 🟡 **γ-7+ static analysis for Python (and other languages)** — the
  γ-4 parser is TS-first. A Python `import` walker would let `onto
  ingest <python-dir>` produce a connected cross-file graph the same
  way TS projects do today.

**Project Legend Phase δ** — **not yet shipped.**
- 🟡 **`onto node inspect <id>`** — Inspector / Lupa primitive; one
  LLM call per node lifetime, cached as `node.translator`.
- 🟡 **`onto verify-homeomorphism <id>`** + batch report — runs the
  per-node round-trip diff automatically and aggregates the result
  into a verdict map (`ε-equivalent` / `divergent` / `unrecoverable`).
  Closes the manual compile-back-and-diff loop the
  `VIBE_REASONING_PROCEDURE.md` runbook walks through by hand.

**Project Legend Phase ε** — **not yet shipped.** Self-ingestion of
the Ontology repo; the publishable adjunction-claim measurement.

**Other:**
- **`onto branch lift <nodeId> --to <branch>`** — turn the read-only
  `describeCartesianLift` into an `edge_create` / `node_create`
  proposal. Depends on the [`BRANCH_MODEL.md`](BRANCH_MODEL.md)
  materialisation decision.
- **`onto sign <branch>` / `onto verify-published` / `onto replay --against`** —
  Open-Prompt protocol primitives. Phase ζ.
- **`run prompt --as-proposal` with `edge_create` target** — the
  discriminated-union mutation schema already supports it; the
  model-driven candidate edge is the missing piece.
- **`onto query` extensions** — negation in shapes (`!hasIncoming`),
  exact edge profiles, multi-shape OR queries.
- **`onto replay`** — rebuild `state.json` from `events.jsonl` and
  assert equality. Would lift the "replayable" claim from analogy to
  strict (see [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §4.4).
