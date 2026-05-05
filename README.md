# Ontology

> **A typed, temporal, multidimensional graph editor for intentions.**
> Models may speak. Only explicit graph commands may mutate the network.

Ontology is a terminal-first tool for building **a network of ideas that does not lose its mind** when an AI gets involved. Instead of letting prompts and outputs sprawl across chats, files, and notes, you connect intentions as typed nodes and edges in `.ontology/` — and the kernel guarantees nothing mutates the graph except explicit commands you ran.

The deeper bet: **code is the compiled shadow of a valid semantic network**, not the other way around. Today Ontology is a verified network kernel, a node editor, and a model runtime — not yet a code generator. We are building toward that, one bootstrap at a time.

```bash
npm install
npm run dev -- init
npm run dev -- node create --level domain --kind entity \
  --prompt "Harvest has seededQuantity, harvestedQuantity and status."
npm run dev -- inspect
npm run dev -- walk node_0001
```

---

## Why this exists

Most AI tooling today does this:

```
prompt + files + model → output
```

Ontology wants this:

```
graph state + typed context + model → candidate
candidate + deterministic validators → accepted | rejected
accepted candidate + explicit graph command → mutation
```

That separation buys three things:

1. **Memory.** The graph remembers every decision, every edge, every event, in an append-only log.
2. **Trust.** A model can suggest. A user must approve. The graph is the source of truth.
3. **Composition.** When a project grows, the topology of the graph determines what gets compiled, in what order, with what dependencies.

---

## What Ontology can do today

| Verb | What it means |
| --- | --- |
| `onto init` | Create a fresh `.ontology/` kernel (state, events log, edges log, canon node). |
| `onto node create` | Add a typed semantic node. Append a `node_created` event. |
| `onto node link` | Connect two nodes with a typed edge. Append an `edge_created` event. |
| `onto context assemble` | Compute the local context for a node (parent path; optionally edge-aware with `--include-edges`). |
| `onto run prompt` | Send a free-form prompt to a model (mock or local Ollama). |
| `onto run context` | Send the assembled context for a node to a model. Optionally `--validate` and `--persist`. |
| `onto run prompt --as-proposal` / `onto run context --as-proposal` | Same as above, but wrap the model's response into a typed candidate node mutation (a proposal). |
| `onto runs list / show / verify` | Inspect persisted run records (content-addressed, audit-friendly). |
| `onto propose node`, `onto proposal list / show / apply / reject` | The proposal lifecycle: typed candidate mutations applied or rejected explicitly. Models speak; the user commits. |
| `onto walk <id>` | **Open the Walker**: an interactive focal-cell terminal interface. Read-only in v0. |
| `onto inspect`, `onto validate`, `onto events tail`, `onto model doctor`, ... | Observability primitives. |

The full list is in [docs/CLI_COMMANDS.md](docs/CLI_COMMANDS.md).

---

## Where to go next

If you are a **first-time visitor**, start with the guided tour:

- [**Getting Started**](docs/GETTING_STARTED.md) — a hands-on walk from `init` to `walk` in 5 minutes.

If you want to understand **the design**:

- [**The Canon**](docs/ONTOLOGY_CANON.md) — the foundational definition.
- [**The Mathematical Model**](docs/MATHEMATICAL_MODEL.md) — the 7 axioms.
- [**The Architecture**](docs/ARCHITECTURE.md) — how Kernel, Observability, LLM Runtime, and Context Assembler relate.

If you want to **contribute or extend**:

- [**Roadmap**](docs/ROADMAP.md) — what is implemented, what is planned, in which bootstrap.
- [**RFCs**](docs) — `RUN_PERSISTENCE.md`, `PROPOSAL_SYSTEM.md`, `WALKER_INTERFACE.md` — design specs for in-flight and upcoming work.
- [**Release Notes**](docs/RELEASE_NOTES.md) — the running changelog.

---

## Status

**Bootstrap 0.5 complete.** Version `0.2.0-alpha.1`. The kernel is hardened; node creation, edges, edge-aware context, mock + Ollama runtimes, deterministic validation, content-addressed run persistence, the read-only Walker v0, poset enforcement, and the full Proposal System (propose → list/show/reject → apply with parentHash re-validation, plus `run prompt --as-proposal` / `run context --as-proposal` for run-driven proposals) are all implemented and tested.

The canonical loop now runs end-to-end:

```
graph state + typed context + model → run_persisted → proposal_created → user reviews → proposal_applied → node_created
```

Every step is in the append-only events log; every node can be traced back to the model run that proposed it.

Next on the runway: Walker v1 (edit mode, `:propose`, `:run`, `:compile --plan`), `onto propose link` (edge_create proposals), and the edge-aware SemanticLinker.

Ontology is alpha-quality. The append-only log is single-writer (CLI single-shot); concurrent writes from multiple processes are not yet protected. Everything else is meant to fail loudly and exit `1` rather than silently corrupt.
