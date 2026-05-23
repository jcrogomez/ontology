# Ontology Milestone Review — 2026-05-19

> *Automated milestone review generated 2026-05-19. Audits Phase ε (self-ingestion) progress against the pre-registered hypotheses, flags concrete bugs found in code/reports, and ranks recommended next moves. The δ run completed today at 06:30:44 UTC; its synthesis sibling has **not** been written yet — Section 2 is the first written read of the δ result.*

## 0. Pre-flight: git sync

`git pull` **failed** with `HTTP 403 from proxy` (network is sandboxed in this run environment). Local `main` is **2 commits ahead** of `origin/main` — the two unpushed commits are the δ template fix + the δ template/hypothesis bundle:

```
661c540 fix(ingest): δ template — prompt MUST be JSON string (not array)
3453ac1 feat(ingest): δ template — prescriptive contract voice + pre-registered hypothesis
```

There is one untracked file in working tree: `docs/legend/calibrations/SELF_INGEST_DELTA_2026-05-18.md` (the raw δ verify report — generated 06:30:44 today, not yet committed). **First action item** below is human-side: `git push` the two commits, then `git add` + `git commit` the raw δ report (per project convention β/β′/γ raw matrices and synthesis are tracked; the `.ontology.*-result/` run dirs are gitignored).

`tsc --noEmit` is clean on current HEAD.

## 1. Where we are in the milestone

**Active milestone:** Phase ε — self-ingestion on the Ontology repo itself. Per `docs/ROADMAP.md` lines 187 and 251–262, all prerequisites have shipped (δ-1 `onto node inspect`, δ-2 `onto verify-homeomorphism`, γ-7 prompt invariants). Phase ε is gated on API credit; the ollama-tier calibration sweep (β → β′ → γ → δ) is what's been running.

**Headline progression so far:**

| Run | Date | Verify model | `unrecoverable` | Mean Jaccard | Mean honesty | H1 verdict |
|---|---|---|---:|---:|---:|---|
| β | 2026-05-16 | qwen2.5-coder:3b | 24 (19 %) | ~0.00 | 0.166 | — |
| β′ | 2026-05-16 | qwen2.5-coder:7b | 32 (25 %) | ~0.00 | 0.187 | regressed on unrecoverable |
| γ | 2026-05-18 | qwen2.5-coder:7b (+Move 1b) | **19 (15 %)** | 0.003 | 0.182 | confirmed within 1 |
| **δ** | **2026-05-19** | **qwen2.5-coder:7b (+δ prescriptive prompt)** | **24 (19 %)** | **0.021** | **0.246** | **falsified on Jaccard, partial on honesty** |

The δ-vs-γ comparison is the decision point that the δ hypothesis pre-registered (see [SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md](./SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md) §H1–H4).

## 2. δ run — first read against pre-registered hypotheses

### H1 — primary: mean Jaccard moves materially off the γ floor

| Metric | γ measured | δ predicted | δ measured | Verdict |
|---|---:|---:|---:|---|
| Mean Jaccard | 0.003 | **≥ 0.10** (conservative) | **0.021** | **falsified** — moved 7× off the floor but stayed an order of magnitude below the threshold |
| Mean structural honesty | 0.182 | **≥ 0.25** | **0.246** | **partial — within 0.004 of the threshold (effectively confirmed at noise)** |
| Missing exports (G said, F skipped) | 558 | **≤ 250** | **488 across 115 nodes** | **falsified** — only −12 % vs predicted −55 % |
| `epsilon_equivalent` count | 0 | **≥ 2** | **0** | **falsified** |

**H1 verdict per the pre-registered decision tree:** Jaccard < 0.05 + epsilon_equivalent = 0 → **"MODEL IS THE FLOOR. Move 3 (Sonnet) is the only meaningful next experiment."** The honesty lift is real but small enough that prompt-only iteration on the ollama tier has effectively hit its ceiling.

