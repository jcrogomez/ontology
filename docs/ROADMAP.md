# Ontology Roadmap

## Current State: Bootstrap 0.9 — Categorical Extensions + Compiler Hardening (`0.3.0-alpha.0`)

Ontology has reached **Bootstrap 0.9**. The seven axioms of the canon all run concrete code (axiom 4 is now structural via `parsePromptAST`), and four additive categorical extensions (Yoneda query, effect monad, branch fibration, topos predicate algebra) ship as runtime libraries with first-line CLI / Walker surfaces. The compiler is hardened end-to-end: code-fence stripping, language parse-check on every artifact, optional `--runtime-check`, refinement-parent context threading, per-node `model.ref` routing, and a top-level `EffectWithLog` that retires the legacy try/catch tower. `computeCompilePlan` rejects `contradicts` and halts BFS on `supersedes`, so contradictions surface as failures.

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
- **Compiler hardening** (post-0.8, PRs #103-#105, #108-#110, #112): code-fence stripping for `manifestation: code` artifacts (PR #103); language parse-check after every write, surfaces as `validate_failed` (PR #104); refinement-parent context threading into per-node prompts so upstream `provides` reach downstream steps (PR #105); per-node `model.ref` routing through the registry when no `--provider` override is given (PR #108); system-prompt format leak fixed by switching to XML `<context>` tags (PR #109); optional `--runtime-check` executes the artifact under a wall-clock timeout post parse-validation (PR #110); `computeCompilePlan` rejects `contradicts` as a hard error and halts BFS on `supersedes` with a `superseded` warning (PR #112).
- **Walker UX** (post-0.8, PR #106): `:run` and `:compile` accept `--model` and `--ollama-host`. Args round-trip through the same dispatcher path the CLI uses.
- **Test reliability** (post-0.8, PR #107): vitest `hookTimeout` bumped to 30s to absorb tsx cold-start.
- **PromptAST — axiom 4 made structural** (post-0.8, PR #113): `parsePromptAST(raw)` recognises three line-anchored markers (`@requires:`, `@provides:`, `@expand:`), strips them from the prompt body, and emits a deduplicated `PromptAST`. `compileNode` consumes the parsed body instead of the raw text. Closes the last "axiom 4 stored as text" gap. `src/runtime/prompt/`.
- **Walker hardening** (post-0.8, PR #114): `:validate` (deterministic intent validation), `:branch list` (first fibration surface), `:context` (explicit assembly with edge filters), `:query` (ad-hoc Yoneda search against the focal), and `:compile --runtime-check`.
- **Compiler refactor onto `EffectWithLog`** (post-0.8, PR #115): `compileNode` no longer wraps the dispatch / write / validate pipeline in a top-level `try/catch`. Failures bubble through `bindWithLog`; partial diagnostics survive even on error.

Bootstrap 0.9 — **Categorical Extensions** (PR #111, shipped together as four additive
runtime libraries with proven laws, see [`CATEGORICAL_VISION.md`](CATEGORICAL_VISION.md)):
- ✅ `onto query` — representable-functor (Yoneda) search by Hom-profile.
  Query shape covers intrinsic coordinates plus incoming / outgoing edge
  types and context-contract tokens. `src/runtime/query/`,
  `src/commands/query/`. Walker `:query`. See [`QUERY_REPRESENTABLE.md`](QUERY_REPRESENTABLE.md).
- ✅ Effect monad library — `Result<T,E>`, `Effect<T,E>`, `EffectWithLog<T,E>`,
  monad laws tested. **Compiler integration shipped in PR #115.**
  `src/runtime/effects/`. See [`EFFECT_MONAD.md`](EFFECT_MONAD.md).
- ✅ Branch fibration — branches modelled as Grothendieck fibers over the
  temporal log. `listBranches`, `computeBranchFiber`, `describeCartesianLift`.
  Walker `:branch list` (PR #114) is the first surface; an `onto branch` CLI
  is open follow-up. `src/runtime/fibration/`. See [`BRANCH_FIBRATION.md`](BRANCH_FIBRATION.md).
- ✅ Topos predicate algebra — three-valued Ω = `true | false | unknown`,
  composable rule predicates (`pAnd`, `pOr`, `pImplies`, …),
  `compileNodeRules` lifts a node's `requires` / `provides` / `forbids` into
  a single predicate. Additive: `intent-validator.ts` unchanged. A
  follow-up may port the validator onto this algebra.
  `src/runtime/topos/`. See [`RULES_TOPOS.md`](RULES_TOPOS.md).

Follow-ups unlocked by Bootstrap 0.9:
- ✅ Compiler refactor onto `EffectWithLog` (PR #115).
- 🟡 Branch-aware compile (`onto compile run --branch feature/x` walks one
  fiber, not the whole graph). `computeBranchFiber` is in place; only the
  CLI wiring is missing.
- 🟡 `onto branch list` and `onto branch fiber <branch>` — surface the
  programmatic fibration API to the CLI.
- 🟡 `onto branch lift <nodeId> --to feature/x` — turn the read-only
  `describeCartesianLift` into an `edge_create` / `node_create` proposal.
- 🟡 Validator port: rebuild `intent-validator.ts` on top of the topos algebra.
- 🟡 `onto query` extensions: negation in shapes, exact edge profiles, multi-shape OR.

Other open follow-ups:
- 🟡 `run prompt --as-proposal` with `edge_create` target (the discriminated-union
  mutation schema already supports it; the model-driven candidate edge is the gap).
- 🟡 CLI surface for the semantic linker (`onto link <nodeId>`).
- 🟡 Walker v2 (plane / time / branch / manifestation rotation, proposal-review pane).
- 🟡 Visual DAG Studio (web-based UI).
- 🟡 `runFromWalker` port onto `EffectWithLog` (compiler-side already done in PR #115).
- 🟡 Atomic `state.json` writes (write-to-temp + rename) and advisory lock for
  multi-process safety.

At this stage, Ontology is a verified network kernel, a node editor, a proposal system, an interactive walker, a compiler that produces auditable runnable artifacts with structural validation, and a categorical layer (Yoneda query, effect monad, fibration, topos) that future work can build on.

**Known limitations:**
- Branch fibration has no `onto` CLI surface yet — only walker `:branch list`. Branch-aware compile is a follow-up.
- Topos predicate algebra is library-only; the validator port is pending.
- Semantic linker is exposed only as a programmatic API (`semanticLink()`).
- `runFromWalker` is still on the legacy try/catch path; the `EffectWithLog` refactor covers `compileNode` only.
- `state.json` and `events.jsonl` writes are not crash-atomic — a SIGKILL or out-of-disk mid-write can truncate the file. The single-writer assumption (CLI single-shot) is unchanged; concurrent invocations from multiple processes are not lock-protected.

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

### Bootstrap 0.7: PromptAST ✓
- Parse natural language prompts into structural Abstract Syntax Trees (AST) as formal rewrite rules. Shipped in PR #113: `parsePromptAST(raw)` recognises `@requires:` / `@provides:` / `@expand:` markers, strips them from the prompt body, and emits a deduplicated `PromptAST` consumed by `compileNode`.

### Bootstrap 0.8: Compiler + Hello World ✓
- Compiler v0: `onto compile run <nodeId>` walks the topological plan from `computeCompilePlan` and produces artifacts at `.ontology/artifacts/generated/`. Each step emits `run_persisted` and `compilation_run` events; the artifact path is anchored in the temporal log.
- Manifestation-aware extension: artifacts pick file extensions from `coordinates.manifestation` and `technical.language` (e.g., `manifestation: code` + `language: python` → `.py`).
- Walker integration: `:compile [provider]` from inside the TUI renders the result panel with each step's artifact path.
- Hello-world fixture: `npm run example:hello-world` builds canon → ... → leaf, compiles, and runs the produced Python script.
- PR #102. See `docs/COMPILER.md`.

### Bootstrap 0.9: Categorical Extensions + Compiler Hardening ✓
- Categorical extensions (PR #111): four additive runtime libraries land together — Yoneda query, effect monad, branch fibration, topos predicate algebra. Each ships with proven laws or property tests. See `docs/CATEGORICAL_VISION.md` for the nine-concept map.
- Compiler hardening (PRs #103-#105, #108-#110, #112): code-fence stripping, language parse-check after every artifact write, refinement-parent context threading, per-node `model.ref` routing, system-prompt format leak fix, optional `--runtime-check`, and `contradicts` / `supersedes` plan semantics.
- Walker hardening (PRs #106, #114): `--model` / `--ollama-host` on `:run` and `:compile`; `:validate`, `:branch list`, `:context`, `:query`, `:compile --runtime-check`.
- Compiler refactor onto `EffectWithLog` (PR #115): `compileNode` is no longer a top-level try/catch; failures bubble through `bindWithLog` and partial diagnostics survive.

---

## Future Capabilities (Planned / Not Yet Implemented)

The following components are strictly **planned** and **do not yet exist** in the current architecture. They represent the long-term vision of Ontology as a complete ecosystem.

### SemanticLinker
*(Edge-aware Implemented / CLI surface Planned)*
A dynamic linking system designed to automatically resolve and bind context, dependencies, and interfaces across the semantic network during the compilation functor process. Today it is exposed only as the programmatic `semanticLink()` API; future work adds a CLI surface (`onto link <nodeId>`) and runs the linker between compile steps.

### Branch Fibration CLI
*(Library + Walker surface Implemented / `onto branch` CLI Planned)*
The fibration library ships in PR #111 with `listBranches`, `computeBranchFiber`, `describeCartesianLift`. Walker `:branch list` lands in PR #114. Open: `onto branch list`, `onto branch fiber <branch>` (read-only), `onto compile run --branch <name>` (walk one fiber), and `onto branch lift <nodeId> --to <branch>` (turn the read-only `describeCartesianLift` into a proposal).

### Topos Validator Port
*(Library Implemented / Validator Port Planned)*
`compileNodeRules` and `evaluatePredicate` are in place. Open: rebuild `intent-validator.ts` on the predicate algebra so rules compose first-class via `pAnd` / `pImplies` / etc. instead of imperative loops.

### Visual DAG Studio
*(Planned / Not yet implemented)*
A visual, web-based, multidimensional interface to interact with, query, and edit the `.ontology` graph in real-time, moving beyond the current terminal-first CLI implementation.
