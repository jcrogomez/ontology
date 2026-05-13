# Ontology

> **A typed, temporal, multidimensional graph that compiles intentions into running programs.**
> Models may speak. Only explicit graph commands may mutate the network.
> Code is the compiled shadow of a valid semantic network.

## What this is

Ontology is a terminal-first system for **versioning intent**, not just code. You connect intentions as typed nodes and edges in `.ontology/` — a kernel-verified intention network — and a compiler walks that network in topological order to produce executable artifacts.

In one line of math, the system implements a structure-preserving functor

$$F\colon \text{Intent} \longrightarrow \text{Code}$$

with a semantic gate ($\text{validateIntent} \to \Omega$) that refuses to emit an artifact whose declared contract is violated. The inverse direction — **lifting existing code back into intent** — is the central work of [Project Legend](docs/PROJECT_LEGEND.md): the operational adjoint $G$ of $F$, with the round-trip $F \circ G \approx \mathrm{id}$ measured empirically.

The point: a Ontology session generates code you can re-derive from a network you can read. The intent is the durable artifact; the code is the compiled shadow. Every artifact is traceable to the proposal that birthed it, the model run that drafted it, the assembled context the model saw, and the hashes of the nodes and edges that authorised the compilation.

## Why this matters

Two pains every team using LLM-assisted development feels today:

1. **Bandwidth gap.** A session produces more code than a human can review with care.
2. **Adoption wall.** The intent-first workflow works on greenfield projects; brownfield projects have no path in.

Ontology addresses both. The forward direction (`onto compile run`) makes the intent the source of truth, so a session's diff is a small intent change, not a sprawl of generated files. Project Legend addresses the second: `onto ingest <path>` lifts existing source into the intent layer so the workflow applies to any codebase, not only new ones.

Longer term, the **Open-Prompt protocol** (Legend Phase ζ) turns the signed intent + audit chain into a trust-transparency layer between fully open-source and proprietary self-attestation: an organisation publishes its intent and lets third parties verify that the running code respects that intent, without exposing the implementation.

## See it in 60 seconds

```bash
git clone https://github.com/jcrogomez/ontology.git
cd ontology
npm install
npm run example:hello-world
```

That command builds a five-node intention chain, compiles it through the topological plan, writes a working Python script to `.ontology/artifacts/generated/`, and (if `python3` is on your PATH) runs it. You should see:

```
Step 7: artifact
  Path:     .../examples/hello-world/.ontology/artifacts/generated/node_0005.py
  Contents:
    print("hello world")

Step 8: run the artifact
  hello world

✓ Ontology compiled an intention into a working program.
```

Read [`examples/hello-world/README.md`](examples/hello-world/README.md) for the walkthrough.

## What you actually get

| Verb | What it means |
| --- | --- |
| `onto init` | Create a fresh `.ontology/` kernel (state, events log, edges log, canon node). |
| `onto node create` | Add a typed semantic node. Supports `--manifestation`, `--language`, `--requires`/`--provides`/`--forbids`, `--rules`, `--literal` for compile-ready leaves. |
| `onto node update / remove` | Edit a node in place or delete it (refuses if any edge references the node). The plasticity primitives. |
| `onto node link` | Connect two nodes with a typed edge. Refinement-family edges enforce the abstraction poset. |
| `onto edge remove / update` | Symmetric primitives for edge mutation. |
| `onto node list / show` | Inspect the network. |
| `onto context assemble` | Compute a node's local context (parent path + edge neighbors). |
| `onto run prompt / run context` | Dispatch a prompt to a model. Persist with `--persist`. Wrap the run as a proposal with `--as-proposal`. |
| `onto runs list / show / verify` | Audit persisted run records. Every byte is content-addressed. |
| `onto graph neighbors / path / subgraph` | Read-only traversal queries over the typed graph. |
| **`onto graph infer-edges <dir>`** | **Project Legend γ-4: parse TypeScript imports/exports and report the static `depends_on` / `uses_token` edge graph. With `--create-proposals` (γ-6), emits one `edge_create` proposal per inferred edge by matching `outputs.files[0]` on each endpoint. Pure static analysis — no LLM.** |
| **`onto link <nodeId> --candidate <text>`** | Run the semantic linker: gluing matrix + intent validation + edge proposal suggestions for missing requirements. Read-only. |
| **`onto ingest <path>`** | **Project Legend γ-1/γ-5: lift existing source into the intent layer. Accepts a single file (one node\_create proposal) or a directory (one per source file, plus a γ-4 static-edge inference report). Provider defaults to Anthropic; falls back to Ollama or mock. `--include py,ts,tsx` for non-TS codebases. `--dry-run` previews extraction without committing.** |
| `onto propose node / link` | Stage a typed candidate mutation without touching the graph. |
| `onto proposal list / show / apply / reject` | Lifecycle the candidate. `apply` re-validates `parentHash`/endpoint hashes and stales on divergence. |
| **`onto compile plan <id>`** | Preview the topological compile order rooted at a node. Read-only. |
| **`onto compile run <id>`** | Compile the focal and its dependency closure. `--target <path>` writes to a user-pinned source path (gated behind `--force`); `--branch <name>` restricts to one Grothendieck fiber. |
| **`onto compile run-batch [--all-artifacts \| --nodes <ids>]`** | Compile many focals in one invocation. Shared upstream walks reuse the per-run cache. The prerequisite for Legend's verify-homeomorphism. |
| **`onto query`** | Yoneda search by Hom-profile. Find every node whose edges + context-contract + coordinates match a query shape. |
| `onto walk <id>` | The Walker: an interactive focal-cell terminal interface. Edit drafts, propose, run models, preview plans, compile — all from the TUI. **Shows which AI service is active (Anthropic / Ollama local / Ollama cloud / none → mock fallback) at the top of the focal cell.** |
| `onto branch list / fiber` | Grothendieck-fiber views of the typed graph (read-only). |
| `onto validate`, `onto inspect`, `onto events tail`, `onto model doctor`, `onto doctor` | Observability. `model doctor` reports per-provider availability and surfaces whether `ANTHROPIC_API_KEY` / `OLLAMA_HOST` are set. |

