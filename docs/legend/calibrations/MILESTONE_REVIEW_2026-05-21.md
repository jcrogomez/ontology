# Ontology Milestone Review — 2026-05-21

> *Automated run of the `ontology-pr-suggestions` scheduled task. `git pull` failed again (sandboxed network — same proxy constraint as prior reviews). Local `main` confirmed at HEAD `867ce58`, **in sync with `origin/main`** (`git status` shows no unpushed commits). Two untracked files remain from prior automated reviews: `docs/legend/calibrations/MILESTONE_REVIEW_2026-05-19.md` and `docs/legend/calibrations/MILESTONE_REVIEW_2026-05-20.md` (not yet committed). `tsc --noEmit` is **clean** on HEAD. Vitest unavailable in this sandbox (rolldown ARM binding absent in Linux x64 — infrastructure constraint, not a project issue). No new commits have landed since 2026-05-19's 9-commit Move 3α tooling sprint.*

---

## 1. Situational summary

The project has been **static for two days** (2026-05-19 → 2026-05-21) at the pre-flight checkpoint. The Move 3α tooling is fully built and tested; the codebase is clean; the hypothesis is pre-registered. The single blocking issue is unchanged: **Arm C model substitution has not been decided**. No arm of the 3α multi-arm run has executed yet.

This review focuses on what is new vs the 2026-05-20 review, verifies the unchanged state is genuinely unchanged (not regressed), and sharpens the ranked backlog with two days of elapsed time as context.

---

## 2. What has NOT changed since 2026-05-20

Everything confirmed stable on HEAD `867ce58`:

- `tsc --noEmit` — clean ✅
- All five Move 3α module files intact and at expected line counts:
  - `src/runtime/legend/ast-symbol-scanner.ts` (188 lines)
  - `src/runtime/legend/export-recovery.ts` (200 lines)
  - `src/runtime/legend/failure-mode-tagger.ts` (177 lines)
  - `src/runtime/compile/ast-grounding.ts` (142 lines)
  - `src/commands/verify/homeomorphism.ts` (present, `--ast-grounding` wired at line 882)
- `.ontology.*` archive directories: same 5 directories as before — no new runs have generated new result dirs
- No new commits on `main`
- No new test files added since the 2026-05-20 review

The two-day pause has not introduced drift or regressions. The pick-up procedure in `SELF_INGEST_EPSILON_3A_TODO.md` remains fully valid.

---

## 3. Open bugs — updated status

### 3.1 ✅ CLOSED (2026-05-19)
Pareto label `mock_default` mislabeling — fixed in `4a2feb7`.

### 3.2 🟠 STILL OPEN — `homeomorphism_verified` event omits dispatch model and perimeterHash
Code inspection today confirms this is still unresolved. `src/commands/verify/homeomorphism.ts` lines 379–413 show the event payload contains `nodeIds, total, byVerdict, thresholds, totalUsage` — **no `model`/`provider` field, no `perimeterHash`**. While `dispatchModel` IS read from the `VerificationResult` (line 561–593), it is used for the Pareto report but never forwarded to the `homeomorphism_verified` event payload. This means any audit-chain replay from `events.jsonl` alone still cannot identify which model produced the results.
**Effort:** ~1 h. **Priority:** bundle with 4.4 in the same PR, before Move 4 (Opus ceiling).

### 3.3 ✅ AUTO-CLOSED (2026-05-19)
Was a symptom of bug 3.1.

### 3.4 🟡 STILL OPEN — `context/types.ts` + `fibration/types.ts` persistent stragglers
Unresolved pending actual arm execution. The Move 1c safety net in `748025e` is predicted to rescue them if `provides=[]` was the root cause; confirmation requires running at minimum Arm A. Still not blocking the run itself.

### 3.5 🟡 STILL OPEN — `docs/ROADMAP.md` stale last-refresh date
`Last refresh: 2026-05-12` — now 9 days stale. Phase ε section still describes it as "gated on API credit." Four ollama calibration runs (β/β'/γ/δ'), the 9-commit Move 3α tooling sprint, and the hardware-bottleneck pre-flight are not reflected. Low urgency but increasingly misleading.

### 3.6 🟡 STILL OPEN — `.ontology.*` archive directories accumulating
Five directories, ~9.6 MB total disk. Modest now but each arm run adds ~2.3 MB of a new result dir. Recommend a `scripts/legend-archive-prune.sh` before the multi-arm run starts to keep the working directory clean. Still ~30 min effort.

### 3.7 🟡 STILL OPEN — `MILESTONE_REVIEW_2026-05-19.md` and `MILESTONE_REVIEW_2026-05-20.md` untracked
Both automated review files remain untracked in the working tree. Now a third review (this document) is being generated. All three should be committed in a single cleanup commit per the project's convention of tracking calibration artifacts in git.

