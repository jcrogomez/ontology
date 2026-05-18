# Ontology — Milestone review 2026-05-18

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout at `main` (`4782251` — "docs: add self-ingestion β'
> results"). **`git pull` from the sandbox failed again — `HTTP 403`
> from proxy to `github.com` (ninth consecutive day). The local clone
> is the source of truth; the branch is **3 commits ahead of
> `origin/main`** (`c711fc1`, `598fb25`, `4782251`) and must be
> pushed locally before the next teammate / CI sync.**
>
> The previous review (`MILESTONE_REVIEW_2026-05-17.md`) closed with
> "Phase ε is no longer one command away — it's one design move
> away" and ranked **Move 1b** as the cheapest meaningful next
> experiment. In the 24 h since: **the β′ raw + synthesis documents
> were promoted from untracked to committed (`4782251`), but none
> of the five ranked code fixes from yesterday landed.** No new
> Phase ε measurement was run; no code change in `src/` since
> `598fb25` (registry ordering fix). The branch is now 3 ahead of
> `origin/main` and the same five-item bug list is still open.

---

## 1. Headline status

**Quiet day on the code axis; one docs-only commit landed.** The
β′ data and synthesis that were on disk untracked at MR_2026-05-17
filing time are now committed (`4782251`, +476 LoC across the two
calibration docs). That closes the documentation gap on β′, but
leaves the actionable items it identified untouched:

- **Move 1b (the vocabulary-domain fix in `static-summary.ts`) has
  NOT been implemented.** Lines 158 and 244 still emit
  `i.modulePath` into `requires`. The 6 newly-`unrecoverable`
  static_summary files are still blocked by the gluing-check
  mismatch.
- **`.gitignore` still does NOT match `.ontology.archive-*/` or
  `.ontology.self-ingest-*-result/`.** Two `.ontology.*` directories
  are currently untracked — same situation as the last three
  reviews. **This is the fourth consecutive review where this
  three-line fix has slipped.**
- **`MAX_OUTPUT = 4096` still hard-coded** in
  `src/commands/ingest/index.ts:635`. Move 3 (the Sonnet 4.6 probe)
  will hit this ceiling on any file >~3 KB.
- **`extractIntentEnsemble` fatal-failure counting bug** at
  `src/commands/ingest/index.ts:781-795` still emits
  `validCount: 0, failedCount: reps.length + 1`. Latent until the
  ensemble path is exercised, but Move 3 may exercise it.
- **`MODEL_CAPABILITY_PROFILES` still has zero Anthropic entries**
  (`src/runtime/llm/model-capabilities.ts:76-99` — four Ollama
  profiles, none for Opus / Sonnet / Haiku).
- **Dispatcher fallback through `preferred[1..N]` still not
  implemented** (`src/runtime/llm/registry.ts:171` still returns
  `preferred[0]` only; `src/runtime/llm/dispatcher.ts` has zero
  references to `preferred` at all).

Net change against MR_2026-05-17's recommendation list:
**0/15 ranked items closed.** Only the auxiliary "commit the
untracked β′ docs" step happened. The 24 h has been a documentation
catch-up, not a development step.

The first three items on MR_2026-05-17's "Now (this session)" list
remain:

1. `.gitignore` patch (3 lines)
2. push the ahead-commits (now 3, not 2)
3. Move 1b (~10 lines + 2 tests)

**These three items together are roughly 45 minutes of work.** The
fact that they keep slipping is becoming the dominant signal in
the reviews.

---

## 2. What happened in the last 24 h

One commit on `main` since MR_2026-05-17:

| Commit  | Phase | Headline |
|---|---|---|
| `4782251` | docs | add self-ingestion β' results (the two untracked calibration docs become tracked) |

Specifically — `4782251` committed:

```
docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16.md            (+329)
docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md  (+147)
```

But **did not** commit:

- The β′ hypothesis pre-registration
  (`SELF_INGEST_BETA_PRIME_2026-05-16_HYPOTHESIS.md`) — already
  in the tree at `c711fc1`, so it's fine.
- The two run-artefact directories
  (`.ontology.self-ingest-beta-result/`,
  `.ontology.self-ingest-beta-prime-result/`) — still untracked
  AND still un-`.gitignore`-d, exactly as flagged.
- Yesterday's review (`MILESTONE_REVIEW_2026-05-17.md`) or the
  one before (`MILESTONE_REVIEW_2026-05-16.md`) — both still
  untracked.

### Sequence of events (this window)

1. β′ raw matrix + β′ synthesis were committed verbatim from
   disk (`4782251`).
2. No new measurement, no code change, no test addition.
3. The MR_2026-05-17 review file itself was filed but never
   `git add`-ed.

### `tsc --noEmit` status

Clean from the sandbox (`./node_modules/.bin/tsc --noEmit` exit 0).

### Repo state

- **Active branch:** `main` (`4782251`), **3 ahead of
  `origin/main`** (per local `git log origin/main..HEAD` — the
  exact `origin/main` SHA cannot be re-checked because the proxy
  is 403'd; this count is based on the assumed-unchanged remote
  state at last successful fetch).
- **`git status`:** working tree has 4 untracked items —
  2 run-artefact directories + 2 review docs (yesterday's and
  the day before's).
- **GitHub proxy:** 403'd from the sandbox for the **ninth**
  consecutive day. `git pull` was attempted at task start and
  failed with HTTP 403; the local repo is authoritative.
- **`vitest run`:** still blocked in the sandbox by the missing
  `@rolldown/binding-linux-arm64-gnu`. Run `npm test` locally
  before any merge.

---

## 3. Pipeline state — Project Legend

No state change versus MR_2026-05-17 §3. The Pareto frontier is
unchanged:

| Run | Task | Provider | Model | n | Honesty | Cost | Pareto |
|---|---|---|---|---:|---:|---:|:---:|
| β | code_sketch | ollama | `qwen2.5-coder:3b` | 124 | 0.166 | $0 | (dominated by β′) |
| β′ | code_sketch | ollama | `qwen2.5-coder:7b` | 126 | 0.187 | $0 | ★ current best @ $0 |

Two-point Pareto with negligible slope through the ollama tier
(MR_2026-05-17 §3 still stands). The next data point that can
change the shape is still **outside the ollama tier** — either
Move 1b (cheapest, $0, validates the gluing-check vocabulary fix)
or Move 3 (Anthropic Sonnet 4.6 ceiling probe, ~$2–3).

Phase ε remains gated on whichever of {Move 1b, Move 3} ships
first. Promotion to `0.4.0` final is still gated on a Phase ε
self-ingestion report at
`docs/legend/calibrations/SELF_INGEST_<date>.md` with non-trivial
n and measured ε — and on `MATHEMATICAL_CLAIMS.md` §3.10
upgrading from T4 to T2 with a citation to that report
(`CHANGELOG.md` lines 14-26).

---

## 4. Bug list — open items + re-verification

The hierarchy from MR_2026-05-17 carries over essentially unchanged.
The line numbers, file paths, and predicted impacts were re-verified
against the current tree (`4782251`).

### 4.1 `.ontology.archive-*/` and `.ontology.self-ingest-*-result/` STILL NOT gitignored — **mid, foot-gun, recurring × 4**

**Carried over unfixed from MR_2026-05-15 §4, MR_2026-05-16 §4.3,
MR_2026-05-17 §4.1.** Confirmed: `.gitignore` has `node_modules/`,
`dist/`, `.ontology/`, `coverage/`, etc. — no glob for
`.ontology.archive-*` or `.ontology.self-ingest-*-result/`.

Today the working tree has **two** untracked `.ontology.*`
directories from the β and β′ runs. A wildcard `git add .` by
either operator or automation would stage all of them.

**Fix (3 lines, no excuse to defer):** append to `.gitignore`:

```
.ontology.archive-*/
.ontology.self-ingest-*-result/
```

**This is the only "now" item on every review since MR_2026-05-15
that has not landed. Land it in the same commit as Move 1b.**

### 4.2 `MAX_OUTPUT = 4096` still bites the Anthropic side — **mid, blocks paid pass, recurring × 4**

Carried over unfixed from MR_2026-05-15 §4.3, MR_2026-05-16 §4.1,
MR_2026-05-17 §4.2. Confirmed: `src/commands/ingest/index.ts:635`
still hard-codes `const MAX_OUTPUT = 4096;`.

The Anthropic adapter's own default is 8192; γ-7 calibration
explicitly required 8192. Phase ε's Move 3 (Sonnet 4.6 verify
probe) will hit this ceiling on files > ~3 KB. **Land before the
Sonnet probe, not after.**

**Fix:** raise to 8192, pin with a comment citing γ-7
(`docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md`).

### 4.3 `extractIntentEnsemble` mis-counts on fatal-failure path — **mid, telemetry-only, recurring × 3**

Carried over unfixed from MR_2026-05-16 §4.2, MR_2026-05-17 §4.3.
Confirmed: `src/commands/ingest/index.ts:781-795` still emits
`validCount: 0, failedCount: reps.length + 1` on a fatal break.

The bug is latent because the Phase ε β′ run did not exercise the
ensemble path. The Anthropic-side Move 3 will exercise it if it
runs with `--ensemble high-confidence` (see PILOT_RUNBOOK §2).
**Pin a test for the rep-1-ok, rep-2-fatal trace.**

### 4.4 `MODEL_CAPABILITY_PROFILES` still has no Anthropic entries — **mid, predates Move 3, recurring × 3**

Carried over unfixed from MR_2026-05-16 §4.9, MR_2026-05-17 §4.4.
Confirmed: `src/runtime/llm/model-capabilities.ts:76-99` has
exactly four profiles — `qwen2.5-coder:3b`, `llama3.2:3b`,
`deepseek-r1:1.5b`, `phi3:mini`. Zero entries for Opus 4.7,
Sonnet 4.6, or Haiku 4.5.

Move 3 will dispatch on Sonnet; the calibration write-up wants a
stable profile reference. **Fix (~30 LoC):** add three profiles
citing γ-2 (HASH_TS) and γ-7 (Vibe-Reasoning). Empty `bannedFor`.

### 4.5 Dispatcher has no `preferred[]` fallback — **mid, architectural, recurring × 2**

Carried over unfixed from MR_2026-05-17 §4.5. **Re-verified:**

- `src/runtime/llm/registry.ts:171` still
  `return table[task]?.preferred[0];` (line 171, unchanged).
- `src/runtime/llm/dispatcher.ts` has **zero** references to
  `preferred`. The fallback is genuinely not wired.

Today it's still papered over by reordering `preferred[]`
(`598fb25` puts deployable models first). The proper fix is a
dispatcher-level retry loop — see MR_2026-05-17 §4.5 for the
~25 LoC sketch.

### 4.6 Gluing-check vocabulary-domain mismatch — **MID → HIGH, blocks Move 1's aggregate gain, recurring × 1**

**Carried over unfixed from MR_2026-05-17 §4.6.** **This is now
the single highest-leverage open item** because:

(a) the β′ synthesis ranks it as the cheapest meaningful
experiment (~10 LoC + 30 min verify-only re-run);
(b) the synthesis explicitly predicts it drops `unrecoverable`
from 32 back below β's 24;
(c) it's a prerequisite for trusting the Move 3 Sonnet probe — if
the gluing-check is silently rejecting Move 1's `requires`,
Move 3's results on those same files are noise.

**Re-verified state:**

```ts
// src/runtime/legend/static-summary.ts:158 (barrel handler)
const requires = uniqueInOrder([
  ...(vocabulary?.imports ?? []).map((i) => i.modulePath),  // ← module paths, not symbols
]);

// src/runtime/legend/static-summary.ts:244 (declaration_only handler)
const requires = uniqueInOrder(
  (vocabulary?.imports ?? []).map((i) => i.modulePath),  // ← same bug
);
```

Note: line 252 of the same file already does the right thing for
`importedSymbols` (uses `.flatMap((i) => i.symbols)`); the fix is
to apply that same pattern to the `requires` builder.

**Fix (Move 1b, ~10 LoC):** swap both call sites to
`...flatMap((i) => i.symbols)` — same shape as line 252. Pin two
tests: (a) barrel with named re-exports (`requires` should be
symbol names, not module paths); (b) declaration_only with type
imports (`requires` should be imported type names).

### 4.7 Move 1's static-summary `requires` array can leak file-extension fragments — **low, recurring × 1**

Carried over unfixed from MR_2026-05-17 §4.7. Defensive regression
test: `buildStaticSummary` never emits a `requires` entry ending
in `.js` / `.ts` / `.tsx`. Catches future drift back to module-path
emission.

### 4.8 `verify-homeomorphism` had no actionable error surface — **low UX, recurring × 1**

Carried over unfixed from MR_2026-05-17 §4.8. `--preflight` flag
to dispatch one empty `code_sketch` request per `(provider, task)`
pair the run will need; fail-fast on adapter errors. ~20 LoC.
**Land alongside Move B (dispatcher fallback).**

### 4.9 `schema_module` overfit predicate — **mid, deferred until post-Phase-ε, recurring × 1**

Carried over from MR_2026-05-17 §4.9. β′ confirmed the bimodality
prediction but blurred by the overfit. **Defer to alongside the
post-ε ζ release-notes write-up.** Not blocking.

### 4.10 Static-summary `forbids` / `rules` still prose strings — **design, low, recurring × 2**

Carried over from MR_2026-05-16 §4.6, MR_2026-05-17 §4.10. β′
confirmed this regression in the deflected files. Lift to
structured tokens (`forbids: ["runtime-decl", "side-effect"]` for
barrels, `forbids: ["runtime-decl", "value-decl"]` for
declaration-only). ~30 LoC. **Defer to post-Move-1b.**

### 4.11–4.13 React-component heuristic, test-file AST walk, hardening regressions

All carried over from MR_2026-05-17 §4.11–4.13. No regressions,
no priority change.

### 4.14 The "easy fix never lands" pattern — **NEW, meta-process**

**Surfaced by the trend, not by code.** The `.gitignore` patch
(§4.1) is now on its **fourth consecutive review** without
landing despite being three lines of text and named as a "Now,
this session, do this first" item in MR_2026-05-17. Move 1b is
on its second review with the same status, despite the synthesis
explicitly calling it "~10 LoC + ~30 min" of work.

**The pattern:** scheduled-task reviews run every morning, identify
small high-leverage fixes, file them in priority order — and the
user doesn't pick them up because the time gap between review and
hands-on session leaves them as "I'll do them next time". By next
time, the daily review has refreshed and re-flagged the same
items, padding their carry-over count.

**Fix options (pick one):**

- **(a) Land a single `chore: open-items-sweep` commit** that
  closes §4.1 + §4.2 + §4.3 + §4.4 + §4.5 + §4.6 + §4.7
  together. Total estimate: ~110 LoC + ~5 tests + 1 manual
  verify run. ~2 h of focused work. This clears the backlog
  before Phase ε's next measurement so the next review starts
  fresh.

- **(b) Drop the scheduled-task review for 24 h** to break the
  carry-over feedback loop and re-run only after the open items
  list is empty.

- **(c) Tighten the scheduled task's prompt to NOT re-flag items
  already on the carry-over list** unless they've been flagged
  ≥ 3 times — and only emit a separate "the carry-over list is
  N items deep" summary at the top. This makes the carry-over
  count itself the signal instead of being buried in §4.

**Recommendation: (a)** — clear the backlog in one focused
session, then resume Phase ε measurement on a clean tree. The
carry-over count is now a meaningful drag on review readability.

---

## 5. Suggested next steps — priority order

### Now (this session, before any new measurement)

1. **The open-items sweep (recommended §4.14 option a)** —
   single commit covering:

   - §4.1 — `.gitignore` += `.ontology.archive-*/`,
     `.ontology.self-ingest-*-result/` (3 lines).
   - §4.6 — Move 1b: swap `i.modulePath` → `i.symbols.flatMap`
     at `static-summary.ts:158, 244`. Pin two tests.
   - §4.2 — raise `MAX_OUTPUT` 4096 → 8192 at
     `ingest/index.ts:635`. Pin a comment citing γ-7.
   - §4.3 — fix `extractIntentEnsemble` fatal-failure counting
     at `ingest/index.ts:781-795`. Pin a test.
   - §4.4 — add Sonnet 4.6 / Opus 4.7 / Haiku 4.5 profiles to
     `model-capabilities.ts:76-99`. ~30 LoC.
   - §4.5 — dispatcher `preferred[1..N]` fallback in
     `dispatcher.ts`. ~25 LoC + 2 tests.
   - §4.7 — defensive regression test on module-path leak.

   Total: ~110 LoC + ~5 tests + 1 verify-only re-run of β′
   post-apply state to confirm Move 1b drops `unrecoverable` from
   32 toward β's 24. Expected wall-clock: ~2 h focused +
   ~30 min verify-only re-run.

2. **Push the three ahead-commits** (`c711fc1`, `598fb25`,
   `4782251`) and the sweep commit from step 1, **from the
   user's machine**:

   ```bash
   cd ~/Development/ontology
   git status                                  # confirm clean post-sweep
   git push origin main
   ```

   The proxy is still 403'd from the sandbox; nine days running.

3. **Commit MR_2026-05-16, MR_2026-05-17, MR_2026-05-18 (this
   file)** in a single `docs(reviews): land three review files`
   commit. The reviews are useful institutional memory and
   should not float untracked.

### Then (this week, after the sweep)

4. **Verify-only re-run with Move 1b** against the preserved
   `.ontology.self-ingest-beta-prime-result/` post-apply state.
   File a Phase ε γ measurement at
   `docs/legend/calibrations/SELF_INGEST_GAMMA_2026-05-XX.md`
   if the result is publishable; or a "Move 1b verify" appendix
   to the β′ synthesis if not. ~30 min, $0.

5. **If Move 1b drops `unrecoverable` below 24:** proceed
   immediately to Move 3 (Anthropic Sonnet 4.6 ceiling probe).
   Cost-estimate first per `PILOT_RUNBOOK.md` §2:
   `onto ingest <perimeter> --provider anthropic --cost-estimate`.
   Pre-register the hypothesis in
   `SELF_INGEST_SONNET_PROBE_HYPOTHESIS_2026-05-XX.md` (maintain
   the discipline that MR_2026-05-17 §6.4 calls out as
   load-bearing).

6. **If Move 1b doesn't move `unrecoverable`:** the gluing-check
   bug is somewhere else (likely upstream `provides` shape, not
   downstream `requires` shape). Write a `MOVE_1B_NULL_RESULT`
   appendix and proceed to Move 3 as a model-axis probe anyway —
   the prompt-bound vs model-bound question is independent of
   Move 1b.

### Then (Move 3 — Anthropic Sonnet 4.6 ceiling probe)

7. **Run verify-only on the preserved post-apply state with
   `--provider anthropic --model claude-sonnet-4-6`.** Predicted
   $2–3 spend, ~30 min wall-clock. The single answerable
   question: model or prompt?

8. **Write `SELF_INGEST_2026-05-XX_SONNET_PROBE.md`.** Either
   direction is publishable signal.

### Then (Phase ε close + ζ release prep)

9. **If Move 3 says "prompt-bound":** scope a `code_sketch`
   template restructure PR. Re-anchor the contract directly
   before the generation cue. Separate larger PR, not a
   Phase ε measurement.

10. **If Move 3 says "model-bound":** Move 4 — deploy Sonnet 4.6
    on the full perimeter (not verify-only) as the Phase ε
    publishable run. ~$15–30, ~2 h.

11. **Lift `MATHEMATICAL_CLAIMS.md` §3.10 T4 → T2** citing
    whichever direction Move 3 forced.

12. **Tag `0.4.0`.**

### Phase ζ — release + Open-Prompt

13. **Open-Prompt v0** — `onto sign`, `onto verify-published`,
    `onto replay`. Spec at `docs/OPEN_PROMPT.md`.

14. **Tighten `schema_module` predicate** (§4.9). Defer to after
    Phase ε close.

### Design / hardening (parallel work, low priority)

15. **Static-summary structured-tokens migration** (§4.10).
    ~30 LoC. Aligns deflected files with γ-7 direction.

16. **`onto verify-homeomorphism --preflight`** (§4.8). ~20 LoC.
    Fail-fast on model-availability before iterating nodes.

17. **Registry-default shared fixture refactor** (MR_2026-05-16
    §4.10). ~10 LoC. Carried over.

---

## 6. Design observations from the carry-over arc

### 6.1 The pre-registration discipline is still paying off, but it's been ~36 h since the last measurement

MR_2026-05-17 §6.4 called the pre-registration discipline
"load-bearing" and asked the user to maintain it through Move 3.
36 h later: no Move 1b, no Move 3, no new pre-registration. The
discipline doesn't decay if no measurement runs, but the
measurement cadence has dropped from "β + β′ in 48 h" to "zero
in the last 36 h". **A single Move-1b verify-only re-run would
restart the cadence at ~$0 cost.**

### 6.2 The gluing-check vocabulary contract is still implicit

MR_2026-05-17 §6.2 recommended adding a `// @semantic: symbol-name`
comment to the `requires` / `provides` fields in
`ExtractionResultSchema` plus a runtime invariant in the gluing
check that errors loudly when it sees a module-path-shape token.
Not landed. **Land alongside Move 1b** — without it, the next
contributor making the same mistake hits the same silent failure.

### 6.3 The doc-only commit pattern signals review-without-action

`4782251` committed the β′ raw + synthesis (the documentation
side of the work that ran on 2026-05-16) but did NOT commit any of
the code changes the synthesis recommended. The pattern across
the last week:

```
β ingest + apply ─▶ β synthesis (recommends Move 1, Move 2,
                                 Move 3) ─▶ Move 1 ships (f7bce43)
                                            ─▶ β′ ─▶ β′ synthesis
                                                     (recommends Move 1b,
                                                      Move 3, Move B)
                                                     ─▶ [STALL]
```

Move 1b is structurally identical to Move 1 — a small change to
`static-summary.ts`. The stall is not technical; it's a session
boundary. **Recommendation: schedule Move 1b for the next
hands-on session as the first action item, before any new
measurement design.**

### 6.4 The carry-over count is becoming the dominant review signal

Items by carry-over count this morning:

```
4 reviews:  §4.1 (.gitignore)
3 reviews:  §4.2 (MAX_OUTPUT), §4.4 (Anthropic profiles)
2 reviews:  §4.3 (ensemble counting), §4.5 (dispatcher fallback),
            §4.6 (Move 1b), §4.10 (forbids/rules prose)
1 review:   §4.7 (.js leak), §4.8 (preflight), §4.9 (schema_module)
new:        §4.14 (the carry-over pattern itself)
```

When the bottom line of every review starts with "Carried over
unfixed from MR_<date> §X", the review's signal-to-noise is
dominated by what didn't happen rather than what did. Option (a)
in §4.14 — landing the sweep — resets this. **Recommended.**

---

## 7. One-paragraph summary

**Phase ε's cadence stalled in the last 24 h.** One docs-only
commit (`4782251`) promoted the β′ raw + synthesis from
untracked to tracked, but none of the five ranked code fixes
from yesterday's review landed; no new Phase ε measurement was
run; the same five-item bug list — all small, all high-leverage,
total ~110 LoC + ~5 tests — has carried over for a fourth review
in the case of the `.gitignore` patch and a second review for
Move 1b. The β′ synthesis explicitly predicts Move 1b drops
`unrecoverable` from 32 back below β's 24 in a ~30-minute
verify-only re-run that costs $0; it remains the cheapest
meaningful next experiment. **Recommended action: land a single
`chore: open-items-sweep` commit covering §4.1 through §4.7
(the `.gitignore` patch, Move 1b, `MAX_OUTPUT` raise, ensemble
counting fix, Anthropic capability profiles, dispatcher
fallback, defensive module-path leak test), push the resulting
4 commits from the user's machine (the proxy is still 403'd from
the sandbox for the ninth consecutive day), then run the Move 1b
verify-only re-run as the first new Phase ε measurement in 36 h.**
The Sonnet 4.6 ceiling probe (Move 3) remains the only experiment
that can break the flat ollama-tier Pareto curve, but it
shouldn't run until Move 1b has either confirmed or falsified the
gluing-check vocabulary fix; otherwise the Move 3 data on those
same six static_summary files is noise. The pre-registration
discipline is still on the table — MR_2026-05-17 §6.4 made the
case clearly — and a `SELF_INGEST_SONNET_PROBE_HYPOTHESIS.md` pre-
filed against an explicit Jaccard prediction should ship with
Move 3 whenever it runs.

