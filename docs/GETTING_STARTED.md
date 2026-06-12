# Getting Started

A 5-minute hands-on tour that takes you from a blank directory to a small, valid intention network with edges and a model run that you can audit.

## Before you begin

```bash
git clone https://github.com/jcrogomez/ontology.git
cd ontology
npm install
npm run check     # typecheck — should be silent (exit 0)
npm run test:run  # test suite — see the Node note below
```

> **Node version.** `package.json` requires Node **≥ 20** (`engines`), and
> the test runner (vitest/rolldown) specifically needs **≥ 20.12** —
> on older Node it aborts at startup with
> `SyntaxError: ... does not provide an export named 'styleText'`. If
> your default `node` is 18, run the suite under a 20+ toolchain (e.g.
> Homebrew `node@23`: `PATH="$(brew --prefix node@23)/bin:$PATH" npm run test:run`).
> `npm run check` (typecheck) and `npm run dev` (the CLI, via `tsx`)
> work on Node 18. The full suite's current green/known-failing status
> lives in [`ROADMAP.md`](ROADMAP.md).

You will run the CLI as `npm run dev -- <command>`. To get a real `onto` binary on your PATH instead, install globally straight from git — the `prepare` script builds on install:

```bash
npm install -g github:jcrogomez/ontology
onto --version
```

(Publication to npm as `@jcrogomez/ontology` is pending the first non-rc release; the bare `ontology` name on npm is an unrelated, abandoned package.) Examples below write `onto X`; substitute `npm run dev -- X` if you haven't installed the binary.

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

Nodes are typed semantic objects. They carry a `level` (where in the abstraction poset they live), a `kind` (what shape of intention they represent), and an optional **contract** — the structured `requires` / `provides` / `forbids` tokens the validator enforces against any output produced from this node.

```bash
onto node create --level domain --kind entity \
  --prompt "Harvest has seededQuantity, harvestedQuantity and status." \
  --provides "harvest_entity,stock_calculus"

onto node create --level workflow --kind action \
  --prompt "When a harvest is recorded, compute stock_delta and emit a stock event." \
  --requires "harvest_entity,stock_calculus" \
  --rules "FORBID: writes to .ontology/nodes/"
```

Each command:
- Writes a new file under `.ontology/nodes/`.
- Appends a `node_created` event to `events.jsonl`.
- Updates `state.json` counters.
- Hashes the node body for integrity.
- Declares the node's contract: `--provides` lands in `context.provides`, `--requires` in `context.requires`, `--forbids` in `context.forbids`, `--rules` in `node.rules`. The validator (`onto link`, the compile gate) enforces this contract against any LLM output produced for the node.

```bash
onto node list
```

Should show three nodes: the canon, plus the two you just created.

**Iterating on a node** — if you want to refine a prompt or tighten a contract, you don't have to delete and recreate. Use `onto node update`:

```bash
onto node update node_0001 \
  --prompt "Harvest has seededQuantity, harvestedQuantity, status, and a timestamp." \
  --provides "harvest_entity,stock_calculus,harvest_timestamp"
```

The node is rewritten in place, re-hashed, and a `node_updated` event lands in the temporal log with both old and new hashes — the audit chain still shows exactly how the intent evolved.

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

`runs verify` recomputes the deterministic id and the body hash; if either diverges from the stored value, it exits non-zero. This is the audit primitive the Proposal System and the Compiler both rely on.

---

## 7. Walk the network

This is the moment Ontology stops being a CLI and becomes an editor.

```bash
onto walk node_0000_canon
```

A focal cell appears. The border is colored by the abstraction level (white = canon, blue = project, ..., red = unit). The path bar at the bottom shows a colored breadcrumb. Tokens that appear in more than one node's `requires` or `provides` are underlined.

Navigate (v1 commands):

- `↑` parent · `↓` first child · `←` / `→` siblings
- `i` enter edit mode (compose a candidate child draft); `Esc` saves
- `:propose` turns the draft into a proposal; `:cleardraft` discards it
- `:run [ollama]` dispatches a model run against the focal's context
- `:plan` previews the topological compile plan rooted at the focal
- `:compile [ollama]` runs the full compile, writing artifacts to disk
- `:clearrun` / `:clearplan` / `:clearcompile` dismiss panels
- `q` or `:q` quit

Try walking from canon down into your nodes. Then try `:plan` to see the order, `:compile` to actually compile.

---

## 8. Compile to a real artifact

Now the full canonical loop. Add a leaf node that *is* a piece of Python:

```bash
onto node create \
  --level artifact \
  --kind artifact \
  --manifestation code \
  --language python \
  --prompt 'print("hello world")'

# Link it as a refinement of one of your existing nodes (replace IDs as needed):
onto node link --from node_0003 --to node_0002 --type refines

# Preview the compile order (read-only):
onto compile plan node_0003

# Compile (writes the artifact and emits compilation_run events):
onto compile run node_0003 --provider mock

# The artifact is on disk:
cat .ontology/artifacts/generated/node_0003.py
python3 .ontology/artifacts/generated/node_0003.py
```

You should see:

```
hello world
```

That's the canon's axiom 6 (compiler functor) running real code. The mock provider acts as the **identity functor** for `code_sketch` task — it returns the prompt verbatim — which makes this work offline. With Ollama, replace `--provider mock` with `--provider ollama --model llama3.1:8b` and supply a higher-level prompt; the compile pipeline is identical.

**Semantic gate.** Every compile passes the generated artifact through `validateIntent` against the focal's contract before claiming success. Formally, the compile is the composite

$$\text{Intent}\;\xrightarrow{\;F\;}\;\text{Artifact}\;\xrightarrow{\;\text{validateIntent}\;}\;\Omega,$$

where $\Omega = \{\text{true}, \text{false}, \text{unknown}\}$. A `false` verdict aborts the compile with `reason: "intent_failed"` and surfaces which clause was violated — so you cannot ship an artifact that contradicts the contract you declared with `--requires` / `--provides` / `--forbids` / `--rules`. Try it: re-create the artifact node with `--rules "FORBID: hello"` and re-run the compile; the gate stops it with the violating phrase named in the error.

**Branch-scoped compile.** If your project carries multiple branches, `onto compile run <focal> --branch <name>` restricts the plan to a single Grothendieck fiber — only edges whose both endpoints live on `<name>` participate. Cross-branch dependencies become inert under that flag, which is exactly what you want when one branch ships ahead of another.

The shorter way to see all of this end-to-end is:

```bash
npm run example:hello-world
```

That builds a full canonical chain, compiles it, and runs the artifact for you. Read [`examples/hello-world/README.md`](../examples/hello-world/README.md) for the walkthrough.

---

## What you just touched

In 5 minutes you exercised every axiom of the canon:

- **Axiom 1** (typed directed multigraph): `node link` with edge types.
- **Axiom 2** (temporal log): every command appended to `events.jsonl`.
- **Axiom 3** (poset): the abstraction levels you assigned, with refinement direction enforced at link time and by `validate`.
- **Axiom 4** (prompts as rewrite rules): partial. `parsePromptAST(raw)` recognises `@requires:` / `@provides:` / `@expand:` markers and emits a deduplicated AST consumed by `compileNode`, but no module yet rewrites the body based on the markers. The leaf's prompt becomes the artifact byte-for-byte under the mock provider's identity behavior on `task: code_sketch`. See [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §2.4.
- **Axiom 5** (presheaf context): `context assemble`'s local view, plus the underlined tokens in the walker.
- **Axiom 6** (compiler functor): `onto compile run` walks the topological plan and writes structure-preserving artifacts.
- **Axiom 7** (code as compiled shadow): the `.py` file you ran is traceable through `compilation_run` → `runId` → `node` back to the canon.

You also exercised:

- **Run persistence**: content-addressed records with deterministic ids; cache hits surface as `(cached)`.
- **Proposal system**: drafts in the walker → `:propose` → `apply` → real graph mutation. See [PROPOSAL_SYSTEM.md](PROPOSAL_SYSTEM.md).
- **Audit chain**: every artifact ties back to events, runs, and node hashes. Use `onto runs verify <id>` to recompute hashes, `onto events tail` to see the temporal log.

---

## Where to go from here

- [**Hello World example**](../examples/hello-world/README.md) — the canonical demo, end-to-end in one command.
- [**Compiler**](COMPILER.md) — how `onto compile` produces artifacts and why each step has full provenance.
- [**The Canon**](ONTOLOGY_CANON.md) and [**Mathematical Model**](MATHEMATICAL_MODEL.md) for the formal foundation.
- [**Mathematical Claims — Audit & Map**](MATHEMATICAL_CLAIMS.md) for the rigor classification of every math claim in the project.
- [**Architecture**](ARCHITECTURE.md) for how the kernel, runtime, assembler, proposal system, compiler, and walker relate.
- [**CLI Commands**](CLI_COMMANDS.md) for the full surface.
- [**Roadmap**](ROADMAP.md) for what is shipped and what is next.
- [**Walker Interface RFC**](WALKER_INTERFACE.md) if you want to extend or skin the walker.

Once the basics feel comfortable, see [CLI_COMMANDS.md](CLI_COMMANDS.md) §`drift` (Merkle change-detection over compiled artifacts) and §`semantic index` / `semantic links` (local embedding index + `query --semantic` hybrid retrieval).