### 3.8 🆕 NEW — No commits landed in 48 h; momentum risk
Not a code bug, but a process flag worth naming explicitly: the project is at maximum tooling readiness and minimum forward motion. The Arm C substitute decision is the entire blocker — it is a ~30 min research task (browse `ollama.com/library`, filter by size ≤ 4 GB, run a 3-file tok/s pre-flight). The longer this decision stays open, the more context has to be re-loaded on resume. The `SELF_INGEST_EPSILON_3A_TODO.md` pick-up procedure is well-written and self-contained, so re-entry cost is low — but the experiment was designed to run while the machine is idle overnight, and two nights have passed without it running.

---

## 4. Design items — updated status

All four open design items (4.1 – 4.5) remain unresolved. No new design work landed. Quick status for each:

**4.1 🟠 Pareto multi-session log** — Still un-built. Each arm run will produce a distinct `AggregateReport` JSON; without a log these are siloed. Will matter acutely once Arms A and B both complete and need to be compared against δ'.

**4.2 🟠 `--reps N --aggregator median` wiring** — Still absent from `homeomorphism.ts`. Not blocking 3α but needed before Move 4 (Opus ceiling) to avoid the single-draw Jaccard variance problem observed in γ.

**4.3 🟠 δ' template smoke fixture** — `tests/ingest-prompt-template.test.ts` still does not exist. Code inspection confirms no ingest-prompt-template file in `tests/`. A future prompt edit can silently regress the MANDATORY EXPORTS block structure with no test catching it.

**4.4 🟠 `perimeterHash` absent from `homeomorphism_verified`** — Confirmed open by code read (see bug 3.2 above — same PR). The perimeter is the sorted list of 125 `sourceFile` paths; a hash over that is a single `createHash('sha256')` call.

**4.5 🟡 `CALIBRATION_LOG.md` index missing** — The five hypothesis/synthesis pairs (β, β', γ, δ', and the pending 3α) have no single index document. Still ~30 min to write; increasingly valuable as the calibration chain grows.

---

## 5. New observations (today)

### 5.1 🟡 The `bakeoff-synthesis.ts` module is the highest-leverage unbuilt piece
This was noted in the 2026-05-20 review but deserves promotion: **two nights have passed without it being built, and the arms are about to run**. The synthesis generator is a purely deterministic, no-LLM module (`src/runtime/legend/bakeoff-synthesis.ts`) that reads N `AggregateReport` JSONs and emits a cross-arm comparison table. Building it *before* the arms run turns the post-3α synthesis from a manual writing task into a mechanical generation. Given the 3α arms will produce large per-node matrices (125 nodes × 3 arms = 375 rows), manual synthesis without this tool risks:
- cherry-picking rather than full-perimeter comparison
- arithmetic errors in per-mode deltas
- inability to re-generate the synthesis if the raw JSON changes

**This is the highest-leverage task before the arms run.**

