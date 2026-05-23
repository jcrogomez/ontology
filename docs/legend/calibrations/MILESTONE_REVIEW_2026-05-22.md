# Ontology Milestone Review — 2026-05-22

> ## 🔧 Session update (post-review development pass)
>
> After the review below was written, the operator asked to **stop depending on git/remote and advance the local backlog as far as possible**. This session then built and verified (all against the local working tree; `tsc --noEmit` clean throughout):
>
> 1. **`src/runtime/legend/bakeoff-synthesis.ts`** — the deterministic, no-LLM cross-arm synthesis generator that was the #1 unbuilt item in the three prior reviews. Reads N `AggregateReport`s and emits per-arm summaries, export-recovery micro/macro deltas, signed per-mode failure deltas, Pareto-frontier roll-up, per-file rebuild status with improved/regressed/stable/mixed/incomparable trends, and an H1 mean-Jaccard decision-gate read. Includes a markdown renderer (`renderBakeoffSynthesisMarkdown`) so the post-3α synthesis writes itself, plus a `BakeoffSynthesisSchema`. **Verified: 30/30 runtime checks via compiled `node` (vitest can't run in the sandbox — wrong-platform native binding).**
> 2. **Bug §3.2 + design §4.4 closed** — `src/commands/verify/homeomorphism.ts` now adds `model: { provider, model }` (the actually-dispatched identity) and `perimeterHash` (sha256 over the sorted source-file list) to the `homeomorphism_verified` event payload. The audit chain is now replayable from `events.jsonl` alone. Two pure helpers exported (`dominantDispatchModel`, `computePerimeterHash`). **Verified: 6/6 runtime checks.**
> 3. **Tests added** — `tests/bakeoff-synthesis.test.ts` and `tests/homeomorphism-event-audit.test.ts` (both type-check clean; run them on-machine with `npx vitest run` since the sandbox lacks the rolldown/esbuild arm64 binding).
>
> **Concurrent activity noticed:** during this session, separate **graph hierarchy-metrics** work appeared in the working tree (`src/commands/graph/metrics.ts`, `src/runtime/graph/hierarchy-metrics.ts`, `tests/hierarchy-metrics.test.ts`, `HIERARCHY_BASELINE_2026-05-22.md`, and a `graph metrics` command wired into `src/cli.ts`). That is the operator's own in-progress feature and is unrelated to the changes above — **the project is no longer "static," so the §1/§3.9 momentum framing below is outdated as of today.** Nothing was committed (the operator is mid-edit; the stale `.git/index.lock` from §0 also still applies).
>
> ---

> *Automated run of the `ontology-pr-suggestions` scheduled task. `git pull` **failed again** — the sandbox network proxy blocks GitHub (`HTTP 403 from proxy after CONNECT`), the same constraint as the 05-19 → 05-21 reviews; `origin` is private so the GitHub web/API are also unreadable from here. Local sync therefore could not be performed from the sandbox — see §0 for what the user must run on their own machine. Local `main` is at HEAD `867ce58`, last known **in sync with `origin/main`**. `tsc --noEmit` is **clean** (verified today, exit 0). Vitest still cannot run in this sandbox (rolldown ARM binding absent on Linux x64 — infrastructure constraint, not a project regression; 109 test files present and unchanged). Three prior review files remain **untracked** in the working tree; this is now the fourth.*

---

## 0. ⚠️ Action the sandbox could not take — please run locally

Two things this automated run could **not** do, both needing your real machine:

1. **`git pull`** — the sandbox cannot reach GitHub. Run on your machine to actually sync:
   ```sh
   cd ~/Development/ontology && git pull --ff-only
   ```

