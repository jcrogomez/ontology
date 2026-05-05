# Getting Started

A 5-minute hands-on tour that takes you from a blank directory to a small, valid intention network with edges and a model run that you can audit.

## Before you begin

```bash
git clone https://github.com/jcrogomez/ontology.git
cd ontology
npm install
npm run check     # typecheck — should be silent
npm run test:run  # full suite — should be all green
```

You will run the CLI as `npm run dev -- <command>`. When Ontology is published, `onto <command>` will be the equivalent.

Optional: if you have [Ollama](https://ollama.com/) running locally, the model commands can dispatch to a real model. Without Ollama, the `mock` provider works for everything in this tour.

---

## 1. Initialize the kernel

```bash
mkdir my-project && cd my-project
npm run dev --prefix /path/to/ontology -- init
```

You now have a `.ontology/` directory:

```
.ontology/
  state.json              ← high-level metrics
  events.jsonl            ← append-only temporal log
  edges.jsonl             ← typed semantic relations (empty so far)
  nodes/
    node_0000_canon.json  ← the foundational node, frozen
  models/registry.json
  processors/registry.json
```

The canon node is frozen and contains the mathematical definition of Ontology. It is the root of every path you will assemble later.

```bash
npm run dev --prefix /path/to/ontology -- inspect
```

Should print a brutalist summary: nodes, events, edges, and the first canon rule.

> Tip: from now on, when working inside `my-project/`, prefix every command with the path to the cloned `ontology/` repo (`npm run dev --prefix /path/to/ontology -- ...`), or install Ontology locally with `npm install /path/to/ontology` and use `npx onto`.

---

## 2. Create your first nodes

Nodes are typed semantic objects. They carry a `level` (where in the abstraction poset they live) and a `kind` (what shape of intention they represent).

```bash
onto node create --level domain --kind entity \
  --prompt "Harvest has seededQuantity, harvestedQuantity and status."

onto node create --level workflow --kind action \
  --prompt "When a harvest is recorded, compute stock_delta and emit a stock event."
```

Each command:
- Writes a new file under `.ontology/nodes/`.
- Appends a `node_created` event to `events.jsonl`.
- Updates `state.json` counters.
- Hashes the node body for integrity.

```bash
onto node list
```

Should show three nodes: the canon, plus the two you just created.

---

## 3. Connect nodes with typed edges

The graph is a typed multigraph. Edges have a *type* (`depends_on`, `validates_against`, `documents`, `emits`, …).

```bash
onto node link --from node_0002 --to node_0001 --type depends_on
```

The workflow node now declares "I depend on the harvest entity". `edges.jsonl` gets one line; `events.jsonl` gets an `edge_created` event.

Self-links and unknown edge types are rejected. Hashes link every event to the previous one.

The full list of edge types is in [`src/schemas/ontology.ts`](../src/schemas/ontology.ts) under `EdgeTypeSchema`.

---

## 4. Assemble local context

Context in Ontology is **local**, not global. For any node you ask:

> "What do I need to know to reason about this node, given its position in the graph?"

```bash
onto context assemble node_0002
```

The output is a structured package:
- The canon (the constant background).
- The path of ancestor nodes from canon down to the focal node.
- The constraints (rules) inherited along the path.
- A formatted prompt suitable for a model.

To project edges into the context (a workflow's `depends_on` edges, for example):

```bash
onto context assemble node_0002 --include-edges
```

The `Edge Context` block now includes the edges incident to `node_0002` and the IDs of the neighbor nodes brought in.

---

## 5. Send the context to a model

```bash
onto run context node_0002 --provider mock
```

The mock provider is deterministic and never makes a network call — useful for CI and structural smoke tests. The output reports `Provider: mock` and a fake response.

To run against Ollama (if installed):

```bash
onto run context node_0002 --provider ollama --model llama3.1:8b
```

To validate the response against the assembled context's `requires`/`provides`/`forbids`:

```bash
onto run context node_0002 --provider mock --validate
```

A `Validation:` block appears: `OK`, `Score`, `Warnings`, `Violations`.

---

## 6. Persist the run for audit

By default, a run is ephemeral: nothing is written. Add `--persist` to store a content-addressed record:

```bash
onto run context node_0002 --provider mock --validate --persist
```

A `Run: run_<id>` line appears. The same call run a second time prints `(cached)` and skips the dispatch.

```bash
onto runs list
onto runs show run_<id>
onto runs verify run_<id>
```

`runs verify` recomputes the deterministic id and the body hash; if either diverges from the stored value, it exits non-zero. This is the audit primitive that the upcoming Proposal System will rely on.

---

## 7. Walk the network

This is the moment Ontology stops being a CLI and becomes an editor.

```bash
onto walk node_0000_canon
```

A focal cell appears. The border is colored by the abstraction level (white = canon, blue = project, ..., red = unit). The path bar at the bottom shows a colored breadcrumb. Tokens that appear in more than one node's `requires` or `provides` are underlined.

Navigate:

- `↑` parent
- `↓` first child
- `←` / `→` siblings
- `q` or `:q` quit

Try walking from canon down into your nodes. Notice how the colors change. Try the same on a node that has edges.

`T`, `B`, `M`, `g`, `E` are reserved for v1+ — they will plug in time scrub, branch hop, manifestation rotation, and edge walks once those make sense for the kernel.

---

## What you just touched

In 5 minutes you exercised:

- **Axiom 1** (typed directed multigraph): `node link` with edge types.
- **Axiom 2** (temporal log): every command appended to `events.jsonl`.
- **Axiom 3** (poset): the abstraction levels you assigned to each node.
- **Axiom 5** (presheaf context): `context assemble`'s local view, plus the underlined tokens in the walker.
- **Run persistence**: content-addressed records with deterministic ids.
- **Read-only LLM dispatch**: a model spoke; no `.ontology` byte was mutated.

What you did **not** touch (yet, on purpose):

- **Axiom 4** (prompts as rewrite rules): prompts are still opaque text. PromptAST arrives later.
- **Axiom 6** (compiler functor): no code is generated. The compiler is the last bootstrap.
- **Proposal system**: today, mutations are typed CLI commands. The Proposal System will let model runs become typed candidate mutations you explicitly apply or reject. See [PROPOSAL_SYSTEM.md](PROPOSAL_SYSTEM.md).

---

## Where to go from here

- [**The Canon**](ONTOLOGY_CANON.md) and [**Mathematical Model**](MATHEMATICAL_MODEL.md) for the formal foundation.
- [**Architecture**](ARCHITECTURE.md) for how the kernel, runtime, and assembler relate.
- [**CLI Commands**](CLI_COMMANDS.md) for the full surface.
- [**Roadmap**](ROADMAP.md) for what comes next.
- [**Walker Interface RFC**](WALKER_INTERFACE.md) if you want to extend or skin the walker.
