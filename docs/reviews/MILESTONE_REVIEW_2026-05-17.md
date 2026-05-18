# Ontology — Milestone review 2026-05-17

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout at `main` (`598fb25` — "fix(llm): order ollama
> preferred[] by VRAM deployability"). **`git pull` from the sandbox
> failed again — `HTTP 403` from proxy to `github.com` (eighth
> consecutive day). The local clone is the source of truth; the
> branch is **2 commits ahead of `origin/main`** (`c711fc1`,
> `598fb25`) and must be pushed locally before the next teammate /
> CI sync.**
> The previous review (`MILESTONE_REVIEW_2026-05-16.md`) closed with
> Phase ε "one command away from its first measurement." In the
> 24 h since: **β ran, β was disproved, Move 1 shipped, β′ ran
> overnight, β′ surfaced a routing-architecture bug mid-flight, the
> bug was patched (`598fb25`), and β′ completed against the
> pre-registered hypothesis. The β′ synthesis is on disk and the
> ranked next moves are clear.**

---

## 1. Headline status

**Phase ε now has two real measurements on the Pareto frontier and a
sharply-narrowed bottleneck question.** β (`13fde17`) and β′
(`598fb25` + post-patch verify re-run) both produced zero
`epsilon_equivalent` nodes and both falsified their headline
hypotheses, but together they ruled out two whole classes of
explanation:

- **Doubling Ollama model size (3b → 7b) for `code_sketch` produced
  ~12 % honesty improvement (0.166 → 0.187) and zero change in
  mean Jaccard.** Model capacity is not the bottleneck at the
  ollama-tier boundary.
- **Move 1 (export-vocabulary preservation in `static_summary`)
  works — `prompt/types.ts` regen'd at Jaccard = 1.0 — but the
  rest of Move 1's deflected files moved from `divergent_*` to
  `unrecoverable` because the gluing check rejects module
  specifiers as `requires` tokens.** The vocabulary-domain
  mismatch is fixable in ~10 lines (Move 1b).

The β′ synthesis (`docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md`)
is filed and ranks the next experiments. **The cheapest meaningful
move is Move 1b: change `static-summary.ts` to put imported
SYMBOL NAMES in `requires` instead of module paths.** 15 min of
code + ~30 min of verify-only re-run on the preserved post-apply
state. Predicted to drop `unrecoverable` from 32 back below β's
24.

The second move is the **Anthropic Sonnet 4.6 ceiling probe**
(~$2–3, ~30 min). β′ flattened the ollama-tier honesty curve
enough that the only way to falsify "the bottleneck is
prompt/contract design, not model capacity" is to step outside
that tier. Either Sonnet hits real Jaccard (model-bound) or it
also produces Jaccard ≈ 0 (prompt-bound, and the next PR is a
`code_sketch` template restructure).

**Five small fixes recommended before pushing further on Phase
ε:** §4.1 add `.ontology.archive-*/` to `.gitignore` (still open
from MR_2026-05-16 §4.3 — **NOT fixed**, two new untracked
archives present); §4.2 raise `MAX_OUTPUT` 4096→8192 for the
Anthropic side (still open from MR_2026-05-15); §4.3 fix
`extractIntentEnsemble` fatal-failure counting (still open);
§4.4 add Anthropic profiles to `MODEL_CAPABILITY_PROFILES` (still
open); **§4.5 implement dispatcher-level `preferred[]` fallback**
(new — β′ surfaced this).

---

## 2. What happened in the last 24 h

Two commits on `main` since MR_2026-05-16, plus three untracked
artefact directories and two untracked doc files representing the
β + β′ run outputs:

| Commit  | Phase | Headline |
|---|---|---|
| `c711fc1` | ε β′ | docs: pre-register Phase ε β′ hypothesis |
| `598fb25` | llm fix | order ollama `preferred[]` by VRAM deployability |

Plus on disk (untracked):

```
.ontology.self-ingest-beta-result/                       (β post-apply graph snapshot)
.ontology.self-ingest-beta-prime-result/                 (β′ post-apply graph snapshot)
docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16.md           (β′ raw matrix)
docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md (β′ analysis)
docs/reviews/MILESTONE_REVIEW_2026-05-16.md                              (yesterday's review)
```

### Sequence of events (chronological)

1. **β ran** at the `4336723` hypothesis commit on the Ollama
   side with `--model qwen2.5-coder:3b` forced on both ingest
   (`semantic_parse`) AND verify (`code_sketch`). Result:
   0/126 epsilon_equivalent, 24/126 unrecoverable, mean Jaccard
   ~0.00, mean honesty 0.166. The hypothesis predicted Jaccard
   ≥ 0.55 (semantic_parse bucket); **falsified by ~0.55 absolute
   distance** — the largest single falsification this project
   has logged.
2. **β synthesis** (separately filed, not in this 24 h window)
   diagnosed two failure modes: (a) `--model` overrode the
   registry's per-task routing, so `code_sketch` ran on a model
   calibrated for `structured_extraction`; (b) `static_summary`
   deflected files emitted EMPTY `provides[]` / `requires[]`,
   giving compile-back nothing to anchor against.
3. **Move 1 shipped** (commit `f7bce43`, pre-current-window) —
   `buildStaticSummary` now threads exported names into
   `provides[]` and imported `i.modulePath` into `requires[]`.
4. **β′ hypothesis pre-registered** (`c711fc1`, this window) —
   removed the `--model` override and shipped Move 1. Predicted
   Jaccard ≥ 0.5 on static_summary bucket, ≥ 0.30 on
   semantic_parse bucket, ≤ 10 unrecoverable.
5. **β′ ran** — but the first verify attempt **failed in 2
   seconds** with every node `unrecoverable` and error
   `model 'qwen2.5-coder:14b' not found`. Root cause:
   `getDefaultModelForTask` returns `preferred[0]` only; the
   Ollama `code_sketch` registry entry listed 14b before 7b;
   14b is not deployable on M1 (5.3 GiB VRAM ceiling per
   bake-off v2).
6. **Routing fix shipped** (`598fb25`) — reordered
   `preferred[]` arrays for Ollama `code_sketch`,
   `test_generate`, `node_expand` to put deployable models
   first, with 14b kept as `preferred[1]` for the future
   fallback-aware dispatcher.
7. **β′ verify re-ran** at `598fb25` with 7b actually
   dispatching. 98 min wall-clock for 126 nodes (~47 s / node).
   Result: 0/126 epsilon_equivalent, 32/126 unrecoverable
   (**worse** than β), mean Jaccard ~0.00, mean honesty 0.187.
   All three β′ hypotheses falsified — H1 partially (one
   `prompt/types.ts` proof-of-mechanism at Jaccard = 1.0; the
   other six deflected files now `unrecoverable` due to the
   gluing-check vocabulary mismatch in `requires`), H2
   directly (0.187 << 0.35), H3 in the opposite direction
   (32 > 24 > predicted ≤ 10).
8. **β′ synthesis written** — diagnoses the vocabulary-domain
   bug in the gluing check vs Move 1's `requires` shape, ranks
   Move 1b (~10 LoC) as the cheapest next experiment, ranks
   Move 3 (Sonnet 4.6 ceiling probe, ~$2–3) as the second.

### `tsc --noEmit` status

Clean from the sandbox (`./node_modules/.bin/tsc --noEmit`
exit 0). The routing patch and the pre-existing Move 1
modifications type-check end-to-end.

### Repo state

- **Active branch:** `main` (`598fb25`), **2 ahead of `origin/main`**.
- **`git status`:** working tree has 5 untracked items — 3 of
  them are run artefacts (`.ontology.self-ingest-beta-result/`,
  `.ontology.self-ingest-beta-prime-result/`, and the
  untracked calibration + review docs).
- **GitHub proxy:** still 403'd from the sandbox. Eight days
  running. The two ahead-commits need to be pushed from the
  user's machine.
- **`vitest run`:** still blocked in the sandbox by the
  missing `@rolldown/binding-linux-arm64-gnu`. Run `npm test`
  locally before any merge.

---

## 3. Pipeline state — Project Legend end-to-end

Phase ε now has TWO completed runs at the same perimeter
(`src/runtime src/core src/commands src/schemas`, 126 nodes
post-apply) with different routing configurations:

```
                                    β (forced 3b for both)        β′ (registry-routed 7b code_sketch)
Ingest model (semantic_parse)       qwen2.5-coder:3b              qwen2.5-coder:3b
Verify model (code_sketch)          qwen2.5-coder:3b  ← OVERRIDE  qwen2.5-coder:7b  ← REGISTRY ROUTING
Move 1 (static_summary vocab)       OFF                           ON (commit f7bce43)
Wall-clock (verify only)            ~75 min                       98 min (post-fix re-run)
Mean structural honesty             0.166                         0.187
Mean Jaccard (overall)              ~0.00                         ~0.00
epsilon_equivalent count            0 / 126                       0 / 126
unrecoverable count                 24 / 126 (19 %)               32 / 126 (25 %) — WORSE
```

The honesty axis moved 0.021 absolute (~12 % relative) for a
2.3× parameter jump. **The curve is essentially flat through the
ollama tier.** The unrecoverable count moved in the WRONG
direction because Move 1 successfully populated `requires[]` with
content the gluing check then rejected — the bug is in the
domain mismatch between `requires` (modules) and `provides`
(symbols), not in either side individually.

The Pareto frontier today:

| Run | Task | Provider | Model | n | Honesty | Cost | Pareto |
|---|---|---|---|---:|---:|---:|:---:|
| β | code_sketch | ollama | `qwen2.5-coder:3b` | 124 | 0.166 | $0 | (dominated by β′) |
| β′ | code_sketch | ollama | `qwen2.5-coder:7b` | 126 | 0.187 | $0 | ★ current best @ $0 |

Two-point Pareto with near-zero slope. The next data point that
can change the shape is **outside the ollama tier** — Sonnet 4.6
at ~$2–3 (Move 3 in the synthesis ranking).

---

## 4. Bug list — open items + new findings

### 4.1 `.ontology.archive-*/` STILL NOT gitignored — **mid, foot-gun, recurring**

**Carried over unfixed from MR_2026-05-16 §4.3.** The current
`.gitignore` excludes `.ontology/` but not `.ontology.archive-*`
or `.ontology.self-ingest-*-result/`. Today the working tree has
**three** untracked `.ontology.*` directories from the β and β′
runs, totalling >200 KB of run-state. A wildcard `git add .` by
either operator or automation would stage all of them.

**Fix (3 lines, no excuse to defer):** append to `.gitignore`:

```
.ontology.archive-*/
.ontology.self-ingest-*-result/
```

A pattern-based rule covers existing and future ephemeral
snapshots. **Land this in the next commit before anything else
touches the working tree.**

### 4.2 `MAX_OUTPUT = 4096` still bites the Anthropic side — **mid, blocks paid pass, recurring**

**Carried over unfixed from MR_2026-05-15 §4.3 and MR_2026-05-16
§4.1.** `src/commands/ingest/index.ts:635` still hard-codes
`const MAX_OUTPUT = 4096;`. The Anthropic adapter's own default
is 8192; γ-7 calibration explicitly required 8192. Phase ε's
Move 3 (Sonnet 4.6 verify probe) will hit this ceiling on files
> ~3 KB.

**Fix (1 line + 1 test):** raise to 8192, pin with a comment
citing γ-7. Land before the Sonnet 4.6 probe, not after.

### 4.3 `extractIntentEnsemble` mis-counts on fatal-failure path — **mid, telemetry-only, recurring**

**Carried over unfixed from MR_2026-05-16 §4.2.** `src/commands/ingest/index.ts:781-795`
emits `validCount: 0, failedCount: reps.length + 1` on a fatal
break, but `reps.length` is the count of attempts already
pushed — some of which may have been successful. The Phase ε
β′ run did not exercise the ensemble path so the bug is still
latent; the Anthropic side has not run yet.

**Fix (~5 LoC):** count `validBeforeFatal` and `failedBeforeFatal`
explicitly. Pin a test for the rep-1-ok, rep-2-fatal trace.

### 4.4 `MODEL_CAPABILITY_PROFILES` still has no Anthropic entries — **mid, predates Move 3, recurring**

**Carried over unfixed from MR_2026-05-16 §4.9.** None of Opus
4.7, Sonnet 4.6, or Haiku 4.5 have a calibration profile. Move 3
will dispatch on Sonnet; the calibration write-up wants a stable
profile reference.

**Fix (~30 LoC):** add three profiles citing γ-2 (HASH_TS) and
γ-7 (Vibe-Reasoning). Empty `bannedFor`. Land before Move 3.

### 4.5 Dispatcher has no `preferred[]` fallback — **new, mid, architectural**

**Surfaced by β′ in anger.** `getDefaultModelForTask` in
`src/runtime/llm/registry.ts:163` returns `preferred[0]` only.
When `preferred[0]` is not pulled / does not fit local VRAM, the
dispatch fails immediately with no automatic try of
`preferred[1..N]`. The β′ first verify attempt failed in 2 s for
exactly this reason (14b listed first, not deployable on M1).

Today it's papered over by reordering `preferred[]` (commit
`598fb25` puts deployable models first). The proper fix is a
dispatcher-level retry: catch "model not found" / "model
unavailable" / 404 from the adapter, fall through
`preferred[1..N]`, log the demotion.

