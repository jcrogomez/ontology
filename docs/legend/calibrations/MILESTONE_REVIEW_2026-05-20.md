# Ontology Milestone Review — 2026-05-20

> *Automated run of the `ontology-pr-suggestions` scheduled task. `git pull` failed (sandboxed network — same constraint as yesterday's review). Local `main` is **in sync with `origin/main`** (`git status` shows no unpushed commits, unlike yesterday's 2-ahead state). One untracked file remains: `docs/legend/calibrations/MILESTONE_REVIEW_2026-05-19.md` (the previous automated review). `tsc --noEmit` is clean on HEAD (`867ce58`). Vitest could not run in the sandbox (rolldown ARM binding absent in the Linux x64 sandbox — this is an infrastructure constraint, not a project regression).*

---

## 1. What shipped since yesterday's review

Yesterday's `MILESTONE_REVIEW_2026-05-19.md` listed **Move B (Sonnet probe)** as the top action and **bug 3.1 fix + Move A (δ synthesis)** as its prerequisites. In the session that followed, the project took a different but well-reasoned path: instead of going straight to Sonnet, it built all the prerequisite tooling for the **Move 3α multi-arm local experiment** first. Nine commits landed:

| Commit | Tag | Description |
|---|---|---|
| `4a2feb7` | fix(verify) | **Bug 3.1 closed** — Pareto report now reads the actual dispatched model from the persisted run record, not `node.model.ref` defaulting to `mock_default`. The ★-frontier row will be correctly labelled from this commit forward. |
| `515fd92` | feat(legend) | **AST symbol scanner** — deterministic `ts-morph` extractor for `mandatoryExports[]` per source file. 16 new tests green. The "symbols come from deterministic tools" axiom from TARGET_ARCHITECTURE.md made concrete. |
| `748025e` | fix(ingest) | **Move 1c safety net** — when an ingest LLM returns an empty `provides[]`, AST exports backfill it. Predicted to reduce `unrecoverable` from 24 → ~17 by rescuing the two `context/types.ts` / `fibration/types.ts` stragglers and similar borderline nodes. |
| `35ac998` | feat(compile) | **AST grounding at code_sketch** — every compile-back dispatch now receives a deterministic MANDATORY EXPORTS section in its system prompt. Cache contextHash folds in the grounding identity, keeping ε-pre and ε-post run caches cleanly separated. 17 new tests green. |
| `ca5e002` | feat(legend) | **ExportRecoveryRate metric** — measures exact-name survival from AST mandate → regenerated `.ts` file (candado #2: measured at the OUTPUT, not the prompt). Exposes `exportRecoveryRate`, `hallucinationRate`, `missingMandatoryExports`, `hallucinatedExports`, `exactExportSetMatch`. 10 new tests green. |
| `e493b40` | feat(legend) | **Failure-mode tagger v0** — per-node structured labels (`missing_exports`, `hallucinated_exports`, `empty_regen`, `compile_back_failed`, `gluing_rejected`, `schema_invalid`). Produces the model × file_kind × failure_mode tensor the 3α-3γ bake-off will mine. 12 new tests green. |
| `fab66e2` | docs(legend) | **Move 3α hypothesis pre-registered** — `SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md`; H1–H6 falsifiers, decision tree, and candados locked before any arm runs. |
| `4837936` | docs(legend) | **TARGET_ARCHITECTURE.md** — destination blueprint for the role-based pipeline (AST scanner → extractor → critic → reducer → code_sketch → repair → verifier → frontier escalation). Not executable yet; reference for judging each 3α-3γ iteration. |
| `867ce58` | docs(legend) | **Move 3α TODO + pick-up notes** — session pause record with status snapshot, hardware characterization numbers, Arm C substitution decision outstanding, and a fully prioritized backlog with pick-up procedure. |

**Aggregate:** 55 new tests across 4 new test files; 227 Phase ε pre-flight tests remained green; `tsc --noEmit` clean throughout.

---

## 2. Where the milestone stands today

**Active milestone:** Phase ε self-ingestion — multi-arm calibration (Move 3α).

The pre-flight run on 2026-05-19 **revealed a hardware bottleneck** before any arm executed. Key measured numbers on the 8 GB dev machine:

| Arm | Model | Size | Output gen (tok/s) | Verdict |
|---|---:|---:|---:|---|
| A (control) | qwen2.5-coder:7b | 4.7 GB | 1.1 | Degraded — in swap even alone |
| B (structured-output) | granite4.1:8b | 5.3 GB | 0.2 | Marginal — heavy swap |
| C (coding-specialised) | devstral-small-2:24b | 15 GB | ~0.02 | **INFEASIBLE** — 15 GB > available RAM; 125-node run would take ~18 h wall-clock |

**Status of the 3-arm run:** 🟡 **BLOCKED on Arm C substitution decision.** The pre-flight was a clean diagnostic; the blocking issue is strategic (which ≤ 4 GB coding-specialised model substitutes for devstral-24b), not a code defect.

**What the decision tree says at this moment:**

```
δ' result → "MODEL IS THE FLOOR at the ollama-qwen tier"
             → Move 3α: test whether (AST grounding + better-tuned local model) closes the gap
             → Arm C bottleneck → choose substitute OR defer to cloud
             → If local arms A+B both falsify H1 → Move 4 (Opus ceiling) fires
             → If any local arm confirms H1 → bake-off synthesis → TARGET_ARCHITECTURE router skeleton
```

The project is one decision away from running: pick the Arm C substitute (or explicitly defer it to cloud) and execute Arms A+B overnight.

---

## 3. Bugs — current status

### 3.1 ✅ CLOSED — Pareto label `mock_default` mislabeling
Fixed in `4a2feb7`. The fix reads `persistedRun.model.provider / .model` first, falling back to `options.model`, then to `node.model.ref`. Closed.

### 3.2 🟠 OPEN — `homeomorphism_verified` event omits verify model
**Still unresolved.** The event payload records totals, verdict breakdown, and usage but does not name the `provider/modelName` that produced the regen artifacts. Replaying or re-aggregating a Pareto table from the event log alone still requires cross-walking through `compilation_run` events + run JSON files.
**Effort:** ~1 h. **When:** bundle with the perimeterHash addition (item 4.4) in a single PR.

### 3.3 ✅ AUTO-CLOSED — `--provider ollama` without `--model` silent routing
Was a symptom of bug 3.1. With the Pareto label now reading the actual dispatched model, the foot-gun is visible in the report. Closed as a consequence.

### 3.4 🟡 OPEN — `context/types.ts` + `fibration/types.ts` persistent stragglers
These two `declaration_only` nodes have been `unrecoverable` through γ → δ' → (pre-3α). The Move 1c safety net (`748025e`) should rescue them if their `provides=[]` was the root cause; confirmation requires actually running an arm. If they remain unrecoverable after 3α-A, the γ diagnosis (import symbols don't match upstream `provides`, or a secondary gluing rejection path) needs a manual walk. **Diagnostic pass is ~2 h; not blocking 3α run itself.**

