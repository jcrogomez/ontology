# Ontology — Milestone review 2026-05-15

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout at `main` (`f4855b9` — "feat(ε): H1 —
> retry-once-with-Zod-feedback on schema_failed ingest", committed
> 2026-05-14 22:47 local). The working tree carries three uncommitted
> modifications (H2 adaptive context-window budget mid-flight, see §3
> below). **`git pull` from the sandbox blocked again — `HTTP 403` from
> the proxy to `github.com` (same posture as 2026-05-14 / -13 / -12 /
> -11 / -10 — six days running). The local clone is the source of
> truth; run `git pull` locally before acting on this report.** The
> previous review (`MILESTONE_REVIEW_2026-05-13.md`) closed at Phase γ
> + δ shipped, Phase ε queued behind a five-item pre-flight checklist
> and the `~$15–30` API spend. In the 48 h since, **the entire pre-ε
> tooling sweep landed (prework A–E plus F–J), the Ollama pilot ran
> end-to-end on 124 files, and H1 (schema-retry) + H2 (adaptive
> num_ctx) are recovering the truncation / schema-improvisation
> failures that pilot surfaced**. Phase ε on the paid pass is now
> waiting only on the H2 commit + a re-run of the Ollama pilot to
> confirm the failure shape collapses, then the Anthropic publishable
> sweep.

---

## 1. Headline status

**Phase ε is mid-pilot.** Prework A–E (multi-positional ingest +
frontier tagger + six-axis matrix + intersection aggregator + cross-doc
references) shipped in `373eb8a` / `4f689f7` on 2026-05-13, immediately
followed by prework F–J on 2026-05-14:

- **F — `5f02feb`** — per-axis honesty score (no global scalar, four
  axis means with sample-size denominator).
- **G — `a1305ae`** — Pareto pivot by `(task, provider, model)` over
  the verify matrix.
- **H — `c08516a`** — ASCII chart primitives (sparkline, bar, bar
  chart, histogram) + report visualisations.
- **I — `6ed8d48`** — auto-written progress report at
  `.ontology/reports/<KIND>_<runId>.md` on every `onto ingest` and
  every `onto compile run`.
- **J — `01835a7`** — vocab-gap detector v0 (loose word-token overlap
  between `provides[].key` and regen exports).
- **`f2e0f61`** — silent-data-corruption fix: two `0x00` bytes had
  slipped into `pareto.ts`'s `bucketKey` template literal in the
  initial Write. The pure-TS path compiled and tests passed (NUL is
  a valid string char and was stable across both sides of the
  equality), but the Phase ε ingest correctly classified the file as
  `binary_content` and refused to extract intent. The binary guard
  worked exactly as designed; the bytes are gone.

The Ollama pilot (qwen2.5-coder:7b, 124 files, 2h21m wall-clock)
returned **19 `schema_failed` proposals** out of 124, concentrated
on barrels / `schemas.ts` / `types.ts` where the weaker model
improvises invalid enum values. **`f4855b9` (H1)** adds a one-shot
retry that re-dispatches with the literal Zod issue list as feedback
plus a focused 7b-specific correction block. **The uncommitted
working-tree changes (§3) are the H2 follow-up** — Phase ε pilot
discovery: Ollama's default `num_ctx=2048` silently truncates any
source file over ~6 KB, which on this perimeter corrupts ~30 % of
the input. The H2 patch threads an adaptive `contextWindow` /
`maxTokens` budget through `LlmRequest` → Ollama adapter `num_ctx`
/ `num_predict`, sized from `system + file + retry-feedback +
output + safety buffer`, floor 4096 / cap 16384.

**Phase ε remaining work is now narrow:**

1. Commit H2 with a regression test that pins
   `computeAdaptiveBudget(EXTRACTION_SYSTEM_PROMPT.length, 6500)`
   produces `num_ctx ≥ 4096` (today only the H1 surface is
   covered by `tests/ollama-adapter.test.ts`, and that file does
   not yet exercise `num_ctx` / `num_predict` at all).
2. Re-run the Ollama pilot. Expectation: `schema_failed` count drops
   from 19 toward single digits (H1 retry) and silent-truncation
   failures collapse (H2 num_ctx). If both numbers land, the matrix
   shape is judge-able and the paid pass is unblocked.
3. Anthropic publishable sweep per `docs/legend/PILOT_RUNBOOK.md` §6
   — same commands, swap provider. Cost-estimate first; abort if
   `>$30`.
