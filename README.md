# Ontology

> **A typed, temporal, multidimensional graph that compiles intentions into running programs.**
> Models may speak. Only explicit graph commands may mutate the network.
> Code is the compiled shadow of a valid semantic network.

Ontology is a terminal-first system for building **a network of ideas that does not lose its mind** when an AI gets involved. Instead of letting prompts and outputs sprawl across chats, files, and notes, you connect intentions as typed nodes and edges in `.ontology/` — a kernel-verified intention network — and a compiler walks that network in topological order to produce executable artifacts. Every artifact is traceable to the proposal that birthed it, the model run that drafted it, the assembled context the model saw, and the hashes of the nodes and edges that authorized the compilation.

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
| `onto node create` | Add a typed semantic node. Supports `--manifestation` and `--language` for compile-ready leaves. |
| `onto node link` | Connect two nodes with a typed edge. Refinement-family edges enforce the abstraction poset. |
| `onto node list / show` | Inspect the network. |
| `onto context assemble` | Compute a node's local context (parent path + edge neighbors). |
| `onto run prompt / run context` | Dispatch a prompt to a model. Persist with `--persist`. Wrap the run as a proposal with `--as-proposal`. |
| `onto runs list / show / verify` | Audit persisted run records. Every byte is content-addressed. |
| `onto graph neighbors / path / subgraph` | Read-only traversal queries over the typed graph. |
| **`onto link <nodeId> --candidate <text>`** | **Run the semantic linker: gluing matrix + intent validation + edge proposal suggestions for missing requirements. Read-only.** |
| `onto propose node / link` | Stage a typed candidate mutation without touching the graph. |
| `onto proposal list / show / apply / reject` | Lifecycle the candidate. `apply` re-validates `parentHash`/endpoint hashes and stales on divergence. |
| **`onto compile plan <id>`** | **Preview the topological compile order rooted at a node. Read-only.** |
| **`onto compile run <id>`** | **Compile the focal and its dependency closure. Writes artifacts. Emits `compilation_run` events.** |
| **`onto query`** | **Yoneda search by Hom-profile. Find every node whose edges + context-contract + coordinates match a query shape.** |
| `onto walk <id>` | The Walker: an interactive focal-cell terminal interface. Edit drafts, propose, run models, preview plans, compile — all from the TUI. |
| `onto validate`, `onto inspect`, `onto events tail`, `onto model doctor`, `onto doctor` | Observability. |

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

Every step is recorded in the append-only `events.jsonl`. Every artifact ties back to a `compilation_run` event. The chain is replayable in either direction.

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

If you want to **contribute or extend**:

- [**Roadmap**](docs/ROADMAP.md) — what is implemented, what is planned, in which bootstrap.
- [**RFCs**](docs) — `RUN_PERSISTENCE.md`, `PROPOSAL_SYSTEM.md`, `WALKER_INTERFACE.md`, `COMPILER.md`.
- [**Release Notes**](docs/RELEASE_NOTES.md) — the running changelog.

## Status

**Bootstrap 0.9 — Categorical extensions + compiler hardening.** Version `0.3.0-alpha.0`. The seven axioms of the mathematical canon are running concrete code, including the previously textual axiom 4:

| Axiom | Implementation |
| --- | --- |
| 1. Typed directed multigraph | `node link` with 18 edge types, multigraph allowed |
| 2. Temporal log | append-only `events.jsonl` with hash chain |
| 3. Abstraction poset | enforced at `node link` and `validate` for the refinement family |
| 4. Prompts as rewrite rules | `parsePromptAST` lifts `@requires:` / `@provides:` / `@expand:` markers into a structured `PromptAST`; `compileNode` consumes the parsed body |
| 5. Presheaf context | `assembleContext`, `glueFragments`, `validateIntent`, edge-aware `semanticLink` |
| 6. Compiler functor | `onto compile run` walks the topological plan; refinement-parent context threading, per-node `model.ref` routing through the registry, language parse-check on every artifact, optional `--runtime-check` execution, and a top-level `EffectWithLog` retire the legacy try/catch tower |
| 7. Code as compiled shadow | every artifact under `.ontology/artifacts/generated/` ties back through events to nodes; code-fence stripping + parse validation enforce structural fidelity |

Compiler-plan hardening (Bootstrap 0.9): `computeCompilePlan` now rejects `contradicts` edges as plan errors and halts BFS on `supersedes` with a `superseded` warning, so contradictions surface as failures instead of silent compiles.

The four additive categorical extensions (`CATEGORICAL_VISION.md`) ship as runtime libraries with first-line surfaces:

| Extension | Library | Surface |
| --- | --- | --- |
| Yoneda query | `src/runtime/query/representable.ts` | `onto query` CLI, walker `:query` |
| Effect monad | `src/runtime/effects/io.ts` | in concrete use inside `compileNode` |
| Branch fibration | `src/runtime/fibration/branch-fiber.ts` | walker `:branch list` (no `onto branch` CLI yet) |
| Topos predicate algebra | `src/runtime/topos/predicate.ts` | `intent-validator.ts` ported onto the algebra; verdict ∈ Ω exposed via `result.verdict` |

Ontology is alpha-quality. The append-only log is single-writer (CLI single-shot); concurrent writes from multiple processes are not yet protected, and `state.json` writes are not yet atomic on crash. Everything else is meant to fail loudly and exit `1` rather than silently corrupt.