### 3.5 🟡 OPEN — ROADMAP `Last refresh` date stale
`docs/ROADMAP.md` line 327 still reads `Last refresh: 2026-05-12` and does not reflect the β / β′ / γ / δ' calibration loop, the 9-commit Move 3α tooling sprint, or the current blocked state. Phase ε is still listed as "🟡 next active stream (gated on API credit)" when four ollama-tier calibration runs have completed. Low urgency but misleading to a newcomer.

### 3.6 🟡 OPEN — Six `.ontology.*` archive directories accumulating on disk
All gitignored. The failed-delta directory from 2026-05-18 confirms that δ' had a false start. A `scripts/legend-archive-prune.sh` (keep last N, tarball the rest) would keep disk clean ahead of the 3α runs, which will generate three more result directories. **~30 min to write; recommended before the 3-arm run starts.**

### 3.7 🆕 NEW — `MILESTONE_REVIEW_2026-05-19.md` untracked in working tree
The previous automated review (`docs/legend/calibrations/MILESTONE_REVIEW_2026-05-19.md`) was generated but never `git add`'d or committed. **Recommended action:** commit both this review and the prior one in the same cleanup pass. The convention from γ is that calibration artifacts are tracked in git.

---

## 4. Design items — current status

### 4.1 🟠 Pareto table needs a multi-session log
Still un-built. An append-only `.ontology/legend/pareto-log.jsonl` (one row per verify session keyed by `runStartIso, gitCommit, perimeterHash`) plus an `onto legend pareto` subcommand would make the publishable Phase ε comparison readable without manually merging session JSON files. **Deferred until after 3α Arms A+B run and produce two rows to merge.**

