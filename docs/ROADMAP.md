# Ontology Roadmap

## Current state

Project Legend **Phases α–δ shipped**; **Phase ε (self-ingestion of the
Ontology repo) is mid-flight** with concrete data. Five self-ingest
runs (β / β′ / γ / δ / δ′) landed iterative interventions on the core
perimeter (~125 files), and Move 3α — the multi-arm bake-off testing
AST grounding at compile-back — is producing the publishable
cartography matrix. The platform underneath (network kernel, proposal
system, semantic linker, compiler with intent gate + `--runtime-check`,
four categorical extensions, plasticity layer, atomic writes,
hardening sweep §3.1–§3.15) is closed.

**Where to look:**
- Run history, hypothesis triplets, and daily milestone reviews: [`legend/calibrations/CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md).
- Per-PR / per-commit detail: [`RELEASE_NOTES.md`](RELEASE_NOTES.md).
- Move 3α current TODO + resume point: [`legend/calibrations/SELF_INGEST_EPSILON_3A_TODO.md`](legend/calibrations/SELF_INGEST_EPSILON_3A_TODO.md).
- Design background: [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md), [`POSITIONING.md`](POSITIONING.md), [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md).

## Phase plan (Project Legend)

| Phase | Content | Status |
|---|---|---|
| α | Pre-foundation gaps §1–§6 (plasticity layer) | ✅ shipped |
| β | Multi-file compile + `--target`, `node.literal`, path fibration | ✅ shipped |
| γ | `onto ingest <file/dir>`, Anthropic provider, static-edge inference, rich proposal payload | ✅ shipped |
| δ | Inspector / translator (`onto node inspect`) + verification (`onto verify-homeomorphism`) | ✅ shipped |
| **ε baseline** | β / β′ / γ / δ / δ′ self-ingest runs; Move 1 / 1b / 1c (export-vocab + vocab-domain + safety net); EXTRACTION_SYSTEM_PROMPT rewrite | ✅ shipped |
| **ε Move 3α** | AST grounding at compile-back; multi-arm bake-off (qwen / granite / starcoder local + devstral cloud deferred) | 🟡 active — Arm A confirms H1 on 6/6; Arm B HW-vetoed; Arm C-local contract-violation; Arm A0 control landed — grounding contributes Δ = +0.355 mean Jaccard over a strong qwen-7b + safety-net baseline (0.226 → 0.581), §3.1 circularity worry resolved as "real lift, not artefact" |
| **ε close** | Land Arm A0 + cloud Arm C (~$5–10 GPU rental), recalibrate hypotheses, upgrade `MATHEMATICAL_CLAIMS.md` §3.10 adjoint T4 → T2 | 🟡 pending Arm A0 + cloud Arm C |
| ζ | Release + Open-Prompt seeds (sign, verify-published, replay) | pending |

## Open follow-ups

### Phase ε remaining

- ✅ **Arm A0 control** landed 2026-05-24 (mean Jaccard 0.226; grounding Δ = +0.355). §3.1 circularity worry resolved as "real lift, not artefact". Promoted to bootstrap history.
- 🟡 **Arm C-cloud — `devstral-small-2:24b`** on rented GPU (A10/L4 class, ~$5–10 for the full perimeter). The clean H3 test; local 8 GB Mac is infeasible.
- 🟡 **Behaviour-axis checker.** Cartography matrix currently fills only `structural` (+ `cost`); `contract` / `behaviour` / `intent` are explicit no-data. Behaviour is the next-highest-value checker because it is **orthogonal to AST grounding** and so immune to §3.1 circularity.
- 🟡 **`onto legend bakeoff-synthesis` CLI.** Library + renderer ship; cross-arm synthesis still runs through a hand-rolled driver (`scripts/run-3a-bakeoff-synthesis.ts`). Verb removes the last manual cherry-picking surface.
- 🟡 **`MATHEMATICAL_CLAIMS.md` §3.10 adjoint T4 → T2.** Gated on a clean ε close.

### Plasticity follow-ups

- 🟡 **Advisory lock under `.ontology/.lock`** — concurrent-writer protection (atomic writes are done).
- 🟡 **`onto branch lift <nodeId> --to <branch>`** — turn `describeCartesianLift` into proposals; depends on the BRANCH_MODEL.md Option-C confirmation.
- 🟡 **`onto query` extensions** — negation, exact edge profiles, multi-shape OR.
- 🟡 **`run prompt --as-proposal` for `edge_create`** — schema supports it; the model-driven candidate edge is missing.

### Phase ζ + speculative

- 🔵 **Open-Prompt protocol:** `onto sign <branch>`, `onto verify-published`, `onto replay --against`.
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
| Legend ε | Five self-ingest runs (β / β′ / γ / δ / δ′) on the Ontology core perimeter; Move 1 / 1b / 1c; Move 3α tooling burst (bakeoff-synthesis, perimeterHash audit, `--reps` median); Move 3α multi-arm bake-off (Arm A landed 2026-05-23, Arms B + C-local landed 2026-05-24 alongside cross-arm synthesis); Move 1 hygiene + manifestation guard closes the `node_0094` silent-exclusion. Full triplet history: [`CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md). |

---

*Last refresh: **2026-05-24** (late). Phase ε is mid-flight; Arm A0 control landed (grounding Δ = +0.355 mean Jaccard, circularity worry resolved); cloud Arm C is the remaining gate for a clean ε close and the §3.10 adjoint T4 → T2 upgrade. The roadmap is kept in sync with `main` — when a follow-up ships, promote it out of the open list and into the bootstrap-history table or `RELEASE_NOTES.md`.*