2. **A stale `.git/index.lock` is present** (0-byte file, created during this session's git probing; the sandbox mount is read-only on `.git` so it could not be removed here). A leftover `index.lock` will block the **next** `git add` / `git commit` / `git pull` with *"Unable to create '.git/index.lock': File exists."* If your next git command fails that way, clear it:
   ```sh
   rm -f ~/Development/ontology/.git/index.lock
   ```
   (Safe to delete as long as no other git process is running — it is empty and stale.)

Everything below is the substantive review against the **local** working tree, which is fully present and verified.

---

## 1. Situational summary — the static streak is now three days

The project has been **at the same HEAD (`867ce58`) since 2026-05-19** — no new commits in three days. The Move 3α tooling sprint shipped cleanly and the codebase is in a healthy pre-flight state, but **no arm of the 3α multi-arm run has executed**, and the **single blocker is unchanged**: the Arm C model-substitution decision.

Concretely, three nights have now passed in which the local arms — explicitly designed to run unattended overnight at the machine's degraded-but-feasible tok/s — could have produced data and did not. The re-entry cost stays low (the pick-up procedure in `SELF_INGEST_EPSILON_3A_TODO.md` is excellent and self-contained), but the experiment's whole premise was "run it while the machine is idle," and that window keeps closing unused.

This review verifies the unchanged state is genuinely unchanged (not regressed), confirms each open item by **reading the live code** rather than trusting prior reviews, surfaces one new operational finding (§3.8, the index.lock), and sharpens the ranked backlog given three days of elapsed time.

---

## 2. Verified state on HEAD `867ce58` (today, by direct inspection)

| Signal | Result | How verified |
|---|---|---|
| `tsc --noEmit` | ✅ clean (exit 0) | ran today |
| HEAD / commits since 05-19 | `867ce58`, **0 new commits** | `git log --since=2026-05-19` |
| `origin/main` sync | last known in sync; **cannot re-confirm** (pull blocked) | `git status` |
| Move 3α modules intact | ✅ 188 / 200 / 177 / 142 lines | `wc -l` on the four files |
| `ast-symbol-scanner.ts` | present (188) | direct |
| `export-recovery.ts` | present (200) | direct |
| `failure-mode-tagger.ts` | present (177) | direct |
| `compile/ast-grounding.ts` | present (142) | direct |
| `--ast-grounding` CLI flag | wired at `src/cli.ts:882` (exact) | `grep -n` |
| Test files | 109 `.test.ts` (unchanged) | `ls tests/*.test.ts` |
| `bakeoff-synthesis.ts` | ❌ **still absent** | `ls` → not found |
| `tests/ingest-prompt-template.test.ts` | ❌ **still absent** | `ls` → not found |
| `scripts/legend-archive-prune.sh` | ❌ **still absent** (only `bakeoff.sh`, `check-nul-bytes.sh`) | `ls scripts/` |
| Arm result dirs (`.ontology.self-ingest-epsilon-3a-*`) | ❌ **none** — arms have not run | `ls -d` |
| `.ontology.*` archive dirs | 5 dirs, **~9.8 MB** total | `du -sh` |
| Untracked files | **3** review docs (05-19, 05-20, 05-21) | `git status -s` |

No drift, no regression. The two-/three-day pause has not damaged anything; it has simply not advanced anything.

---

## 3. Open bugs — re-verified by code read today

### 3.1 ✅ CLOSED (2026-05-19, `4a2feb7`)
Pareto label `mock_default` mislabeling. Remains closed.

### 3.2 🟠 STILL OPEN — `homeomorphism_verified` event omits dispatch model **and** perimeterHash
**Re-confirmed by reading `src/commands/verify/homeomorphism.ts` today.** The event is appended around lines 379–412; its payload (lines ~395–403) carries `nodeIds`-equivalent counts, `byVerdict`, `thresholds`, and `...totalUsage` — **but no `model`/`provider` field and no `perimeterHash`**. The actually-resolved `dispatchModel` *is* read (declared line 561, populated ~588–593) and folded into the report object (line ~634), but it is **never forwarded into the event payload**. Consequence unchanged: an audit-chain replay from `events.jsonl` alone cannot identify which model produced the results, nor pin the perimeter it ran against.
**Effort:** ~1 h. **Bundle** with design 4.4 (perimeterHash) in one PR, before any Opus ceiling spend.

### 3.4 🟡 STILL OPEN — `context/types.ts` + `fibration/types.ts` persistent stragglers
Both files confirmed present in `src/runtime/`. Their `unrecoverable` status is unverifiable without running an arm. The Move 1c safety net (`748025e`) is predicted to rescue them if `provides=[]` was the root cause; **confirmation requires running at least Arm A**. Not blocking the run.

### 3.5 🟡 STILL OPEN — `docs/ROADMAP.md` stale refresh date — now **10 days** stale
`grep` confirms line 327 still reads `Last refresh: 2026-05-12`. It predates the β/β′/γ/δ′ calibration loop, the 9-commit Move 3α sprint, the hardware-bottleneck pre-flight, and three days of static pre-flight state. Low urgency, increasingly misleading to a newcomer.

### 3.6 🟡 STILL OPEN — `.ontology.*` archive dirs accumulating (low priority)
Five dirs, ~9.8 MB total. Benign now; a 3-arm run adds ~7 MB. A `scripts/legend-archive-prune.sh` is a quality-of-life item, **not urgent** — keep it low.

### 3.7 🟡 STILL OPEN → now **three** untracked review files
`MILESTONE_REVIEW_2026-05-19.md`, `_05-20.md`, and `_05-21.md` are all untracked; this document makes a fourth pending. Per the project's convention of tracking calibration artifacts in git, commit all of them in one cleanup commit (after clearing the index.lock per §0).

### 3.8 🆕 NEW (operational) — stale `.git/index.lock` on disk
A 0-byte `.git/index.lock` is present. It was produced when `git status` in the sandbox tried to refresh the index and could not unlink the lock afterward (the mount is read-only on `.git`). On your real machine this leftover lock will **block the next git write** until removed. Surfaced as §0 action #2. This is the most concretely actionable new item this run.

### 3.9 🆕 NEW (process) — momentum risk has compounded, not just persisted
Named in the 05-21 review as "no commits in 48 h." It is now **72 h**. The blocker is the same ~30-minute research decision (Arm C substitute). The cost of *this* is not code rot — the build is clean and the pick-up notes are pristine — it is **opportunity cost**: three idle-machine nights that could each have produced an arm's worth of data. Re-stated bluntly so it does not quietly become a week.

---

## 4. Design items — re-verified today

**4.2 🟠 `--reps N --aggregator median` wiring** — `grep` on `src/cli.ts` confirms **only `--ast-grounding` exists** (line 882); no `--reps`, no `--aggregator`. Still needed before the Opus ceiling probe to defang the single-draw Jaccard variance seen in γ (1.0 → 0.0 on one draw). Not blocking 3α.

**4.3 🟠 δ′ template smoke fixture** — `tests/ingest-prompt-template.test.ts` confirmed absent. A future "tidy the prompt" edit can still silently soften the MANDATORY EXPORTS MUSTs with no test catching it. ~1 h.

**4.4 🟠 `perimeterHash` absent from `homeomorphism_verified`** — same PR as bug 3.2, confirmed by the same code read. The perimeter is the sorted list of ~125 `sourceFile` paths; a single `createHash('sha256')` over the joined list.

**4.5 🟡 `CALIBRATION_LOG.md` index missing** — no single index document links the β / β′ / γ / δ′ (+ pending 3α) hypothesis/synthesis pairs. The calibrations directory now holds 20+ files; a newcomer must `grep -r SELF_INGEST` to reconstruct the trail. ~30 min, increasingly valuable.

---

## 5. New observations (today)

### 5.1 🔴 `bakeoff-synthesis.ts` is now THREE days unbuilt and is still the highest-leverage piece
Confirmed absent again. This deterministic, no-LLM module (reads N `AggregateReport` JSONs → cross-arm comparison: exportRecovery micro+macro deltas, per-mode failure deltas, Pareto positions, per-file rebuild status) is the one piece that turns post-3α synthesis from a 375-row (125 nodes × 3 arms) manual writing task — prone to cherry-picking and arithmetic error — into a mechanical generation. Building it **before** the arms run is strictly better than after. It has been the recommended #1/#2 in two consecutive reviews and remains unstarted.

### 5.2 🟡 The review series is now out-producing the codebase
A meta-observation worth stating once: this scheduled task has generated four review documents (05-19 → 05-22) over a window in which the project produced **zero commits**. The reviews are doing their job (verifying non-regression, keeping the backlog sharp), but four untracked review files with no intervening work is itself a signal that the *decision*, not more analysis, is the bottleneck. The next session's first 30 minutes (Arm C choice) unblock everything downstream.

### 5.3 🟡 Wall-clock planning is unchanged and still favors starting tonight
From the TODO's measured numbers: Arm A (qwen2.5-coder:7b) ≈ 1.1 tok/s → ~5 h for 125 nodes; Arm B (granite4.1:8b) ≈ 0.2 tok/s → ~25 h, worth a fresh-reboot re-measure first (closing apps may lift it toward 0.5 tok/s, halving the run). The math has not changed; only the number of unused nights has.

---

## 6. Ranked next moves

The ordering is essentially the 05-21 ranking with urgency dialed up by the three-day streak. The genuinely new entry is **Move 0** (the index.lock / pull hygiene), which is a 2-minute unblock.

### 🔧 Move 0 — Git hygiene (~2 min, do first)
On your machine: `rm -f .git/index.lock` (if present), then `git pull --ff-only`. Then commit the four untracked review files in one sweep:
```sh
git add docs/legend/calibrations/MILESTONE_REVIEW_2026-05-*.md
git commit -m "docs(legend): land automated milestone reviews 05-19 → 05-22"
```

### 🥇 Move 1 — Arm C substitute decision (~30 min) — *the single gate*
Walk `ollama.com/library` for a coding-specialised model, quantised ≤ 4 GB, Q4+, **from a different family than qwen** (so the H3 "coding-specialist vs generalist" signal stays clean — do **not** reuse `qwen2.5-coder:3b`). Verify sizes on the catalog before pulling; run a 3-file tok/s pre-flight. Then update `SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md` with the chosen substitute and "Arm C (devstral-24b) deferred to cloud." Everything downstream is blocked on this 30-minute task.

### 🥈 Move 2 — Bakeoff synthesis generator (~3–4 h) — *build before the arms run*
`src/runtime/legend/bakeoff-synthesis.ts` + `tests/bakeoff-synthesis.test.ts`. Deterministic, no LLM. Input: array of `AggregateReport`; output: structured cross-arm comparison. Three days overdue; build it now so the post-3α synthesis writes itself.

### 🥉 Move 3 — Run Arms A and B (overnight × 2) — *start A tonight*
After Moves 1–2:
```sh
# Arm A — start this evening → results by morning
onto verify-homeomorphism --all-artifacts --matrix --ast-grounding \
  --provider ollama --model qwen2.5-coder:7b
# Arm B — re-measure granite after a clean reboot, then run the next evening
onto verify-homeomorphism --all-artifacts --matrix --ast-grounding \
  --provider ollama --model <substitute-or-granite4.1:8b>
```
Output: `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md` + `ARM_B.md` via `--report`.

### Move 4 — Backlog sprint PR (~3 h, parallelizable with Arm B's wall-clock)
One PR closing: bug 3.2 + design 4.4 (add `model: {provider, model}` and `perimeterHash` to the `homeomorphism_verified` payload, ~1 h) · design 4.3 (`tests/ingest-prompt-template.test.ts` smoke fixture, ~1 h) · design 4.2 (`--reps N --aggregator median` wiring, ~1 h — needed before any Opus probe).

### Move 5 — 3α synthesis + decision-tree read (~45 min, after Arms A+B)
Run the bakeoff-synthesis generator over the two arm reports; compare against H1–H6. Then the pre-registered tree fires: **both confirm H1 (mean Jaccard ≥ 0.10)** → synthesise → TARGET_ARCHITECTURE router skeleton → Arm C (cloud devstral) as confirmation; **both falsify H1** → Move 6 (Opus 4.7 ceiling probe, per `feedback_sota_ceiling_use_opus`) is mandatory.

### Move 6 — Cloud Arm C (deferred, ~$5–10)
devstral-small-2:24b on ≥24 GB VRAM (RunPod / Modal / Ollama Cloud). Not blocking.

### Lower priority (do when convenient)
ROADMAP refresh (3.5, ~30 min) · CALIBRATION_LOG.md index (4.5, ~30 min) · archive-prune script (3.6, ~30 min).

---

## 7. Summary table

| Item | Status | Urgency | Effort |
|---|---|---|---|
| Clear `.git/index.lock` + `git pull` (§0) | 🆕 needs local machine | **DO FIRST** | ~2 min |
| Commit 4 untracked review files (3.7) | 🟡 4 pending | Low | ~5 min |
| Arm C substitute decision | 🔴 **the single blocker** | **HIGH** | ~30 min |
| bakeoff-synthesis generator (5.1) | 🔴 not started (3 days) | **HIGH** — build before arms | ~3–4 h |
| Run Arm A (qwen 7b) | 🟡 ready — start tonight | HIGH | ~5 h wall-clock |
| Run Arm B (granite/substitute) | 🟡 ready after A | HIGH | ~10–25 h wall-clock |
| Bug 3.2 + design 4.4 (event payload) | 🟠 open (code-confirmed) | Medium | ~1 h |
| Design 4.3 (ingest template smoke) | 🟠 open | Medium | ~1 h |
| Design 4.2 (`--reps` median) | 🟠 open | Medium (before Opus) | ~1 h |
| ROADMAP stale refresh (3.5) | 🟡 10 days stale | Low | ~30 min |
| CALIBRATION_LOG.md index (4.5) | 🟡 missing | Low | ~30 min |
| archive-prune script (3.6) | 🟡 ~9.8 MB | Low | ~30 min |

---

## 8. One-paragraph executive summary

Three days static at HEAD `867ce58`; build clean (`tsc --noEmit` exit 0), all Move 3α tooling intact and verified by direct inspection, no regressions. The project remains one ~30-minute decision — the Arm C model substitute — away from running the 3α arms, and three idle-machine nights have now passed without that overnight run happening. The highest-leverage *buildable* task, the deterministic `bakeoff-synthesis.ts` generator, is still unbuilt after being the top recommendation in two prior reviews. Two new operational items this run: a stale `.git/index.lock` that will block the next git write until removed, and `git pull` could not be performed from the sandbox (GitHub is proxy-blocked) — both need a quick local fix (§0). The recommended path is unchanged but more urgent: clear the lock and pull, make the Arm C call, build the synthesis generator, and start Arm A tonight so the machine works while idle. Code-level bugs (3.2/4.4 event payload, 4.2 reps median, 4.3 template smoke) are all confirmed open by today's code read and fit a single ~3 h backlog PR that can run in parallel with the arms' wall-clock.

---

*Generated by the `ontology-pr-suggestions` scheduled task on 2026-05-22. HEAD: `867ce58`. Build: `tsc --noEmit` clean (verified). `git pull` blocked (sandbox proxy); local sync + index.lock cleanup deferred to the user — see §0. No new commits since 2026-05-19.*
