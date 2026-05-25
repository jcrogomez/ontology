# Ontology Roadmap

## Current State: 0.4.0-rc.1 — Project Legend Phase ε mid-flight (multi-arm bake-off)

Ontology has reached **post-Bootstrap 0.9** with the **plasticity layer**
shipped, **Project Legend Phases α–δ closed end-to-end**, and **Phase ε
(self-ingestion on the Ontology repo) actively producing data**. The
seven axioms of the canon all run concrete code (axiom 4 is structural
via `parsePromptAST`), four additive categorical extensions (Yoneda
query, effect monad, branch fibration, topos predicate algebra) ship as
runtime libraries with full CLI / Walker surfaces, iteration primitives
(`node update`, `node remove`, `edge update`, `edge remove`, contract
flags on `node create`, validator gate on `compile run`) close the
iterative-workflow loop, and **all milestone-review items §3.1 through
§3.15 are resolved** (tests pin every invariant). The compiler is
hardened end-to-end: code-fence stripping, language parse-check + intent
gate, optional `--runtime-check`, refinement-parent context threading +
structured contract in the system prompt, per-node `model.ref` routing,
and a top-level `EffectWithLog` that retires the legacy try/catch tower
across compile *and* `runFromWalker`. `computeCompilePlan` rejects
`contradicts` and halts BFS on `supersedes` (transitively, pinned).

**Phase ε is no longer "the next active stream":** five self-ingest
runs (β / β′ / γ / δ / δ′) have landed on the Ontology core perimeter
(~125 files), and Move 3α — the multi-arm bake-off testing AST grounding
at compile-back — is mid-flight. Arm A (`qwen2.5-coder:7b`) verified
125/126 nodes (mean Jaccard 0.581, structural honesty 0.496, 0
unrecoverable) and confirmed H1 on all six pre-registered falsifiers;
Arm B (`granite4.1:8b`) was hardware-vetoed (8 GB RAM swap →
`fetch failed` on 124/125 nodes); Arm C-local (`starcoder2:7b`, a
substitute for the deferred cloud devstral-small-2:24b) confirmed that
coding-base-at-7B does not satisfy the MANDATORY EXPORTS contract; the
mechanical cross-arm `bakeoff-synthesis` reads H1 as "partial signal".
An Arm A0 control run (qwen + safety-net **without** `--ast-grounding`)
is currently in flight to isolate grounding's marginal contribution
from a metric-circularity confound that the AST-injection intervention
introduces (see `legend/calibrations/MILESTONE_REVIEW_2026-05-24.md` §3.1).

