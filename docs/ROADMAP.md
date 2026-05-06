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
- node link (typed semantic edge creation, with self-loop rejection)
- context assemble --include-edges (edge-aware context, with --edge-types filter)
- run context --include-edges / --edge-types (edge-aware run with the same filter)
- run persistence (`.ontology/runs/`, content-addressed; `--persist`, `runs list/show/verify`)
- Walker v0 (read-only focal-cell terminal interface, color by abstraction level, presheaf-overlap underlining, see `docs/WALKER_INTERFACE.md`)
- cycle detection in parent walks (assembler, walker)
- centralized error message helper
- poset enforcement on refinement-family edges (`refines`, `inherits_from`, `implements`, `belongs_to`) at link time and retroactively in `onto validate`
- proposal system (Bootstrap 0.5): full lifecycle implemented across PRs #92, #93, #94, #95.
  - PR #92 — schema + storage + `onto propose node` + `proposal_created` event.
  - PR #93 — `onto proposal list / show / reject` + `proposal_rejected` event.
  - PR #94 — `onto proposal apply` (with `--dry-run`) + parentHash re-validation + stale detection + `proposal_applied` / `proposal_staled` events.
  - PR #95 — `run prompt --as-proposal` and `run context --as-proposal`: model runs become typed candidate proposals with full provenance back to the persisted run.
