# RESTRUCTURE PROPOSAL — docs + source, grounded in the F/G/laws structure

> **Status (2026-06-15): Part A (docs) and Part B (source) BOTH EXECUTED.**
> Part B collapsed `src/` into the six role buckets — `kernel/ forward/
> inverse/ laws/ runtime/ surfaces/` (+ `cli.ts`) — in per-bucket commits,
> each tsc-green; ~860 relative import specifiers across src + tests
> recomputed by an extension-agnostic resolver; the `runtime/legend/` split
> (the one judgement call) sent 9 extraction files → `inverse/`, 16
> verification files → `laws/`; `errors.ts` → `kernel/`. The path-heuristic
> instruments coupled to the old layout (`frontier-tagger.ts`,
> `structural-classifier.ts`) were **augmented, not replaced** — their rules
> now match BOTH the conventional layout (so external-project ingest +
> `examples/legend-fixture/` still work) AND the new self-layout (so the
> Phase-ε self-perimeter coverage holds). The dated `SELF_INGEST_HYPOTHESIS
> §6` record is untouched; a re-ingest reconciles the live `.ontology` graph
> against the new tree (run separately). CLI help-text pointers,
> `scripts/bakeoff.sh`, the CLAUDE.md repo-layout tree and this doc's
> ARCHITECTURE module map were realigned.
>
> *(A first Part-B attempt was reverted when a naive "repoint rules at the
> new buckets" broke the general/conventional tagger; the augment approach
> above is the fix.)*
>
> **Original Part A status:** the 32 design docs were `git mv`'d into
> `docs/design/{kernel,forward,inverse,laws,runtime,surfaces}/` +
> `docs/meta/`, every relative link in the living docs + the `docs/…`
> pointers in `src/**.ts` comments were rewritten, and `docs/design/README.md`
> is the new grouped index. `tsc` + NUL guard green (one **pre-existing,
> unrelated** NUL in `src/runtime/compile/rules-grounding.ts` predates this
> work). Three corrections to the original plan: `PAPER_DRAFT.md` does not
> exist (skipped); `CHANGELOG.md` lives at repo root, not `docs/` (left in
> place); `BRANCH_MODEL.md` (unclassified in the plan) went to `runtime/`
> per its own "runtime consequences" framing. **Accepted cost:** 12 links
> *inside* dated immutable records (`RELEASE_NOTES.md`, `docs/archive/**`,
> one calibration, one prompt, `CHANGELOG.md`) now dangle to moved docs and
> were left untouched per the no-rewrite convention.
>
> Part B (source-folder moves) rewrites 200+ import paths and must be done
> on a branch with the full test suite green (vitest needs Node ≥ 20.12 on
> the Mac — it cannot run in the agent sandbox). Nothing here touches the
> **dated audit trail** (`docs/legend/calibrations/**`, `*_HYPOTHESIS.md`,
> `*_RESULT.md`, `RELEASE_NOTES.md`, `docs/archive/**`): per the project's
> own convention those are historical records and must not be rewritten.

## The organising principle

Today the layout is *chronological / by-phase* (α, β, … ζ, "legend",
"topos") — it records the order things were built. The proposal is to make
it *structural / by-role in the mathematics*: the whole system is the
diagram **`F : Intent → Code`, `G : Code → Intent`, `F∘G ≈ id`**, so the
top-level folders and the doc tiers should name exactly those roles. A
newcomer (human or agent) should be able to point at any folder and say
which part of that diagram it implements.

---

## Part A — Documentation information architecture

There are 95 markdown files. The problem is not the count — it is that
orientation docs, design specs, math, and dated records all sit flat in
`docs/`, so "where do I start" has no answer. Proposal: **four explicit
tiers**, by role.

### Tier 1 — Orientation (read first, kept current)

A newcomer reads only these. They are living docs.

| Doc | Role |
|---|---|
| `README.md` | The pitch + first run. |
| `docs/VISION.md` | **New.** The *why* / destination (the asymmetry thesis). |
| `docs/ROADMAP.md` | **Single source of truth** for open work. |
| `docs/GETTING_STARTED.md` | First run / onboarding. |
| `docs/CLI_COMMANDS.md` | The `onto <verb>` surface. |
| `docs/MATHEMATICAL_CLAIMS.md` | The honest T1–T4 ledger. |

**Action:** add a short "Start here" index at the top of `README.md`
pointing at exactly this tier, in this order. `CLAUDE.md`'s "Where to
look" table already does this for agents — align the two.

### Tier 2 — Design (the architecture, by F/G/laws role)

Group the component design docs under the same three headings the source
will use, so doc and code mirror each other:

- **Kernel (the category of intent):** `ONTOLOGY_CANON.md`,
  `PROPOSAL_SYSTEM.md`, `RUN_PERSISTENCE.md`, `SEMANTIC_INDEX.md`.
- **F — forward (Intent→Code):** `COMPILER.md`, `CONTEXT_ASSEMBLER.md`,
  `MODEL_RUNTIME.md`, `PROMPT_GENERATORS.md`.
- **G — inverse (Code→Intent):** `PROJECT_LEGEND.md`, `LEGEND.md`,
  `DRIFT.md`, `legend/INTENT_NARRATION_SPEC.md`,
  `legend/CONTRACT_AXIS_CHECKER_SPEC.md`,
  `legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md`.
- **Laws / categorical extensions:** `MATHEMATICAL_MODEL.md`,
  `CATEGORICAL_VISION.md`, `RULES_TOPOS.md`, `BRANCH_FIBRATION.md`,
  `EFFECT_MONAD.md`, `QUERY_REPRESENTABLE.md`,
  `legend/CONTEXT_GLUING_REGIMES.md`.
