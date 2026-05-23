# Ontology Milestone Review — 2026-05-23

> *Automated run of the `ontology-pr-suggestions` scheduled task. **The situation has flipped since the last four reviews.** Where 05-19 → 05-22 reported a static HEAD (`867ce58`) and a stalled experiment, the working tree today shows a **10-commit burst** (all landed 05-22) that closed the two highest-leverage backlog items, plus an in-progress `--reps`/`--aggregator` feature in the working tree. HEAD is now `ab76a18`. `tsc --noEmit` is **clean** (exit 0, verified today). Test files grew **109 → 118**. `git pull` is still proxy-blocked from the sandbox (`HTTP 403 from proxy after CONNECT`) — but it is also **moot**: local `main` is **0 behind / 10 ahead** of `origin/main`, so the sync owed is a `git push`, not a pull (§0). Vitest still cannot run in this sandbox (rolldown/esbuild arm64 binding absent on Linux x64 — infra constraint, not a regression); all verification below is `tsc` + direct code reads.*

---

## 0. ⚠️ Actions the sandbox could not take — please run locally

1. **`git push`, not `git pull`.** Local `main` is **10 commits ahead and 0 behind** `origin/main` (last-known sync point). There is nothing upstream to pull; what is owed is a push of the 05-22 burst once the working tree is committed:
   ```sh
   cd ~/Development/ontology
   rm -f .git/index.lock      # see #2 below
   git push origin main
   ```
   (The sandbox cannot reach GitHub to do this — `origin` is private and the proxy 403s all github.com traffic.)