The full surface is in [docs/CLI_COMMANDS.md](docs/CLI_COMMANDS.md).

## The canonical loop, end-to-end

```
intention (graph)
   ↓
context (assembleContext, edge-aware)
   ↓
candidate (model run, persisted, hashed)
   ↓
deterministic validation (intent validator + presheaf gluing)
   ↓
proposal (typed candidate mutation, parentHash-pinned)
   ↓
explicit apply (user approval, fail-loud on stale dependencies)
   ↓
mutation (node_created / edge_created event)
   ↓
compilation (topological plan run, model dispatch, artifact written)
   ↓
file on disk (auditable: artifact → event → run → prompt hash → node)
```

Every step is recorded in the append-only `events.jsonl`. Every artifact ties back to a `compilation_run` event. The chain is auditable in either direction (`onto runs verify`, `onto events tail`, `onto runs show`). Replay-as-rebuild — reconstructing `state.json` from the events log — is roadmap, not shipped; today state is loaded from `state.json` directly. See [`MATHEMATICAL_CLAIMS.md`](docs/MATHEMATICAL_CLAIMS.md) §4.4 for the rigor classification.

## Why this exists

Most AI tooling does this:

```
prompt + files + model → output
```

Ontology does this:

```
graph state + typed context + model → candidate
candidate + deterministic validators → accepted | rejected
accepted candidate + explicit graph command → mutation
network of mutations + topological plan + compiler → artifact
```

That separation buys four things:

1. **Memory.** The graph remembers every decision, every edge, every event, in an append-only log.
2. **Trust.** A model can suggest. A user must approve. The graph is the source of truth.
3. **Composition.** When a project grows, the topology of the graph determines what gets compiled, in what order, with what dependencies.
4. **Provenance.** Every byte of every artifact traces back through the events log to the canon. Nothing slips through.

## Where to go next

If you're a **first-time visitor**, start with the guided tour:

- [**Getting Started**](docs/GETTING_STARTED.md) — a hands-on walk from `init` to `compile` in 5 minutes.
- [**Hello World example**](examples/hello-world/README.md) — the canonical demonstration.

If you want to understand **the design**:

- [**The Canon**](docs/ONTOLOGY_CANON.md) — the foundational definition.
- [**The Mathematical Model**](docs/MATHEMATICAL_MODEL.md) — the seven axioms.
- [**The Categorical Vision**](docs/CATEGORICAL_VISION.md) — the nine-concept map (categories, functors, Yoneda, monads, fibrations, topos, …) onto concrete modules.
- [**Mathematical Claims — Audit & Map**](docs/MATHEMATICAL_CLAIMS.md) — every math claim classified into strict / operational / analogy / aspirational, with file citations. Read this alongside the two above to know how literally each claim holds.
- [**The Architecture**](docs/ARCHITECTURE.md) — how Kernel, Observability, LLM Runtime, Context Assembler, Proposal System, and Compiler relate.
- [**The Compiler**](docs/COMPILER.md) — how `onto compile` walks the plan and produces artifacts.
- [**The Walker**](docs/WALKER_INTERFACE.md) — the interactive TUI design.

For the four post-axiom categorical extensions:

- [**Yoneda Query**](docs/QUERY_REPRESENTABLE.md) — `onto query` search by Hom-profile.
- [**Effect Monad**](docs/EFFECT_MONAD.md) — `Result` / `Effect` / `EffectWithLog` with proven monad laws.
- [**Branch Fibration**](docs/BRANCH_FIBRATION.md) — branches as Grothendieck fibers over the event log.
- [**Rules as Topos**](docs/RULES_TOPOS.md) — three-valued Ω predicate algebra over `requires` / `provides` / `forbids`.

For **Project Legend** — the inverse direction of the compile functor, now partially operational:

- [**Project Legend**](docs/PROJECT_LEGEND.md) — design doc + phase plan. `onto ingest <path>` lifts existing source into the intent layer; γ-6 closes the multi-file cycle by translating static imports into `edge_create` proposals; δ-1 `onto node inspect` produces a cached human-readable summary per node; δ-2 `onto verify-homeomorphism` measures the round-trip with dual distances (LoC + structural Jaccard) and a five-label verdict. Phase ε (self-ingestion on the Ontology repo for the publishable adjunction claim) is next. Includes the Open-Prompt protocol (signed intent + audit-chain replay as a trust-transparency layer between open-source and proprietary self-attestation).
- [**γ-2 hash.ts calibration**](docs/legend/calibrations/HASH_TS_2026-05-12.md) — first empirical data point. 5 / 5 functions ε-equivalent under F ∘ G with Claude Opus 4.7.
- [**γ-7 Vibe-Reasoning calibration**](docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md) — second empirical data point on an external 24-file Python corpus. The γ-7 prompt invariants (MANDATORY EXPORTS block + comprehensive `provides` capture) moved ε-equivalent 36% → 65% and fully eliminated `divergent_both` (4 → 0) across an apples-to-apples re-ingest.
- [**Vibe-Reasoning calibration procedure**](docs/legend/calibrations/VIBE_REASONING_PROCEDURE.md) — runbook for testing the full ingest cycle on an external Python codebase. Useful template for ingesting any non-TS codebase.
- [**Branch Model**](docs/BRANCH_MODEL.md) — design decision (Option C: lazy materialisation on touch) that gates Bootstrap 0.10 / cross-branch `node_update`.

If you want to **contribute or extend**:

- [**Roadmap**](docs/ROADMAP.md) — what is implemented, what is planned, in which bootstrap; refreshed after every commit that ships a new surface.
- [**RFCs**](docs) — `RUN_PERSISTENCE.md`, `PROPOSAL_SYSTEM.md`, `WALKER_INTERFACE.md`, `COMPILER.md`.
- [**Release Notes**](docs/RELEASE_NOTES.md) — the running changelog.
- [**LEGEND (0.4.0 release note)**](docs/LEGEND.md) — the public-facing release write-up for the inverse-functor cycle: what shipped γ-0 through δ-2, the two empirical data points, what to read next.
- [**Open-Prompt protocol spec**](docs/OPEN_PROMPT.md) — Phase ζ design: signed intent + audit-chain replay as a third trust posture between open-source and self-attestation. Spec-only in 0.4.0; v0 implementation lands in 0.5.0.
- [**Milestone reviews**](docs/reviews/) — daily snapshots that pair PR progress with a concrete bug list.

## Status

**Project Legend Phases β + γ + γ-7 + δ shipped — auto-digest cycle + Inspector + verification all operational.** Version `0.4.0-rc.1` (release candidate; final 0.4.0 promotes when Phase ε self-ingestion ships). The seven axioms of the canon run concrete code, the plasticity layer is in place, the forward + inverse functors of the compile adjunction are both implemented, the round-trip is measured on two external corpora, and dispatch routing is cross-provider per-task (LlmTask → tier → model resolved automatically):