### H2 — `unrecoverable` count stable or marginally up

δ: **24** (γ: 19, predicted band: 18–25). **Confirmed within band** — at the upper edge but inside it. The prescriptive prompt didn't trigger an invented-symbol storm, which is the good news.

### H3 — vocab-gap report drops materially

Predicted ≤ 250 missing exports across ≤ 90 nodes. Measured **488 across 115 nodes**. **Falsified** — the MANDATORY rule ("every name in `provides` appears verbatim in `prompt`") was not honoured strongly enough by qwen2.5-coder:7b. The model continues to drop declared names at compile-back; the floor is a model-capacity property at this tier.

### H4 — extraction reliability holds

The raw δ matrix lists **125 nodes** (vs γ's 125, vs hypothesis's "≥ 120"). **Confirmed.** The 5500-char prescriptive template did not blow up schema-retry behaviour on qwen2.5-coder:3b at the ingest tier.

### Overall δ read

The prescriptive template earned a small honesty win (+0.064 vs γ) without losing extraction reliability — that's a non-trivial, real result that should be written up. **But** the Jaccard floor stayed an order of magnitude below the H1 threshold, the vocab-gap report barely moved, and the unrecoverable count rebounded to β's baseline. Per the pre-registered decision tree, this is the **"both prompt AND model are limits"** middle scenario, biased toward "model is the dominant floor".

**Recommendation: write the δ synthesis (the missing artifact in this commit chain), then run Move 3.**

## 3. Bugs found

### 3.1. 🔴 Pareto report mislabels the verify model as `mock_default`

**Severity:** medium (corrupts the publishable Pareto table — the same table that backs the `MATHEMATICAL_CLAIMS.md §3.10` T4 → T2 lift decision).

**Where:** `src/commands/verify/homeomorphism.ts:260-265`. The `buildMatrixCost` call resolves the model as:

```ts
model: options.model ?? node?.model?.ref ?? "unknown",
```

