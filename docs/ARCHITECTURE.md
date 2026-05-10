# Ontology Architecture

This document describes the current architectural state of the Ontology
project (Bootstrap 0.9, version `0.3.0-alpha.0`, plus the post-0.9
validator port). It explains how the modules relate; for the
mathematical interpretation, read this alongside
[`CATEGORICAL_VISION.md`](CATEGORICAL_VISION.md) and
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md).

## Module map

```
src/
  cli.ts                    — entry point + command registration

  schemas/                  — Zod schemas: nodes, edges, events, runs,
                              proposals, prompt AST, error envelope.
                              Every entry point parses through here.
  core/                     — pure kernel primitives (no IO outside
                              .ontology/). Hashing, file-system
                              abstraction, project paths, drafts /
                              proposals / runs persistence, render
                              helpers, projects registry.
  commands/                 — CLI surface. Each command is a thin
                              translator from CLI args → kernel calls
                              → render. Includes `init`, `validate`,
                              `inspect`, `node {create,list,show}`,
                              `node link`, `events tail`, `context
                              assemble`, `run prompt|context`, `runs
                              {list,show,verify}`, `graph
                              {neighbors,path,subgraph}`, `propose
                              {node,link}`, `proposal
                              {list,show,apply,reject}`, `compile
                              {plan,run}`, `query`, `walk`, `open`,
                              `projects {list,forget}`, `model
                              {doctor,list}`, `doctor`.
  walker/                   — Ink-based interactive TUI (`onto walk`).
                              Actions in `walker/actions/`; key handling
                              and state in `walker/state/`.
  runtime/
    llm/                    — adapter boundary (mock + ollama),
                              dispatcher, model registry, model
                              resolution.
    context/                — assembleContext (parent path + edge
                              neighbors); presheaf `buildFragment`;
                              gluing; semantic linker; intent
                              validator (now built on the topos
                              predicate algebra — see §"Validator").
    graph/                  — pure helpers: traversal, edges helper,
                              poset, compile-plan (Kahn's algorithm
                              over hard-dependency edges).
    compile/                — compile-node (one step), compile-plan-
                              runner (outer loop), artifact-writer,
                              manifestation-mapper, upstream-context
                              threading, post-write checks
                              (`extract-code-fence`, `validate-
                              language`, optional `runtime-check`).
                              Built on `EffectWithLog`.
    prompt/                 — `parsePromptAST(raw)` (axiom 4 surface).
    effects/                — Result / Effect / EffectWithLog monad
                              library + async variant + monad-laws
                              tests. See [`EFFECT_MONAD.md`](EFFECT_MONAD.md).
    query/                  — Yoneda-style Hom-profile matcher. See
                              [`QUERY_REPRESENTABLE.md`](QUERY_REPRESENTABLE.md).
    fibration/              — `listBranches`, `computeBranchFiber`,
                              `describeCartesianLift`. Read-only
                              library. See [`BRANCH_FIBRATION.md`](BRANCH_FIBRATION.md).
    topos/                  — three-valued Ω predicate algebra
                              (`omega.ts`, `predicate.ts`, `rule-
                              compiler.ts`). See [`RULES_TOPOS.md`](RULES_TOPOS.md).
```

## Layer boundaries

1. **`src/cli.ts`** — pure router. Translates `argv` to a command call
   and exits with a status code. Never does work.
2. **`src/commands/`** — CLI surface. Each command is the *only* place
   that touches stdout / stderr in its flow. Commands compose pure
   helpers from `runtime/` and persistence helpers from `core/`. They
   never import sibling commands.
3. **`src/runtime/`** — pure libraries. No filesystem effects except
   through helpers from `core/project/load.ts`. No process exits, no
   stdout. Anything that *can* be a pure function in `runtime/` is.
4. **`src/core/`** — kernel primitives. Hashes, schemas, on-disk
   layout, append-only writes. Owns the contract with `.ontology/`.
5. **`src/walker/`** — Ink TUI. Renders react components against a
   focal cell; calls into `runtime/` and `core/` exactly the same way
   the CLI does. The walker never owns its own kernel state.