**Fix (~25 LoC in `dispatcher.ts`):**

1. Pass the full `preferred[]` array (not just `preferred[0]`) to
   the dispatcher when `effectiveDefaultModel` was task-derived.
2. Wrap the adapter call in a loop that catches the
   model-unavailable family of errors and retries with the next
   `preferred[i]`.
3. Surface the demotion in the per-file telemetry
   (`ExtractTelemetry`) so reports show which model actually
   dispatched.
4. Pin two tests: (a) `preferred[0]` available → no demotion;
   (b) `preferred[0]` 404s → `preferred[1]` dispatches with
   `demotedFrom` set in telemetry.

**Priority:** mid. It's not blocking the immediate Move 1b → Move 3
sequence, but it's the right architectural fix for the registry's
existing `preferred[]` semantic, and the bug is fresh in context.
Land this in the same window as Move 1b if scope allows.

### 4.6 Gluing-check vocabulary-domain mismatch — **new, mid, blocks Move 1's aggregate gain**

**Surfaced by β′ analysis.** `static-summary.ts` (lines 158, 244)
emits `requires: [...module paths from i.modulePath]`. The
intent-validator's gluing check then asks: "does some upstream
node's `provides[]` contain this entry?" Upstream `provides` are
symbol names (e.g. `createNodeProposalForExtraction`), not module
paths (e.g. `./io.js`). The two vocabularies never match → six
of seven Move 1 deflected files moved to `unrecoverable`.