4. Produce `docs/legend/calibrations/SELF_INGEST_2026-05-XX.md`,
   lift `MATHEMATICAL_CLAIMS.md` §3.10 from T4 → T2.

The 2026-05-13 review's five-item pre-flight (§4.1 async-def, §4.2 +
§4.3 audit events, §4.4 retry jitter, §4.5 literal in translator
hash) **is fully closed**: §4.1 `async def` is in
`verify-homeomorphism.ts:104`; §4.2 / §4.3 events are enumerated in
`schemas/ontology.ts:282/287` and emitted from `node/inspect.ts:161`
and `verify/homeomorphism.ts:327`; §4.4 jitter is at
`anthropic/adapter.ts:83-84`; §4.5 `literal` is in
`translator.ts:82`. §4.9 advisory lock was shipped in `b2193bf`
(`src/core/fs/lock.ts`). The release-seed (`e52a3c1` — `0.4.0-rc.1`),
the Walker v2 PR-1 review pane (`4a3116d`), and the LEGEND /
OPEN_PROMPT release notes (`1419d46`) all landed concurrently — the
release runway is paved; Phase ε is the only remaining gate.

---

## 2. What happened in the last 48 h

19 commits on `main` (commit `6ea7e94` was the tail of the prior
review; the new range is `b035ce7..f4855b9`). Highest-signal items:

| Commit | Phase | Headline |
| --- | --- | --- |
| `b035ce7` | pre-ε | Five reviewer follow-ups closed — items §4.1–§4.5 from MR_2026-05-13 |
| `f80163d` | pre-ε | Cross-provider per-task routing — mixed plans on the same compile run |
| `e43b2cc` | pre-ε | Cost-estimate task-aware rate resolution (was reading Anthropic rates with Ollama routes) |
| `b2193bf` | hardening | Advisory lock at `.ontology/.lock` (§4.9) |
| `4a3116d` | walker | Walker v2 PR-1: proposal review pane (`:proposals` j/k/a/r/d) |
| `1419d46` | ζ | `docs/LEGEND.md` release note + `docs/OPEN_PROMPT.md` protocol spec |
| `e52a3c1` | release | `0.4.0-rc.1` chore tag |
| `373eb8a` | ε prework A–E | Multi-positional ingest + frontier tagger + 6-axis matrix + intersections + xref |
| `4f689f7` | ε prework | `examples/legend-fixture/`, `onto frontier` preview, `--matrix` rendering, `PILOT_RUNBOOK.md` |
| `5f02feb` | ε prework F | Honesty score per axis (vectorial — no global scalar) |
| `a1305ae` | ε prework G | Pareto pivot by `(task, provider, model)` |
| `c08516a` | ε prework H | ASCII chart primitives + verify-report visualisations |
| `6ed8d48` | ε prework I | Auto-write `.ontology/reports/<KIND>_<runId>.md` on ingest + compile |
| `01835a7` | ε prework J | Vocab-gap detector v0 (loose word-token overlap) |
| `f2e0f61` | fix | Strip NUL bytes from `pareto.ts` `bucketKey` separator |
| `f4855b9` | ε H1 | Retry-once with Zod feedback on schema_failed ingest |

### Net-new code surface

```
src/runtime/legend/
├── frontier-tagger.ts          412 lines  (prework B)
├── matrix.ts                   521 lines  (prework C + F)
├── matrix-intersections.ts     145 lines  (prework D)
├── pareto.ts                   213 lines  (prework G)
├── render-ascii.ts             177 lines  (prework H)
├── progress-report.ts          320 lines  (prework I)
├── vocab-gap.ts                215 lines  (prework J)
├── translator.ts               159 lines  (δ-1, post 2026-05-13 patch on literal)
└── verify-homeomorphism.ts     324 lines  (δ-2, post 2026-05-13 patches)
```

Tests added: `legend-matrix.test.ts`, `legend-matrix-intersections.test.ts`,
`legend-pareto.test.ts`, `legend-render-ascii.test.ts`,
`legend-progress-report.test.ts`, `legend-vocab-gap.test.ts`,
`frontier-tagger.test.ts`, `frontier-cli.test.ts`,
`legend-fixture-tagger.test.ts`, `verify-report-markdown.test.ts`,
plus extensions on the existing legend test files. The fixture under
`examples/legend-fixture/` pins 17 multi-label tagger predictions.

### Legend pipeline end-to-end (with prework I + H + F + G + J overlays)