- **Runtime / workflow (ζ):** `legend/WORKFLOW_RUNTIME_SPEC.md`,
  `SYNC_LOOP.md`, `SYNC_LOOP_SPEC.md`, `WAKEUP_SCANNERS.md`.
- **Surfaces:** `WALKER_INTERFACE.md`, `OPEN_PROMPT.md`.

**Action (low-risk):** move these into `docs/design/{kernel,forward,
inverse,laws,runtime,surfaces}/`. Markdown moves only break relative
links, which are easy to grep and fix — no code impact. `ARCHITECTURE.md`
becomes the index page of `docs/design/`.

### Tier 3 — Dated records (historical, immutable)

`docs/legend/calibrations/**`, every `*_HYPOTHESIS.md` / `*_RESULT.md` /
`*_SYNTHESIS.md`, `RELEASE_NOTES.md`, `CHANGELOG.md`, `docs/archive/**`.
**Do not move or rewrite.** Optionally add a single `INDEX.md` at the
calibrations root (one already exists for the raw bakeoff) — additive only.

### Tier 4 — Meta (contributor-facing)

`COMMENTING_GUIDE.md`, `POSITIONING.md`, `PAPER_DRAFT.md`,
`SELF_INGEST_RUNBOOK.md`, `CLAUDE.md`. Move under `docs/meta/` (except
`CLAUDE.md`, which stays at repo root where agents expect it).

**Net doc effect:** flat 95 → four legible tiers; a newcomer's path is
README → VISION → ROADMAP, and every design doc sits under the F/G/laws
heading it belongs to.

---

## Part B — Source folder reorganisation

### The reframe

Current `src/runtime/` has grown **16 sibling subdirectories** with no
visible grouping — `compile`, `legend`, `context`, `topos`, `fibration`,
`effects`, `query`, `llm`, `static`, `workflow`, `graph`, `ingest`,
`prompt`, `semantic`, `templates`, `mcp`. The phase names ("legend",
"topos") tell you *when* code was added, not *what role* it plays. The
proposal collapses this into the same six structural buckets as the docs.

### Proposed top-level (`src/`)

| Proposed | Implements | Absorbs (current) |
|---|---|---|
| `kernel/` | The category **C** of intent: objects, morphisms, event log, hashing, replay, proposals. | `core/`, `schemas/`, `runtime/graph/`, `runtime/semantic/` |
| `forward/` | **F : Intent → Code** — the compiler + context it consumes. | `runtime/compile/`, `runtime/context/`, `runtime/prompt/`, `runtime/templates/` |
| `inverse/` | **G : Code → Intent** — extraction, static analysis, ingest. | `runtime/legend/` (extraction half), `runtime/static/`, `runtime/ingest/` |
| `laws/` | **F∘G ≈ id** + the categorical extensions (the verified structure). | `runtime/legend/` (verify/lens/contract/behaviour half), `runtime/topos/`, `runtime/fibration/`, `runtime/effects/`, `runtime/query/` |
| `runtime/` | The ζ workflow machine + LLM dispatch (the live engines). | `runtime/workflow/`, `runtime/llm/` |
| `surfaces/` | Everything a user/agent touches. | `commands/`, `walker/`, `runtime/mcp/` |

The diagram becomes legible in the file tree itself:
`kernel` is **C**; `forward` is **F**; `inverse` is **G**; `laws` is the
proof that `F∘G ≈ id`; `runtime` runs the loop; `surfaces` is the cabin.

### The one real judgement call

`runtime/legend/` (25 files) currently mixes **G** (extraction:
`export-recovery`, `ast-symbol-scanner`, ingest helpers) with **laws**
(`verify-homeomorphism`, lens laws, `contract-checker`, `verdict-variance`,
`ficha-quality`). The proposal **splits it**: extraction → `inverse/`,
verification → `laws/`. This is the highest-value clarity gain *and* the
move most likely to surface hidden coupling. Do it as its own commit, with
the suite green before and after.

### Migration recipe (per move, on a branch)

1. `git mv` the directory (preserves history).
2. Rewrite import specifiers — the codebase uses explicit `.js` ESM paths,
   so a scripted find-replace of the old prefix → new prefix is mechanical
   and total (no implicit resolution to miss).
3. `npm run check` (tsc) — catches every broken path immediately.
4. `npm run check:nul`, then the full suite on Node ≥ 20.12.
5. One structural bucket per commit (`kernel`, then `forward`, …), never
   all at once — so a regression bisects to a single bucket.

### Honest cost / benefit

- **Cost:** ~200+ import-path rewrites, a churned `git blame` at the
  directory level (mitigated by `git mv` + per-bucket commits), and one
  genuinely fiddly split (`legend` → `inverse`/`laws`).
- **Benefit:** the folder tree *teaches the mathematics*. For a project
  whose entire pitch is "intention is a legible, auditable surface," a
  source tree that itself reads as `C, F, G, F∘G` is not cosmetic — it is
  the thesis applied to its own code. It also makes the ROADMAP's "G is
  the binding constraint" finding physically locatable: it lives in
  `inverse/`.

### Recommended sequencing

Do **Part A (docs)** first — it is reversible and code-free, and it
establishes the six-bucket vocabulary. Then do **Part B** one bucket at a
time, starting with the cheap, unambiguous ones (`kernel`, `forward`,
`surfaces`) and ending with the `legend` split. None of this is urgent
relative to the ROADMAP's step-1 (audit-surface accuracy); schedule it as
deliberate hygiene, not a blocker.

---

*Proposal authored as part of the vision realignment. Execute on a branch;
keep the dated audit trail untouched; let `ROADMAP.md` remain the source of
truth for what is actually in flight.*
