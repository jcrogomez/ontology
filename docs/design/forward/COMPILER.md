# Compiler

**Status:** Implemented (Bootstrap 0.8). The compiler is the structure-preserving functor from axiom 6 of the canon, now running concrete code under `src/forward/compile/`.

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

The compiler asks the kernel: *"what is the topological order to compile this node?"* That answer comes from `computeCompilePlan(focalId, edges)` in `src/kernel/graph/compile-plan.ts`. The helper:

- Walks the dependency closure rooted at the focal, following only **hard-dependency edge types**: `depends_on`, `inherits_from`, `refines`, `implements`, `uses_token`.
- Sorts the closure with Kahn's algorithm. Independent nodes break ties alphabetically by id, so the same graph always produces the same plan.
- Detects cycles and returns a partial plan plus the unresolved set rather than spinning forever.

The same helper backs the read-only preview commands `onto compile plan <nodeId>` and the walker's `:plan`. CLI scripts and the TUI agree on the order because they share the kernel.

### 2. Step

For each plan step, the compiler invokes `compileNode` (`src/forward/compile/compile-node.ts`):

1. Compute the deterministic run id for this step (hash of `(input, model)`). If a record already exists in `.ontology/runs/`, the step is a **cache hit** — no model dispatch fires. The cached response is reused.
2. Otherwise, dispatch the focal node's `prompt.raw` against the configured provider (mock or ollama) with `task: code_sketch`.
3. Persist the run via `createPersistedRun`. This records the input hashes, the model identity, the response, and emits a `run_persisted` event.
4. Hand the response text to the **artifact-writer** (`src/forward/compile/artifact-writer.ts`). The writer picks the file extension from the node's `coordinates.manifestation` and `technical.language` (see [Manifestation mapping](#manifestation-mapping)). The artifact lands at `.ontology/artifacts/generated/<nodeId>.<ext>`.
5. Append a **`compilation_run`** event whose payload carries `nodeId`, `runId`, `cached`, `artifactRelativePath`, and `bytes`. This is the audit-chain anchor for the artifact.

### 3. Plan-runner

`runCompilePlan` (`src/forward/compile/compile-plan-runner.ts`) is the outer loop: it computes the plan, then iterates `compileNode` over each step. The runner stops on the first step failure and reports the partial successes that already landed (those artifacts are real and audit-traceable; the events log records them). On full success, the runner returns the focal's artifact path so callers can surface the "main" output.

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

The mapping lives in `src/forward/compile/manifestation-mapper.ts`. Adding a new language is one entry in the `LANGUAGE_EXTENSION` table.

Set the mapping at node creation:

```bash
onto node create \
  --level artifact \
  --kind artifact \
  --manifestation code \
  --language python \
  --prompt 'print("hello world")'
```

## The mock provider as the identity functor (on one task)

For `task: code_sketch`, the mock provider returns the prompt **verbatim** — no `[mock:...]` prefix. Every other task keeps the prefixed echo behavior so existing tests do not regress.

This is deliberate: it makes mock-driven compilation a degenerate but useful case of axiom 6 — the leaf node's `prompt.raw` *is* the artifact byte-for-byte. That is why the [hello world example](../../../examples/hello-world/README.md) works offline without a model: the leaf's prompt is literal Python, and the mock identity-functors it through to disk.

The "identity functor" framing is honest only on the `code_sketch` slice — on other tasks the mock prefixes a marker, which is not the identity. See [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) §4.3 (T3 — useful analogy on a one-task slice).

A real model (Ollama, etc.) is a non-identity functor on every task. The same compile-plan structure, the same step-by-step audit chain, the same event log shape — only the per-step transformation changes.

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

## What the compiler does (Bootstrap 0.9 hardening)

The Bootstrap 0.8 v0 listed four gaps in this section. Three closed in 0.9:

- **Prompt parsing — shipped (PR #113).** `parsePromptAST(raw)` recognises three line-anchored markers (`@requires:`, `@provides:`, `@expand:`), strips them from the prompt body, and emits a deduplicated `PromptAST`. `compileNode` consumes the parsed body instead of `prompt.raw`. Axiom 4 is now structural rather than textual. See `src/forward/prompt/parse.ts`.
- **Upstream-output threading — shipped (PR #105).** The plan-runner threads each refinement parent's compiled response into the per-node `compileNode` call as `UpstreamContextItem[]`, and the system prompt renders them under XML `<context>` tags (PR #109 fixed an earlier format leak). Downstream nodes now actually see what their refinement parents produced.
- **`contradicts` / `supersedes` semantics in the plan — shipped (PR #112).** `computeCompilePlan` rejects any plan whose closure contains a `contradicts` edge as a hard `CompilePlanError`, and halts BFS on `supersedes` with a `superseded` warning. Note the asymmetry: `contradicts` is loud (the plan errors out); `supersedes` is silent-by-design (the predecessor is dropped from the closure even when its successor is unreachable from the focal — that is the intended semantics of "this node has been replaced"). Tests should pin both behaviours.

Per-artifact validation gates were also added in 0.9, and the **semantic gate** landed post-0.9:

- **Language parse-check (PR #104).** Every code artifact is parse-validated against the node's `technical.language` after write. Failures emit a `validate_failed` step and abort the plan. A deterministic, model-agnostic floor on artifact quality.
- **Semantic gate via `validateIntent` (post-0.9, commit `1a8a4c3`).** After parse-check and before the optional runtime-check, every artifact is evaluated against the focal node's full contract — the union of `context.requires` / `context.provides` / `context.forbids` tokens and the FORBID/REQUIRE prose in `node.rules`. Formally, every compile step is now the composite
  
  $$F_n\;\colon\;\text{Intent}_n\;\xrightarrow{\;\text{dispatch}\;}\;\text{Artifact}_n\;\xrightarrow{\;\text{validateIntent}\;}\;\Omega_n,$$
  
  where $\Omega_n = \{\text{true}, \text{false}, \text{unknown}\}$ is the Heyting algebra defined in `runtime/topos/`. A `false` verdict aborts the compile with `reason: "intent_failed"` and surfaces the violated clause; an `unknown` verdict (open-world callers only) passes through with a warn-level breadcrumb so the audit log records the uncertainty. The gate runs always — there is no opt-out — because a compile that violates its declared contract is structurally invalid, not merely undesirable.
- **Optional `--runtime-check` (PR #110).** `onto compile run --runtime-check` executes each artifact under a wall-clock timeout (default 5000 ms, max 60000 ms) and surfaces non-zero exits, signal kills, and timeouts as `runtime_failed` step records.
- **Code-fence stripping (PR #103).** When `coordinates.manifestation === "code"`, the artifact-writer strips a leading/trailing markdown code fence so a model returning ```` ```python ... ``` ```` produces a runnable file.
- **Per-node `model.ref` routing (PR #108).** Without `--provider` override, each node compiles via its own `technical.model.ref` resolved through the registry, so the per-step run record honestly reports which model produced which artifact.
- **Branch-scoped compile (post-0.9, commit `5f97e18`).** `onto compile run <focal> --branch <name>` restricts the plan to the Grothendieck fiber $p^{-1}(\text{name})$, where $p\colon \mathcal{I} \to \mathcal{B}$ forgets the branch label. Only intra-fiber edges participate; cross-branch supersedes / refinement are inert; the focal must itself live on the branch (refused with `focal_off_branch` otherwise).
- **Multi-file orchestration (post-0.9, Project Legend Phase β-1).** `onto compile run --target <path>` writes the focal's compiled artifact to an arbitrary path (crash-atomic via temp+rename; clobber-gated behind `--force` so an interactive caller cannot silently destroy a non-empty file). `onto compile run-batch [--all-artifacts | --nodes <ids>]` walks N focals in one invocation and the per-run persisted-run cache reuses shared upstream walks across plans — the prerequisite for Legend's `verify-homeomorphism` flow.
- **`node.literal` escape hatch (post-0.9, Project Legend Phase β-2).** For irreducible-specificity content (regexes, magic constants, license headers) where probabilistic generation would only add risk, `node.literal?: string` pins the artifact body verbatim and `compileNode` short-circuits the dispatch+persist slice. The audit chain is preserved: a synthetic persisted run is written with `provider="literal"` / `model="literal"`, content-addressed on the literal bytes plus upstream context (so two byte-identical literals collapse to the same `runId` and a re-compile is a cache hit). **Crucially, the post-dispatch slice runs unchanged** — `projectArtifact` (pass-through; never strips a fence from a literal), `validateLanguage`, `validateIntent`, optional `runtimeCheck`, `emitEvent`. A literal that contains a forbidden token still fails the semantic gate; a literal that won't parse still fails the language check; a literal that crashes at runtime still fails `--runtime-check`. The escape hatch is *just for dispatch*, not for any validator downstream of it.

## What the compiler does not do (yet)

- **Reverse direction (`onto ingest`).** Lifting existing source into the intent layer — the approximate left adjoint $G\colon \text{Code} \to \text{Intent}$ — is the entire subject of Project Legend, Phases γ–ε.

These are explicit, documented gaps. They can be filled without changing the kernel surface — `compileNode` and `runCompilePlan` are the extension points.
