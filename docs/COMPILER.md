# Compiler

**Status:** Implemented (Bootstrap 0.8). The compiler is the structure-preserving functor from axiom 6 of the canon, now running concrete code under `src/runtime/compile/`.

## What the compiler does

`onto compile run <nodeId>` walks the focal node's *dependency closure* in topological order and produces an artifact for each node. The result is a deterministic, hash-traceable mapping from a region of the intention graph to a set of files on disk. The graph is the source; the artifacts are the compiled shadow.

```
.ontology/                           .ontology/artifacts/generated/
  nodes/
    node_0000_canon.json     ──→     node_0000_canon.txt
    node_0001.json           ──→     node_0001.txt
    node_0002.json           ──→     node_0002.py     ← focal artifact
  edges.jsonl                        (refinement edges drove the order)
  events.jsonl                       compilation_run × 3 appended
  runs/                              run_<id>.json × 3 (one per step)
```

Every artifact carries provenance back through the events log: `artifact path → compilation_run event → runId → run record → prompt hash → node body`. Nothing is generated without leaving an audit trail.

## How it works

### 1. Plan

The compiler asks the kernel: *"what is the topological order to compile this node?"* That answer comes from `computeCompilePlan(focalId, edges)` in `src/runtime/graph/compile-plan.ts`. The helper:

- Walks the dependency closure rooted at the focal, following only **hard-dependency edge types**: `depends_on`, `inherits_from`, `refines`, `implements`, `uses_token`.
- Sorts the closure with Kahn's algorithm. Independent nodes break ties alphabetically by id, so the same graph always produces the same plan.
- Detects cycles and returns a partial plan plus the unresolved set rather than spinning forever.

The same helper backs the read-only preview commands `onto compile plan <nodeId>` and the walker's `:plan`. CLI scripts and the TUI agree on the order because they share the kernel.

### 2. Step

For each plan step, the compiler invokes `compileNode` (`src/runtime/compile/compile-node.ts`):

1. Compute the deterministic run id for this step (hash of `(input, model)`). If a record already exists in `.ontology/runs/`, the step is a **cache hit** — no model dispatch fires. The cached response is reused.
2. Otherwise, dispatch the focal node's `prompt.raw` against the configured provider (mock or ollama) with `task: code_sketch`.
3. Persist the run via `createPersistedRun`. This records the input hashes, the model identity, the response, and emits a `run_persisted` event.
4. Hand the response text to the **artifact-writer** (`src/runtime/compile/artifact-writer.ts`). The writer picks the file extension from the node's `coordinates.manifestation` and `technical.language` (see [Manifestation mapping](#manifestation-mapping)). The artifact lands at `.ontology/artifacts/generated/<nodeId>.<ext>`.
5. Append a **`compilation_run`** event whose payload carries `nodeId`, `runId`, `cached`, `artifactRelativePath`, and `bytes`. This is the audit-chain anchor for the artifact.

### 3. Plan-runner

`runCompilePlan` (`src/runtime/compile/compile-plan-runner.ts`) is the outer loop: it computes the plan, then iterates `compileNode` over each step. The runner stops on the first step failure and reports the partial successes that already landed (those artifacts are real and audit-traceable; the events log records them). On full success, the runner returns the focal's artifact path so callers can surface the "main" output.

## Manifestation mapping

The artifact's file extension is derived from the node's `coordinates.manifestation` plus its optional `technical.language`. This is what makes a leaf-node artifact land as `.py` versus `.txt`.

| `manifestation` | Default extension | Language override |
| --- | --- | --- |
| `intent` | `.txt` | (ignored) |
| `ast` | `.json` | (ignored) |
| `osl` | `.osl` | (ignored) |
| `code` | `.txt` | language-aware |
| `test` | `.txt` | language-aware |
| `build` | `.sh` | (ignored) |

When `manifestation` is `code` or `test` and `node.technical.language` is one of `python`, `typescript`, `javascript`, `rust`, `go`, `ruby`, `java`, `c`, `cpp`, `csharp`, `shell`, `bash`, `sql`, `html`, `css`, `json`, `yaml`, `toml`, `markdown`, the language extension wins. Unknown languages fall back to `.txt`.

The mapping lives in `src/runtime/compile/manifestation-mapper.ts`. Adding a new language is one entry in the `LANGUAGE_EXTENSION` table.

Set the mapping at node creation:

```bash
onto node create \
  --level artifact \
  --kind artifact \
  --manifestation code \
  --language python \
  --prompt 'print("hello world")'
```

## The mock provider as the identity functor

For `task: code_sketch`, the mock provider returns the prompt **verbatim** — no `[mock:...]` prefix. Every other task keeps the prefixed echo behavior so existing tests do not regress.

This is deliberate: it makes mock-driven compilation a degenerate but mathematically valid case of axiom 6. The functor is the identity. The leaf node's `prompt.raw` *is* the artifact byte-for-byte. That's why the [hello world example](../examples/hello-world/README.md) works offline without a model: the leaf's prompt is literal Python, and the mock identity-functors it through to disk.

A real model (Ollama, etc.) is a non-identity functor. The same compile-plan structure, the same step-by-step audit chain, the same event log shape — only the per-step transformation changes.

## Audit chain in detail

After `onto compile run node_0042` succeeds, the temporal log records:

```
... (prior events)
run_persisted        runId: run_a3f2b1c8         (step 1's run)
compilation_run      nodeId: node_0000_canon, runId: run_a3f2b1c8, artifact: ...
run_persisted        runId: run_b6e2f4d1         (step 2's run)
compilation_run      nodeId: node_0001, runId: run_b6e2f4d1, artifact: ...
run_persisted        runId: run_c9a8e3f2         (focal's run)
compilation_run      nodeId: node_0042, runId: run_c9a8e3f2, artifact: .../node_0042.py
```

To trace any artifact:

```bash
# 1. Find the compilation_run event for the artifact.
onto events tail --limit 50 | grep node_0042

# 2. Pull the runId from the event payload, then inspect the run record.
onto runs show run_c9a8e3f2

# 3. The run record stores promptHash, contextHash, provider, model, output.
onto runs verify run_c9a8e3f2
```

You can run that chain on any artifact in the project. Without the chain, a generated file is opaque; with it, it has full provenance.

## What the compiler does not do (yet)

- **Prompt parsing.** `compileNode` sends the focal's `prompt.raw` directly to the model. Future work (Bootstrap 0.7+, post-hello-world) will parse prompts into a structured AST (`@requires:`, `@provides:`, `@expand:` markers), validate them against the assembled context, and surface the AST to the model as a system prompt.
- **Upstream-output threading.** The plan-runner accumulates each step's response in an `upstreamArtifacts` map and passes it to `compileNode`, but `compileNode` v0 does not inject it into the prompt. The contract is in place for the next iteration.
- **`contradicts` / `supersedes` semantics in the plan.** The plan helper currently ignores these edge types. A future pass will halt on `contradicts` and exclude `supersedes` predecessors.
- **Real validation between steps.** Today the compiler trusts the kernel. Future work may run `validateIntent` on each step's output and refuse to advance the plan when a candidate breaks the gluing.

These are explicit, documented gaps. They can be filled without changing the kernel surface — `compileNode` and `runCompilePlan` are the extension points.