- proposal system (post-0.5): `onto propose link` for edge_create proposals (PR #96). Mutation schema is now a discriminated union with both `node_create` and `edge_create` variants; both are applicable, both stale on endpoint divergence.
- semantic linker (post-0.5, PR #97): edge-aware. Accepts `includeEdges` and `edgeTypes` so the gluing pool now includes neighbor nodes brought in via typed edges. A focal `requires` can be satisfied by an edge neighbor's `provides`; an edge neighbor's `provides` can trigger a focal `forbids`. The provider field is now Zod-parsed instead of any-cast.
- graph query CLI (post-0.5, PR #98): `onto graph neighbors / path / subgraph`. Read-only traversal primitives: list incident edges with direction, BFS shortest path between two nodes, depth-bounded undirected k-hop neighborhood. Pure helpers in `src/runtime/graph/traversal.ts` are reusable by Walker v1 and any future MCP / API surface.
- Walker v1 PR-A (post-0.5, PR #99): edit mode + drafts + `:propose`. The walker can now author candidate children of any focal node and promote them to real proposals without leaving the TUI. Drafts live under `.ontology/work/drafts/` and are cleared on successful proposal. The full chain `walker → draft → proposal → apply → node` runs end-to-end inside the terminal.
- Walker v1 PR-B (post-0.5, PR #100): `:run` integration. Dispatches a model run against the focal's assembled context, persists the result by default, and renders it in a `:clearrun`-able panel below the focal cell. The walker stays interactive during dispatch; cache hits surface as `(cached)` with no second LLM call.
- Walker v1 PR-C (post-0.5, PR #101): `:plan` topological compile-plan preview + `onto compile plan <nodeId>` CLI surface. Pure helper `computeCompilePlan` runs Kahn's algorithm over the hard-dependency edge family, detects cycles, returns deterministic ordering. **Walker v1 milestone complete.**
- **Bootstrap 0.8 — Hello World** (post-0.5, PR #102): the compiler ships. `onto compile run <nodeId>` walks the topological plan, dispatches each node's prompt against the configured provider, and writes artifacts to `.ontology/artifacts/generated/`. Each step emits both `run_persisted` and `compilation_run` events; full audit chain `artifact → compilation_run → runId → run record → prompt hash → node` is replayable. The mock provider acts as the identity functor for `task: code_sketch`, so a leaf node whose `prompt.raw` is literal source compiles offline. Walker integration via `:compile`. Hello-world example at `examples/hello-world/` produces an executable Python script via `npm run example:hello-world`. **Axiom 6 (compiler functor) and axiom 7 (code as compiled shadow) both running concrete code.**

Planned (post-Bootstrap 0.8):
- PromptAST (axiom 4): parse prompts into structured rewrite rules so the compiler can use AST-aware dispatch.
- Compiler hardening: thread upstream-step outputs into downstream prompts; enforce `contradicts` / `supersedes` plan semantics; run `validateIntent` between steps.
- run-driven edge proposals (`run prompt --as-proposal` with edge target).
- CLI surface for the semantic linker (`onto link <nodeId>` or similar).
- Walker v2 (plane / time / branch / manifestation rotation, proposal-review pane).
- Visual DAG Studio (web-based UI).

At this stage, Ontology is a verified network kernel, a node editor, a proposal system, an interactive walker, AND a compiler that produces auditable, runnable artifacts.

**Known limitations:**
- PromptAST (axiom 4) not yet implemented; prompts are still stored verbatim
- compiler does not yet thread upstream outputs or enforce `contradicts` / `supersedes`
- semantic linker is exposed only as a programmatic API (no CLI surface)
- single-writer state.json (CLI single-shot); concurrent invocations are not lock-protected

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

### Bootstrap 0.4: Walker v0 + Poset Enforcement
- Walker v0: focal-cell terminal interface, color by abstraction level, cross-node concept underlining, arrow + TAB/T/B/M navigation. Read-only. See `docs/WALKER_INTERFACE.md`.
- Poset enforcement: validator rejects edges whose direction violates the partial order.

### Bootstrap 0.5: Proposal System

In progress, shipped as a chain of small PRs:

- **PR #92** ✓ — Schema, storage, `onto propose node`, `proposal_created` event. Pending status only.
- **PR #93** ✓ — `onto proposal list / show / reject` + `proposal_rejected` event with old/new hash audit chain.
- **PR #94** ✓ — `onto proposal apply` (with `--dry-run`), `parentHash` re-validation, stale detection, `proposal_applied` / `proposal_staled` events. The proposal lifecycle is now total and replayable end to end.
- **PR #95** ✓ — `run prompt --as-proposal` and `run context --as-proposal`: model runs become typed candidate proposals in one CLI invocation, with `source.runId` populated from the persisted run record. The audit chain `run_persisted → proposal_created → node_created → proposal_applied` is complete.

See `docs/PROPOSAL_SYSTEM.md` for the full design.

(Run persistence shipped early as part of Bootstrap 0.4 because it is a small, low-risk prerequisite that unblocks both proposal provenance and the walker's `:run` mode.)

### Bootstrap 0.6: Map and Slice + Walker v1 ✓
- Graph query CLI (`graph neighbors`, `graph path`, `graph subgraph`). PR #98.
- Walker v1: edit mode, `:propose`, `:run`, `:plan`. PRs #99 / #100 / #101.

### Bootstrap 0.7: PromptAST (planned)
- Parse natural language prompts into structural Abstract Syntax Trees (AST) as formal rewrite rules.

### Bootstrap 0.8: Compiler + Hello World ✓
- Compiler v0: `onto compile run <nodeId>` walks the topological plan from `computeCompilePlan` and produces artifacts at `.ontology/artifacts/generated/`. Each step emits `run_persisted` and `compilation_run` events; the artifact path is anchored in the temporal log.
- Manifestation-aware extension: artifacts pick file extensions from `coordinates.manifestation` and `technical.language` (e.g., `manifestation: code` + `language: python` → `.py`).
- Walker integration: `:compile [provider]` from inside the TUI renders the result panel with each step's artifact path.
- Hello-world fixture: `npm run example:hello-world` builds canon → ... → leaf, compiles, and runs the produced Python script.
- PR #102. See `docs/COMPILER.md`.

---

## Future Capabilities (Planned / Not Yet Implemented)

The following components are strictly **planned** and **do not yet exist** in the current architecture. They represent the long-term vision of Ontology as a complete ecosystem.

### SemanticLinker
*(Edge-aware Implemented / Advanced features Planned)*
A dynamic linking system designed to automatically resolve and bind context, dependencies, and interfaces across the semantic network during the compilation functor process. Today it is exposed only as the programmatic `semanticLink()` API; future work adds a CLI surface and runs the linker between compile steps.

### Compiler
*(v0 Implemented / Hardening Planned)*
The compilation engine responsible for executing the structure-preserving functor from the category of intention (the `.ontology` network) to the category of executable artifacts. Bootstrap 0.8 ships the v0: `onto compile run` walks the topological plan and writes artifacts. Future hardening: thread upstream-step outputs into downstream prompts, enforce `contradicts` / `supersedes` plan semantics, run `validateIntent` between steps. See `docs/COMPILER.md`.

### PromptAST
*(Planned / Not yet implemented)*
Parse prompts into structured rewrite rules with explicit markers (`@requires:`, `@provides:`, `@expand:`). Lifts axiom 4 from "stored as text" to "structural rewrite rule" so the compiler can dispatch with AST-aware system prompts.

### Visual DAG Studio
*(Planned / Not yet implemented)*
A visual, web-based, multidimensional interface to interact with, query, and edit the `.ontology` graph in real-time, moving beyond the current terminal-first CLI implementation.