**Fix (Move 1b, ~10 LoC) in `src/runtime/legend/static-summary.ts`:**

Change line 158 from:
```ts
const requires = uniqueInOrder([
  ...(vocabulary?.imports ?? []).map((i) => i.modulePath),
  ...
]);
```
to:
```ts
const requires = uniqueInOrder([
  ...(vocabulary?.imports ?? []).flatMap((i) => i.symbols),
  ...
]);
```

And the analogous change at line 244-245. Module paths can move
to the prompt prose where they're already informative but
contractually non-binding. Pin two tests: barrel with named
re-exports (requires = symbol names), declaration_only with
type imports (requires = imported type names).

**Predicted impact (from synthesis):** 6 newly-unrecoverable
static_summary files pass the gluing check; aggregate
`unrecoverable` drops from 32 toward β's 24 — possibly below.
**Cheapest meaningful next experiment.**

### 4.7 Move 1's static-summary `requires` array can leak file-extension fragments — **new, low**

`static-summary.ts:158` builds requires from `i.modulePath`
unfiltered. ESM module specifiers in this codebase include `.js`
extensions on TS sources (`./io.js`, `../runtime/llm/types.js`).
Even AFTER Move 1b changes the source to `i.symbols`, if any
other code path uses `i.modulePath` for contract emission, the
emitted tokens will not match the canonical symbol vocabulary.