### 5.2 🟡 `--ast-grounding` CLI flag confirmed correctly wired at line 882
Code read confirmed the flag is registered at exactly `src/cli.ts:882` (not "~882" as the TODO said — it's precise). The TODO's approximation was conservative; the flag is properly wired. No action needed.

### 5.3 🟡 Disk accumulation is benign but will double during the 3-arm run
Current: `.ontology.*` dirs total ~9.6 MB. Each 125-node arm run generates ~2.3 MB. A 3-arm run adds ~7 MB, bringing the total to ~17 MB — still negligible on a modern machine. The archive-prune script (bug 3.6) is a quality-of-life item, not an urgent one. Lower its priority accordingly.

### 5.4 🟡 Arm A wall-clock is the main planning constraint
qwen2.5-coder:7b at 1.1 tok/s output gen on this machine → estimated ~5 h wall-clock for 125 nodes. At 0.2 tok/s, granite would take **~25 h** for Arm B — effectively an entire day on top of Arm A's overnight. The practical schedule is:
- Start Arm A on a quiet evening → results by next morning
- Review Arm A results → if hardware situation hasn't changed, start Arm B immediately → results ~24 h later
- Arm B's long wall-clock means a **fresh-reboot baseline measurement for granite** is worth doing first (per the 2026-05-20 recommendation). A reboot with all non-essential apps closed may bring granite from 0.2 → something closer to 0.5 tok/s, cutting Arm B from 25 h → ~10 h.

---

## 6. Ranked next moves (updated)

The ranking from 2026-05-20 is essentially unchanged. Two priority promotions:

### 🥇 Move 1 — Bakeoff synthesis generator (~3-4 h)
**Promoted to #1** (was #2). Arm C substitution is still #1 chronologically, but the synthesis generator is more impactful to build now while the arms haven't run yet. These two can be done in any order and ideally on the same session.

**Deliverable:** `src/runtime/legend/bakeoff-synthesis.ts`
- Input: array of `AggregateReport` from different arm result paths
- Output: structured comparison object with per-arm exportRecovery (micro + macro), per-mode failure delta, Pareto positions, per-file rebuild status
- Tests: deterministic, no LLM; add to `tests/bakeoff-synthesis.test.ts`
- No flags needed — a library function, called by the synthesis document generator

### 🥈 Move 2 — Arm C substitute decision (~30 min)
Browse `ollama.com/library`, filter by:
- Quantised size ≤ 4 GB
- Coding-specialised tuning (different architecture from qwen-coder family for clean H3 signal)
- Q4 or higher

Candidates to evaluate: `deepseek-coder:1.3b`, `deepseek-coder:6.7b-q4`, `starcoder2:3b`, `codestral:nano` — **verify sizes on the catalog before pulling**. The criterion is architecture diversity from qwen (don't pick qwen-coder:3b for Arm C — same family as Arm A). Update `SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md` with the chosen substitute and "Arm C (devstral-24b) deferred to cloud."

### 🥉 Move 3 — Run Arms A and B (overnight × 2 evenings)
After Moves 1 and 2:
```sh
# Arm A — evening 1 → results next morning
onto verify-homeomorphism --all-artifacts --matrix --ast-grounding \
  --provider ollama --model qwen2.5-coder:7b

# Arm B — recommend reboot pre-measurement, then evening 2
onto verify-homeomorphism --all-artifacts --matrix --ast-grounding \
  --provider ollama --model granite4.1:8b
```
Output: `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md` + `ARM_B.md` (generated by `verify-homeomorphism --report`).

### Move 4 — Backlog sprint PR (~3 h, can run in parallel with arm B's wall-clock)
Single PR closing:
- Bug 3.2 + design 4.4: add `model: { provider, model }` and `perimeterHash` to `homeomorphism_verified` event payload (~1 h)
- Design 4.3: `tests/ingest-prompt-template.test.ts` smoke fixture for δ' template invariants (~1 h)
- Bug 3.7: commit all three untracked `MILESTONE_REVIEW_2026-05-2*.md` files (~5 min)
- Design 4.2: `--reps N --aggregator median` wiring in `homeomorphism.ts` (~1 h) — do this before Move 5 so Arm C can use it

### Move 5 — 3α synthesis + decision tree (~45 min, after Arms A+B complete)
Run the bakeoff-synthesis generator over the two arm reports. Compare against H1–H6 falsifiers. The decision tree then fires:
- **Both confirm H1 (mean Jaccard ≥ 0.10)** → synthesise → TARGET_ARCHITECTURE router skeleton → Arm C (cloud devstral) as confirmation
- **Arms falsify H1** → Move 6 (Opus 4.7 ceiling probe) is mandatory; local tier is at the floor for all practical purposes

### Move 6 — Cloud path for Arm C (deferred until after 5)
RunPod / Modal / Ollama Cloud with devstral-small-2:24b on ≥ 24 GB VRAM. Estimated ~$5-10. Not blocking.

---

## 7. Summary table

| Item | Status | Urgency | Effort |
|---|---|---|---|
| 3α bakeoff-synthesis generator | 🔴 Not started | **HIGH** — build before arms run | ~3-4 h |
| Arm C substitute decision | 🔴 Blocked | **HIGH** — last blocker to 3α run | ~30 min |
| Run Arm A (qwen 7b) | 🟡 Ready to run | HIGH | ~5 h wall-clock |
| Run Arm B (granite) | 🟡 Ready (after A) | HIGH | ~10-25 h wall-clock |
| Bug 3.2 + design 4.4 (event payload) | 🟠 Open | Medium | ~1 h |
| Design 4.3 (ingest template smoke) | 🟠 Open | Medium | ~1 h |
| Design 4.2 (--reps median) | 🟠 Open | Medium (before Move 5) | ~1 h |
| Commit untracked review files (3.7) | 🟡 3 files pending | Low | ~5 min |
| ROADMAP.md stale refresh (3.5) | 🟡 Open | Low | ~30 min |
| archive-prune script (3.6) | 🟡 Open | Low | ~30 min |
| CALIBRATION_LOG.md index (4.5) | 🟡 Not started | Low | ~30 min |

---

*Generated by the `ontology-pr-suggestions` scheduled task on 2026-05-21. HEAD: `867ce58`. Build: `tsc --noEmit` clean. No new commits since 2026-05-19.*