- **Forward (F)** — `onto compile run` walks the topological plan and dispatches every node. `--target <path>` writes to user-pinned source paths (β-1, gated behind `--force` with a two-phase commit so a failed validator never clobbers the user's file); `node.literal` pins irreducible-specificity content verbatim (β-2); `compute­FiberBy(input, projection)` generalises the branch fibration to arbitrary projections, with `pathProjection` as the spatial analogue Legend needs (β-3).
- **Inverse (G)** — `onto ingest <file|dir>` extracts structured intent via a frontier LLM (γ-0 Anthropic provider + prompt caching; γ-1 single-file; γ-5 multi-file with `--include` for non-TS codebases; γ-3 rich proposal payload so apply produces complete nodes in one step).
- **Cross-file edges** — `onto graph infer-edges <dir>` parses TypeScript imports and reports `depends_on` / `uses_token` edges without an LLM (γ-4); `--create-proposals` resolves them to `edge_create` proposals after apply (γ-6), closing the multi-file cycle.
- **Inspector / Lupa (δ-1)** — `onto node inspect <id>` produces a 3–5 sentence developer-facing summary per node, cached on the node as `translator: { text, model, provider, generatedAt, sourceHash }`. One LLM call per node lifetime; automatic invalidation when prompt / rules / contract / literal change.
- **Verification framework (δ-2)** — `onto verify-homeomorphism --all-artifacts` compiles back every code-manifestation node and classifies each with **two distances** (LoC delta + structural Jaccard over top-level declarations) folded into a five-label verdict. `--report <path.md>` writes a markdown summary; `--json` exposes the same data programmatically with per-node usage/cost.
- **Two empirical data points** — γ-2 (`hash.ts` single-file, 5/5 ε-equivalent at $0.08) and γ-7 (Vibe-Reasoning external corpus, +29pp ε-equivalent and `divergent_both` eliminated after the MANDATORY EXPORTS prompt invariant). Reports: [`HASH_TS_2026-05-12.md`](docs/legend/calibrations/HASH_TS_2026-05-12.md), [`VIBE_REASONING_GAMMA_7_2026-05-12.md`](docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md).
- **Cross-provider per-task routing** — `LlmTask × provider → preferred model` resolved automatically via `DefaultAnthropicRouting` + `DefaultOllamaRouting`. `--provider anthropic` (no `--model`) routes `inspect` → Haiku 4.5, `semantic_parse` → Sonnet 4.6, `code_sketch` → Opus 4.7. Mixed plans (some nodes on Ollama, some on Anthropic, some pinned via `node.literal`) work in the same compile run.
- **Walker AI indicator** — the focal-cell TUI shows which AI service is configured (`anthropic` / `ollama (local)` / `ollama (cloud)` / `none — mock fallback`) at the top of the panel, so a user knows at a glance which provider `:run` and `:compile` will route through.

The remaining Legend work is ε (self-ingestion of the Ontology repo for the publishable adjunction claim, gated on API credit) and ζ (release + Open-Prompt seeds: sign, verify-published, replay). Branch-aware compile (`onto compile run --branch <name>`) and the branch fibration CLI (`onto branch list / fiber`) cover the temporal-fiber surface; the spatial path fibration helper is ready for ingest's per-directory token vocabulary normalisation.

| Axiom | Implementation |
| --- | --- |
| 1. Typed directed multigraph | `node link` with 18 edge types, multigraph allowed |
| 2. Temporal log | append-only `events.jsonl` with hash chain |
| 3. Abstraction poset | enforced at `node link` and `validate` for the refinement family |
| 4. Prompts as rewrite rules | `parsePromptAST` lifts `@requires:` / `@provides:` / `@expand:` markers into a structured `PromptAST`; `compileNode` consumes the parsed body |
| 5. Presheaf context | `assembleContext`, `glueFragments`, `validateIntent` (built on the topos predicate algebra), edge-aware `semanticLink` (CLI: `onto link <nodeId>`) |
| 6. Compiler functor | `onto compile run` walks the topological plan; refinement-parent context threading, per-node `model.ref` routing through the registry, language parse-check on every artifact, optional `--runtime-check` execution, and a top-level `EffectWithLog` retire the legacy try/catch tower |
| 7. Code as compiled shadow | every artifact under `.ontology/artifacts/generated/` ties back through events to nodes; code-fence stripping + parse validation enforce structural fidelity |

Compiler-plan hardening (Bootstrap 0.9): `computeCompilePlan` now rejects `contradicts` edges as plan errors and halts BFS on `supersedes` with a `superseded` warning, so contradictions surface as failures instead of silent compiles.

The four additive categorical extensions (`CATEGORICAL_VISION.md`) ship as runtime libraries with first-line surfaces:

| Extension | Library | Surface |
| --- | --- | --- |
| Yoneda query | `src/runtime/query/representable.ts` | `onto query` CLI, walker `:query` |
| Effect monad | `src/runtime/effects/io.ts` | concrete use inside `compileNode` and `runFromWalker` (both post-0.9) |
| Branch fibration | `src/runtime/fibration/branch-fiber.ts` | `onto branch list` / `onto branch fiber <name>` CLI, walker `:branch list`, and `onto compile run --branch <name>` for fiber-scoped compiles |
| Topos predicate algebra | `src/runtime/topos/predicate.ts` | `intent-validator.ts` ported onto the algebra; `validateIntent({openWorld: true})` exposes the three-valued verdict end-to-end through `semanticLink` |

Ontology is alpha-quality. The append-only log is single-writer (CLI single-shot); concurrent writes from multiple processes are not yet protected, and `state.json` writes are not yet atomic on crash. Everything else is meant to fail loudly and exit `1` rather than silently corrupt.