**Fix (defensive, low priority):** add a regression test that
`buildStaticSummary` never emits a `requires` entry ending in
`.js` / `.ts` / `.tsx`. Catches future drift.

### 4.8 `verify-homeomorphism` "first attempt failed in 2 s" had no actionable error surface — **new, low UX**

When the β′ first verify attempt failed (every node
`unrecoverable` with "model not found"), the failure mode was
diagnosed by reading per-node `reason` strings — there was no
top-level pre-flight check that the resolved model was actually
pullable before iterating 126 nodes. A 2-second whole-run
failure with 126 identical error messages is correct in the
small (the verification engine doesn't know which models any
given node will need ahead of time, since some nodes might
override) but a `verify-homeomorphism --preflight` mode that
dispatches a single empty `code_sketch` request first and
fails fast on model-availability errors would have surfaced the
same bug in 2 s without 126 noise lines.

**Fix (~20 LoC, low priority):** add a `--preflight` flag that
runs one dispatch per (provider, task) pair the run will need,
fails fast on adapter errors. Skip when `--dry-run`. Land
alongside Move B.

### 4.9 `schema_module` overfit predicate — **design, mid, was deferred for β′ measurement, NOW actionable**

MR_2026-05-16 §4.4 deferred this to "after β confirms the
bimodality prediction." β′'s data answers it: across the 126
nodes, the `schema_module` shape covered files that **use** Zod
for runtime validation (`ingest/index.ts`,
`runtime/llm/ensemble.ts`, `runtime/legend/{matrix,pareto,
vocab-gap}.ts`, `runtime/topos/{omega,predicate}.ts`) interleaved
with the canonical schema files under `src/schemas/`. The
bimodality is consistent with the prediction but blurred by the
overfit.