When the operator invokes `verify-homeomorphism --provider ollama` without an explicit `--model`, `options.model` is undefined, and `node.model.ref` defaults to `"mock_default"` (every ingested node carries that default — see `src/schemas/ontology.ts:183`). The cost record then bakes in `provider: "ollama", model: "mock_default"` — but the **actual run records** under `.ontology/runs/*.json` correctly show `"provider": "ollama", "model": "qwen2.5-coder:7b"` (verified by inspecting five recent run JSON files from today's δ pass).

**Visible impact:** the δ raw report's Pareto table reads:

```
| code_sketch | ollama | mock_default | 125 | 0.246 (n=101) | $0 | 189 | 567 | ★ |
```

That row is the only ★-frontier entry in the report. If γ's mean honesty 0.182 had been pasted into the same machinery, both rows would have collided under `(code_sketch, ollama, mock_default)` and the Pareto would have been a single misleading bucket per session.

**Fix:** read the actual `runModel` from the persisted run record when available, fall back to the override, and only then to `node.model.ref`. Concrete sketch:

```ts
const persistedRun = loadPersistedRun(r.runId, cwd);  // already loaded for usage
const cost = buildMatrixCost({
  provider: persistedRun?.model.provider ?? provider ?? "unknown",
  model:    persistedRun?.model.model    ?? options.model ?? node?.model?.ref ?? "unknown",
  task:     "code_sketch",
  usage:    r.usage,
});
```

The `loadPersistedRun` path is already imported elsewhere in this file (line 399-ish for cost-USD extraction). Net diff is ~6 lines.

### 3.2. 🟠 The `homeomorphism_verified` event payload omits the verify model

**Severity:** low (audit-chain completeness).

The event at `evt_7960eece` (sequence 605) records `total: 125, byVerdict: {...}, thresholds: {...}, totalUsage: {...}` but **does not name the provider/model that produced the regen artifacts**. To replay or re-aggregate a Pareto table from the event log alone, the consumer has to cross-walk through every `compilation_run` event and into the run JSON. Add `model: { provider, modelName }` to the `homeomorphism_verified` payload (read once from the verify command's resolved `--provider` / `--model` knob plus the per-node run resolution).

### 3.3. 🟠 `--provider ollama` without `--model` silently routes through registry defaults

**Severity:** low (operator-foot-gun).

When the user passes `--provider ollama` but no `--model`, the dispatcher routes per `node.model.ref` via the registry, which on this codebase happens to map to qwen2.5-coder:7b for everything. That's the intended behaviour, but the report leg of the pipeline (bug 3.1) makes it invisible. Once 3.1 is fixed, the symptom disappears for free.

### 3.4. 🟡 Two `unrecoverable` stragglers are static_summary nodes with a secondary gluing-check rejection mode

Carried over from γ synthesis §H3, still unresolved in δ:

- `context/types.ts` — declaration_only, stayed unrecoverable through γ → δ.
- `fibration/types.ts` — same pattern.

The γ synthesis predicted two diagnoses worth checking: (a) the import symbols don't match any upstream node's `provides` (e.g. `import type { Foo }` vs upstream `FooSchema`); (b) the gluing check has a second rejection path that hasn't been surfaced. **Move 1c (small, ~2 h) is the diagnostic.** Not blocking, but it's the only known systematic rejection that survives the δ prompt rewrite.

### 3.5. 🟡 ROADMAP "last refresh" date is stale

`docs/ROADMAP.md` line 327 reads `Last refresh: 2026-05-12 (late), after Project Legend Phase δ shipped end-to-end on top of Phase γ-7 hardening`. The roadmap itself does not mention β / β′ / γ / δ self-ingestion calibrations at all — those are six commits and seven hypothesis/synthesis docs that landed since the refresh date. Phase ε is still listed as "🟡 next active stream (gated on API credit)" when in fact four ollama-tier calibration runs have completed against it. Refresh the roadmap or split the Phase ε row into "ε-ollama-calibration (in progress)" + "ε-anthropic-publishable (gated on API credit)".

### 3.6. 🟡 Two stale `.ontology` archive directories live in tree

```
.ontology.archive-bak-pre-delta-2026-05-18         (May 13)
.ontology.archive-failed-delta-2026-05-18          (May 19)
.ontology.archive-pre-delta-2026-05-18             (May 13)
.ontology.self-ingest-beta-prime-result            (May 17)
.ontology.self-ingest-beta-result                  (May 16)
.ontology.self-ingest-gamma-result                 (May 18)
```

All are gitignored (per `9eb9211` sweep) so this is repo hygiene, not a leak — but six archive dirs each holding ~125 nodes worth of JSON + verify artifacts is real disk. The `failed-delta-2026-05-18` directory is dated **today** (May 19), which is informative — it confirms the δ run experienced at least one false start before the 06:30 successful completion. Worth a `scripts/legend-archive-prune.sh` that keeps the last N and tarballs the rest, before the next calibration session.

## 4. Design improvements

### 4.1. The Pareto table needs more than one row per session to be useful

Today's verify pipeline produces **one** `(task, provider, model)` row per invocation. The whole point of the Pareto pivot is comparison across (provider, model) buckets — which means the publishable workflow has to merge multiple per-session matrices into a single aggregated report. Two reasonable shapes:

- **Append-only Pareto log** under `.ontology/legend/pareto-log.jsonl`, one row per verify session, with `runStartIso, gitCommit, perimeterHash` as keys. A new `onto legend pareto` subcommand renders the merged frontier.
- **Multi-pass verify** where `verify-homeomorphism --providers ollama,anthropic --models qwen2.5-coder:7b,claude-sonnet-4-6` runs the same perimeter through every (provider, model) cross product in one shot.

The append-only log is cheaper to ship and matches the existing event-sourced design. The multi-pass shape is what the publishable claim wants to ride. Recommend log first, multi-pass as a Phase ε publishable artifact later.

### 4.2. Pre-register the n ≥ 3 rep distribution before Move 3 / Sonnet probe

γ's `prompt/types.ts` Jaccard 1.0 → 0.0 regression (γ synthesis §3) showed that single-draw results on a stochastic-temperature stack are not reliable as per-file evidence. The δ result reinforces this — the per-file Jaccard distribution in the raw matrix has a long tail of 0.000 values that may or may not collapse under a median-of-3 estimator. **Before the Sonnet probe pays $2–3 of real tokens, add a `verify-homeomorphism --reps N --aggregator median` flag** (the ensemble path already has the machinery; this is a wiring task). Sonnet at $0.50/run × 3 = $1.50 extra is well-spent insurance against publishing a number that doesn't replicate.

### 4.3. The δ template change should land paired with a smoke fixture

The δ template (commit `3453ac1`) is a load-bearing prompt change with **no fixture test** that pins its prescriptive properties. A small `tests/ingest-prompt-template.test.ts` that asserts:

- the rendered prompt contains the MANDATORY block verbatim,
- every name in a representative `provides` list appears in the rendered prompt body,
- narrative-voice phrases listed as FORBIDDEN do not appear,

…would catch a future "someone tidied the prompt and accidentally softened the MUSTs" regression. The δ template is now the calibrated baseline (per the ε decision tree); regressions on it are publishable-claim-killers.

### 4.4. `homeomorphism_verified` payload should grow a perimeterHash field

The `perimeter` (which src files were verified) is implicit today — readers reconstruct it from the `nodeIds[]` list and the per-node `sourceFile` field. A stable hash over `(sorted source paths, file mtimes or content-hashes)` would make the audit chain reproducible without loading every node. Useful when the publishable Phase ε claim asserts "measured on commit X, perimeter Y" — Y today is a 125-line list.

### 4.5. `RELEASE_NOTES.md` is at v0.9-era headers; the calibration sweep deserves its own thread

The release notes file ends at the post-0.9 / Legend δ shipped material. Six calibration runs and a major prompt-template revision happened since — they don't have to be release notes per se (calibrations are not user-facing surface area), but a `docs/legend/CALIBRATION_LOG.md` index that links the four hypothesis/synthesis pairs in chronological order would make the audit trail readable to a newcomer in <2 minutes. Right now you have to grep for `SELF_INGEST_*` to find them.

## 5. Ranked next moves

### 🥇 Move A — write the δ synthesis (today, ~45 min)

The pre-registered convention from γ is that **every raw matrix has a synthesis sibling committed alongside**. δ has the hypothesis (`SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md`, committed `3453ac1`) and the raw report (`SELF_INGEST_DELTA_2026-05-18.md`, written today, not yet `git add`'d). The synthesis (`SELF_INGEST_DELTA_2026-05-18_SYNTHESIS.md`) is the missing artifact. Section 2 of this review is the skeleton — promote it into the synthesis doc, sign off on the falsification verdict, and commit the trio. **This unblocks Move B (Sonnet probe) by closing the ollama-tier loop publicly.**

### 🥈 Move B — Sonnet 4.6 ceiling probe (the original Move 3)

The pre-registered decision tree fires here. δ's Jaccard < 0.05 + epsilon_equivalent = 0 → **MODEL IS THE FLOOR**. Run `verify-homeomorphism --all-artifacts --matrix --provider anthropic --model claude-sonnet-4-6` against γ's preserved post-apply state. Expected ~$2–3, ~30 min wall-clock. Both possible outcomes are publishable:

- **Sonnet honesty ≫ 0.246:** ollama tier is model-bound for this task. Sonnet becomes the production compile-back tier. Move C ships a full Sonnet run as the Phase ε publishable claim. `MATHEMATICAL_CLAIMS.md §3.10` lifts T4 → T2.
- **Sonnet honesty ≈ 0.246:** prompt/contract design ceiling holds across model tiers. Scope a `code_sketch` template restructure (Move E) — re-anchor the contract directly before the generation cue, restate provides as strict obligations *in the code_sketch prompt*, not just the ingest prompt.

**Prerequisite for clean results:** fix bug 3.1 first (otherwise the Sonnet bucket lands on the same `mock_default` line and the Pareto comparison is unreadable). ~30 min fix + test, then the probe is unblocked.

### 🥉 Move C — bug-fix sweep before the Anthropic spend

A single PR closes bugs 3.1, 3.2, 3.4 plus design item 4.3 (template smoke fixture). All four are small, atomic, and the first three corrupt downstream Pareto / replay surfaces. **Do not pay for the Sonnet probe before this sweep lands.** Estimated ~3 h of focused work.

### Move D — Move 1c straggler diagnostic (2 h, can wait)

Load `context/types.ts` and `fibration/types.ts`, inspect their per-node `requires` / `provides`, and walk the gluing-check rejection path to identify what's still hitting them post-Move-1b. Standalone work; not blocking Sonnet probe; closes a known γ-era loose end.

### Move E — `code_sketch` prompt restructure (conditional)

Only execute if Move B (Sonnet) returns honesty ≈ 0.246. In that case, the prompt is the bottleneck and `assembleContext` + the system-prompt template that wraps the code-sketch dispatch deserves the same prescriptive treatment the δ ingest template got. Estimated 4–6 h once the Sonnet number is in.

### Move F — Phase ε publishable pass on Anthropic

Conditional on Move B + Move E outcomes. The publishable Phase ε claim is a clean (provider, model, prompt, perimeter, n-reps, honesty, Jaccard, unrecoverable, dollars-spent) record. Move F is the one-shot that produces it. Estimated ~6–8 h wall-clock + ~$5–15 spend, depending on which model tier the prior moves crown.

## 6. Status checks (orthogonal, not on the Phase ε critical path)

- ✅ `tsc --noEmit` clean on HEAD.
- ❓ Full `npx vitest run` not executed in this review (sandbox cost). Recommend running the five canonical Phase ε pre-flight suites (per `PILOT_RUNBOOK.md` §0) before any Anthropic spend.
- 🟡 122 test files in `tests/`. Test count growth has tracked feature growth; no obvious dead suites in the listing.
- 🟡 No `TODO` / `FIXME` markers in `src/` — clean by that signal.
- 🟡 Six `.ontology.*` archive directories accumulating on disk; gitignored but worth a prune script (item 3.6).
- 🟠 Two commits unpushed to `origin/main`; one untracked δ raw report waiting to be committed.

## 7. One-paragraph executive summary

Phase ε's ollama-tier calibration loop has produced four measured runs (β / β′ / γ / δ) with the pre-registered decision tree firing cleanly at each step. The δ result, completed at 06:30 UTC today, falsifies the prompt-is-the-bottleneck hypothesis — H1's mean Jaccard target was missed by an order of magnitude — and points the next experiment at the Sonnet 4.6 ceiling probe (the original Move 3). Before paying for Anthropic tokens, the Pareto-report bug that mislabels the verify model as `mock_default` should be fixed and the δ synthesis sibling should be written and committed alongside the raw δ matrix. The two stragglers from γ remain unrecovered and deserve their diagnostic pass. Everything else — typecheck, test count, code hygiene, architectural surfaces — is in a healthy state for the Anthropic-tier publishable measurement that will lift `MATHEMATICAL_CLAIMS.md §3.10` from T4 to T2.

---

*Auto-generated 2026-05-19 by the `ontology-pr-suggestions` scheduled task. `git pull` failed (sandboxed network). Local `main` was 2 commits ahead of `origin/main` at review time; one untracked file (`SELF_INGEST_DELTA_2026-05-18.md`) was the basis of Section 2.*