---

Sources: local clone at `HEAD = 4782251` (`main`, **3 ahead** of
`origin/main`, working tree dirty with 2 untracked `.ontology.*`
dirs + 2 untracked review docs); `git log 598fb25..HEAD` (1
commit, docs-only); `git show 4782251` (file list:
`docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16.md`,
`docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md`);
`docs/reviews/MILESTONE_REVIEW_2026-05-17.md` (yesterday's review,
still untracked); `docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md`
(β′ analysis, now tracked at `4782251`);
`src/runtime/legend/static-summary.ts:158, 244` (Move 1b target,
**still emitting `i.modulePath`** — re-verified line-by-line);
`src/runtime/llm/{registry,dispatcher,model-capabilities}.ts`
(routing + capability profiles — re-verified: 4 Ollama profiles,
0 Anthropic profiles, `preferred[0]` only in registry, zero
`preferred` references in dispatcher);
`src/commands/ingest/index.ts:635` (`MAX_OUTPUT` re-verified at
`4096`); `src/commands/ingest/index.ts:781-795` (ensemble
counting bug re-verified at `validCount: 0, failedCount:
reps.length + 1`); `.gitignore` (re-verified: still missing
`.ontology.archive-*` / `.ontology.self-ingest-*-result/`);
`docs/ROADMAP.md`, `docs/PROJECT_LEGEND.md`, `docs/LEGEND.md`,
`docs/CHANGELOG.md` (promotion gate still references the
unfinished Phase ε self-ingestion calibration).
`tsc --noEmit` is clean from the sandbox; `npm test` blocked by
the missing `@rolldown/binding-linux-arm64-gnu` binary in the
sandboxed npm install. The GitHub proxy 403 is in effect for the
**ninth** consecutive day; `git pull` and `git push` must be
run from the user's machine. **`git pull` was attempted at run
start and failed with HTTP 403 from the proxy — the local repo
is the source of truth; no remote drift can be detected from the
sandbox.**