The full calibration corpus — pre-ε prework, the canonical β / β′ / γ
/ δ / ε self-ingest run triplets (HYPOTHESIS / raw report / SYNTHESIS),
the daily automated milestone reviews, and conventions — is indexed in
[`legend/calibrations/CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md).

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

Follow-ups unlocked by Bootstrap 0.9 (all shipped):
- ✅ Compiler refactor onto `EffectWithLog` (PR #115).
- ✅ Validator port onto the topos algebra (`intent-validator.ts` is now
  built on `compileValidationPredicate` + `evaluatePredicate`).
- ✅ Branch-aware compile (`onto compile run --branch <name>` walks one
  fiber). `5f97e18`.
- ✅ `onto branch list` and `onto branch fiber <name>` — read-only CLI
  surfaces over the fibration library. `c7c062a`.
- ✅ Atomic writes for `state.json`, `events.jsonl`, registry — `writeJson`
  now uses temp + rename; corrupt-mid-write leaves the original intact.
  `17022e9`.
- 🟡 `onto branch lift <nodeId> --to <branch>` — turn the read-only
  `describeCartesianLift` into an `edge_create` / `node_create` proposal.
  Depends on the BRANCH_MODEL.md decision (Option C recommended).
- 🟡 `onto query` extensions: negation in shapes, exact edge profiles, multi-shape OR.

Plasticity layer (closed today — pre-foundation for Project Legend):
- ✅ §1 `compile run` gate with `validateIntent` — semantic gate aborts
  compile on FORBID violation before runtime-check. `1a8a4c3`.
- ✅ §2 `onto node create --requires/--provides/--forbids/--rules` flags —
  contract declarable at create time, no JSON edit required. `fc94700`.
- ✅ §3 `assembleContext` surfaces the structured contract per node in
  the LLM prompt (not only the prose `rules`). `3023bdc`.
- ✅ §4 `onto node update <id>` — edit prompt / label / rules / contract
  tokens in place; re-hash; emit `node_updated` with old/new hashes.
  `dfbefa9`. **The plasticity primitive.**
- ✅ §5 `onto node remove <id>` — refuses if any edge references the node;
  emits `node_removed`. `e847417`.
- ✅ §6 `onto edge remove <edgeId>` + `onto edge update <edgeId> --type`
  — atomic edges.jsonl rewrite; `edge_removed` / `edge_updated` events
  with old/new hashes. `e847417`.

Hardening sweep (all milestone-review items §3.1–§3.15 closed):
- ✅ §3.1 ANSI leak in `truncateVisible`. `cb616ef`.
- ✅ §3.2 atomic `writeJson`. `17022e9`.
- ✅ §3.3 `runtime-check` SIGTERM-slack scaling. `809b948`.
- ✅ §3.4/§3.5 registry path-first + `state.json` liveness check. `82e2a30`.
- ✅ §3.6 `eventTypeColor` negative-first ordering. `8078bb2`.
- ✅ §3.7 `colorsEnabled()` memoization with reset hook. `57fd9e5`.
- ✅ §3.8 `unicodeEnabled()` separation. `96823cc`.
- ✅ §3.9 `runFromWalker` ported onto `EffectWithLog`. `6dc2268`.
- ✅ §3.10 `computeCompilePlan` supersedes transitive pin. `b109547`.
- ✅ §3.11 + §3.12 batched node loads. `0e933a2`.
- ✅ §3.13 binary-file guard on `--candidate-file`. `14ecc51`.
- ✅ §3.14 `:graph view` skipped-count separated from cap-truncation. `f1384be`.
- ✅ §3.15 edge-suggester dedup invariant pin (the bug was not present;
  pinned to prevent regressions). `5fedf4a`.

Open follow-ups:
- ✅ CLI surface for the semantic linker — `onto link <nodeId>`
  (post-0.9). Wraps `semanticLink()` and surfaces the gluing matrix +
  validation block + edge proposal suggestions.
- ✅ Visual DAG Studio (terminal-first) — `:graph view [depth]` walker
  action; web variant deferred.
- ✅ Validator open-world mode — `openWorld?: boolean` flag on
  `validateIntent`; verdict exposed end-to-end through `semanticLink`.
  `c835509`.
- 🟡 `run prompt --as-proposal` with `edge_create` target (the
  discriminated-union mutation schema already supports it; the
  model-driven candidate edge is the gap).
- 🟡 Walker v2 (plane / time / branch / manifestation rotation,
  proposal-review pane).
- 🟡 Advisory lock under `.ontology/.lock` for multi-process safety
  (atomic writes are done; concurrent-writer protection still missing).

At this stage, Ontology is a verified network kernel with mutable iteration semantics (plasticity layer in place), a proposal system, an interactive walker, a compiler with a semantic gate that produces auditable runnable artifacts, branch-aware compile via Grothendieck fibers, and a categorical layer (Yoneda query, effect monad, fibration, topos) that future work — most notably **Project Legend** — builds directly on top of.

## The next chapter: Project Legend

**[`docs/PROJECT_LEGEND.md`](PROJECT_LEGEND.md)** is the design for the
inverse direction of the compile functor: lift existing source code into
the intent layer, verify the homeomorphism $F \circ G \approx
\mathrm{id}$ on a measured subcategory, and report the intent-resistant
complement. The Inspector / Lupa primitive (one LLM call per node
lifetime, cached as `node.translator`) keeps the resulting network
human-readable. The Open-Prompt protocol turns the signed intent +
audit chain into a trust-transparency layer that lets organisations
publish what they run without exposing source.

Phase plan (estimates from PROJECT_LEGEND.md §6):

| Phase | Content | Status | Est. hours |
|---|---|---|---|
| α | Pre-foundation gaps §1–§6 (plasticity layer) | ✅ shipped | — |
| β | Layer 1 (multi-file compile + `--target`), 2 (`node.literal`), 5 (path fibration) | ✅ shipped (incl. 2 post-merge fixes) | actual ~10 h |
| γ | Layer 7 (`onto ingest <file>`) + Anthropic provider + rich proposal payload | ✅ γ-0 / γ-1 / γ-3 shipped 2026-05-12; γ-2 calibration on `hash.ts` 5/5 ε-equivalent (see [`legend/calibrations/HASH_TS_2026-05-12.md`](legend/calibrations/HASH_TS_2026-05-12.md)) | γ-0–3: ~4 h |
| γ-4/5/6 | Layer 3 (TS-first static-edge inference) + `onto ingest <directory>` + `infer-edges --create-proposals` + walker AI indicator + `--include` flag | ✅ shipped 2026-05-12 (commits `62d8c86` / `a25ade9` / `9c16b9d` / `69424af` / `bc350ce`); Vibe-Reasoning runbook at [`legend/calibrations/VIBE_REASONING_PROCEDURE.md`](legend/calibrations/VIBE_REASONING_PROCEDURE.md) | actual ~6 h |
| δ | Layer 4 (Inspector / translator) + Layer 6 (verification + report) | ✅ shipped 2026-05-12 (`8779acc` δ-1 + `29b330c` δ-2); γ-7 prompt invariants (`2e8853e`) + 5 tooling-gap fixes (`6ea7e94`) + 5 reviewer fixes (`b035ce7`) + cross-provider routing (`f80163d`) all in main | actual ~12 h |
| γ-7 + δ measurement | Vibe-Reasoning corpus calibration with γ-7 invariants | ✅ shipped 2026-05-12 (`7abd73e`); +29pp ε-equiv, `divergent_both` eliminated. Report at [`legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md`](legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md) | actual ~3 h |
| ε — β / β′ / γ / δ / δ′ baseline | Self-ingest of the Ontology core perimeter (~125 files); five iterative runs each pre-registered. Move 1 (export-vocab preservation in `static_summary`), Move 1b (vocab-domain flatmap of `i.symbols`), Move 1c (ingest safety net), δ EXTRACTION_SYSTEM_PROMPT rewrite (descriptive → constructive) all shipped during this arc | ✅ shipped 2026-05-16 → 2026-05-18; see triplets in [`CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md) §1 | actual ~10 h |
| ε — Move 3α tooling burst (2026-05-22) | Bake-off-synthesis generator (`ddfe266`), `homeomorphism_verified` event audit with `model` + `perimeterHash` (`00b8100`), `--reps N --aggregator median` for variance defang (`6c6e368`), `ingest-prompt-template.test.ts` invariants (`54cd2f0`), hierarchizer baseline + empirical-validation protocol | ✅ shipped 2026-05-22 (10-commit burst) | actual ~6 h |
| ε — Move 3α multi-arm bake-off | AST grounding at compile-back; Arm A `qwen2.5-coder:7b`, Arm B `granite4.1:8b`, Arm C-local `starcoder2:7b` (Arm C-cloud `devstral-small-2:24b` deferred); H1 falsifiers pre-registered, decision tree fires "partial signal" | 🟡 active — Arm A `2026-05-23` confirms H1 on 6/6; Arm B HW-vetoed; Arm C-local contract-violation; **Arm A0 control in flight 2026-05-24**; Arm C-cloud (~$5–10) gates clean H3 | actual to-date ~12 h |
| ε — close + adjoint upgrade | Land Arm A0 + cloud Arm C, recalibrate hypotheses if synthesis warrants, upgrade [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §3.10 adjoint claim from T4 → T2 | 🟡 pending Arm A0 + cloud Arm C | ~3–5 h |
| ζ | Release + Open-Prompt seeds (sign, verify-published, replay) | pending | ~3–5 h |

**Known limitations (as of plasticity layer completion):**
- Semantic linker has a read-only CLI (`onto link <nodeId>`);
  proposal-mutation flow still requires the manual
  `onto propose link` → `onto proposal apply` two-step.
- Concurrent multi-process writes are not lock-protected. The writes
  themselves are crash-atomic (temp + rename), but a SIGKILL between
  two cooperating CLI invocations could still leave inconsistent
  state. Advisory lock under `.ontology/.lock` is the next hardening
  item.
- BRANCH_MODEL.md (Option A/B/C decision) is recommended (Option C —
  lazy materialisation) but not user-confirmed. Required before any
  cross-branch `node_update` propagation lands.
- `Walker v2` (proposal review pane, plane/time/branch/manifestation
  rotation) remains unshipped. The existing Walker is functional but
  basic.
- Several rhetorical claims in the docs are useful intuition but not
  pinned by tests. See [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md)
  for the full ledger — Project Legend's adjoint claim (§3.10) is
  currently classified T4 and lifts to T2 after Phase ε.

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
| post-0.9 | Semantic linker CLI | `onto link <nodeId> --candidate <text>` wraps `semanticLink()`: gluing matrix + `validateIntent` block + edge proposal suggestions for missing requirements (per provider, parallel rows for `depends_on` and `uses_token`). Walker `:link-analysis` mirrors the surface using `focal.prompt.raw` as the default candidate. Read-only: suggestions are copy-pasteable `onto propose link` commands. |
| post-0.9 | `:graph view` walker action | `:graph view [depth]` renders the focal's k-hop subgraph as a structured panel (upstream / downstream / lateral buckets, abstraction-level coloring, per-row connecting edges). Reuses `extractSubgraph`. Closes the Visual DAG Studio terminal-first roadmap item. |
| post-0.9 | `onto branch list` + `onto branch fiber <name>` | Read-only CLI surfaces over the fibration library. `branch list` enumerates branches with per-branch node counts; `branch fiber <name>` renders the induced subgraph (nodes + edges intra-branch). Errors on unknown branch with `Known branches:` hint. |
| post-0.9 | Plasticity layer (gaps §1–§6 of pre-Legend foundation) | `compile run` gates on `validateIntent` (semantic gate before runtime-check); `onto node create` accepts `--requires/--provides/--forbids/--rules` flags; `assembleContext` surfaces the structured contract per node in the LLM prompt; `onto node update <id>` edits prompt / label / rules / contract in place with `node_updated` event; `onto node remove <id>` deletes (refuses with edge guard); `onto edge remove/update <id>` for symmetric edge ops. Schema additions: `node_removed`, `edge_updated` event types. |
| post-0.9 | Hardening sweep (§3.1–§3.15) | ANSI leak fix, atomic `writeJson`, runtime-check slack scaling, registry foot-guns, eventType ordering, memoised colorsEnabled, separated unicodeEnabled, batched node loads in compile + graph-view, binary-file guard, supersedes transitive pin, edge-suggester invariant pin, skipped-count separated from cap-truncation, `runFromWalker` ported onto `EffectWithLog`. |
| post-0.9 | `onto compile run --branch <name>` | Restrict the compile plan to a single Grothendieck fiber. Refuses with `focal_off_branch` if the focal lives on a different branch; refuses with `missing_branch` if the name is unknown. |
| post-0.9 | Validator open-world mode | `openWorld?: boolean` on `validateIntent`; the three-valued verdict (true/false/unknown) is now observable end-to-end through `semanticLink.validation.verdict`. Closed-world remains the default (backward compatible). |
| post-0.9 | Project Legend foundation | [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md) design document. Mathematical-claims registry updated with §3.10 (compile adjoint), §4.8 (Inspector triangle), §4.9 (Open-Prompt protocol), all T4 with explicit paths to T2 after the respective phases ship. |
| post-0.9 | Project Legend Phase β | `onto compile run-batch` + `compile run --target <path>` (β-1, `a09e1d7`); `node.literal` escape hatch (β-2, `04f730c`); `computeFiberBy(input, projection)` for path fibration (β-3, `881506a`); post-β review blockers — atomic write + clobber gate + binary guard (`157d367`); two-phase commit for `writeArtifact` so failed validator no longer clobbers `--target` (`2cbaa32`). |
| post-0.9 | Project Legend Phase γ (extraction core) | γ-0 Anthropic provider with prompt caching, default `claude-opus-4-7` (`aad0fed`); γ-1 `onto ingest <file>` with `--dry-run` (`b670ca3`); γ-3 rich proposal payload — manifestation/language/requires/provides/forbids/rules/literal/sourceFiles on `node_create` (`7d50c91`); γ-4 TS-first static-edge inference + `onto graph infer-edges <dir>` preview (`62d8c86`); γ-5 `onto ingest <directory>` multi-file (`a25ade9`); γ-6 `infer-edges --create-proposals` for edge proposals against applied nodes (`9c16b9d`); walker AI provider status indicator (`69424af`); `--include` flag for non-TS source extensions + Vibe-Reasoning runbook (`bc350ce`). γ-2 calibration: 5/5 ε-equivalent on `hash.ts` with Opus 4.7 (commit `ac0a45f`, report at [`legend/calibrations/HASH_TS_2026-05-12.md`](legend/calibrations/HASH_TS_2026-05-12.md)). |
| post-0.9 | Project Legend Phase γ-7 + δ (Vibe-Reasoning hardening) | `eee5610` `onto ingest --cost-estimate` (zero-API pre-flight); `bad6840` γ-4 Python static-edge parser (regex-based; `src/runtime/static/python.ts` + language-agnostic dispatcher); `4dd59b1` `--open-world` flag + ingest prompt fix (stale `kind` enum + project-internal-only contract tokens); `23ac144` configurable `--max-tokens` (Anthropic default 4096 → 8192, exposed on `compile run` / `run-batch`); `2e8853e` γ-7 MANDATORY EXPORTS block in `assembleContext` + extractor prompt teaches comprehensive `provides` capture; `29b330c` δ-2 `onto verify-homeomorphism` — dual-distance (LoC + structural Jaccard) + five-label verdict folder, the `MATHEMATICAL_CLAIMS.md` §3.10 publishable measurement; `8779acc` δ-1 `onto node inspect` (Inspector / Lupa) — translator cached on `node.translator` with automatic `sourceHash` invalidation, `--regenerate` override, one LLM call per node lifetime. |
| post-0.9 | Project Legend Phase ε — β / β′ baseline (2026-05-16) | First end-to-end self-ingest of the Ontology core perimeter. β: `qwen2.5-coder:3b` both ways (single-model baseline). β′: drop `--model` override on `verify-homeomorphism` so registry per-task routing actually runs; also lands **Move 1** (export-vocabulary preservation in `static_summary`). β′ surfaced a routing-architecture bug mid-flight + first Jaccard 1.0 file proving Move 1's mechanism works in isolation. Triplet siblings under [`legend/calibrations/`](legend/calibrations/). |
| post-0.9 | Project Legend Phase ε — γ + Move 1b vocab-domain fix (2026-05-18) | β′ proved Move 1 worked in isolation but aggregate regressed because `static_summary` emitted module specifiers into `requires` while gluing demanded symbol names. **Move 1b** (`9eb9211`) flatmaps `i.symbols` instead — recovered 13 unrecoverable nodes (32 → 19) but mean Jaccard stayed at 0.003, pointing the diagnosis at the extraction prompt. |
| post-0.9 | Project Legend Phase ε — δ / δ′ EXTRACTION_SYSTEM_PROMPT rewrite (2026-05-18) | Same schema/models as γ; only EXTRACTION_SYSTEM_PROMPT changed, from descriptive ("describe the SHAPE") to constructive ("MUST export/return …"). Mean Jaccard 7× off γ floor; vocab gap −12% only (488 missing exports / 115 of 125 nodes). Sets up Move 3α as the compile-back-side intervention. |
| post-0.9 | Project Legend Phase ε — Move 3α tooling burst (2026-05-22, 10 commits) | `ddfe266` `src/runtime/legend/bakeoff-synthesis.ts` deterministic no-LLM cross-arm synthesizer (per-arm summaries, micro/macro export-recovery deltas, signed per-mode failure deltas, Pareto roll-up, per-file rebuild status, H1 mean-Jaccard decision gate, markdown renderer); `00b8100` `homeomorphism_verified` event audit — `model: { provider, model }` + `perimeterHash = sha256(sorted source files)` so the audit chain replays from `events.jsonl` alone; `6c6e368` `--reps N --aggregator median` defangs single-draw Jaccard variance; `54cd2f0` `tests/ingest-prompt-template.test.ts` pins the δ′ EXTRACTION_SYSTEM_PROMPT invariants (MANDATORY block contents, provides-in-prompt, forbidden narrative phrases); hierarchizer baseline + empirical-validation protocol (`HIERARCHY_BASELINE_2026-05-22.md`, `EMPIRICAL_VALIDATION_PROTOCOL_2026-05-22.md`) establish `closedWorldContextReachableSatisfaction` as the brújula. |
| post-0.9 | Project Legend Phase ε — Move 3α Arm A (2026-05-23, qwen2.5-coder:7b) | First arm of the multi-arm bake-off. AST-extracted MANDATORY EXPORTS injected into compile-back system prompt. 125 nodes verified, structural honesty mean 0.496 (100% coverage), 10% epsilon_equivalent / 57% divergent_loc / 4% divergent_structural / 30% divergent_both / **0 unrecoverable**. Wall-clock 1h 33min (15:46 → 17:20 local; 3.2× faster than the pre-registered 5h forecast — the 1.1 tok/s swap-floor measurement overestimated). Confirms H1 on all six pre-registered falsifiers, each by ~10×. Pre-Arm-A hardening: `5d70f3b` fixes the `--reps` cache-collision (per-rep token folded into `runId`) + `2591179` adds `fsync` on `state.json` + integration test + README honesty pass; `103d3c2` Arm A pre-flight checklist + critical-path map. |
| post-0.9 | Project Legend Phase ε — Move 3α Arms B / C-local + synthesis (2026-05-24) | Arm B (`granite4.1:8b`, 5.3 GB) — hardware-vetoed: 124/125 unrecoverable from HTTP `fetch failed` as the 5.3 GB model swapped on 8 GB RAM; wall-clock 10h 27min (mid pre-registered 10-25h band). Verdict: "inoperative on this hardware, not structured-output specialist fails to lead qwen" — clean Arm B requires cloud / ≥16 GB RAM. Arm C-local (`starcoder2:7b`, 4.0 GB) — substitute for the deferred cloud `devstral-small-2:24b`: 54% unrecoverable + 46% divergent_both; wall-clock ~12 min (short-circuit on intent validation). Verdict: "coding-base-at-7B does not satisfy the MANDATORY EXPORTS contract" — NOT diagnostic of the broader H3. Synthesis driver `scripts/run-3a-bakeoff-synthesis.ts` lands; H1 decision-tree gate fires "partial signal" (A clears 0.1 floor; B/C-local don't). `0313ebc` ships `node_update_parent` kernel primitive (schema + apply path + planner unblock; consumed by `hierarchizer.ts`, no CLI verb yet). |
| post-0.9 | Project Legend Phase ε — Move 1 hygiene + manifestation guard (2026-05-24, `e6141b1`) | Closes [`MILESTONE_REVIEW_2026-05-24.md`](legend/calibrations/MILESTONE_REVIEW_2026-05-24.md) §4.1 silent-perimeter under-count. `node_0094` (entry point of `src/commands/ingest/index.ts`) was ingested with `manifestation: "intent"` (the schema default the LLM extractor fell into for a degenerate extraction) and silently excluded from `verify-homeomorphism --all-artifacts`, shrinking Arm A from 126 to 125 with no warning. Fix shipped as: `inferManifestationFromSourcePath` helper in `runtime/compile/manifestation-mapper.ts` (extension → manifestation: `*.ts/*.py/...` → `code`, `*.test.ts/...` → `test`, `build.sh` → `build`); ingest guard in `createNodeProposalForExtraction` overrides extractor manifestation when it is `undefined` or `"intent"` and the path implies otherwise, recording the override in `provenance.rationale.manifestationOverride`; verify warning in `--all-artifacts` candidate resolver lists silently-excluded code-extension nodes (suppressed under `--json`). Move 1 also lands the Arm A/B/C-local + synthesis reports + sidecar JSONs (the pre-registered output), the synthesis driver, the daily milestone-review series, [`CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md) as the index, and an Arm A post-publication addendum documenting the 125 vs 126 distinction. Companion: Arm A0 control run (qwen + safety-net **without** `--ast-grounding`) launched same day to isolate grounding's marginal contribution from the §3.1 metric-circularity confound. |

Per-PR detail lives in [`RELEASE_NOTES.md`](RELEASE_NOTES.md).

---

## Open follow-ups (canonical, kept in sync with the headline status above)

Each item below is unshipped. Tagged 🟡 (active candidate for the next
Bootstrap) or 🔵 (longer-term / shape still to be decided). Items
shipped today have been promoted out of this list and into the
Bootstrap history table above.

**Project Legend core — Phase ε remaining work:**
- 🟡 **Arm A0 control run** (in flight 2026-05-24). qwen2.5-coder:7b
  with safety-net **without** `--ast-grounding`, identical perimeter to
  Arm A. Isolates grounding's marginal contribution from the metric-
  circularity confound surfaced in
  [`MILESTONE_REVIEW_2026-05-24.md`](legend/calibrations/MILESTONE_REVIEW_2026-05-24.md)
  §3.1 (the intervention injects exactly the declaration names that
  `structuralJaccard` / `exportRecoveryRate` score). ~1.5 h wall-clock,
  $0. Report: `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A0_CONTROL.md`.
- 🟡 **Arm C-cloud — `devstral-small-2:24b`** on rented GPU. The clean
  H3 test ("coding-specialisation doesn't transfer") needs a coding-
  tuned 24B that fits in ≥24 GB VRAM; local 8 GB Mac is infeasible
  (measured 0.02 tok/s). ~1-2 h on an A10/L4-class GPU at ~$0.50-2.00/h
  = total ~$5-10 if scheduled to one continuous session. Output triplet
  follows the same convention.
- 🟡 **Behaviour-axis checker** (next-highest cartography column). The
  current matrix has only `structural` (+ `cost`) filled across 125
  nodes; `contract`, `behaviour`, `intent` are all explicitly
  not-measured / untested / not-reviewed. `behaviour` is the most
  valuable next checker because it is **orthogonal to AST grounding**
  and so immune to the §3.1 metric-circularity concern — a smoke
  `--runtime-check` over the subset that compiles would already be
  diagnostic.
- 🟡 **Bake-off-synthesis CLI surface**. The library
  (`src/runtime/legend/bakeoff-synthesis.ts`) and the markdown renderer
  are tested and used in production; the cross-arm synthesis still
  needs a hand-rolled driver (`scripts/run-3a-bakeoff-synthesis.ts`).
  An `onto legend bakeoff-synthesis <jsons…>` verb removes the last
  manual cherry-picking surface.
- 🟡 **`MATHEMATICAL_CLAIMS.md` §3.10 adjoint upgrade — T4 → T2**.
  Gated on a clean ε close (Arm A0 + Arm C-cloud at minimum). The
  cartography matrix becomes the publishable measurement; the
  fidelity-axis honesty (structural + at least one orthogonal column)
  decides whether to upgrade or report the gap honestly.

**Plasticity follow-ups:**
- 🟡 **Advisory lock under `.ontology/.lock`** for multi-process safety.
  Atomic writes are done; concurrent-writer protection is the next step.
- 🟡 **`onto branch lift <nodeId> --to <branch>`** — turn the read-only
  `describeCartesianLift` into an `edge_create` / `node_create`
  proposal. Depends on the BRANCH_MODEL.md decision (Option C
  recommended).
- 🟡 **`onto query` extensions** — negation in shapes (`!hasIncoming`),
  exact edge profiles, multi-shape OR queries.
- 🟡 **`run prompt --as-proposal` for `edge_create` targets** — the
  discriminated-union mutation schema already supports it; the
  model-driven candidate edge is the missing piece.

**Project Legend stretch (Phase ζ / Open-Prompt):**
- 🔵 **`onto sign <branch>`** — Merkle root over nodes + events, signed
  with the org's private key.
- 🔵 **`onto verify-published <signed-artefact>`** — re-walk the audit
  chain, validate signatures.
- 🔵 **`onto replay --against <intent-artefact>`** — run an output
  stream against a published intent network, surface any artefact that
  would have failed the validator.

**Post-Phase ζ — self-maintaining intent network (RFCs drafted):**
- 🟡 **Wakeup Scanners** — system-initiated proposals via topology and
  LLM scanners that traverse the graph and emit typed Intents (orphan,
  missing edge, split, merge, extract canon, supersede). Intents
  desugar to sequences of atomic proposals already supported by the
  current Proposal System; grouping is transactional via a new Bundle
  artifact. Fase 1 (topological scanners, no LLM) is independent of any
  other work and is the smallest unit that exercises system-initiated
  proposals end-to-end. Spec: [`WAKEUP_SCANNERS.md`](WAKEUP_SCANNERS.md).
- 🟡 **Prompt Generators** — content-addressed, composable prompt
  templates so scanner-dispatched runs carry a verifiable causal chain
  back to the parameterised template that produced their `promptHash`.
  Reuses the existing `@expand:` marker in `parsePromptAST` (today
  metadata only) as substitution primitive; the path that lifts
  [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) Axiom 4 from T3 to
  T2 in the generator domain. Prerequisite for Wakeup Fase 3 (LLM
  scanners). Spec: [`PROMPT_GENERATORS.md`](PROMPT_GENERATORS.md).

**Longer-term:**
- 🔵 **Branch-merge proposals** — natural transformation between two
  fibers. Library-level work; needs a `BranchMergeProposal` shape and a
  unified validation pipeline. See `BRANCH_FIBRATION.md` §Future Work.
- 🔵 **Walker v2** — proposal review pane; plane / time / branch /
  manifestation rotation. See `WALKER_INTERFACE.md` §10.
- 🔵 **Bootstrap 0.10 — `node_update` across branches** — requires
  the BRANCH_MODEL.md decision (Option C recommended). The per-branch
  `node_update` itself is shipped; cross-branch propagation is the gap.
- 🔵 **Web-based Visual DAG Studio** — projecting the walker into 2D.
  Deferred until the CLI surface stabilises further; the terminal
  `:graph view` covers the inspection-not-decoration goal for now.
- 🔵 **Rigor improvements** identified by
  [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) — presheaf-restriction
  test, artifact-category for the compiler functor, cartesian-lift
  universal-property test, `onto replay`, etc. Each is bite-sized and
  lifts a specific claim from one tier to the next.

---

*This roadmap is kept in sync with `main` after every commit that
ships a new surface or closes a follow-up. Stale items move to the
Bootstrap history table; new items land here under their phase
heading. Last refresh: **2026-05-24**, after a twelve-day Phase ε
arc that took the project from "ε is next, gated on API credit" to
"ε is mid-flight with concrete data". Five self-ingest runs landed
(β / β′ / γ / δ / δ′; perimeter ~125 files); Move 1 / 1b / 1c
shipped the export-vocabulary preservation, vocab-domain flatmap, and
ingest safety net; the EXTRACTION_SYSTEM_PROMPT rewrote from
descriptive to constructive; the Move 3α tooling burst (`ddfe266`,
`00b8100`, `6c6e368`, `54cd2f0`, + hierarchizer baseline +
empirical-validation protocol) made the multi-arm bake-off
mechanical and audit-replayable; Move 3α Arm A confirmed H1 on 6/6
falsifiers (`qwen2.5-coder:7b`, mean Jaccard 0.581, 0 unrecoverable);
Arm B hardware-vetoed (`granite4.1:8b`, 124/125 unrecoverable on
8 GB RAM); Arm C-local contract-violation (`starcoder2:7b`, coding-
base-at-7B fails the MANDATORY EXPORTS contract); synthesis fired
"partial signal"; Move 1 hygiene (`e6141b1`) shipped the
`inferManifestationFromSourcePath` guard + verify silent-exclusion
warning that closes the `node_0094` 125/126 perimeter under-count;
[`CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md)
landed as the canonical index of the calibration corpus
(`783b5b1`). **Arm A0 control** (qwen + safety-net **without**
`--ast-grounding`) is currently in flight to disentangle the §3.1
metric-circularity confound; **Arm C-cloud (devstral-small-2:24b on
rented GPU, ~$5-10)** is the remaining gate for a clean ε close and
the §3.10 adjoint claim's T4 → T2 upgrade.*