**Fix (Move 1c, ~10 LoC) in `src/runtime/legend/structural-classifier.ts`:**

Tighten the `schema_module` predicate to require both
`hasZodImport` AND `(reExportCount + schemaExportCount) ≥
0.5 × exportCount` AND `not under src/commands/`. Pin a test
that `ingest/index.ts` falls back to `mixed_module`.

**Priority:** mid. Phase ε ζ release notes will cite per-shape
distributions; the schema_module count drifts from 10 to ~4
under the tightened predicate. Land alongside the post-β′
write-up, not before the next Phase ε measurement.

### 4.10 Static-summary `forbids` / `rules` still prose strings — **design, low, carried over**

**Carried over unfixed from MR_2026-05-16 §4.6.** The static-
summary builder emits English prose in `forbids: ["runtime side
effects in the barrel itself"]` and `rules: ["REQUIRE: every
export is a re-export..."]`. γ-7 explicitly moved contracts
from prose to structured tokens. **β′ confirms this regression
exists in the data** — deflected files have empty
`provides_match` against the structured contract algebra.

**Fix (~30 LoC, low priority):** emit `forbids: ["runtime-decl",
"side-effect"]` for barrels, `forbids: ["runtime-decl", "value-
decl"]` for declaration-only. Drop the prose `rules`.

### 4.11 React-component heuristic break-scoping (carried over, cosmetic) — **low**

Carried over from MR_2026-05-16 §4.7. `structural-classifier.ts:295-305`
inner-`break` semantics still hard to read. **Defer.**