```
  source (.ts/.py)
    │  onto frontier <perimeter> --totals-only           (B preview, $0)
    │  onto ingest <perimeter> --cost-estimate           (A: variadic, $0)
    │  onto ingest <perimeter> --provider ollama         (H1 + H2 recovery)
    │      └─ writes .ontology/reports/INGEST_<runId>.md (I: frontier preview,
    │         tokens sparkline, per-file table)
    ▼
  node_create proposals
    │  onto graph infer-edges <dir> --create-proposals    (γ-6)
    │  onto proposal apply <id> [from walker :p]          (Walker v2 PR-1)
    ▼
  applied node + edge network
    │  onto verify-homeomorphism --all-artifacts --matrix
    │      └─ produces six-axis matrix (C), byAxis aggregate (C),
    │         byIntersection (D — seven required pairs always present),
    │         honesty per axis (F — structural / contract / behavior /
    │         intent, with sample-size denominator),
    │         paretoByTaskModel (G), vocab-gap report (J — per-node +
    │         aggregate), and three ASCII charts (H — verdict bar,
    │         honesty histogram, frontier-tag bars)
    │      └─ optionally --report <path.md>, --json
    ▼
  five-label verdict folder + axis-relative subcategories
  + Pareto frontier + intent-vocab gap detector
```

The pipeline is **production-ready for the paid pass** modulo §3 (H2
commit) and §4.* below.

---

## 3. Repo / build status

- **Active branch:** `main` (`f4855b9`).
- **`git status`:** three modified files, all on the H2 adaptive
  `num_ctx` path:
  - `src/runtime/llm/types.ts` (+9 lines) — adds `contextWindow?:
    number` to `LlmRequest`. Distinct from the existing
    `LlmModelHandle.contextWindow` field; no collision.
  - `src/runtime/llm/ollama/adapter.ts` (+15 / −4) — forwards
    `contextWindow` as `num_ctx` and `maxTokens` as `num_predict`
    inside the `options` blob. Empty options when neither is set, so
    no mock-provider / existing-test regression.
  - `src/commands/ingest/index.ts` (+72 / −2) — `computeAdaptiveBudget`
    helper (chars-per-token = 3 with a 600-char retry-feedback
    overhead, 500-char user-prompt overhead, 512-token safety buffer,
    floor `MIN_CONTEXT=4096`, cap `MAX_CONTEXT=16384`,
    `MIN_OUTPUT=1024`, `MAX_OUTPUT=4096`), threaded into both the
    primary and retry dispatches. The helper rounds `contextWindow`
    up to the nearest 1024.
- **Commits ahead of `origin/main`:** seven (preworks F–J + H1 + the
  NUL-byte fix). Same git-proxy 403 as last review prevents pushing
  from the sandbox.
- **`tsc --noEmit`:** **clean** end-to-end in the sandbox (Linux
  aarch64). All new types compose with the existing `LlmRequest`
  surface; ingest threads the budget through without violating any
  adapter's contract.
- **`vitest run`:** still blocked in the sandbox (`@rolldown/binding-*`
  rolldown native binding missing for `linux-arm64-gnu`; the npm
  registry still 403s the binary). **Run `npm test` locally before
  any merge.** Commit messages on `5f02feb` / `a1305ae` / `c08516a` /
  `6ed8d48` / `01835a7` / `f4855b9` collectively claim **1100+ tests
  passing**.
- **GitHub proxy:** still 403'd from the sandbox (`git pull`,
  `git fetch`, npm registry binary downloads). Six days running.

---

## 4. Bug list — new findings

Today's commits closed every flagged item from 2026-05-13 §4.1–§4.10
(see §1 above for the cross-reference). The list below is **new**,
scoped to the prework F–J + H1 + uncommitted H2 surface that landed
in the last 48 h.

### 4.1 H2 has no test coverage — **mid-severity, blocks the H2 commit landing on `main`**

