# Ontology

> **A typed, temporal, multidimensional graph that compiles intentions into running programs.**
> Models may speak. Only explicit graph commands may mutate the network.
> Code is the compiled shadow of a valid semantic network.

## What this is

Ontology is a terminal-first system for **versioning intent, not just code**. You write down *what you mean* as typed nodes and edges in a kernel-verified graph (`.ontology/`); a compiler walks that graph and emits the code. The reverse also works: `onto ingest` lifts an existing codebase back into the intent layer, and `onto verify-homeomorphism` measures how faithfully the round-trip survives.

The payoff: an Ontology session generates code you can **re-derive from a network you can read**. The intent is the durable artifact; the code is its compiled shadow. Every artifact traces back to the proposal that birthed it, the model run that drafted it, the context the model saw, and the hashes of the nodes and edges that authorised the compilation — an audit chain you can walk in either direction.

## See it in 60 seconds

**Prereqs:** Node ≥ 20 (the test suite needs ≥ 20.12); `python3` optional for the demo's final step.

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

The demo runs **offline** (the mock provider). Read [`examples/hello-world/README.md`](examples/hello-world/README.md) for the walkthrough, then [Getting Started](docs/GETTING_STARTED.md) for the hands-on tour.

## Install

- **Inside the repo (development):** `npm install`, then `npm run dev -- <command>` (or `npm run build && node dist/cli.js <command>`).
- **As a global `onto` binary, straight from git:** `npm install -g github:jcrogomez/ontology` — the `prepare` script builds on install and exposes `onto` on your PATH.
- **From npm:** the package is staged as `@jcrogomez/ontology` (the bare `ontology` name on npm belongs to an unrelated, abandoned package); publication is pending the first non-rc release.

## Why this matters

Two pains every team using LLM-assisted development feels today:

1. **Bandwidth gap.** A session produces more code than a human can review with care. With the intent as the source of truth (`onto compile run`), a session's diff is a small intent change, not a sprawl of generated files.
2. **Adoption wall.** Intent-first workflows usually only work on greenfield projects. `onto ingest <path>` lifts existing source into the intent layer, so the workflow applies to any codebase.

Longer term, the **Open-Prompt protocol** turns the signed intent + audit chain into a trust-transparency layer between fully open-source and proprietary self-attestation: an organisation publishes its *intent* and lets third parties verify the running code respects it, without exposing the implementation. The read-only half (`onto mcp`) already ships; signing/replay are roadmap.

## What you actually get