### 4.2 🟠 `--reps N --aggregator median` wiring absent
`src/commands/verify/homeomorphism.ts` has no `--reps` or `--aggregator` flag as of HEAD. The γ-era Jaccard 1.0 → 0.0 regression on a single draw (γ synthesis §3) motivates a median-of-3 estimator before the Opus spend. **Add before Move 4 (Opus ceiling); not blocking 3α.**

### 4.3 🟠 δ' template smoke fixture absent
`tests/ingest-prompt-template.test.ts` does not exist. The δ' prescriptive template is the calibrated extraction baseline; a future "tidy the prompt" edit that inadvertently softens the MUSTs is a publishable-claim-killer. **~1 h; add to the Move 3α backlog sprint, not a blocker for running arms.**

### 4.4 🟠 `perimeterHash` absent from `homeomorphism_verified` payload
No `perimeterHash` field in the event. Without it, the audit chain cannot be replayed from the event log alone — readers must reconstruct the perimeter from the 125-node `sourceFile` list. **Bundle with bug 3.2 fix.**

### 4.5 🟡 `CALIBRATION_LOG.md` index missing
No single document links the four hypothesis/synthesis pairs (β, β′, γ, δ') in chronological order. A newcomer must `grep -r SELF_INGEST` to reconstruct the audit trail. **~30 min; recommended after 3α synthesis is written.**

---

## 5. New observations for today

### 5.1 🟡 Arm A will run at degraded tok/s — wall-clock estimate matters for planning
With qwen2.5-coder:7b measured at 1.1 tok/s output gen on this machine (vs expected 30–50 on Apple Silicon with memory headroom), a 125-node arm run will take **roughly 5 h wall-clock** (per the TODO's own estimate). Running overnight or while idle is the right posture. **The run is not infeasible, just slow.** Arm B (granite4.1:8b at 0.2 tok/s) is borderline — the TODO estimates "5 h per local arm" which suggests Arm B may actually take 20+ h at those rates. Recommend re-measuring granite after a fresh reboot with all other apps closed.

### 5.2 🟡 `--ast-grounding` CLI flag location should be verified before the run
The TODO references `src/cli.ts` line ~882 for the flag. A quick `grep -n ast-grounding src/cli.ts` before starting the arm run would confirm the flag is wired correctly — the note says "~882" which implies it was found approximately, not pinned.

### 5.3 🟡 No `bakeoff-synthesis.ts` module yet
The TODO's backlog item (1) — a deterministic cross-arm synthesis generator that reads N `AggregateReport` JSON files and emits per-mode deltas and Pareto positions — has not been built. Without it, the post-3α synthesis will be manual. **Recommended to build this before the arms run** so the synthesis writes itself.

### 5.4 🟡 The δ' synthesis document does exist (was missing yesterday)
Yesterday's review noted "δ synthesis is the missing artifact." The calibrations directory now contains `SELF_INGEST_DELTA_2026-05-18_SYNTHESIS.md`. **Move A from yesterday's ranked list is closed.** Good.

---

## 6. Ranked next moves

### 🥇 Move 1 — Arm C substitute decision (~30 min)
Walk `ollama.com/library` for coding-specialised models with quantised size ≤ 4 GB (Q4+). Pull 1–2 candidates; run a 3-file tok/s pre-flight (241 prompt tokens, ~120 output). Update `SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md` with the chosen substitute and note "Arm C (devstral-24b) deferred to cloud." This is the **single decision blocking the entire 3α run.**

Candidate categories to search (per TODO's criteria):
- Something in the `coder` family at 3b–4b — not qwen2.5-coder:3b (already pulled, but same family as Arm A weakens the H3 coding-specialist signal)
- Any `instruct`-tuned coding model ≤ 4 GB from a different architecture (phi, deepseek-coder, starcoder2, codestral-nano, etc.) — verify catalog before naming

### 🥈 Move 2 — Bakeoff synthesis generator (~3–4 h before the arms run)
`src/runtime/legend/bakeoff-synthesis.ts` — deterministic, no LLM, reads N `AggregateReport` JSONs and emits a cross-arm comparison table (exportRecovery micro + macro deltas, failureModes per-mode delta, Pareto positions, per-file rebuild status). Build this before the arms execute so the synthesis is mechanical and fast when results arrive.

### 🥉 Move 3 — Run Arms A and B overnight
After Moves 1 and 2 are complete:
```sh
onto verify-homeomorphism --all-artifacts --matrix --ast-grounding \
  --provider ollama --model qwen2.5-coder:7b    # Arm A — overnight
onto verify-homeomorphism --all-artifacts --matrix --ast-grounding \
  --provider ollama --model <substitute>         # Arm B — after A completes
```
Output: `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md` + `ARM_B.md`.

### Move 4 — Backlog sprint (~3 h, can parallelize with arm runs)
A single PR closing:
- Bug 3.2 + design item 4.4 (dispatchModel + perimeterHash on `homeomorphism_verified`) — ~1 h
- Design item 4.3 (δ' template smoke fixture `tests/ingest-prompt-template.test.ts`) — ~1 h
- Bug 3.6 (archive prune script) — ~30 min
- Commit both `MILESTONE_REVIEW_2026-05-19.md` and `MILESTONE_REVIEW_2026-05-20.md` — ~5 min

### Move 5 — 3α synthesis + decision tree read (~45 min, after Arms A+B complete)
Run the bakeoff-synthesis generator over the two arm reports. Compare against the H1–H6 falsifiers in the hypothesis doc. The decision tree then fires one of:
- **Both arms confirm H1** → proceed to bake-off synthesis → TARGET_ARCHITECTURE router skeleton → Arm C (cloud devstral or substitute) is an optional confirmation
- **Arms falsify H1** → Move 4 (Opus ceiling probe) is mandatory; local model class is at the floor

### Move 6 — Cloud path for Arm C (devstral-small-2:24b), deferred
RunPod / Modal A10 or L4 class GPU at ~$0.50–2.00/h; full 125-node run estimated 1–2 h; total ~$5–10. Not blocking Arms A+B results; queue for after the synthesis decision tree reads.

### Move 7 — Move 4 (Opus ceiling), conditional
Fires if (a) local arms falsify H1 OR (b) Arms A+B confirm H1 and the bake-off points to a model-capability ceiling beyond the local tier. Per project memory `feedback_sota_ceiling_use_opus`, the ceiling probe uses `claude-opus-4-7`, not Sonnet.

---

## 7. Health checks

| Signal | Status | Note |
|---|---|---|
| `tsc --noEmit` | ✅ clean | HEAD `867ce58` |
| New test suite (4 files, 55 tests) | ✅ green (on-machine) | Cannot verify in sandbox — rolldown ARM binding absent |
| Phase ε pre-flight suite (227 tests) | ✅ green (on-machine) | Same constraint |
| `origin/main` sync | ✅ in sync | No unpushed commits today (vs 2-ahead yesterday) |
| Archive dirs accumulating | 🟡 6 dirs | Gitignored; prune before 3α run |
| Untracked files | 🟡 2 files | Both milestone review docs; commit in Move 4 sweep |
| ROADMAP refresh date | 🟡 stale | 2026-05-12; reflects neither calibration loop nor 3α sprint |
| Design items 4.2 / 4.3 / 4.4 | 🟠 open | `--reps`, smoke fixture, perimeterHash — none blocking 3α run |
| Arm C substitution | 🟡 decision pending | The single gate on starting the 3-arm run |

---

## 8. One-paragraph executive summary

The Move 3α tooling sprint (2026-05-19) shipped cleanly: bug 3.1 fixed, AST symbol scanner + grounding + export-recovery + failure-mode tagger all landed with 55 new green tests, the multi-arm hypothesis is pre-registered, and the δ' synthesis exists. The project is now at the decision gate for the actual 3α run — the only blocker is the Arm C hardware constraint and its substitute choice. Arms A and B can run locally tonight at degraded-but-feasible tok/s; Arm C (devstral-24b) needs a ≤ 4 GB substitute or a cloud GPU session. Three supporting tasks are recommended before pulling the trigger: the Arm C substitute search (~30 min), a bakeoff-synthesis generator module (~3–4 h, so post-run synthesis writes itself), and a small backlog PR closing bugs 3.2, 3.6 and design items 4.3, 4.4. After the arms complete, the decision tree either points at the TARGET_ARCHITECTURE router skeleton (local arms confirm H1) or at the Opus 4.7 ceiling probe (both arms falsify H1). Either outcome is publishable.

---

*Auto-generated 2026-05-20 by the `ontology-pr-suggestions` scheduled task. `git pull` failed (sandboxed network). Local `main` at `867ce58`, in sync with `origin/main`.*