### 4.12 Test files still walk AST in classifier (carried over, micro-perf) — **low**

Carried over from MR_2026-05-16 §4.8. Wasted work on test files.
**Defer until 5000-file perimeter.**

### 4.13 `eventTypeColor` / `colorsEnabled` / etc. — **closed in prior windows**

All hardening sweep items §3.1–§3.15 (MR_2026-05-14) confirmed
still closed in current code. No regressions.

---

## 5. Suggested next steps — priority order

### Now (this session, before any new Phase ε measurement)

1. **Add `.ontology.archive-*/` AND `.ontology.self-ingest-*-result/`
   to `.gitignore`** (§4.1). 3 lines. Two run-artefact directories
   are currently untracked AND ungignored — recurring foot-gun
   across three reviews now. **Do this first.**
2. **Push the two ahead commits.** `c711fc1` (hypothesis doc),
   `598fb25` (registry ordering fix). The GitHub proxy is still
   403'd from the sandbox; the push must happen from the user's
   machine: `git push origin main`. Eight-day push gap closes.
3. **Implement Move 1b** (§4.6). Change
   `src/runtime/legend/static-summary.ts:158, 244` from
   `i.modulePath` to `i.symbols.flatMap`. Pin two tests. ~10 LoC.
   The synthesis's cheapest meaningful experiment.
4. **Verify-only re-run with Move 1b** against the preserved
   `.ontology.self-ingest-beta-prime-result/` post-apply state.
   ~30 min, $0. Compare `unrecoverable` count to β′'s 32 and to
   β's 24. The cheapest data point that can move the Pareto.

### Then (this week, before Move 3 / Anthropic probe)

5. **Raise `MAX_OUTPUT` from 4096 to 8192** (§4.2). 1 line + 1
   test. Closes the Anthropic ceiling regression that has been
   open for three reviews.
6. **Fix `extractIntentEnsemble` fatal-failure counting** (§4.3).
   ~5 LoC + 1 test. Telemetry-only, but the Move 3 report cites
   ensemble metadata if `--ensemble high-confidence` runs.
7. **Add Anthropic profiles to `MODEL_CAPABILITY_PROFILES`**
   (§4.4). ~30 LoC. Sonnet 4.6 / Opus 4.7 / Haiku 4.5 with
   `preferredFor` derived from `DefaultAnthropicRouting`.
8. **Implement dispatcher-level `preferred[]` fallback** (§4.5).
   ~25 LoC + 2 tests. The architectural fix that papered over by
   `598fb25`. Run β′'s 14b-listed-first scenario as a regression
   test.
9. **Cost-estimate the Anthropic probe** per
   `PILOT_RUNBOOK.md` §2:
   `onto ingest <perimeter> --provider anthropic --cost-estimate`.
   Verify against a $5 ceiling — Move 3 is a verify-only probe,
   not a full ingest pass.

### Then (Move 3 — Anthropic Sonnet 4.6 ceiling probe)

10. **Run verify-only on the preserved post-apply state with
    `--provider anthropic --model claude-sonnet-4-6`.** Predicted
    $2–3 spend, ~30 min wall-clock. The single answerable question:
    is the bottleneck the model (Jaccard moves materially up) or
    the prompt/contract design (Jaccard stays ≈ 0)? This is the
    only experiment that can break the flat ollama-tier curve.
11. **Write `SELF_INGEST_2026-05-XX_SONNET_PROBE.md`.** Either
    direction is publishable signal — the calibration write-up
    cites the answer, not the wish.

### Then (Phase ε close + ζ release prep)