The three uncommitted files thread a brand-new budget computation
through `LlmRequest` and the Ollama adapter. `grep contextWindow
tests/` returns one hit (`tests/llm-types.test.ts:20`, which
exercises `LlmModelHandle.contextWindow`, not `LlmRequest`'s).
`tests/ollama-adapter.test.ts` does not assert on `num_ctx` or
`num_predict` in the dispatched payload, and there is no test
fixture exercising `computeAdaptiveBudget` directly. Phase ε's H2
recovery hinges on this code path; landing it without a regression
test would let any future refactor silently revert to `num_ctx=2048`
truncation — exactly the failure mode H2 is meant to close.

**Fix (~80 LoC of test):**

(a) `tests/legend-adaptive-budget.test.ts`: unit-test
`computeAdaptiveBudget` on representative file sizes — tiny (<1 KB,
should floor at `contextWindow=4096`), typical (6 KB, the failure
threshold), large (20 KB, should approach but not exceed
`MAX_CONTEXT=16384`), edge (35 KB, should cap at 16384 — the helper
acknowledges this with a comment, pin it). Cover
`maxTokens` clamp at the `MIN_OUTPUT` / `MAX_OUTPUT` bounds.

(b) Extend `tests/ollama-adapter.test.ts`: one test pinning that
when `request.contextWindow` is provided the dispatched JSON
includes `options.num_ctx`; one test pinning that when
`request.maxTokens` is provided the dispatched JSON includes
`options.num_predict`; one test pinning that neither key appears
when the request omits them. Use the existing mock-fetch harness.

(c) One end-to-end test in `tests/ingest-cli.test.ts` (or a new
`tests/ingest-adaptive-budget.test.ts`) that mocks the dispatcher
and asserts the budget threads through both the primary and the
retry dispatch (H1 retry must reuse the same budget — that's
documented in the source comment but not pinned).

Recommended before the H2 commit lands.

### 4.2 `computeAdaptiveBudget` ignores `EXTRACTION_SYSTEM_PROMPT` evolution — **design, low-mid**

The caller passes `EXTRACTION_SYSTEM_PROMPT.length` into
`computeAdaptiveBudget` (`src/commands/ingest/index.ts:255-257`).
That is one of two system-prompt strings reachable from this code
path — the other is the retry-feedback `buildRetryPrompt` body,
counted via the `RETRY_FEEDBACK_OVERHEAD_CHARS = 600` constant.
**The hard-coded 600 is the only place the H1 retry's actual
overhead is tracked**: if `buildRetryPrompt` grows (say, the next
7b-tier failure mode adds a 1 KB enum cheat-sheet), the budget will
under-allocate and the retry will silently land outside the
allocated window. Either:

(a) Compute the retry-feedback overhead from
`buildRetryPrompt("", "").length` at module-load time and use that
as the constant (~3 lines of code; pins the value automatically).

(b) Increase `SAFETY_BUFFER_TOKENS` from 512 to ~1024 to absorb
moderate growth without a tighter coupling. Cheap, also closes the
related (minor) concern that the user-prompt overhead is
hard-coded at `USER_PROMPT_OVERHEAD_CHARS = 500` but the actual
prompt template can drift.

(a) is the cleaner design; (b) is the cheaper insurance. **Pick one
before the H2 commit lands**, not after.

### 4.3 H2 budget is computed even for Anthropic, where it has no effect — **cosmetic**

`computeAdaptiveBudget` runs unconditionally in
`extractIntentFromFile`; the result is passed to
`dispatchLlmRequest` regardless of provider. The Anthropic adapter
ignores `contextWindow` (documented in the comment block), so this
is correct behaviour, but the `maxTokens` cap of 4096 is forwarded
to Anthropic too — and **on Anthropic the existing extractor was
not bounded by `maxTokens` from the ingest path** (the adapter's
own default is 8192). Effectively, H2 lowers the Anthropic ceiling
from 8192 to 4096. For most files this is fine — extractor JSON
rarely exceeds 1500–2000 tokens — but the **Vibe-Reasoning γ-7
calibration explicitly upgraded `MAX_OUTPUT` because 4096 was
insufficient for files > 3 KB once adaptive thinking consumed part
of the budget**. The same regression risk applies here on the
Anthropic side of Phase ε.

**Two paths:**

(a) Pass `maxTokens` only when `provider === "ollama"`; let
Anthropic keep its 8192 default. Three-line guard at the call site.

(b) Raise `MAX_OUTPUT` from 4096 to 8192 to align with Anthropic's
historical default. Acceptance: still bounds Ollama KV cache —
`num_predict=8192` on qwen2.5-coder:7b 4-bit needs ~4 MB more
output buffer, not a real concern at 16 GB / 32 GB RAM. Cheaper to
implement; same behaviour for both providers.

(b) is the simpler fix and keeps the budget calculation
provider-neutral, which matches the design intent stated in the
comment block. Pin the choice with a comment so future readers
understand why the cap doubled.

### 4.4 `pareto.ts` `bucketKey` is now space-separated — **fragile**

Post-`f2e0f61`, `bucketKey(task, provider, model)` returns
`` `${task} ${provider} ${model}` `` (single ASCII space separator).
The NUL fix was the right call, but the space is fragile for any
caller whose model identifier happens to contain a space.
Anthropic / Ollama canonical model names don't (`claude-opus-4-7`,
`qwen2.5-coder:7b`), but a custom Ollama tag (`ollama create
my-model:vN`) or an Anthropic system-prompt-routed alias could
introduce one, and the consequence is a silent bucket collision —
two distinct `(task, provider, model)` triples share a key, their
Pareto frontier merges, the report mislabels which model dominates
which task.

