# Ontology Roadmap

## Current state

Project Legend **Phases α–ε closed**; **Phase ζ (workflow runtime) is
active.** Phase ε (self-ingestion) closed 2026-05-26 on a 4-arm +
2-column substate: five iterative self-ingest runs (β / β′ / γ / δ / δ′)
plus the Move 3α multi-arm bake-off established that AST grounding
contributes a real Δ = +0.355 mean Jaccard, and the §3.10 adjoint claim
was upgraded T4 → T2. The fidelity-cartography matrix fills **2 of 5
columns** (structural + behaviour; contract / intent are explicit
no-data). Phase ζ has shipped a workflow-runtime v0 (typed-node state
machine, predicate DSL, artefact-slot dataflow). The platform
underneath (network kernel, proposal system, semantic linker, compiler
with intent gate + `--runtime-check`, four categorical extensions,
plasticity layer, atomic writes, hardening sweep §3.1–§3.15) is closed.

**Rigor sprint (2026-06-01).** Three load-bearing categorical claims
moved up the tier ladder: Axiom 5 presheaf-restriction and Axiom 6 /
§3.2 compiler-functoriality promoted **T2 → T1** (laws test-pinned via
`tests/presheaf-sheaf-laws.test.ts` + `tests/compiler-functoriality.test.ts`
and the new `src/runtime/graph/artifact-category.ts`), and §3.10's adjoint
reframed as a *probabilistic / enriched* functor with a shipped, tested
variance-measurement core (`src/runtime/legend/verdict-variance.ts`) — it
stays T2 (only the budget-gated real-LLM N-run remains). A pinned
**negative** result: context gluing is a *separated presheaf*, not a
sheaf / colimit (the gluing axiom fails for agreeing sections). A second
pass closed the two cheap *load-bearing* claims: **Axiom 2** (crash-atomic
durable event log + advisory lock — the code had already shipped, the
ledger entry was stale; pinned by `fs-json.test.ts` + `advisory-lock.test.ts`)
and **§3.9 validator port** (closed-world parity == Boolean oracle,
exhaustively pinned by `tests/runtime/topos/closed-world-parity.test.ts`)
→ both T1. **T1 count 8 → 13.** Detail in
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §Axiom 2, §Axiom 5,
§Axiom 6, §3.9, §3.10.