12. **If Move 3 says "prompt-bound":** scope a `code_sketch`
    template restructure PR. The current template emits `requires`
    / `provides` arrays in a structured block but the
    parent-context threading (PR #105) puts them at the top of a
    long prompt. Hypothesis: re-anchoring the contract directly
    before the generation cue would lift Jaccard from 0 to
    something measurable. This is a separate larger PR, not a
    Phase ε measurement.
13. **If Move 3 says "model-bound":** Move 4 — deploy Sonnet 4.6
    on the full perimeter (not verify-only) as the Phase ε
    publishable run. ~$15–30, ~2 h. Calibration write-up
    immediately follows.
14. **Lift `MATHEMATICAL_CLAIMS.md` §3.10 T4 → T2** citing
    whichever direction Move 3 forced.
15. **Tag `0.4.0`.** Release seed, LEGEND.md, OPEN_PROMPT.md are
    all merged; Phase ε calibration is the last gate.

### Phase ζ — release + Open-Prompt

16. **Open-Prompt v0 implementation** — `onto sign`,
    `onto verify-published`, `onto replay`. Spec at `OPEN_PROMPT.md`.
17. **Tighten `schema_module` predicate** (§4.9). Defer to after
    Phase ε close; pin with the β′ data.

### Design / hardening (parallel work, low priority)

18. **Static-summary structured-tokens migration** (§4.10).
    ~30 LoC. Aligns deflected files with γ-7 direction.
19. **`onto verify-homeomorphism --preflight`** (§4.8). ~20 LoC.
    Fail-fast on model-availability before iterating nodes.
20. **Registry-default shared fixture refactor** (MR_2026-05-16
    §4.10). ~10 LoC. Carried over.

---

## 6. Design observations from the β → β′ arc

### 6.1 The Pareto curve through the ollama tier is essentially flat

β → β′ doubled parameter count for `code_sketch` (3b → 7b) and
moved mean honesty 0.021 absolute (~12 % relative). For a 2.3×
parameter jump that's a near-zero slope. The conclusion is
load-bearing: **you cannot solve Phase ε by trying bigger ollama
models**. The next data point that can change the answer must
come from outside the ollama tier (Sonnet) or from outside the
model axis (prompt / contract template restructure).

### 6.2 The intent-validator's gluing check has a vocabulary contract that wasn't named

β′ surfaced the bug not because the gluing check is wrong — it
correctly rejects "this node's `requires` aren't satisfied by
any upstream `provides`" — but because two different parts of
the codebase chose two different vocabularies for the same
field. `static-summary.ts` chose module paths because that's
what `imports` carries naturally; `extractIntent` chose symbol
names because that's what the schema's contract semantics
demand.

**Design fix:** the schema contract should be explicit.
`ExtractionResultSchema` documents `requires` and `provides`
shape as "Zod string", but the gluing check imposes a tighter
constraint that's invisible to the schema layer. Recommended:
add a `// @semantic: symbol-name` comment to the `requires` /
`provides` fields in the schema, and a runtime invariant in the
gluing check that errors loudly when it sees a module-path-shape
token (`/^\.\.?\//.test(...)` or `\.(js|ts|tsx|jsx)$`). Future
contributors making Move 1's mistake would hit a clear error
instead of producing silent unrecoverables.

### 6.3 The registry's `preferred[]` semantic is a promise the dispatcher doesn't keep

`getDefaultModelForTask` returns `preferred[0]` only. The
comment at `registry.ts:42-44` acknowledges this. **β′ proved
this gap matters.** A user who reads the registry sees an
ordered list and reasonably assumes fallback semantics. The
sandbox's deploy posture (M1, single dev machine, models
pulled on demand) makes `preferred[0]` missing a normal
condition, not an exception.

**The architectural fix is small (~25 LoC, §4.5).** Land it.
The commit reordering models by VRAM (`598fb25`) is a workaround
for a single deploy posture; the dispatcher fallback is the
posture-independent fix.

### 6.4 The pre-registration discipline is paying off

Both β and β′ falsified their hypotheses. **That's the system
working as designed.** Predictions filed BEFORE the run gave
the synthesis a non-negotiable anchor — there's no story-fitting
possible after the fact. The β′ synthesis is sharper than the
β synthesis precisely because two consecutive falsifications
narrow the explanation space faster than any one alone.