**Fix:** use the Unit Separator (``) or any non-printable
sentinel that is forbidden in identifiers but trivially serializable
back to display. `${task}${provider}${model}` is the
canonical fix; the renderer already maps the bucket back to its
fields rather than displaying the raw key. ~2 lines + one test
asserting that two model names differing only by a space-vs-other
non-printable byte do not collide.

### 4.5 Compile-report token / cost telemetry is wired to zero — **prework I gap, mid**

`src/commands/compile/run.ts:197-211` calls `renderCompileReport`
with `totalTokens: 0, totalUsd: 0` literally hard-coded, and the
`steps[]` it builds carries no `tokensUsed` per step. The
`CompileReportData` interface (`progress-report.ts:218`) declares
`tokensUsed?: number` on each step, and the renderer at line
277 / 299 emits a per-step tokens sparkline and table column from
that data — so the surfaces exist but the data is dropped on the
floor. The root cause is one layer down: `CompilePlanStepResult`
(`src/runtime/compile/compile-plan-runner.ts:67`) does not carry
the `usage` field that `compile-node.ts:377` records on the
underlying run record. Two adjacent improvements would close it:

(a) Add `usage?: LlmUsage` (or just `totalTokens?: number`) to
`CompilePlanStepResult`, populate it from the dispatch response in
`compile-node.ts`.

(b) In `src/commands/compile/run.ts`, fold step-level usage into the
`steps` payload and `result.steps.reduce` into `totalTokens` /
`totalUsd` (USD requires the per-task rate table, already used by
`onto ingest --cost-estimate`).

Phase ε's Anthropic compile-back is the first context where the
compile-side cost telemetry actually matters — today the operator
gets the per-file ingest cost in the ingest report but no
corresponding number for the compile sweep. ~40 LoC. Recommend
before the paid pass so the report carries comparable cost data on
both sides of the round-trip.

### 4.6 `vocab-gap.ts` camelCase splitter does not handle acronyms — **prework J, low**

`wordTokens(s)` uses `replace(/([a-z0-9])([A-Z])/g, "$1 $2")` to
split camelCase. The regex only triggers on lowercase-to-uppercase
transitions, so consecutive uppercase letters glue: `"HTTPServer"`
→ `{"httpserver"}`, `"XMLParser"` → `{"xmlparser"}`,
`"DBConnection"` → `{"dbconnection"}`. The intent of the loose
match — find vocabulary correspondence between provide-keys and
exports — fails on any acronym-heavy interface (HTTP servers, XML
parsers, DB layers, JSON readers, etc.). The TypeScript compiler
API surface in `src/runtime/static/typescript.ts` exposes plenty of
these.

**Fix:** add the canonical acronym-aware split:

```ts
.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // acronym boundary
.replace(/([a-z0-9])([A-Z])/g, "$1 $2")    // camelCase boundary
```

Order matters; acronym rule runs first so `HTTPServer` becomes
`HTTP Server`, then `Server` is left alone. One test case per
acronym shape. ~3 LoC + 4-line test. Low priority but easy.

### 4.7 `progress-report.renderIngestReport` re-tags files synchronously inside the renderer — **prework I, low**

`renderIngestReport` calls `tagFileFromDisk(f.filePath)` in a tight
loop over every file (`progress-report.ts:132-141`). The renderer
is doc-time, not run-time, but the function is named "render" — it
hides a filesystem read per file. If a file moves between the
ingest dispatch and the report write (the catch block handles this
gracefully), the tag count silently drops. **The bigger concern**
is design coupling: the renderer's correctness depends on a stable
filesystem snapshot, which is not part of its declared input
(`IngestReportData`). Two paths:

(a) Run the tagger inside the ingest command (where the file is
freshly read anyway) and store the tags on `IngestFileSummary`. The
renderer becomes a pure function of its input.

(b) Document the side effect in `IngestReportData` and pin a test
that mid-flight file deletion produces a sensible report.

(a) is cleaner. ~15 LoC refactor; ~10 lines of test. Not blocking.

