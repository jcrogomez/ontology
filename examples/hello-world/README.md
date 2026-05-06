# Hello World

The canonical demonstration that **Ontology compiles intentions into running programs**.

## Run it

```bash
npm run example:hello-world
```

If `python3` is on your PATH, the script ends with the artifact actually executing and printing `hello world` to your terminal.

## What happens

`build.sh` performs a complete round-trip:

1. **Initializes** a fresh `.ontology/` kernel inside `examples/hello-world/`.
2. **Builds the intention chain** — five nodes, one per abstraction level descending from canon:

   ```
   canon → project → target → domain → workflow → artifact
   ```

3. **Links refinement edges** between each pair. Each lower node refines its parent in the abstraction poset (axiom 3). These edges are the hard dependencies the compiler will respect.
4. **Validates** the kernel.
5. **Previews the compile plan** — `onto compile plan node_0005` shows the topological order without writing anything.
6. **Compiles** — `onto compile run node_0005 --provider mock` walks the plan, dispatches each prompt through the mock provider, and writes artifacts to `.ontology/artifacts/generated/`.
7. **Runs the artifact** with `python3` and verifies the output.

## The artifact

The leaf node `node_0005` is created with:
- `manifestation: code`
- `technical.language: python`
- `prompt: 'print("hello world")'`

The mock provider (configured to act as the **identity functor** for `task: code_sketch`) returns the prompt verbatim. The artifact-writer picks the file extension from the manifestation + language tag (`code` + `python` → `.py`). The result is `.ontology/artifacts/generated/node_0005.py` containing exactly:

```python
print("hello world")
```

## Why this matters

This is the smallest possible example, but it exercises every axiom of the canon end-to-end:

- **Axiom 1** (typed directed multigraph) — five nodes connected by typed `refines` edges.
- **Axiom 2** (temporal log) — every node creation, edge creation, run dispatch, and compilation step is recorded as an append-only event in `events.jsonl`.
- **Axiom 3** (abstraction poset) — the chain follows the canonical order; refinement edges are validated to climb upward.
- **Axiom 5** (presheaf context) — each node's local context is computable; the linker would catch dependency violations even at this scale.
- **Axiom 6** (compiler functor) — the topological compile order is *derived* from the graph, not hand-coded. Each node maps to an artifact via a model dispatch. Structure is preserved.

## Replacing the mock with a real model

If you have [Ollama](https://ollama.com/) running locally:

```bash
# Inside examples/hello-world/, after build.sh has produced the chain:
npx tsx ../../src/cli.ts compile run node_0005 --provider ollama --model llama3.1:8b
```

You'll need to write a higher-level prompt for the artifact node so the model has something to generate (rather than asking it to echo a literal `print(...)`). The compile primitives and audit chain remain the same: deterministic plan, run-id provenance, append-only events, content-addressed artifact path.

## Provenance trail

After `build.sh` runs, you can audit any byte of the produced artifact back to its origin:

```bash
# Show the artifact and its source node.
cat .ontology/artifacts/generated/node_0005.py
npx tsx ../../src/cli.ts node show node_0005

# The compilation_run event in the temporal log carries the runId.
npx tsx ../../src/cli.ts events tail | grep compilation_run

# That runId resolves to a persisted run record.
npx tsx ../../src/cli.ts runs list

# Verify the run record's integrity (recomputes the deterministic hash).
npx tsx ../../src/cli.ts runs verify run_<id>
```

Every step is auditable. That's the property the kernel exists to guarantee.

## Cleaning up

The example writes into `examples/hello-world/.ontology/`, which is gitignored. The build script wipes it before each run.