**Where to look:**
- This file is the single source of truth for what is open. Daily review findings roll in here, not into dated snapshots.
- ε run history + hypothesis triplets: [`legend/calibrations/CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md).
- Per-PR / per-commit detail: [`RELEASE_NOTES.md`](RELEASE_NOTES.md).
- Move 3α TODO + resume point: [`legend/calibrations/SELF_INGEST_EPSILON_3A_TODO.md`](legend/calibrations/SELF_INGEST_EPSILON_3A_TODO.md).
- Design background: [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md), [`POSITIONING.md`](POSITIONING.md), [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md).

## Phase plan (Project Legend)

| Phase | Content | Status |
|---|---|---|
| α | Pre-foundation gaps §1–§6 (plasticity layer) | ✅ shipped |
| β | Multi-file compile + `--target`, `node.literal`, path fibration | ✅ shipped |
| γ | `onto ingest <file/dir>`, Anthropic provider, static-edge inference, rich proposal payload | ✅ shipped |
| δ | Inspector / translator (`onto node inspect`) + verification (`onto verify-homeomorphism`) | ✅ shipped |
| ε | β / β′ / γ / δ / δ′ self-ingest runs + Move 3α multi-arm bake-off (AST grounding Δ = +0.355 mean Jaccard, §3.1 circularity resolved); §3.10 adjoint T4 → T2 | ✅ closed 2026-05-26 (4-arm + 2-column substate) |
| **ζ** | Workflow runtime — typed-node state machine, predicate DSL, artefact-slot dataflow, behaviour-axis checker | 🟡 active — runtime v0 + §4.1 dataflow fix landed; no clean real-LLM pass yet |

## Open follow-ups

### Highest-value validation gaps

These close the largest distance between what's *built* and what's
*demonstrated*:

- 🟠 **One real-LLM verify-refine run — first attempt 2026-05-29, surfaced two findings (not yet a clean pass).** The ζ runtime was driven end-to-end for the first time against a real LLM via the Semillas-al-Aire podcast generator (a verify-refine graph gating an episode draft on a §14 checklist, local Ollama granite4.1:8b). Dry-run validated the state machine (seed→verify→pass→revisit→verify→accept, no branch-coverage warnings). The live run did **not** complete, for two reasons worth recording:
  - **(a) Robustness bug — undici headers timeout on slow Ollama prefill.** A verifier dispatch died with `UND_ERR_HEADERS_TIMEOUT` (`executor.ts:424` → `ollama/adapter.ts:111`). Root cause measured by raw curl: granite4.1:8b on an 8 GB Mac took **360 s** to process a ~6.5 KB verify prompt (prefill-bound; 119 output tokens), exceeding undici's default 300 s `headersTimeout`. Compile dodges this (shorter per-node prompts). **Fixed (2026-06-01, `3db9aa4`):** the Ollama client is routed through a `node:http` fetch shim (`ollama/fetch-shim.ts`) that imposes no headers timeout (`undici` is not importable and node exposes no knob to raise the global dispatcher's), so a slow prefill simply waits; connection failures still surface as `ECONNREFUSED` so the soft-fail path is unchanged. This unblocks long *local* runs but does not change (b) — the clean pass still belongs on a frontier provider.
  - **(b) Practical reality — local 8 GB is too slow for a real loop.** At ~6–15 min per step × several iterations, a full §14 loop is >1 h and a 8 B model likely never passes §14. This empirically confirms the project's "local insufficient for the quality bar" note. The clean real-LLM pass should run the loop on a frontier provider (gemini-flash / Anthropic) — which is also where it should land for `examples/workflow-imo-verify-refine`. The compile half (research → ARCO → 4 parts) ran fine on local Ollama and produced a real episode draft; only the verify-refine loop is gated on frontier.
- 🟡 **Test suite runs on Node 20+; pre-existing failures fixed; slowness root-caused (NOT a hang).** Default Node is 18 (vitest's rolldown needs ≥ 20.12 for `node:util.styleText`); Homebrew `node@23` runs it. Four pre-existing failures (unrelated to current work) were fixed in `35e4078`: two real dispatcher bugs + one stale model-capabilities test. **Bisection result (2026-05-28):** the suite is *slow, not hung* — it completes (core ~16 min). The cost is **subprocess-spawn overhead**: 12 CLI/integration test files drive the CLI through `tests/helpers/run-cli.ts`, which spawns `npx tsx src/cli.ts` per call, re-paying `npx` resolution + a full `tsx` transpile of the CLI graph (~1–4s each). Worst offenders: `ingest-cli` 64s, `ingest-static-classifier-enabled` 36s, `…-integration` 28s, `ingest-cost-estimate` 17s, `ingest-ensemble-integration` 16s; pure in-process groups are sub-second (legend 1.2s, hierarchizer 0.15s). **Fixed (2026-05-29):** vitest `globalSetup` builds the CLI once and all CLI tests spawn the compiled `node dist/cli.js` (no `npx`, no per-call transpile) — `be31168` (shared `run-cli.ts` helper, 47 files), `2b1f2ba` (6 inline spawn sites). Non-CLI core dropped **994s → 379s (2.6×)**. The two original core failures are resolved: the dispatcher/model-capabilities bugs (`35e4078`) and `ollama-adapter`'s over-narrow soft-fail assertion (`210c447`, now accepts `model 'X' not found` as a valid soft-fail). **Non-CLI core: 116/116 files green.** The live-Ollama reliability item is **fixed** (`0b209a7`): the `--provider ollama` run-context tests now target an unreachable host (`127.0.0.1:9999`) so they fail fast into their soft-fail branch instead of doing a real generation (was ~45s timeouts; now `run-context-cli` 23/23 in ~15s). `ingest-cli`/`model-cli` Ollama sites use `--cost-estimate`/`model list` (no generation) and were already fast. Workflow/verify suites green (workflow 56/56, verify-determinism 5/5, dispatcher 22/22, routing 44/44).

### Phase ζ — workflow runtime

- 🔵 **Minor ζ ergonomics** (same review, low priority): `step_count` counts *global* visits, not per-node verifier visits — in a generator↔verifier loop `step_count >= 10` means ~5 verifications, not 10; document in spec §3.2 or expose a per-node `visit_count`. And `no_matching_branch` rejects return the verdict JSON as `output` while accept/reject terminals return `currentArtifact` — inconsistent; consider returning `currentArtifact` on branch rejects too.
- 🟡 **Verdict-map variance thread** (`MATHEMATICAL_CLAIMS.md` §3.10, stays T2). The binary-determinism T1 gate is empirically unachievable (real LLMs are not bit-deterministic at temp 0), so §3.10 was reframed (2026-06-01) as a *probabilistic / enriched* adjoint and the measurement core shipped (`verdict-variance.ts` + test: N samples → verdict-distribution agreement / entropy / metric-stdev). Only the budget-gated **real-LLM N-run generation** remains — run it on a frontier provider against a small fixed repo and report the spread (the quantitative ε).
- 🔵 **Advisory lock not universal across mutations** (kernel; surfaced by the 2026-06-01 Axiom 2 → T1 pass). `withLock` wraps the long-running multi-write commands (`compile run`, `compile run-batch`, `verify-homeomorphism`) but the quick single-shot mutations (`node create` / `link`, `proposal apply`, `init`) are not lock-wrapped. They rely on per-write crash-atomicity, so the worst case under a (rare, single-user) concurrent invocation is a *last-writer-wins lost update* on `state.json`, never a corrupt file. Universalising the lock (a shared `--no-lock` option + `withLock` wrap on the quick mutations) is deliberate future hardening, not a correctness bug.
- 🔵 **Behaviour checker module eviction** (`behavior-checker.ts`): the per-call `?ts=` cache-bust leaks module instances, but it is **load-bearing** — `behavior-checker.test.ts` pins that re-imports get fresh module state (isolation between reps). Content-addressing the cache key trades that isolation away, so a real fix needs worker/process isolation (deferred to v1). Fine at ~20 nodes until then.

### Cartography / ε tail (optional reinforcement)

- 🔵 **Arm C-cloud — `devstral-small-2:24b`** on rented GPU (~$5–10). ε closed without it; this is a reinforcement of H3, not a blocker. Local 8 GB Mac is infeasible.
- 🟡 **Contract / intent columns** — the matrix fills 2 of 5; these two remain explicit no-data. **Intent column now has a designed extractor (2026-06-01):** `src/runtime/legend/intent-narration.ts` lifts the *why* (problem / decision / rejected-alternative / parent-goal) as a generative prompt with a behaviour-oracle (`acceptanceCriteria`), over file *neighbourhoods*, deliberately lossy — the opposite stance to the contract extractor. Spec + golden examples in [`legend/INTENT_NARRATION_SPEC.md`](legend/INTENT_NARRATION_SPEC.md). **Wired (2026-06-01):** `onto ingest --intent [<files...>]` narrates one-or-many files → one `manifestation=intent` proposal (oracle persisted as `REQUIRE:` rules); `tests/ingest-intent-cli.test.ts` pins the mock dry-run flow. Remaining to fill the column: a frontier run judged by the behaviour oracle (local 8 GB insufficient — budget-gated, like the §3.10 variance run).
- ✅ **Cross-arm synthesis CLI** — superseded by the shipped `onto bakeoff` (see Interop #4 below); `scripts/run-3a-bakeoff-synthesis.ts` stays as the dated Move 3α driver.
- 🟡 **Next fidelity lever = extraction/prompt completeness on large modules.** The 2026-05-29 loss-breakdown (`scripts/loss-report.ts`) showed Arm A's residual loss is **recall-bound, not precision-bound** — 22 large multi-export modules collapse into recoverable-but-truncated stubs (0/125 unrecoverable). Curbing over-emission is the *smaller* cost; the win is making regen emit the modules it currently drops. See `MATHEMATICAL_CLAIMS.md` §3.10.

### Plasticity follow-ups

- 🟡 **`onto branch lift <nodeId> --to <branch>`** — turn `describeCartesianLift` into proposals; depends on the BRANCH_MODEL.md Option-C confirmation.
- 🟡 **`onto query` extensions** — negation, exact edge profiles, multi-shape OR.
- 🟡 **`run prompt --as-proposal` for `edge_create`** — schema supports it; the model-driven candidate edge is missing.

### Interop / MCP (create-context-graph follow-ups, 2026-05-29)

Four ideas lifted from a comparison with `neo4j-labs/create-context-graph`,
ordered by value. #1 shipped; #2–#4 are designed and queued.

- ✅ **#1 — read-only MCP server (`onto mcp`).** Stdio MCP server exposing the intent graph + audit chain as 12 read-only tools (`list_nodes`/`get_node`/`inspect_node`/`query_nodes`/`assemble_context`/`graph_*`/`runs *`/`audit_log`) + `canon`/`overview` resources, so a third party can READ and judge whether the declared intent is benign and competent — no mutation tools. Thin wrappers over existing pure functions. The tangible first surface of Open-Prompt. Tests: `tests/mcp-server.test.ts` (10, incl. an in-memory-transport end-to-end + a zero-mutation-tools assertion).
- ✅ **#2 — connectors as ingest sources** (PRs/issues → intent). `extractIntentFromFile` was split into a generic `extractIntentFromText` core; `onto ingest --from-pr/--from-issue <n>` fetch via `gh` and run a prose-tuned extractor (`EXTRACTION_SYSTEM_PROMPT_PROSE`, `manifestation=intent`). Best-effort PR changed-files → code-node matching at capture; `--resolve-edges <appliedNodeId>` creates `documents` edge_create proposals post-apply (mirrors γ-5 → γ-6 — edges need the applied node id). Tests: `tests/ingest-intent-source.test.ts` (7, mock-driven; back-compat held — 65/65 existing ingest tests green). Deferred: `--from-commit` (commits were only ever the edge mechanism in the original idea).
- ✅ **#3 — seed intent-graph templates** (`onto init --template <name>`). Declarative JSON templates under `templates/*.json` (Zod-validated, referential + poset integrity checked), replayed through the kernel primitives (`createNode`/`createEdge`) so hashes/events/state are correct. Ships `hello-world` (mirrors the example), `rest-api`, `python-cli`; `--list-templates` to discover; adding one = dropping a JSON file. Schema/loader/replay in `src/runtime/templates/`. Tests: `tests/init-template.test.ts` (7).
- ✅ **#4 — fidelity gate in CI.** New `onto bakeoff <reports...>` command wraps `synthesizeBakeoff` with an H1 floor gate (`--min-jaccard`, default 0.1; gates the baseline arm by default, `--gate-all` for every arm). CI now runs the NUL guard (`check:nul`, was absent) **and** the bakeoff gate over the committed ε arm corpus after `build`. **Honest by construction:** the gate consumes ALREADY-RECORDED reports — it does not re-run the LLM (a live verify needs a real model, infeasible in CI), so it is regression protection over the scoring + recorded corpus, not a fresh measurement. `tests/fidelity-gate.test.ts` (5) pins the baseline floor + the grounding lift A−A0 ≥ 0.30 (records the Move 3α Δ=+0.355). The hand-rolled `scripts/run-3a-bakeoff-synthesis.ts` stays as the dated Move 3α driver; `onto bakeoff` is the general surface. **All four create-context-graph follow-ups (#1–#4) now shipped.**
- ⚪ **Deferred from #1 — `verify_intent_chain` MCP tool** (hash-chain provenance artifact→event→run→node). Blocked on schema work: the `compilation_run` event (`compile-node.ts`) carries `{nodeId,runId,cached,artifactRelativePath,bytes}` but lacks `nodeHash` + `artifactHash` for an end-to-end verifiable chain. First step of that future phase.

### Phase ζ + speculative

- 🔵 **Open-Prompt protocol:** `onto sign <branch>`, `onto verify-published`, `onto replay --against`. The read surface (`onto mcp`, above) ships; signing/replay are the remaining write/verify halves.
- 🟡 **Context-gluing regimes → sound sheaf** (staged plan, [`legend/CONTEXT_GLUING_REGIMES.md`](legend/CONTEXT_GLUING_REGIMES.md)). Provider-uniqueness is right for the static regime (SSoT) and a straitjacket for the dynamic/agentic one; the seam is a content/interface-signature discriminator. Bottom-up order: **O1 populate the discriminator** ✅ (signature threaded to `context.provides[].signature` via a side channel; `provides` stays `string[]`) → **O2 opt-in `identify-if-equal` gluing policy + §3.9 parity guard** ✅ (default-preserving; ledger §Axiom 5 records it as a sheaf on the equal-signature subcategory — **promoted T2→T1 2026-06-09** once the gluing axiom was pinned as a characterising law over an explicit cover, Path-to-T1 gate #2) → **O3 first dynamic-mutation consumer** ✅ v0 (`onto workflow run --as-proposal`: an accepted workflow's artefact → pending `node_create` proposal → `onto proposal apply`; the execution→intent loop closes over the existing proposal substrate). O2's first consumer landed (`onto run context --validate --identify-equal-providers`, opt-in). **O4 closes the loop end-to-end:** a workflow graph declares an output contract (`provides`+signature); `onto workflow run --as-proposal` measures the produced artefact against it (round-trip `F∘G≈id`, for code) and the proposed node is born with `provides`+signature — exactly what `identify-if-equal` reconciles. Resolved-type discriminator **wired** as opt-in `onto ingest --resolved-signatures` (fidelity refinement — broadens the T1 subcategory, not a law gap). Apply-time auto-gluing **landed** as opt-in `onto proposal apply --check-providers` (identify on equal signature, warn on drift; v0 never blocks). Node-update/edges proposals **landed** (2026-06-09, spec §3.6): new `node_update` mutation kind (artefact → prompt, contract → provides, `nodeHash` staleness pin) via `onto workflow run --as-proposal --update-node`, plus graph-declared `proposesEdges` → `edge_create` proposals (update mode; create mode defers them — the γ-6 analogue is future work). Run-record persistence **landed** (2026-06-09): every `--as-proposal` run persists a self-certifying `wfrun_*` record and all its proposals carry a non-null `workflow_run` source (graph/input hashes + per-step trace summary). Remaining horizon: `--strict` blocking mode. Terrain review + §3.9 silent-regression risk recorded in the doc.
- 🟡 **Wakeup Scanners** (Fase 1 = topological, no LLM; independent of other work). Spec: [`WAKEUP_SCANNERS.md`](WAKEUP_SCANNERS.md).
- 🟡 **Prompt Generators** — content-addressed, composable prompt templates; lifts `MATHEMATICAL_CLAIMS.md` Axiom 4 T3 → T2 in the generator domain. Spec: [`PROMPT_GENERATORS.md`](PROMPT_GENERATORS.md).
- 🔵 **Branch-merge proposals**, **Walker v2**, **cross-branch `node_update`** (needs BRANCH_MODEL.md decision), **web Visual DAG Studio**, **rigor improvements** from `MATHEMATICAL_CLAIMS.md`.

## Known limitations

- Semantic linker is read-only (`onto link <nodeId>`); proposal-mutation flow needs the two-step `onto propose link` → `onto proposal apply`.
- Only the long-running mutators (`compile run` / `run-batch` / `verify-homeomorphism`) are lock-protected; quick single-shot mutations rely on per-write crash-atomicity (worst case last-writer-wins, never corruption).
- BRANCH_MODEL.md Option-C (lazy materialisation) is recommended but not user-confirmed; gates cross-branch `node_update` propagation.
- Walker v2 (proposal review pane, plane/time/branch/manifestation rotation) is unshipped.
- Several doc claims are useful intuition but not pinned by tests; see [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) for the tiered ledger.

## Bootstrap history

Detail per PR is in [`RELEASE_NOTES.md`](RELEASE_NOTES.md); the table below is a quick map.

| Bootstrap | Theme |
|---|---|
| 0.1 | Network kernel — `onto init` / `validate` / `inspect`, canon node, `events.jsonl`, `state.json`, hashing. |
| 0.2 | Node editor — `onto node create` (typed level + kind, Zod-validated, hashed). |
| 0.3 | Edges + graph queries — typed multigraph (18 edge types); `onto node link`. |
| 0.4 | Walker v0 + poset + run persistence. |
| 0.5 | Proposal system (`node_create` + `edge_create` mutations, full lifecycle). |
| 0.6 | Map + slice + Walker v1 (edge-aware semantic linker, graph query CLI, walker edit / `:propose` / `:run` / `:plan`). |
| 0.7 | PromptAST — axiom 4 made structural (`parsePromptAST`). |
| 0.8 | Hello-World compiler — `onto compile run`, manifestation-aware artifacts, full audit chain. |
| 0.9 | Categorical extensions (Yoneda query, effect monad, branch fibration, topos predicate algebra) + compiler hardening + Walker hardening. |
| post-0.9 | Plasticity layer (gaps §1–§6 pre-Legend), hardening sweep §3.1–§3.15, validator-on-topos port, branch-aware compile, open-world validator, semantic-linker CLI. |
| Legend β | Multi-file compile (`run-batch`, `--target`), `node.literal`, path fibration, two-phase commit on writeArtifact. |
| Legend γ | `onto ingest <file/dir>`, Anthropic provider, TS/Python static-edge inference, walker AI indicator, rich proposal payload. |
| Legend γ-7 + δ | MANDATORY EXPORTS block, `onto verify-homeomorphism` (dual-distance LoC + Jaccard, five-label verdict), `onto node inspect` (Inspector / Lupa). |
| Legend ε | Five self-ingest runs (β / β′ / γ / δ / δ′) on the Ontology core perimeter; Move 1 / 1b / 1c; Move 3α tooling burst (bakeoff-synthesis, perimeterHash audit, `--reps` median); Move 3α multi-arm bake-off (Arm A 2026-05-23, Arms B + C-local + A0 control + cross-arm synthesis 2026-05-24); `node_0094` silent-exclusion fix. Closed 2026-05-26 with §3.10 adjoint T4 → T2. Full triplet history: [`CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md). |
| Legend ζ | Workflow runtime v0 — standalone workflow schema, graph loader with structural + predicate validation + static branch-coverage lint (spec §3.2), predicate DSL (`consecutive` / `since_last` / `step_count`), typed-node executor, behaviour-axis checker (cartography matrix 1/5 → 2/5 columns), artefact-slot dataflow for verify-refine (§4.1), spec↔example reject-predicate reconciliation (§4.3), lenient with-severity schema (§4.2 — severity optional / issues defaulted, ends the silent pass→fail/major flip); §3.2 branch-coverage lint hardened to enumerate bare `pass`/`fail` under with-severity (`8ec0243`, pinned by `workflow-runtime.test.ts`). |

---

*Last refresh: **2026-06-09** (state as of last commit, 2026-06-09 — O2/O4 gluing gates, `onto ingest --resolved-signatures`, Axiom 5 gluing promoted T2 → T1). The 06-09 promotion is narrated as T1 13 → 14, but a same-day recount fixed a clerical off-by-one in the running headers — honest current T1 count is **13** (see `MATHEMATICAL_CLAIMS.md` §5). Phase ζ active — runtime v0 shipped; first real-LLM verify-refine attempt (2026-05-29) surfaced the undici-timeout fix (`3db9aa4`) but not yet a clean pass (gated on a frontier provider). This file is the single source of truth for open work; when a follow-up ships, promote it out of the open list into the bootstrap-history table or `RELEASE_NOTES.md`.*