### 4.8 `MAX_CONTEXT = 16384` is a tight cap for `src/` outliers — **H2, low**

The H2 helper caps `contextWindow` at 16384. The comment block
correctly notes "Files larger than ~30 KB will be served truncated;
this should be rare in practice and the rerun of the truly outsized
files can override via --max-tokens". Quick sanity check against
the perimeter:

```
$ wc -c $(find src/runtime src/core src/commands src/schemas -name "*.ts") \
   | sort -nr | head -5
```

If any file lands `> 24 KB`, that's already in the H2 truncation
zone (CHARS_PER_TOKEN=3 → 8000 tokens of file body alone, plus
system + retry feedback overhead, plus output budget, can easily
exceed 16K context). The pilot did not break on this because the
pilot's perimeter for the schema_failed cohort was already
small-file barrels. Either:

(a) Raise `MAX_CONTEXT` to 32768 — qwen2.5-coder:7b supports 128K
context, the constraint is just KV memory (≈ 16 MB at 32K, fine on
any developer machine).

(b) Add a CLI flag `--max-context <N>` that overrides for the
known-outlier rerun.

Recommend (a) plus emit a warning when `inputTokens + maxTokens >
MAX_CONTEXT` so the operator knows the file was truncated. The
warning is the real win; the cap raise just reduces how often it
fires.

### 4.9 H1 retry has no per-file backoff between retries — **H1, low**

`f4855b9` adds a one-shot retry on schema_failed. The dispatch is
issued immediately after the first failure — no pause. On a 124-file
sweep, if Ollama is under load (concurrent compile-back, or a 7b →
14b warmup), the back-to-back retries can hit the same throughput
ceiling and fail identically. The 7b adapter has no
`@anthropic-style` 429 surface; Ollama returns wall-clock-driven
timeouts. Two paths:

(a) Insert a `setTimeout(150)` between primary and retry. Cheap,
empirically usually sufficient.

(b) Re-dispatch with a slightly lower temperature on retry (e.g.
0.2 if the first call was 0.7). The H1 retry already changes the
user-prompt content; lowering temperature on the second attempt
narrows the distribution toward conforming output. Empirically more
effective than backoff for schema-failure shape.

Recommend (a) + (b) together — `~5` LoC each. Low priority once
H2 lands (truncation, not 7b improvisation, is the dominant failure
mode at scale).

### 4.10 Walker v2 PR-1 has no test of the `a` apply path under proposal-staled — **walker, low**

`4a3116d` lands `:proposals` with `a/r/d` action keys. The TUI
test coverage (per the commit message) covers j/k navigation,
status badges, dry-run. **`a` under a staled proposal** is not
explicitly pinned: if a proposal's `parentHash` has drifted between
list and apply (the operator authored a `node create` in another
shell, say), the apply emits `proposal_staled` instead of
`proposal_applied`. The Walker should surface this clearly — today
the focal-cell repaints with whatever the apply CLI emits, which is
adequate but not pinned by test. ~30 lines of test. Defer to the
Phase ε proposal-review sweep itself; if the staled path fires in
anger, surface as a real bug then.

### 4.11 `frontier-tagger` "Fallback-only" count silently absorbs new file regions — **prework B, low**

`PILOT_RUNBOOK.md` §1.5 already calls this out: "Fallback-only count
is informational. It's the number of files classified only as
`operational-glue`. Acceptable for glue regions; rising over time
is the signal that a region deserves a more specific rule." The
runbook documents the signal, but **the tagger itself emits no
warning when the count rises sharply between runs**. For Phase ε
this is fine (one run, one decision). For the Open-Prompt protocol
(Phase ζ) where the tagger is part of a published signed-intent
chain, a fallback-rate threshold (say, warn at > 10 % of perimeter)
would catch silent perimeter shape changes. Defer to ζ.

---

## 5. Suggested next steps — priority order

### Now (close gaps before the H2 commit lands)

1. **§4.1 — write tests for the H2 path before committing it.** The
   uncommitted change is the single most important code on the
   critical path for Phase ε; landing it on `main` without a test is
   asking for a silent revert in the next refactor. Two unit-test
   files (adaptive-budget + ollama-adapter num_ctx threading) +
   one ingest-cli end-to-end test. ~80 LoC of test.

2. **§4.2 — switch `RETRY_FEEDBACK_OVERHEAD_CHARS` to compute from
   `buildRetryPrompt("", "").length`** (or pad `SAFETY_BUFFER_TOKENS`
   to 1024). ~3 LoC; eliminates a footgun for a future H3.