| Verb | What it does |
| --- | --- |
| `onto init` | Create a fresh `.ontology/` kernel; `--template <name>` seeds a starter graph. |
| `onto node create / update / remove / link` | Author typed nodes and edges; refinement edges enforce the abstraction poset. |
| `onto context assemble` | Compute a node's local context (parent path + edge neighbours). |
| `onto run prompt / context` | Dispatch to a model; `--persist` records the run; `--as-proposal` stages the output. |
| `onto runs list / show / verify` | Audit content-addressed run records. |
| `onto propose node / link`, `onto proposal …` | Stage and lifecycle typed candidate mutations; `apply` re-validates hashes and can gate on the provider sheaf check (`--check-providers`, `--strict`). |
| `onto compile plan / run / run-batch` | The forward direction: walk the topological plan and emit artifacts (multi-provider routing, `--branch` fiber scoping, `--target` pinned paths). |
| `onto ingest <paths…>` | The inverse direction: lift source files, a directory, a GitHub PR/issue, or the *why* of files (`--intent`) into intent proposals. |
| `onto graph infer-edges / neighbors / path / subgraph / metrics` | Static edge inference (no LLM) and read-only graph queries. |
| `onto verify-homeomorphism` | Measure the round-trip: dual distances, five-label verdict, fidelity-cartography matrix, behaviour checker. |
| `onto drift` | Merkle change-detection over compiled artifacts; `--update` re-anchors the baseline, `--fail-on-drift` gates CI; feeds `verify-homeomorphism --nodes`. |
| `onto regenerate` | Re-derive a node's code from its intent with the in-machinery levers: `--behavior-check`, `--draws N` (consensus), `--refine N` (verify-refine), `--decompose`; writes only behind the gates. |
| `onto probe` / `onto rules` / `onto ficha` | Generate a self-validated behaviour fixture (`probe`); check/triage declared rules (`rules`); audit + deterministically reconcile a node's contract (`ficha audit` / `ficha cleanup --apply --prune`). |
| `onto sync` / `onto status` | The one-step governed loop (`sync`: regen + 3 gates + re-anchor, write-or-refuse) and read-only graph health (`status`; `--blockers` = the dependency-order syncable *ideal* + fix-first blocker *antichain*). |
| `onto execute` | The governed **executor**: closes a node + its closure by refine/decompose/**escalate** up a model capability ladder, writes only behind green gates, and reports each node honestly (closed / extraction-gap / capacity-ceiling / blocked-upstream / unverified). |
| `onto workflow run` | Verify-refine state machine over a typed workflow graph; `--as-proposal` feeds accepted results back into the intent graph (create or `--update-node`). |
| `onto bakeoff <reports…>` | Fidelity regression gate over recorded verify reports (wired into CI). |
| `onto query` | Search nodes by Hom-profile (edges + contract + coordinates); `--semantic <text>` adds embedding re-rank (hybrid retrieval). |
| `onto semantic index / links` | Local embedding index over intent text; `links` ranks similar-but-unlinked node pairs, `--propose --type` stages governed `edge_create` proposals. |
| `onto mcp` | Read-only MCP server over the intent graph + audit chain — a third party can judge the declared intent without mutation access. |
| `onto walk <id>` | The Walker: interactive TUI — navigate, draft, propose (create or in-place update), review proposals, run models, compile, verify the focal's round-trip, run workflows. |
| `onto replay` | Rebuild the state summary from the event log alone, verify chain integrity, `--write` to repair. |
| `onto validate / inspect / doctor / events tail / model doctor` | Observability and health checks. |

Every command and flag is documented in [docs/CLI_COMMANDS.md](docs/CLI_COMMANDS.md) (with a task-oriented index at the top).

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
mutation (node_created / edge_created / node_updated event)
   ↓
compilation (topological plan run, model dispatch, artifact written)
   ↓
file on disk (auditable: artifact → event → run → prompt hash → node)
```

Every step is recorded in the append-only `events.jsonl`; every artifact ties back to a `compilation_run` event; the chain is auditable in either direction (`onto runs verify`, `onto events tail`) and **replayable**: `onto replay` rebuilds the state summary from the log alone, verifies chain integrity, and `--write` repairs a diverged `state.json`.

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

## The math, honestly

In one line, the compiler implements a structure-preserving functor

$$F\colon \text{Intent} \longrightarrow \text{Code}$$

with a semantic gate ($\text{validateIntent} \to \Omega$, a three-valued predicate algebra) that refuses to emit an artifact whose declared contract is violated. The inverse lift is [Project Legend](docs/design/inverse/PROJECT_LEGEND.md): an operational adjunction $G \dashv F$ ($G$ the ingest lift, left adjoint), with the round-trip $F \circ G \approx \mathrm{id}$ **measured empirically** — per-axis distances and tolerances on a fidelity matrix, against pre-registered falsifiers, not asserted.

**Every load-bearing term in this README** — "functor", "presheaf", "Yoneda", "topos", "fibration", "adjoint" — is graded in [`MATHEMATICAL_CLAIMS.md`](docs/MATHEMATICAL_CLAIMS.md): **T1** (a law pinned by tests), **T2** (operational, no law test), **T3** (useful analogy), or **T4** (aspirational). Some of the most useful entries are *negative* results stated plainly: the default context gluing is a separated presheaf, **not** a sheaf (the opt-in `identify-if-equal` mode is the signature-sheaf gluing on the standard site — equal-signature-on-overlaps is the *matching* condition, not a sub-coverage; the site is a genuine Grothendieck coverage, T1 — [`GLUING_SITE_THEOREM.md`](docs/design/laws/GLUING_SITE_THEOREM.md)); the Ω algebra is Kleene, **not** a Heyting/topos implication; and $G$ is irreducibly probabilistic, so the adjunction is graded T2 with a measurement program, not claimed as a theorem. The intent is to neither hide the mathematical content nor oversell it.

## Where to go next

**First-time visitors:**

- [**Getting Started**](docs/GETTING_STARTED.md) — `init` to `compile` in 5 minutes.
- [**Hello World example**](examples/hello-world/README.md) — the canonical demonstration.

**The design:**

- [**The Canon**](docs/design/kernel/ONTOLOGY_CANON.md) — the foundational definition.
- [**The Mathematical Model**](docs/design/laws/MATHEMATICAL_MODEL.md) — the seven axioms.
- [**The Categorical Vision**](docs/design/laws/CATEGORICAL_VISION.md) — the nine-concept map onto concrete modules.
- [**Mathematical Claims — Audit & Map**](docs/MATHEMATICAL_CLAIMS.md) — the rigor ledger (read alongside the two above).
- [**The Architecture**](docs/design/ARCHITECTURE.md) — how Kernel, LLM Runtime, Context Assembler, Proposal System, and Compiler relate.
- [**The Compiler**](docs/design/forward/COMPILER.md) and [**The Walker**](docs/design/surfaces/WALKER_INTERFACE.md).

**The four categorical extensions:** [Yoneda Query](docs/design/laws/QUERY_REPRESENTABLE.md) · [Effect Monad](docs/design/laws/EFFECT_MONAD.md) · [Branch Fibration](docs/design/laws/BRANCH_FIBRATION.md) · [Rules as Topos](docs/design/laws/RULES_TOPOS.md).

**Project Legend** (the inverse direction):

- [**Project Legend**](docs/design/inverse/PROJECT_LEGEND.md) — design doc + phase plan. Phases α–ε closed (self-ingestion of this repo, 4-arm bake-off, fidelity matrix); **Phase ζ (the workflow runtime) is active** — see the [workflow runtime spec](docs/design/runtime/WORKFLOW_RUNTIME_SPEC.md).
- [**Calibration log**](docs/legend/calibrations/CALIBRATION_LOG.md) — the dated, pre-registered experiment record (hypotheses committed *before* runs).
- [**Open-Prompt protocol spec**](docs/design/proposals/OPEN_PROMPT.md) — signed intent + audit-chain replay as a third trust posture. Spec-only; the `onto mcp` read surface is its first tangible slice.
- [**Branch Model**](docs/design/proposals/BRANCH_MODEL.md) — the Option-C design decision gating cross-branch propagation.

**Contributing / current state:**

- [**Roadmap**](docs/ROADMAP.md) — **the single source of truth** for phase state and open work.
- [**Release Notes**](docs/RELEASE_NOTES.md) — the running changelog; [**LEGEND**](docs/design/inverse/LEGEND.md) — the 0.4.0 release write-up (historical snapshot).
- [**Design docs index**](docs/design/README.md) — every component design grouped by role: **kernel** (the category **C**), **forward** (F), **inverse** (G), **laws** (F∘G≈id), **runtime**, **surfaces**.

## Status

**Alpha.** Project Legend phases α–ε are closed; Phase ζ is active — the workflow
runtime AND the governed **dynamic-agent executor**. In one breath:

- **Both directions are operational** — F (compile) and G (ingest) — and the round-trip is *measured*: AST grounding contributes Δ = +0.355 mean structural Jaccard over an ablation control on this repo's 125-file core; the fidelity matrix fills 3 of 5 columns (structural + behaviour + contract), the rest are explicit no-data.
- **The dynamic half exists** — `onto execute` closes a node by refining/decomposing/escalating a model capability ladder, writing only behind green gates and flagging *extraction-gap* (intent too thin) vs *capacity-ceiling* honestly. Child-process draft isolation, an order-ideal readiness view (`onto status --blockers`), and the κ\* capability barometer ship with it. The trustworthy core (shadow + fixture + clean rules) is **136 / 221** nodes.
- **The kernel's mathematical claims are test-pinned where it matters** — 14 T1 laws (crash-atomic durable event log, presheaf restriction, signature-sheaf gluing on the standard Grothendieck site, compiler functoriality, monad laws, Ω closed-world parity, content-addressed runs, the syncable order ideal, …).
- **Durability:** `state.json` writes are atomic + durable, `events.jsonl` appends are durable; the advisory lock covers the long-running mutators only (quick mutations rely on per-write atomicity — worst case last-writer-wins, never corruption).
- **Not yet:** the *measured* executor close-rate sweep over a calibrated sample (the number that gates building the meta-agent "Architect"); a clean real-LLM pass of the ζ verify-refine loop; the signing half of Open-Prompt.

Live phase state, metrics, dates and open work: [**ROADMAP.md**](docs/ROADMAP.md). Everything is meant to fail loudly and exit `1` rather than silently corrupt.
