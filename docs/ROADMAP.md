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
  a single predicate. **`intent-validator.ts` ported onto the algebra
  (post-0.9):** its three rules compile to predicates that fold via
  `allOf`; the closed-world reduction preserves the existing two-valued
  contract; `result.verdict ∈ Ω` exposes the underlying three-valued
  result. `src/runtime/topos/`, `src/runtime/context/intent-validator.ts`.
  See [`RULES_TOPOS.md`](RULES_TOPOS.md) and
  [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §3.9.

Follow-ups unlocked by Bootstrap 0.9:
- ✅ Compiler refactor onto `EffectWithLog` (PR #115).
- ✅ Validator port onto the topos algebra (`intent-validator.ts` is now
  built on `compileValidationPredicate` + `evaluatePredicate`).
- 🟡 Branch-aware compile (`onto compile run --branch feature/x` walks one
  fiber, not the whole graph). `computeBranchFiber` is in place; only the
  CLI wiring is missing.
- 🟡 `onto branch list` and `onto branch fiber <branch>` — surface the
  programmatic fibration API to the CLI.
- 🟡 `onto branch lift <nodeId> --to feature/x` — turn the read-only
  `describeCartesianLift` into an `edge_create` / `node_create` proposal.
- 🟡 `onto query` extensions: negation in shapes, exact edge profiles, multi-shape OR.

Other open follow-ups:
- 🟡 `run prompt --as-proposal` with `edge_create` target (the discriminated-union
  mutation schema already supports it; the model-driven candidate edge is the gap).
- ✅ CLI surface for the semantic linker — `onto link <nodeId> --candidate <text>`
  (post-0.9). Wraps `semanticLink()` and surfaces the gluing matrix +
  validation block + edge proposal suggestions. Walker `:link-analysis`
  mirrors the surface using `focal.prompt.raw` as the default candidate.
- 🟡 Walker v2 (plane / time / branch / manifestation rotation, proposal-review pane).
- ✅ Visual DAG Studio (terminal-first) — `:graph view [depth]` walker action; web variant deferred.
- 🟡 `runFromWalker` port onto `EffectWithLog` (compiler-side already done in PR #115).
- 🟡 Atomic `state.json` writes (write-to-temp + rename) and advisory lock for
  multi-process safety.

At this stage, Ontology is a verified network kernel, a node editor, a proposal system, an interactive walker, a compiler that produces auditable runnable artifacts with structural validation, and a categorical layer (Yoneda query, effect monad, fibration, topos) that future work can build on.

**Known limitations:**
- Branch fibration has no `onto` CLI surface yet — only walker `:branch list`. Branch-aware compile is a follow-up.
- Validator port (post-0.9) is closed-world by default: `result.verdict` is observable as Ω, but `result.ok` collapses to Boolean; an `openWorld?: boolean` flag on `validateIntent` would expose three-valued behaviour to callers.
- Semantic linker is exposed only as a programmatic API (`semanticLink()`).
- `runFromWalker` is still on the legacy try/catch path; the `EffectWithLog` refactor covers `compileNode` only.
- `state.json` and `events.jsonl` writes are not crash-atomic — a SIGKILL or out-of-disk mid-write can truncate the file. The single-writer assumption (CLI single-shot) is unchanged; concurrent invocations from multiple processes are not lock-protected.
- Several rhetorical claims in the docs (limit/colimit framing of compile-plan, "rewrite rule" framing of proposals, "shadow" metaphor of compiled code) are useful intuition but not pinned by tests. See [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) for the full ledger.

## Bootstrap history

Each Bootstrap is a milestone. Anything below is shipped; the unshipped
work is in [Open follow-ups](#open-follow-ups).

| Bootstrap | Theme | Shipped (concretely) |
| --- | --- | --- |
| 0.1 | Network kernel | `onto init` / `validate` / `inspect`; canon node; `events.jsonl`; `state.json`; cryptographic hashing. |
| 0.2 | Node editor | `onto node create` (typed level + kind, Zod-validated, hashed). |
| 0.3 | Edges + graph queries | Typed multigraph (18 edge types); `onto node link`; foundational traversal helpers. |
| 0.4 | Walker v0 + poset + run persistence | Read-only Walker (color by abstraction, presheaf-overlap underlining); refinement-family poset enforcement; content-addressed runs (`--persist`). |
| 0.5 | Proposal system (PRs #92–#95) + `propose link` (PR #96) | Full lifecycle (`pending → applied | rejected | staled`); `parentHash` / endpoint-hash re-validation; `run prompt --as-proposal` / `run context --as-proposal`; `node_create` and `edge_create` mutation variants. |
| 0.6 | Map + slice + Walker v1 (PRs #97–#101) | Edge-aware semantic linker; graph query CLI (`onto graph neighbors / path / subgraph`); Walker v1 edit / `:propose` / `:run` / `:plan`. |
| 0.7 | PromptAST (PR #113) | `parsePromptAST(raw)` recognises `@requires:` / `@provides:` / `@expand:` markers and emits a deduplicated AST consumed by `compileNode`. Axiom 4 made structural (parser, not yet rewriter — see [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §2.4). |
| 0.8 | Hello World compiler (PR #102) | `onto compile run` walks the topological plan, dispatches per node, writes manifestation-aware artifacts; full `artifact → compilation_run → run → prompt → node` audit chain. Mock = identity functor on `task: code_sketch`. |
| 0.9 | Categorical extensions + compiler hardening (PRs #103–#115) | Four additive runtime libraries (Yoneda query / effect monad / branch fibration / topos predicate algebra); compiler hardening (code-fence stripping, language parse-check, refinement-parent threading, `model.ref` routing, XML system prompt, `--runtime-check`, `contradicts`/`supersedes`); Walker hardening (`:validate`, `:branch list`, `:context`, `:query`, `:compile --runtime-check`); `compileNode` ported onto `EffectWithLog`. |
| post-0.9 | Validator port onto topos algebra | `intent-validator.ts` is now built on `compileValidationPredicate` + `evaluatePredicate`; `result.verdict ∈ Ω` exposed; closed-world reduction preserves the existing two-valued contract. See [`RULES_TOPOS.md`](RULES_TOPOS.md) and [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §3.9. |
| post-0.9 | Semantic linker CLI | `onto link <nodeId> --candidate <text>` wraps `semanticLink()`: gluing matrix + `validateIntent` block + edge proposal suggestions for missing requirements (per provider, parallel rows for `depends_on` and `uses_token`). Walker `:link-analysis` mirrors the surface using `focal.prompt.raw` as the default candidate. Read-only: suggestions are copy-pasteable `onto propose link` commands. See [`CLI_COMMANDS.md`](CLI_COMMANDS.md) `link <nodeId>`. |

Per-PR detail lives in [`RELEASE_NOTES.md`](RELEASE_NOTES.md).

---

## Open follow-ups

Each item below is unshipped. Tagged 🟡 (active candidate for the next
Bootstrap) or 🔵 (longer-term / shape still to be decided).

- 🟡 **Atomic writes + advisory lock** on `events.jsonl`, `state.json`,
  and `~/.config/ontology/projects.json`. Closes the largest crash-safety
  gap; promotes axiom 2 from T2 to T1 in the claims map.
- 🟡 **`onto branch` CLI surface** — `onto branch list`, `onto branch
  fiber <name>` (read-only), then `onto compile run --branch <name>`
  (walk one fiber), then `onto branch lift <nodeId> --to <branch>` (turn
  `describeCartesianLift` into a proposal).
- 🟡 **Validator open-world mode** — add an `openWorld?: boolean` flag
  on `validateIntent` so callers can observe `verdict === "unknown"`
  directly instead of only via the lower-level
  `compileValidationPredicate` helper.
- 🟡 **`onto query` extensions** — negation in shapes (`!hasIncoming`),
  exact edge profiles, multi-shape OR queries.
- 🟡 **`run prompt --as-proposal` for `edge_create` targets** — the
  discriminated-union mutation schema already supports it; the
  model-driven candidate edge is the missing piece.
- 🟡 **`runFromWalker` port onto `EffectWithLog`** — compiler-side is
  done; walker-side is still on the legacy try/catch path.
- 🔵 **Branch-merge proposals** — natural transformation between two
  fibers. Library-level work; needs a `BranchMergeProposal` shape and a
  unified validation pipeline. See `BRANCH_FIBRATION.md` §Future Work.
- 🔵 **Walker v2** — proposal review pane; plane / time / branch /
  manifestation rotation. See `WALKER_INTERFACE.md` §10.
- 🔵 **node_update with auto-branch (Bootstrap 0.10)** — open design
  question: when branch X is created from main, do existing nodes
  duplicate, project via overlay, or only materialise on touch? Resolve
  in a design note before any code.
- ✅ **Visual DAG Studio (terminal-first)** — `:graph view [depth]` walker
  action renders the focal's k-hop subgraph as a structured panel with
  upstream/downstream/lateral buckets, abstraction-level coloring, and
  per-row connecting edges. Reuses `extractSubgraph` so it agrees with
  `onto graph subgraph` on slice membership. See
  `WALKER_INTERFACE.md`.
- 🔵 **Web-based Visual DAG Studio** — projecting the walker into 2D.
  Deferred until the CLI surface stabilises further; the terminal
  `:graph view` covers the inspection-not-decoration goal for now.
- 🔵 **Rigor improvements identified by [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §6** —
  presheaf-restriction test, artifact-category for the compiler functor,
  cartesian-lift universal-property test, `onto replay`, etc. Each is
  bite-sized and lifts a specific claim from one tier to the next.

### Visual DAG Studio
*(Terminal-first variant Implemented / Web variant Planned)*
The terminal-first variant ships as the walker action `:graph view [depth]` (post-0.9): structured Upstream/Downstream/Lateral buckets with abstraction-level coloring and per-row connecting edges, sharing the `extractSubgraph` helper that backs `onto graph subgraph`. See `WALKER_INTERFACE.md`.

The web variant — a 2D, mouse-driven projection of the same graph with live updates — is deferred until the CLI surface stabilises further. The shape that would make sense first is a static SPA reading `.ontology/` snapshots, with the artifact-trace audit chain as the lead feature (no other tool has it). Edits, proposal staging, and live-update WebSocket pipelines are non-goals for v0.