2. **A stale `.git/index.lock` is present again** (0-byte, created by this run's git probing; the `.git` mount is read-only here so it could not be unlinked — git even logged `unable to unlink … index.lock: Operation not permitted`). It will block your next `git add` / `commit` / `push` with *"Unable to create '.git/index.lock': File exists."* Clear it first:
   ```sh
   rm -f ~/Development/ontology/.git/index.lock
   ```
   Safe to delete as long as no other git process is running — it is empty and stale. (This is the fourth review in a row to surface this same sandbox artifact; it is harmless but recurring.)

Everything below is the substantive review against the **local** working tree, which is fully present and verified.

---

## 1. Situational summary — the static streak broke, hard

The three-day stall the prior reviews kept escalating is **over**. Between the 05-22 review being written and now, the operator landed a **10-commit catch-up burst** (`8e11d41 … ab76a18`, all dated 2026-05-22) and is mid-flight on an eleventh change. The two items flagged "🔴 HIGH, still not started after N days" in three consecutive reviews are now **built and committed**:

- **Move 2 / §5.1 — `bakeoff-synthesis.ts`** (the deterministic, no-LLM cross-arm reducer): committed in `ddfe266`, 27.5 KB, with `tests/bakeoff-synthesis.test.ts`. This was the #1/#2 recommendation in two reviews. **Closed.**
- **Bug §3.2 + design §4.4 — `homeomorphism_verified` event payload**: committed in `00b8100`. Confirmed by reading `git show 00b8100`: the event now carries `model: dominantDispatchModel(...)` (line 406) and `perimeterHash: computePerimeterHash(...)` (line 407). The audit chain is replayable from `events.jsonl` alone. **Closed.**

Plus a wave of new graph/legend feature work (metrics, hierarchize, edges preview, structural-readiness gate, materialize-edges harness, openWorld gluing relaxation, assembleContext dispatch prompt). The momentum-risk thread (§3.9 in prior reviews) is **retired** — it no longer applies.

The new spotlight is therefore on the **uncommitted work**, and that is where this review spends most of its attention, because it contains one real correctness bug that should be fixed *before* the feature is committed.

---

## 2. Verified state on HEAD `ab76a18` (today, by direct inspection)

| Signal | Result | How verified |
|---|---|---|
| `tsc --noEmit` | ✅ clean (exit 0) | ran today |
| HEAD | `ab76a18` (was `867ce58` for 3 days) | `git log` |
| Commits since 05-19 | **10**, all dated 05-22 | `git log --since=2026-05-19` |
| `origin/main` sync | **10 ahead, 0 behind** — owes a *push* | `git rev-list --left-right --count` |
| Test files | **118** `.test.ts` (was 109) | `ls tests/*.test.ts \| wc -l` |
| `bakeoff-synthesis.ts` (Move 2) | ✅ present + test (committed `ddfe266`) | `ls`, `git show` |
| event payload model+perimeterHash (3.2/4.4) | ✅ in HEAD (`00b8100`) | `git show 00b8100` |
| Working tree | 4 modified + 2 untracked (the `--reps` feature) | `git status -s` |
| `--reps` / `--aggregator` CLI flags | wired at `src/cli.ts:946-947` | `git diff` |
| `reps-aggregator.ts` | new, 289 lines, pure reducer | direct read |
| `tests/reps-aggregator.test.ts` | new, 304 lines, pure unit | direct read |
| Stale `.git/index.lock` | ⚠️ present (sandbox artifact) | `ls .git/` |

No drift, no regression, and — for the first time in four reviews — substantial forward motion.

---

## 3. 🔴 Headline finding — `--reps N` is inert as currently wired

This is the most important thing in this review and it is a genuine correctness bug, caught before the feature is committed.

**What the feature is for.** The new `--reps N` / `--aggregator <median|mean>` option (design item §4.2) exists to defang the single-draw Jaccard variance γ surfaced (structural Jaccard `1.0` on one draw, `0.0` on the next for the same node). The intent: run each node's compile-back N times, fold the per-rep metrics under the median, and classify the verdict from the robust aggregate — *before* the Opus 4.7 ceiling probe spends money on a non-robust signal.

**Why it does not work as wired.** The multi-rep loop in `src/commands/verify/homeomorphism.ts` calls `verifyOne(c, {...})` N times with **byte-identical options**. `verifyOne` → `runCompilePlan` → `compileNode`, and `compileNode`'s cache check (`checkCacheE` in `src/runtime/compile/compile-node.ts`) computes

```
expectedId = computeRunId(prelude.runInput, prelude.runModel)
```

`computeRunId` (in `src/core/runs/persist.ts:42`) is a **pure deterministic hash** of `(runInput, runModel)` — no nonce, no timestamp, no rep index. So:

- **Rep 1** → cache miss → real dispatch → persists a run under `expectedId`.
- **Reps 2..N** → identical inputs → identical `expectedId` → `loadPersistedRun` finds rep 1's record → **cache hit, "dispatch: skipped", returns rep 1's exact text.**

Critically, `force: true` (which `verifyOne` does pass) only flows to `writeArtifactPending` — it overwrites the *output file*; it does **not** bypass `checkCacheE`. There is no `force`-gated branch around the cache lookup.

**Consequence.** All N reps are byte-identical. `aggregateRepResults` then folds N copies of the same value — `median([x,x,x]) = x`. The variance it was built to defang **cannot appear**, because reps 2..N never re-dispatch. Two downstream falsehoods follow:

1. The verdict at `--reps 5` equals the verdict at `--reps 1`. The feature is a no-op for its stated purpose.
2. The option's own help text claims *"Spend scales linearly with reps."* Under the current cache behavior spend is **~1×**, not N× — reps 2..N are free cache hits. The cost model in the docstring is also wrong.

**Why the green unit tests don't catch it.** `tests/reps-aggregator.test.ts` is explicitly pure ("no LLM, no IO") and feeds the reducer hand-built results with *distinct* metrics (e.g. Jaccard 1.0 and 0.0). It correctly verifies the reducer math — but in production the cache makes all reps identical *before* they ever reach `aggregateRepResults`. The bug lives entirely in the integration, which no test exercises.

**Recommended fix (mirror the existing `astGrounding` pattern).** `--ast-grounding` already "folds the grounding identity into the run-cache contextHash so grounded and un-grounded runs cache distinctly." Do the same for reps: fold a **per-rep nonce / rep-index into the run identity** so each rep gets a distinct deterministic `runId`. That yields genuinely fresh dispatches *and* a clean audit trail of N persisted runs (rather than one record overwritten N times, which a naive cache-bypass would cause since `expectedId` would collide). Combined with the provider's existing non-zero sampling temperature (the source of the γ variance), distinct cache keys will surface real draw-to-draw spread. **Land this before committing the feature, and before any Opus 4.7 ceiling probe** — the probe is the whole reason `--reps` exists, and a non-functional `--reps` would silently give it a false sense of robustness.

**Effort:** ~1–2 h for the nonce + threading; add a small integration test asserting that a `--reps 3` run produces ≥2 distinct persisted `runId`s (or that `perRepMetrics` are not all identical when the provider is non-deterministic).

---

## 4. Smaller findings on the new code (fix while it's still uncommitted)

**4.1 🟡 `--aggregator` value is not validated.** `aggregator = options.aggregator ?? "median"`, and `pick()` only checks `aggregator === "median" ? median : mean`. So `--aggregator banana` silently falls through to **mean** — not the documented `median` default, and no error. Validate against `{"median","mean"}` at the CLI boundary (error or coerce-to-median). ~15 min.

**4.2 🟡 Even rep counts produce a synthetic midpoint.** For even N the median is `(mid-1 + mid)/2` — i.e. `median === mean`, and for the γ case `median([0.0, 1.0]) = 0.5`, a value **no real draw produced**. The "median is a robust real draw" intuition only holds for **odd N ≥ 3**. Since `--reps 2` is the cheapest thing a user will reach for first, it is also the most misleading. Recommend: warn (or round toward the nearer real draw) on even N, and document odd-N as the intended use. Note this interacts with §3 — even after the cache fix, `reps=2` remains a weak default.

**4.3 🟢 Minor doc/impl drift (cosmetic).**
- `RepsTelemetry.successCount` doc says "ok=true", but the impl counts `ok && !!metrics`. In practice `verifyOne` always sets `metrics` when `ok` (so it's consistent today), but the wording should match.
- `aggregateDistanceMetrics` returns an aggregated (rounded) `regenLineCount` alongside a `regenDeclarations` taken from a single closest-Jaccard rep, so `regenDeclarations.length` need not equal `regenLineCount`. This is documented and defensible (the comment explains the "real draw, not a chimera" choice) — flag only so a future reader doesn't treat it as a bug.

**4.4 ✅ Strengths worth recording.** The reducer is genuinely well-built: pure / no-IO, thorough edge-case handling (empty → throws, all-unrecoverable cohort, mixed cohort), full per-rep telemetry preserved for the JSON report, robust CLI int-parse (`NaN` / negative / `0` all clamp to 1 via `Math.max(1, …)`), and audit-diff-friendly conditional event fields (`reps`/`aggregator` only added when `reps > 1`). The single defect is the cache-collision integration gap in §3, not the module itself.

---

## 5. Carried-over open items — re-verified today

| # | Item | Status today |
|---|---|---|
| 3.5 | `docs/ROADMAP.md` "Last refresh: 2026-05-12" | 🟡 still stale — now **11 days** old; predates the entire 10-commit burst |
| 4.3′ | `tests/ingest-prompt-template.test.ts` (δ′ template smoke) | 🟡 still absent — **but** the working tree just exported `EXTRACTION_SYSTEM_PROMPT` (`src/commands/ingest/index.ts`), which is exactly the hook this smoke test needs. Friction to add is now near-zero; do it in the same commit. |
| 4.5 | `CALIBRATION_LOG.md` index | 🟡 still missing — `docs/legend/calibrations/` now holds ~29 files; a newcomer must `grep -r SELF_INGEST` to reconstruct the trail |
| 3.6 | `.ontology.*` archive dirs | 🟡 ~9.8 MB across 5 dirs (unchanged); benign, low priority |
| 3.7 | Untracked review files | ✅ **resolved** — the 05-19 → 05-22 set was committed in `ab76a18`. Today's review is the only new untracked doc. |

---

## 6. Ranked next moves

### 🔧 Move 0 — Git hygiene (~2 min, do first)
`rm -f .git/index.lock`, then **`git push origin main`** to publish the 10-commit burst (you owe a push, not a pull). Do this before the working-tree commit so the lock can't block it.

### 🥇 Move 1 — Fix `--reps` before committing it (~1–2 h) — *the single new gate*
Fold a per-rep nonce into the run identity (mirror `astGrounding`'s contextHash folding) so each rep is a distinct deterministic `runId` → fresh dispatch + clean N-run audit trail. Add an integration test asserting `--reps 3` yields non-identical per-rep `runId`s / metrics. Without this the feature ships as a no-op (§3).

### 🥈 Move 2 — Tidy the rest of the feature, then commit (~45 min)
Validate `--aggregator` (4.1); document/guard even-N (4.2); fix the `successCount` doc string (4.3). Add `tests/ingest-prompt-template.test.ts` now that `EXTRACTION_SYSTEM_PROMPT` is exported (closes the long-standing §4.3′). Commit the `--reps` feature + the smoke test together.

### 🥉 Move 3 — Resume the 3α experiment — *now fully tooled*
With `bakeoff-synthesis.ts` built and a (fixed) `--reps` in hand, the original blocker is again the **Arm C model-substitute decision** (~30 min: pick a coding-specialised model ≤4 GB from a non-qwen family, tok/s pre-flight). Then run **Arm A (qwen2.5-coder:7b)** overnight and **Arm B** the next, feed both reports through the bakeoff-synthesis generator, and fire the pre-registered H1 decision tree. The pipeline is finally end-to-end — this is the highest-value *experimental* move once the code is committed.

### Lower priority (do when convenient)
ROADMAP refresh (3.5, ~30 min — now 11 days stale and actively misleading) · `CALIBRATION_LOG.md` index (4.5, ~30 min, increasingly valuable at ~29 files) · `scripts/legend-archive-prune.sh` (3.6, ~30 min).

---

## 7. Summary table

| Item | Status | Urgency | Effort |
|---|---|---|---|
| `rm .git/index.lock` + **`git push`** (§0) | 🆕 needs local machine | **DO FIRST** | ~2 min |
| `--reps` cache-collision (§3) | 🔴 **new bug — feature is a no-op** | **HIGH — before commit & before Opus probe** | ~1–2 h |
| Validate `--aggregator` (4.1) | 🟡 silently falls to mean | Medium | ~15 min |
| Even-N median midpoint (4.2) | 🟡 misleading default | Medium | ~20 min |
| `ingest-prompt-template` smoke (4.3′) | 🟡 absent — hook now exported | Medium (low friction now) | ~45 min |
| Move 2 bakeoff-synthesis | ✅ **CLOSED** (`ddfe266`) | — | — |
| Bug 3.2 + design 4.4 event payload | ✅ **CLOSED** (`00b8100`) | — | — |
| Arm C substitute decision | 🟡 ready — was the original gate | HIGH (after commit) | ~30 min |
| ROADMAP stale refresh (3.5) | 🟡 11 days stale | Low | ~30 min |
| `CALIBRATION_LOG.md` index (4.5) | 🟡 missing (~29 files) | Low | ~30 min |
| archive-prune script (3.6) | 🟡 ~9.8 MB | Low | ~30 min |

---

## 8. One-paragraph executive summary

The three-day stall is over: a 10-commit burst (all 05-22) closed the two highest-leverage backlog items — the `bakeoff-synthesis.ts` reducer (`ddfe266`) and the `homeomorphism_verified` model+perimeterHash audit fix (`00b8100`) — and the project is now 10 commits ahead of `origin` with a clean `tsc --noEmit` and 118 test files. The owed sync is therefore a **push, not a pull** (GitHub is unreachable from the sandbox regardless; §0). The one item that needs eyes is the **uncommitted `--reps`/`--aggregator` feature**: the reducer is well-built and well-unit-tested, but as wired it is **inert** — `verifyOne` is called N times with identical inputs and the deterministic run-cache turns reps 2..N into cache hits, so all reps are byte-identical and the median defangs zero variance (and the "spend scales linearly" claim is false; spend is ~1×). Fix it the way `--ast-grounding` already does it — fold a per-rep nonce into the run identity for distinct `runId`s — and add an integration test, **before committing the feature and before the Opus 4.7 ceiling probe it was built to support.** Two smaller polish items on the same code (`--aggregator` validation, even-N midpoint), the now-trivial `ingest-prompt-template` smoke test (its hook was just exported), and the stale ROADMAP round out the backlog. With the synthesis generator built and `--reps` about to be real, the 3α experiment is finally fully tooled — the next experimental gate reverts to the original ~30-minute Arm C model-substitute decision.

---

*Generated by the `ontology-pr-suggestions` scheduled task on 2026-05-23. HEAD: `ab76a18` (10 ahead of `origin/main`, 0 behind). Build: `tsc --noEmit` clean (verified). `git pull` proxy-blocked from the sandbox and moot (local is ahead); a `git push` + `.git/index.lock` cleanup are deferred to the user — see §0. Vitest unavailable in-sandbox (arm64 binding); all checks via `tsc` + direct code reads.*
