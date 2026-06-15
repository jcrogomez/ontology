# CLAUDE.md — orientation for AI agents working in this repo

This file is the entry point for an agent (Claude Code or otherwise)
picking up work here. Read it first, then the doc it points you to for
your task. Keep it accurate: if you change how the project is built,
tested, or organised, update this file in the same change.

## What this is

**Ontology** is a terminal-first system for versioning *intent*, not
just code. Intentions are typed nodes/edges in a `.ontology/` kernel; a
compiler walks that graph in topological order to emit artifacts
(the forward functor `F: Intent → Code`). **Project Legend** builds the
inverse — lifting existing code back into intent (`G`), with the
round-trip `F∘G ≈ id` measured empirically. See `README.md` for the
full pitch and `docs/design/inverse/PROJECT_LEGEND.md` for the design.

## Where to look (single-source-of-truth map)

| You want… | Read | Notes |
|---|---|---|
| **Current phase state + open work** | [`docs/ROADMAP.md`](docs/ROADMAP.md) | **The single source of truth.** Daily-review findings roll in here. Start here. |
| How literally a math claim holds | [`docs/MATHEMATICAL_CLAIMS.md`](docs/MATHEMATICAL_CLAIMS.md) | Every categorical term is graded **T1** (tested law) / **T2** (operational) / **T3** (analogy) / **T4** (aspirational). Read before asserting any "functor/topos/adjoint" claim. |
| The destination / *why* | [`docs/VISION.md`](docs/VISION.md) | The asymmetry thesis. Direction only; status lives in ROADMAP. |
| Component design (by F/G/laws role) | [`docs/design/README.md`](docs/design/README.md) | Index of the design docs, grouped **kernel / forward (F) / inverse (G) / laws / runtime / surfaces**. |
| Phase ε self-ingestion experiment record | [`docs/legend/calibrations/CALIBRATION_LOG.md`](docs/legend/calibrations/CALIBRATION_LOG.md) | Hand-rolled index of the calibration corpus. These are **dated, pre-registered records — historical, do not rewrite.** |
| Phase ζ workflow runtime | [`docs/design/runtime/WORKFLOW_RUNTIME_SPEC.md`](docs/design/runtime/WORKFLOW_RUNTIME_SPEC.md) | The `onto workflow run` verify-refine state machine, predicate DSL, artefact-slot dataflow. |
| The governed sync loop (`onto sync` / `onto status`) | [`docs/design/runtime/SYNC_LOOP.md`](docs/design/runtime/SYNC_LOOP.md) (how-to), [`docs/design/runtime/SYNC_LOOP_SPEC.md`](docs/design/runtime/SYNC_LOOP_SPEC.md) (contract + acceptance) | One command closes intent→code: regen + 3 gates + per-node re-anchor. Honest number in §8. |
| Per-commit detail | [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md) | |
| Onboarding / first run | [`README.md`](README.md), [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) | |
| CLI surface | [`docs/CLI_COMMANDS.md`](docs/CLI_COMMANDS.md) | |

## Build / test / run

```bash
npm run check        # tsc --noEmit (typecheck). Works on Node 18.
npm run check:nul    # NUL-byte guard. Works on Node 18.
npm run dev -- <cmd> # run the CLI via tsx, e.g. `npm run dev -- validate`. Node 18 OK.
npm run test:run     # vitest run — REQUIRES Node >= 20.12 (see below).
npm run test:smoke:ollama  # opt-in LIVE smoke vs local Ollama (skipped in CI/normal runs; run ~weekly)
```

**Node version is the #1 gotcha.** `package.json` `engines` requires
Node ≥ 20, and vitest's `rolldown` needs **≥ 20.12** specifically — on
older Node it aborts at startup with
`SyntaxError: ... does not provide an export named 'styleText'`.
`tsc`, the NUL guard, and the CLI (`tsx`) all work on Node 18, but the
**test suite does not**. If the default `node` is 18, run tests under a
20+ toolchain. On this machine Homebrew `node@23` is installed:

```bash
PATH="$(brew --prefix node@23)/bin:$PATH" npx vitest run            # full suite
PATH="$(brew --prefix node@23)/bin:$PATH" npx vitest run tests/X.test.ts   # one file
```

