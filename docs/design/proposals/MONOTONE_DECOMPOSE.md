# Monotone decompose (`--keep-slices`) — passing work is kept

**Status:** shipped 2026-07-07 (same-day build; this doc is the design
record). Code: `src/forward/compile/slice-keep.ts` (pure),
`decompose-plan.ts` (scaffold chunking), `regenerate.ts` (round wiring),
executor `decompose` lever composes it. Tests: `tests/slice-keep.test.ts`
(13) + existing decompose/refine/CLI suites green.

## 1. External signal

TestSprite CLI (open-sourced 2026-06-11, Apache 2.0): an agent-invocable
verifier whose failure reports carry the failing step + likely root cause +
suggested fix, and where **passing tests are kept, so coverage grows with
the build** — their users report AI code going ~42% → ~93% pass in one
verified iteration. The reported-failure half of that loop already existed
here (`refine-feedback.ts` feeds per-criterion draft-side diagnostics back,
from DETERMINISTIC gates — stronger than an LLM judge). The missing half
was monotonicity: every refine round re-rolled the WHOLE module, so a
28/31-cases draw was discarded entirely and the next draw started from
zero. High-variance local models never converge under that regime on large
modules.

## 2. What shipped

Two changes, both measured against the Gap-2 `node_0032` failure
(`docs/ROADMAP.md` §Gap 2, the fix-first antichain node gating 5 others):

1. **Scaffold chunking** (`planDecomposition`). Root cause found while
   designing this: a declaration-only module (the Zod schema core — 60+
   exported consts, no exported functions) folded into ONE scaffold slice,
   so "decomposition" degenerated to a whole-file regen. Scaffolds larger
   than `SCAFFOLD_CHUNK_SIZE` (8) now split into ordered chunks; source
   order is preserved, which in declaration modules IS the dependency
   order, and the existing priorCode chain lets later chunks reference
   earlier ones.

2. **Keep-slices** (`--keep-slices`, composes with `--decompose --refine
   N`). Between rounds, slices that no failure implicates are FROZEN —
   reused verbatim, zero dispatch — and only implicated slices regenerate.
   Attribution is deterministic (`slice-keep.ts`, pure): a failing
   behaviour case implicates the slices owning the identifiers its fixture
   text references; a missing export implicates its plan owner; an extra
   export implicates the slice whose emitted code declares it; a lint
   symbol implicates its owner. **Conservative by construction:** any
   failure that cannot be attributed unfreezes everything (falls back to
   the old regenerate-all), because freezing a broken slice is the
   dangerous direction. Attribution recomputes per round, so a frozen
   slice that a NEW failure implicates thaws.

The executor's `decompose` lever now dispatches with
`refine + keepSlices: true` — the lever the policy pulls at the ceiling is
the monotone loop, not a one-shot slice-and-assemble.

## 3. Why this can close full extraction on large modules

The recall-bound failure mode (ROADMAP: "22 large multi-export modules
collapse into truncated stubs") is a *joint* probability problem: one draw
must get ~N declarations right simultaneously, and P(all N)^round never
improves because rounds are independent. Keep-slices changes the algebra:
with slices of ≤8 declarations, each round only re-rolls the failed
slices, so per-slice success compounds instead of resetting —
convergence in a few rounds becomes plausible exactly where whole-module
draws were hopeless. The enriched ficha (exact enum values / defaults —
the G-repair half) supplies the per-slice ground truth; keep-slices
supplies the accumulation.

## 4. Honest limits (graded)

- Attribution correctness (keep-set arithmetic, conservative fallbacks):
  **T1** — `tests/slice-keep.test.ts`.
- "Keep-slices converges where whole-module fails": **T2 — MEASURED
  2026-07-08.** `node_0032` (72 declarations, the recall-bound canonical
  failure) converged: behaviour pass 30/30, Jaccard 1.0, 2 refine rounds,
  cloud-free rung, $0. The round-by-round ledger (each round eliminating
  exactly one defect class, including one error in the human-enriched
  intent) is in `docs/ROADMAP.md` §Gap 2.
- A kept slice generated against an OLD sibling can interact badly after
  the sibling regenerates; the whole-module gates still judge every round
  (no unsound write), and per-round re-attribution self-corrects, but
  convergence under heavy cross-slice coupling is unproven: **T3**.
- The 42%→93% TestSprite figure is their product's claim on their
  workflloads, cited as motivation only: **T4/external**.