The boundary that matters most: **mutation is gated.** Only commands
that explicitly intend to mutate (`init`, `node create`, `node link`,
`proposal apply`, `compile run`, anything `--persist`) ever write. Read
commands are pure functions over `.ontology/`.

## Execution flow (typical `onto compile run`)

```
USER ── onto compile run node_0042 --provider mock
          │
          ▼
src/cli.ts                  → dispatch
src/commands/compile/run.ts → orchestration, stdout
          │
          ▼
src/runtime/graph/compile-plan.ts
          │  (Kahn's algorithm over depends_on / inherits_from / refines /
          │   implements / uses_token; rejects contradicts; halts on
          │   supersedes; deterministic alphabetic tie-break)
          ▼
src/runtime/compile/compile-plan-runner.ts
          │  (for each step: compile-node → write → validate-language →
          │   optional runtime-check, all chained via bindWithLog)
          ▼
src/runtime/llm/dispatcher.ts → mock | ollama adapter
src/runtime/compile/artifact-writer.ts → .ontology/artifacts/generated/<id>.<ext>
src/core/runs/persist.ts             → .ontology/runs/run_<hash>.json + run_persisted event
src/core/state/state-store.ts        → events.jsonl (compilation_run) + state.json
```

Audit chain: every artifact resolves back through one
`compilation_run` event (`runId`, `cached`, `artifactRelativePath`),
which resolves to a content-addressed run record (`promptHash`,
`contextHash`, `provider`, `model`), which resolves back to the
`OntologyNode` whose `prompt.raw` produced it. Three audit primitives
(`onto runs verify`, `onto runs show`, `onto events tail`) are all
read-only.

## Validator (post-0.9)

`src/runtime/context/intent-validator.ts` is built on the topos
predicate algebra (`src/runtime/topos/`). The three rules — gluing ok,
candidate non-empty, FORBID phrase scan — compile to atomic
`Predicate`s; `allOf` folds them into a single conjunction; the
verdict comes from `evaluatePredicate(predicate, ctx)` against an
`EvaluationContext` synthesised by `buildEvaluationContext`. The
two-valued `IntentValidationResult.{ok, score, violations, warnings}`
contract is preserved; the new `verdict: Omega` field exposes the
three-valued underlying result. See [`RULES_TOPOS.md`](RULES_TOPOS.md).

## State & persistence layout

```
.ontology/
  state.json                — high-level metrics: counts, lastEventId,
                              activeBranch, rootNodeId, model registry
                              pointer, processor registry pointer.
  events.jsonl              — append-only temporal log: every mutation
                              and every dispatched run.
  edges.jsonl               — typed semantic edges (one JSON record
                              per line).
  nodes/node_<id>.json      — typed semantic nodes (Zod-validated).
  models/registry.json      — model registry (mock + ollama defaults
                              + per-project overrides).
  processors/registry.json  — processor registry (placeholder; not
                              load-bearing in the current pipeline).
  runs/run_<id>.json        — content-addressed persisted runs.
  proposals/proposal_<id>.json — typed candidate mutations (pending,
                              applied, rejected, staled).
  artifacts/generated/      — compiler outputs.
  work/drafts/<focalId>.draft.json — walker working state.
```

Crash-safety caveat: writes to `state.json`, `events.jsonl`, and the
projects registry (`~/.config/ontology/projects.json`) are direct
`fs.writeFileSync` today. A SIGKILL or out-of-disk mid-write can
truncate the file. The single-writer assumption (CLI single-shot, no
multi-process locking) is unverified. Atomic writes + advisory lock
are the highest-priority hardening item — see
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §6 item 1.

## What is *not* in the architecture

- **No PromptAST rewriting.** Markers are parsed; nothing rewrites
  the body based on them.
- **No `compare` / `propose` context modes.** `assembleContext` rejects
  any mode other than `strict`.
- **No `onto branch` CLI.** Branch fibration is a programmatic
  library + a single Walker action (`:branch list`).
- **No `onto link <id>` CLI.** Semantic linker is programmatic only.
- **No replay command.** Events are logged for audit; state is loaded
  from `state.json` directly, not reconstructed from the log.
- **No web UI / Visual DAG Studio.** Long-term roadmap item only.