For quick logic checks without vitest, a throwaway `tsx` script works
on Node 18 (the codebase imports `.js` paths that `tsx` resolves from
the `.ts` sources).

## Conventions / ethos (do not violate)

- **Honest tiering.** Don't overclaim. Grade categorical claims T1–T4
  in `MATHEMATICAL_CLAIMS.md`; a test against a deterministic mock is
  not evidence about a real LLM. The project's credibility rests on not
  letting framing outrun what's actually verified.
- **Pre-registration.** Phase ε hypotheses are committed *before* runs
  so success criteria can't be retrofitted. Preserve that — never edit
  a `*_HYPOTHESIS.md` to match results.
- **Dated records are historical.** Calibration runs, synthesis
  reports, and release notes describe a point in time. **Correct living
  orientation docs; do not rewrite dated records** (it falsifies the
  audit trail).
- **Milestone-review snapshots are retired (2026-05-28).** Do NOT
  create `MILESTONE_REVIEW_<date>.md` files. Daily-review findings go
  into `docs/ROADMAP.md`.
- **Memory wikilinks.** A bare `[[some-slug]]` in docs often points to
  the user's *memory* notes, not a `docs/` file. It is NOT a dangling
  link just because it doesn't resolve under `docs/`.
- **Commits/pushes.** Only commit/push when the user asks. Verify with
  the full git state first; never amend or force-push without explicit
  instruction.

## Known gotchas

- **Full test suite is slow.** A complete `vitest run` of all ~144
  files takes many minutes on first run; whether any single test truly
  *hangs* vs. the suite just being slow is unconfirmed (see ROADMAP).
  Some tests (e.g. `tests/llm-dispatcher.test.ts:62`) dispatch to a
  **live local Ollama** with no fast-fail guard — if Ollama is running
  they can stall. Prefer running the targeted file(s) for your change.
- **Mock provider is the identity functor** for `code_sketch` (returns
  the prompt verbatim) — useful for deterministic tests.

## Repo layout (orientation)

```
src/                 grouped by role in F : Intent→Code, G : Code→Intent (see docs/RESTRUCTURE_PROPOSAL.md Part B)
  cli.ts             entry point + command registration (stays at root → dist/cli.js)
  kernel/            the category C of intent: core/ (nodes, edges, events, fs, integrity/hash),
                     schemas/ (Zod), graph/, semantic/, errors.ts
  forward/           F : Intent→Code — compile/ (the forward functor), context/ (presheaf
                     assembly + gluing), prompt/, templates/
  inverse/           G : Code→Intent — extraction: ast-symbol-scanner, ficha-quality,
                     intent-narration, structural-classifier, frontier-tagger, … + static/, ingest/
  laws/              F∘G≈id + extensions: verify-homeomorphism, matrix, behavior/contract
                     checkers, … + topos/ fibration/ effects/ query/
  runtime/           the live engines: llm/ (dispatcher, adapters, registry), workflow/ (Phase ζ)
  surfaces/          what a user/agent touches: commands/ (onto <verb>), walker/ (TUI), mcp/
tests/             vitest suites (mirror src/ loosely)
docs/              orientation at top level (ROADMAP, VISION, MATHEMATICAL_CLAIMS, CLI_COMMANDS, GETTING_STARTED)
  design/          component design grouped by role — kernel/ forward/(F) inverse/(G) laws/ runtime/ surfaces/; index in design/README.md
  meta/            contributor-facing (COMMENTING_GUIDE, POSITIONING, SELF_INGEST_RUNBOOK)
  legend/          Project Legend records: legend/calibrations/ = ε records (immutable), legend/prompts/, legend/architecture/
examples/          hello-world (compile demo), workflow-imo-verify-refine (Phase ζ demo)
```

## Phase state (volatile — `docs/ROADMAP.md` is authoritative)

Kept last on purpose: this is the only section that changes often, so
editing it does not invalidate the prompt cache for the stable rules
above. Do not move it up, and do not duplicate ROADMAP detail here.

- **Phases α–ε are closed; Phase ζ (the workflow runtime) is active.**
- **Naming gotcha:** "Phase ζ" in older docs sometimes meant "release +
  Open-Prompt seeds" (the original plan). The *active* ζ stream is the
  workflow runtime.
- For phase specifics, metrics, dates, and open work, trust
  `docs/ROADMAP.md` — that is the single source of truth.
