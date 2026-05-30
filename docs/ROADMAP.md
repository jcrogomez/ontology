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
| **ζ** | Workflow runtime — typed-node state machine, predicate DSL, artefact-slot dataflow, behaviour-axis checker | 🟡 active — runtime v0 + §4.1 dataflow fix landed; never run end-to-end against a real LLM |

## Open follow-ups

### Highest-value validation gaps

These close the largest distance between what's *built* and what's
*demonstrated*:

- 🔴 **One real-LLM verify-refine run.** The ζ workflow runtime is validated only in dry-run (canned pass) and scripted-mock tests; it has never refined a real solution end-to-end. The §4.1 dataflow fix unblocks this — run [`examples/workflow-imo-verify-refine`](../examples/workflow-imo-verify-refine) against Anthropic and commit the trace.
- 🟡 **Test suite runs on Node 20+; pre-existing failures fixed; slowness root-caused (NOT a hang).** Default Node is 18 (vitest's rolldown needs ≥ 20.12 for `node:util.styleText`); Homebrew `node@23` runs it. Four pre-existing failures (unrelated to current work) were fixed in `35e4078`: two real dispatcher bugs + one stale model-capabilities test. **Bisection result (2026-05-28):** the suite is *slow, not hung* — it completes (core ~16 min). The cost is **subprocess-spawn overhead**: 12 CLI/integration test files drive the CLI through `tests/helpers/run-cli.ts`, which spawns `npx tsx src/cli.ts` per call, re-paying `npx` resolution + a full `tsx` transpile of the CLI graph (~1–4s each). Worst offenders: `ingest-cli` 64s, `ingest-static-classifier-enabled` 36s, `…-integration` 28s, `ingest-cost-estimate` 17s, `ingest-ensemble-integration` 16s; pure in-process groups are sub-second (legend 1.2s, hierarchizer 0.15s). **Fixed (2026-05-29):** vitest `globalSetup` builds the CLI once and all CLI tests spawn the compiled `node dist/cli.js` (no `npx`, no per-call transpile) — `be31168` (shared `run-cli.ts` helper, 47 files), `2b1f2ba` (6 inline spawn sites). Non-CLI core dropped **994s → 379s (2.6×)**. The two original core failures are resolved: the dispatcher/model-capabilities bugs (`35e4078`) and `ollama-adapter`'s over-narrow soft-fail assertion (`210c447`, now accepts `model 'X' not found` as a valid soft-fail). **Non-CLI core: 116/116 files green.** The live-Ollama reliability item is **fixed** (`0b209a7`): the `--provider ollama` run-context tests now target an unreachable host (`127.0.0.1:9999`) so they fail fast into their soft-fail branch instead of doing a real generation (was ~45s timeouts; now `run-context-cli` 23/23 in ~15s). `ingest-cli`/`model-cli` Ollama sites use `--cost-estimate`/`model list` (no generation) and were already fast. Workflow/verify suites green (workflow 56/56, verify-determinism 5/5, dispatcher 22/22, routing 44/44).

### Phase ζ — workflow runtime

- 🟡 **Verdict-map determinism thread** (`MATHEMATICAL_CLAIMS.md` §3.10 T2 → T1). The full T1 gate (real-LLM determinism at temp 0) is empirically unachievable; T2 evidence tests pin the deterministic *fold*. Staying T2.
- 🔵 **Behaviour checker module eviction** (`behavior-checker.ts`): the per-call `?ts=` cache-bust leaks module instances, but it is **load-bearing** — `behavior-checker.test.ts` pins that re-imports get fresh module state (isolation between reps). Content-addressing the cache key trades that isolation away, so a real fix needs worker/process isolation (deferred to v1). Fine at ~20 nodes until then.

### Cartography / ε tail (optional reinforcement)

- 🔵 **Arm C-cloud — `devstral-small-2:24b`** on rented GPU (~$5–10). ε closed without it; this is a reinforcement of H3, not a blocker. Local 8 GB Mac is infeasible.
- 🟡 **Contract / intent columns** — the matrix fills 2 of 5; these two remain explicit no-data.
- 🟡 **`onto legend bakeoff-synthesis` CLI.** Cross-arm synthesis still runs through a hand-rolled driver (`scripts/run-3a-bakeoff-synthesis.ts`); the verb removes the last manual surface.

### Plasticity follow-ups

- 🟡 **Advisory lock under `.ontology/.lock`** — concurrent-writer protection (atomic writes are done).
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
- 🟡 **Wakeup Scanners** (Fase 1 = topological, no LLM; independent of other work). Spec: [`WAKEUP_SCANNERS.md`](WAKEUP_SCANNERS.md).
- 🟡 **Prompt Generators** — content-addressed, composable prompt templates; lifts `MATHEMATICAL_CLAIMS.md` Axiom 4 T3 → T2 in the generator domain. Spec: [`PROMPT_GENERATORS.md`](PROMPT_GENERATORS.md).
- 🔵 **Branch-merge proposals**, **Walker v2**, **cross-branch `node_update`** (needs BRANCH_MODEL.md decision), **web Visual DAG Studio**, **rigor improvements** from `MATHEMATICAL_CLAIMS.md`.

## Known limitations

- Semantic linker is read-only (`onto link <nodeId>`); proposal-mutation flow needs the two-step `onto propose link` → `onto proposal apply`.
- Concurrent multi-process writes are not lock-protected (writes are crash-atomic, but cooperating CLI invocations are not).
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
| Legend ζ | Workflow runtime v0 — standalone workflow schema, graph loader with structural + predicate validation + static branch-coverage lint (spec §3.2), predicate DSL (`consecutive` / `since_last` / `step_count`), typed-node executor, behaviour-axis checker (cartography matrix 1/5 → 2/5 columns), artefact-slot dataflow for verify-refine (§4.1), spec↔example reject-predicate reconciliation (§4.3), lenient with-severity schema (§4.2 — severity optional / issues defaulted, ends the silent pass→fail/major flip). |

---

*Last refresh: **2026-05-28**. Phase ε closed (4-arm + 2-column substate, §3.10 T4 → T2); Phase ζ active — workflow runtime v0 shipped, §4.1 dataflow fixed, but not yet run against a real LLM. This file is the single source of truth for open work; when a follow-up ships, promote it out of the open list into the bootstrap-history table or `RELEASE_NOTES.md`.*