The discipline cost (~30 min per pre-registration) is negligible
against the ~2 h measurement cost. **Maintain it through Move 3
and the ζ release.** Sonnet 4.6 ceiling probe should ship with
a `SELF_INGEST_SONNET_PROBE_HYPOTHESIS.md` that says specifically
"we predict Jaccard ≥ X" so the answer is unambiguous either way.

---

## 7. One-paragraph summary

**Phase ε is no longer "one command away" — it's "one design move
away".** The 24 h since MR_2026-05-16 ran β, ran β′, and
falsified both hypotheses in ways that ruled out two whole
classes of explanation: doubling the ollama model from 3b to 7b
moved mean structural honesty 0.021 absolute and zero Jaccard
(model capacity is not the bottleneck at this tier), and Move 1's
export-vocabulary preservation works in isolation (`prompt/types.ts`
hit Jaccard = 1.0) but broke the aggregate because it put module
paths into `requires` while the gluing check demands symbol names
(vocabulary-domain bug, ~10 LoC fix). The β′ run also surfaced an
architectural gap in `getDefaultModelForTask` (returns
`preferred[0]` only, no fallback) which a commit reordering
ollama `preferred[]` arrays papered over but didn't truly fix.
**Immediate next steps (in order):** (1) **`.gitignore` the
`.ontology.archive-*` and `.ontology.self-ingest-*-result/`
directories** — recurring foot-gun, three reviews now; (2) push
the two ahead-commits (`c711fc1`, `598fb25`) from the user's
machine — eight-day push gap; (3) implement Move 1b (~10 LoC
swap of `i.modulePath` → `i.symbols.flatMap` in
`static-summary.ts`); (4) verify-only re-run on the preserved β′
post-apply state ($0, ~30 min); (5) raise `MAX_OUTPUT` 4096→8192
and add Anthropic profiles + dispatcher fallback before the Move
3 Sonnet 4.6 ceiling probe (~$2–3, ~30 min). The Sonnet probe is
the only experiment that can break the flat ollama-tier Pareto
curve — either Jaccard moves materially up (model-bound) or stays
≈ 0 (prompt-bound, scope a `code_sketch` template restructure
PR). The pre-registration discipline is working: two consecutive
falsifications have produced sharper synthesis than any
confirmatory result would have. Maintain it through Move 3 and
into ζ release.

---

Sources: local clone at `HEAD = 598fb25` (`main`, **2 ahead** of
`origin/main`, working tree dirty with 3 untracked `.ontology.*`
dirs + 3 untracked docs); `git log 4336723..598fb25` (2 commits);
`git show c711fc1 598fb25`;
`docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16.md`
(raw matrix);
`docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md`
(β′ analysis);
`docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_HYPOTHESIS.md`
(pre-registered β′);
`docs/reviews/MILESTONE_REVIEW_2026-05-16.md` (yesterday's review);
`src/runtime/legend/static-summary.ts` (Move 1 + Move 1b target);
`src/runtime/llm/{registry,dispatcher,model-capabilities}.ts`
(routing + capability profiles);
`src/commands/ingest/index.ts:635` (`MAX_OUTPUT`);
`src/commands/ingest/index.ts:781-795` (ensemble counting bug);
`.gitignore` (still missing `.ontology.archive-*` /
`.ontology.self-ingest-*-result/`);
`docs/ROADMAP.md`, `docs/PROJECT_LEGEND.md`, `docs/LEGEND.md`.
`tsc --noEmit` is clean from the sandbox; `npm test` blocked by
the missing `@rolldown/binding-linux-arm64-gnu` binary in the
sandboxed npm install. The GitHub proxy 403 is in effect for the
eighth consecutive day; `git pull` and `git push` must be run
from the user's machine. **`git pull` was attempted at run start
and failed with HTTP 403 from the proxy — the local repo is the
source of truth; no remote drift can be detected from the
sandbox.**