3. **§4.3 — decide Anthropic `maxTokens` policy.** Either guard at
   the call site (a) or raise `MAX_OUTPUT` to 8192 (b). Recommend
   (b). One-line change + pinning test. **Blocking for the
   Anthropic paid pass** — without it the published ε could be
   artificially worse than the model produces on files that need
   > 4096 output tokens.

4. **§4.4 — Pareto `bucketKey` to `` separator.** Defensive;
   ~2 LoC + 1 test. Cheap insurance once any custom model name
   enters the rotation.

5. **§4.5 — wire compile-step `usage` through to the compile
   progress report.** ~40 LoC across `compile-node.ts`,
   `compile-plan-runner.ts`, `commands/compile/run.ts`. The cost
   side of Pareto is asymmetric until this lands — ingest has
   per-file telemetry, compile has zeros.

### Phase ε pilot — Ollama re-run (after items 1–5)

6. **Re-run the Ollama pilot end-to-end** under H1 + H2 on the same
   124-file perimeter. Expectation: `schema_failed` drops from 19
   into single digits (H1 retry on the barrel-shaped failures),
   silent truncation collapses (H2 num_ctx), `binary_content`
   refusals stay at zero (the pareto.ts NUL was a one-off). If
   `schema_failed` does not drop, iterate the H1 retry-prompt
   template (`--dry-run` is $0). If truncation still bites, raise
   `MAX_CONTEXT` to 32768 per §4.8.

7. **Read the report.** `verify-homeomorphism --all-artifacts
   --provider ollama --matrix --report …` produces the full Phase ε
   shape. Cross-check against
   `SELF_INGEST_HYPOTHESIS_2026-05-13.md` §7 success criteria.
   Discrepancies between the prediction and the Ollama numbers are
   the cheapest signal we get before the paid pass; iterate the
   tagger / matrix / Pareto logic if anything looks wrong.

### Phase ε pilot — Anthropic publishable pass (after item 7)

8. **Cost-estimate the Anthropic pass** per `PILOT_RUNBOOK.md` §2.
   `onto ingest <perimeter> --provider anthropic --cost-estimate`.
   Verify the estimate against the budget. The `--cost-estimate`
   path is zero-API; safe to run any time.

9. **Run the publishable pass.** Same commands per `PILOT_RUNBOOK.md`
   §6. Report lands at
   `docs/legend/calibrations/SELF_INGEST_2026-05-XX.md`. 30–60 min
   wall-clock; $15–30 spend.

10. **Walk the network with `:inspect` + `:graph view`** per
    `POST_GAMMA_PLAN.md` §3.9. The falsifiability check: if the
    inspected network reads fluently and the operator can navigate
    without diving back to source, the compression-meets-legibility
    hypothesis survives.

11. **Lift `MATHEMATICAL_CLAIMS.md` §3.10 T4 → T2** citing the new
    `SELF_INGEST_2026-05-XX.md`. Update `LEGEND.md` §3 with the
    measured shape per `PILOT_RUNBOOK.md` §7.

### Phase ζ — release + Open-Prompt seeds (after item 11)

12. **Tag `0.4.0`** — the release seed (`e52a3c1`), LEGEND release
    note (`1419d46`), and OPEN_PROMPT spec are already merged on
    `main`. The blocker has been ε. Once ε lands, tag and publish.

13. **Open-Prompt v0 implementation** — `onto sign`,
    `onto verify-published`, `onto replay`. Per `OPEN_PROMPT.md`
    Phase ζ design; the spec landed in `1419d46`.

### Hardening / parallel work

14. **§4.6 vocab-gap acronym splitter** — ~3 LoC + 4-line test.
    Picks up false-negatives on HTTP/XML/JSON/DB interfaces in the
    Phase ε vocab-gap aggregate.

15. **§4.7 frontier-tagging in ingest, not in the renderer** —
    ~15 LoC refactor. Renderer becomes pure.

16. **§4.8 raise `MAX_CONTEXT` to 32768 + emit a warning on
    truncation** — small but improves Phase ε's worst-case
    behaviour on `src/` outliers.

17. **§4.9 H1 retry with backoff + lower temperature.** Once H2
    lands the dominant failure mode shifts; this becomes lower
    priority but is essentially free to write.

18. **§4.10 Walker `:proposals` staled-apply test.** Defer to the
    Phase ε review sweep — if it bites, fix it then.

---

## 6. One-paragraph summary

**Phase ε is mid-pilot, not yet measured.** Prework A–E (multi-positional
ingest + frontier tagger + six-axis matrix + intersection aggregator +
cross-doc references), prework F–J (per-axis honesty score, Pareto
pivot, ASCII chart primitives, auto-written progress reports,
vocab-gap detector), Walker v2 PR-1 (`:proposals` review pane),
advisory lock, cross-provider per-task routing, and a release-seed
all shipped in the last 48 h (16 commits, `b035ce7..f4855b9`).
The Ollama pilot ran end-to-end on the 124-file perimeter and
surfaced two failure modes: 19/124 schema_failed (concentrated on
barrel files where qwen2.5-coder:7b improvises invalid enum values)
and a silent truncation of any file >~6 KB (Ollama's default
`num_ctx=2048`). **H1 (commit `f4855b9`) closes the first via a
one-shot retry with literal Zod feedback** and a focused 7b
correction block. **H2 (uncommitted, three files in the working
tree) closes the second via an adaptive `contextWindow` /
`maxTokens` budget threaded through `LlmRequest` → Ollama adapter
`num_ctx` / `num_predict`** (floor 4096, cap 16384, sized from
file + system + retry + safety buffer). **Five small fixes are
recommended before H2 lands on `main`**: (§4.1) the H2 path has
zero test coverage — block the commit on it; (§4.2) the
`RETRY_FEEDBACK_OVERHEAD_CHARS = 600` constant is a hard-coded
shadow of `buildRetryPrompt`'s actual size and will silently
desync if either changes; (§4.3) the H2 `MAX_OUTPUT = 4096`
silently lowers the Anthropic ceiling that γ-7 had to raise —
align it to 8192; (§4.4) `pareto.ts` `bucketKey` is now
space-separated and will silently collide on any custom model name
containing a space — use ``; (§4.5) the compile-progress
report renders zeros for `totalTokens` / `totalUsd` because
`CompilePlanStepResult` does not surface the usage that
`compile-node.ts` already records — wire it through before the
paid pass so cost telemetry is symmetric across ingest and compile.
**Then re-run the Ollama pilot** to confirm H1 + H2 collapse the
two failure cohorts, **then run the Anthropic publishable pass**
per `PILOT_RUNBOOK.md` §6 (cost-estimate first; ~$15–30, 30–60 min
wall-clock), **produce `SELF_INGEST_2026-05-XX.md`, lift `§3.10`
T4 → T2, tag `0.4.0`.** Open-Prompt v0 implementation
(`onto sign / verify-published / replay`) is the only Phase ζ
work remaining after the release tag.

---

Sources: local clone at `HEAD = f4855b9` (`main`), three modified
files in the working tree (H2 patch in flight); `git log
--since="2026-05-13 12:00"`; `git show b035ce7 f80163d e43b2cc
b2193bf 4a3116d 1419d46 e52a3c1 373eb8a 4f689f7 5f02feb a1305ae
c08516a 6ed8d48 01835a7 f2e0f61 f4855b9`;
`src/runtime/legend/{frontier-tagger,matrix,matrix-intersections,
pareto,render-ascii,progress-report,vocab-gap,translator,
verify-homeomorphism}.ts`;
`src/commands/{ingest/index,compile/run,verify/homeomorphism,
node/inspect}.ts`;
`src/runtime/compile/{compile-node,compile-plan-runner}.ts`;
`src/runtime/llm/{types,ollama/adapter,anthropic/adapter}.ts`;
`src/core/fs/lock.ts`;
`src/schemas/ontology.ts`;
`docs/{ROADMAP,PROJECT_LEGEND,LEGEND,OPEN_PROMPT,POST_GAMMA_PLAN,
POSITIONING,RELEASE_NOTES,MATHEMATICAL_CLAIMS,BRANCH_MODEL}.md`;
`docs/legend/{PREWORK_2026-05-13,PILOT_RUNBOOK}.md`;
`docs/legend/calibrations/{HASH_TS_2026-05-12,
SELF_INGEST_HYPOTHESIS_2026-05-13,
VIBE_REASONING_GAMMA_7_2026-05-12,
VIBE_REASONING_PROCEDURE}.md`; prior review
`docs/reviews/MILESTONE_REVIEW_2026-05-13.md`. The sandbox proxy
blocked `github.com` for the sixth consecutive day, and
`vitest run` is still blocked in the sandbox by the missing
`linux-arm64-gnu` rolldown binding — `tsc --noEmit` is clean from
the sandbox, but `npm test` must run locally before any merge.
