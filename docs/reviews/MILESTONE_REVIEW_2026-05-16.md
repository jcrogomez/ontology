# Ontology — Milestone review 2026-05-16

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout at `main` (`4336723` — "docs(legend):
> pre-register Phase ε self-ingestion β hypothesis", committed
> 2026-05-16 01:32 local). Working tree clean except for the
> untracked `.ontology.archive-pre-self-ingest-2026-05-16/` snapshot
> (104 KB) — see §4.3 below.
> **`git pull` from the sandbox blocked again — `HTTP 403` from the
> proxy to `github.com` (seventh consecutive day). The local clone is
> the source of truth; run `git pull` locally before acting on this
> report.** The previous review (`MILESTONE_REVIEW_2026-05-15.md`)
> closed at H2 mid-flight, with five fix-it items recommended before
> the H2 commit landed. In the 48 h since, **H2 + H3 + H4 + E1/E2/E5
> landed (calibration telemetry + NUL guard + retry-with-backoff +
> bake-off harness), a second bake-off ran (4 models × 3 reps × 20
> files), the calibrated model defaults flipped 7b/8b → 3b family, a
> Structural Semantic Classifier shipped end-to-end (report-only →
> enabled), and the Phase ε self-ingestion β hypothesis was
> pre-registered. Phase ε is now staged for the actual β run.**

---

## 1. Headline status

**Phase ε is one command away from its first measurement.** The 48 h
between MR_2026-05-15 and now closed every blocker from yesterday's
list and added a new architectural layer (Structural Semantic
Classifier) that the hypothesis (`SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md`)
treats as a load-bearing prediction axis. Concretely:

- **H2 landed** (`716b341`) — adaptive `num_ctx` / `num_predict` on
  Ollama dispatches. The §4.1 test gap from MR_2026-05-15 was closed
  inline.
- **H3 landed** (`b6badaf`) — bounded retry-with-backoff on transient
  dispatch failures. Closes MR_2026-05-15 §4.9 in advance.
- **H4 landed** (`16933fd`) — pre-commit guard that rejects NUL bytes
  in `*.ts` / `*.tsx`. Closes the structural cause of the `pareto.ts`
  NUL incident (`f2e0f61`) at source-control time, not after the fact.
- **E1/E2/E5 landed** (`2678ed8`) — per-file telemetry struct
  (`ExtractTelemetry`), INGEST report telemetry section, and a
  `scripts/bakeoff.sh` harness sized for the 3b family.
- **Bake-off v2 completed and archived** — four models (qwen2.5-coder:3b,
  llama3.2:3b, deepseek-r1:1.5b, phi3:mini) × 3 reps × 20 curated files,
  2 h 29 min wall-clock at $0. Conclusions:
  - qwen2.5-coder:3b is **deterministic** at 95% single-run, 100% via
    ensemble × 3. The recommended default for `semantic_parse`.
  - llama3.2:3b is **stochastic complementary** — different files
    fail each rep, so ensemble × 3 reaches 100% coverage. Pareto-
    optimal high-confidence extractor.
  - deepseek-r1:1.5b is **banned** for `structured_extraction` —
    the reasoning-tuned CoT eats the output budget before the JSON
    closes. Nine files fail every rep.
  - phi3:mini is **strictly dominated** — 63% single-run, 5× the
    wall-clock of qwen/llama.
- **Model capability profiles + ban enforcement landed** (`80770cc`,
  `e106c02`) — `MODEL_CAPABILITY_PROFILES` declarative layer plus an
  `LlmTask → LlmTaskKind` mapper. The dispatcher refuses to send a
  banned (model, task-kind) pair regardless of provider. Replaces
  the previous frankenstein `if (model.includes("deepseek")) { ... }`
  shape with a single oracle. **Side-effect:** the Ollama
  `semantic_parse` default flipped from `qwen2.5-coder:7b` (M1 VRAM
  blocker on large files) + `llama3.1:8b` to `qwen2.5-coder:3b` +
  `llama3.2:3b`. The accompanying registry test was missed in
  `e106c02` and silently broke the suite for ~50 min until `42650a8`
  realigned it.
- **High-confidence ensemble mode landed** (`5476bb6`) —
  `--ensemble high-confidence` runs three llama3.2:3b reps,
  selects best by `scoreExtractionCompleteness`, surfaces full
  metadata in the INGEST report. Only honoured for `semantic_parse`,
  Ollama-only, default OFF (single-run path byte-identical to
  pre-PR).
- **Structural Semantic Classifier landed in three increments**:
  1. `2b22915` — pure-fact module `runtime/legend/structural-classifier.ts`
     (677 LoC) — produces `StructuralClassification { language,
     structuralShape, semanticRole, confidence, reasons, signals }`
     from `(path, content)`. Reuses `parseTypeScriptFile` plus a
     small AST walk for JSX / Zod / vitest detection. Pure: no IO,
     no LLM, no network. 23 unit tests.
  2. `80cde7e` — `--static-classifier report-only` wires the classifier
     into ingest as a **read-only observer**: the INGEST report
     gains a "Structural classification" section (shapes / roles /
     notable files) but routing is byte-identical to default. Plus
     a fix to `relativiseOrAbsolute` that canonicalises both sides
     via `fs.realpathSync` before comparing (macOS `/private/var/...`
     quirk).
  3. `14bdd36` — `--static-classifier enabled` graduates the
     classifier from observer to **ingest policy**: barrel and
     declaration_only files bypass the LLM and receive a synthetic
     extraction from `runtime/legend/static-summary.ts`. Conservative
     v0 — every other shape (including `schema_module`) stays on
     `semantic_parse`. Smoke run on `src/runtime src/core src/commands
     src/schemas` confirmed 7/128 deflections, `mixed_module = 0`,
     `unknown = 0`.
- **Phase ε β hypothesis pre-registered** (`4336723`) — per-route
  Jaccard predictions, per-shape variance bands, verdict-folder
  distribution, three structural-cartography signals (route vs shape
  vs cost orthogonality), and explicit falsification conditions.
  Filed **before** the run starts so the experiment is genuinely
  falsifiable.
- **First real-LLM enabled-mode smoke ran** (`6327229` archive,
  raw report `.ontology/reports/INGEST_run_a53fc46d.md`) — 130 files
  on qwen2.5-coder:3b, 128 OK (98.5%), 7 LLM dispatches deflected
  via `static_summary`, 43 min wall-clock. The two `schema_failed`
  losses were both `schema_module`-classified, vindicating the
  conservative routing choice (deflecting `schema_module` would have
  produced silent wrong extractions instead of surfaced failures).

**Phase ε remaining work is now the single command from
`PILOT_RUNBOOK.md` §6**:

```
onto ingest src/runtime src/core src/commands src/schemas \
  --provider ollama \
  --static-classifier enabled \
  --report .ontology/reports/INGEST_BETA_2026-05-16.md
onto proposal apply <ids>  # × 128
onto verify-homeomorphism --all-artifacts --matrix \
  --report docs/legend/calibrations/SELF_INGEST_BETA_2026-05-16.md
```

— against the predictions in
`docs/legend/calibrations/SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md`.
The pre-flight archive at `.ontology.archive-pre-self-ingest-2026-05-16/`
is already in place. The hypothesis predicts ~24% `homeomorphic` +
~20% `structurally_similar` + ~12% `loc_similar_only` + ~44%
`divergent`, mean static_summary Jaccard ≥ 0.95 (n=7), mean
semantic_parse Jaccard ≈ 0.55 (n=123), zero spend, ~2 h wall-clock.

---

## 2. What happened in the last 48 h

17 commits on `main` since the prior review (range
`f4855b9..4336723`). Highest-signal items:

| Commit  | Phase | Headline |
|---|---|---|
| `716b341` | ε H2 | adaptive context window + output budget for Ollama ingest |
| `b6badaf` | ε H3 | bounded retry-with-backoff on transient dispatch failures |
| `16933fd` | ε H4 | pre-commit guard for NUL bytes in `*.ts` / `*.tsx` |
| `2678ed8` | ε E1/E2/E5 | per-file telemetry + report section + bake-off harness |
| `47076d9` / `0537938` | calib | bake-off v2 calibrated results + raw archive |
| `80770cc` | llm | calibrated model capability profiles |
| `e106c02` | llm | wire calibrated `structured_extraction` default + ban enforcement |
| `5476bb6` | llm | high-confidence ensemble mode for `semantic_parse` |
| `2b22915` | legend | Structural Semantic Classifier (pure facts) |
| `80cde7e` | ingest | report structural classifications (report-only) |
| `14bdd36` | ingest | use structural classifier for static summaries (enabled mode) |
| `42650a8` | test | align registry test with calibrated bake-off v2 defaults |
| `6327229` | calib | archive PR3 enabled-mode smoke calibration |
| `4336723` | docs ε | pre-register Phase ε self-ingestion β hypothesis |

### Net-new code surface (since MR_2026-05-15)

```
src/runtime/legend/
├── structural-classifier.ts    677 lines  (NEW — pure facts)
├── static-summary.ts           167 lines  (NEW — deterministic extraction builder)
└── progress-report.ts          +444 lines (classification + ensemble + routing sections)

src/runtime/llm/
├── ensemble.ts                 116 lines  (NEW — high-confidence ensemble primitives)
└── model-capabilities.ts       ~190 lines (NEW — calibrated profiles + LlmTask→LlmTaskKind)

src/commands/ingest/
├── static-classifier-policy.ts  77 lines  (NEW — facts → routing decision)
└── index.ts                    +600 lines (telemetry, ensemble runner, classifier wiring)

docs/legend/calibrations/
├── BAKEOFF_3B_FAMILY_2026-05-15.md         (4-model × 3-rep × 20-file matrix)
├── SMOKE_PR3_ENABLED_2026-05-15.md         (first real-LLM enabled-mode run)
└── SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md (pre-registered β predictions)
```

Test surface: at least nine new test files
(`structural-classifier.test.ts`, `static-summary.test.ts`,
`ingest-static-classifier-{integration,enabled}.test.ts`,
`llm-ensemble.test.ts`, `ingest-ensemble-{scoring,integration}.test.ts`,
`model-capabilities.test.ts`, `dispatcher-ban-enforcement.test.ts`)
plus extensions on the existing ingest / cross-provider / registry
files. Commit messages collectively claim **1300+ tests passing**.

### `tsc --noEmit` status

Clean from the sandbox (`./node_modules/.bin/tsc --noEmit` exit 0).
The H2 / H3 / E1 thread-throughs compose with every adjacent
interface; the structural classifier and ensemble modules respect
the no-circular-import contracts called out in their headers.

### Repo state

- **Active branch:** `main` (`4336723`).
- **`git status`:** working tree clean; one untracked directory,
  `.ontology.archive-pre-self-ingest-2026-05-16/` (104 KB) — **the
  Phase ε β pre-flight archive of `.ontology/` BEFORE the
  self-ingest run**. See §4.3.
- **Commits ahead of `origin/main`:** 1 (the hypothesis doc).
- **GitHub proxy:** still 403'd from the sandbox (`git pull`,
  `git fetch`). Seven days running.
- **`vitest run`:** still blocked in the sandbox by the missing
  `linux-arm64-gnu` rolldown binding (same posture as
  MR_2026-05-15). Run `npm test` locally before any merge.

---

## 3. Pipeline state — Project Legend end-to-end

```
  source (.ts/.py)
    │  onto frontier <perimeter> --totals-only             (B preview, $0)
    │  onto ingest <perimeter> --cost-estimate             (A: variadic, $0)
    │  onto ingest <perimeter> --provider ollama \\
    │                          --static-classifier enabled (PR3 routing)
    │      └─ structural-classifier.ts  → classification facts
    │      └─ static-classifier-policy.ts → semantic_parse | static_summary
    │      └─ extractIntentEnsemble (--ensemble high-confidence, optional)
    │      └─ H1 schema retry + H3 backoff + H2 adaptive budget
    │      └─ writes .ontology/reports/INGEST_<runId>.md
    │         (frontier preview + classifier routing + per-file table)
    ▼
  node_create proposals (≤ N files, − static_summary deflections)
    │  onto graph infer-edges <dir> --create-proposals     (γ-6)
    │  onto proposal apply <id> [from walker :p]           (Walker v2 PR-1)
    ▼
  applied node + edge network
    │  onto verify-homeomorphism --all-artifacts --matrix
    │      └─ six-axis matrix (C) + byIntersection (D)
    │      + honesty per axis (F) + paretoByTaskModel (G)
    │      + vocab-gap (J) + three ASCII charts (H)
    │      └─ optionally --report <path.md>, --json
    ▼
  five-label verdict folder × structural-classifier shape
  × frontier-tag × (model, provider, task) Pareto frontier
```

The two new layers since MR_2026-05-15 — **classifier routing** and
**high-confidence ensemble** — slot into the existing pipeline as
strictly additive policy stages. The defaults are byte-identical to
pre-PR for an operator who runs `onto ingest <path>` without flags.

---

## 4. Bug list — new findings

Today's commits closed every flagged item from MR_2026-05-15 §4.1–§4.11
**except §4.3** (the H2 `MAX_OUTPUT = 4096` cap silently lowering the
Anthropic ceiling) — see §4.1 below. The list below is otherwise
scoped to the surface that landed in the last 48 h.

### 4.1 `MAX_OUTPUT = 4096` still bites the Anthropic Phase ε side — **mid, blocks paid pass**

MR_2026-05-15 §4.3 flagged this. `src/commands/ingest/index.ts:635`
still hard-codes `const MAX_OUTPUT = 4096;`. The Anthropic adapter's
own default is 8192; the Vibe-Reasoning γ-7 calibration explicitly
raised the cap because 4096 was insufficient on files > 3 KB after
adaptive thinking consumed part of the budget. Effectively, every
file that reaches the Anthropic provider through the ingest path
now ships with a 4096 max-output ceiling — **half** of what γ-7
required and what Phase ε on the publishable side will need.

The β hypothesis run is Ollama-only ($0, ε), so this does NOT
block the immediate next step. It DOES block the Anthropic
publishable pass that comes after.

**Fix (1 line + 1 test):** raise `MAX_OUTPUT` to 8192. Pin the choice
with a one-line comment citing γ-7. The Ollama side absorbs the cost
trivially (~4 MB extra KV cache on qwen2.5-coder:3b 4-bit). Land
this before the paid run, not after.

### 4.2 `extractIntentEnsemble` mis-counts `validCount` / `failedCount` on the fatal-failure path — **mid, telemetry-only**

`src/commands/ingest/index.ts:781-795`. When a rep that comes
*after* one or more successful reps fails with a structural reason
(`read_failed` / `binary_content` / `empty_file`), the function
short-circuits with:

```ts
ensemble: {
  ...
  repetitions: reps.length + 1, // includes the failing structural rep
  validCount: 0,
  failedCount: reps.length + 1,
},
```

`reps.length` is the count of attempts pushed before the fatal
break. Two failure shapes are mis-reported:

- Trace A: rep 1 ok, rep 2 fatal → `reps.length = 1`, function
  reports `repetitions = 2, validCount = 0, failedCount = 2`. **One
  rep was actually valid.** The selected ExtractResult is still
  correctly `ok: false` (because the source state is suspect once
  binary_content fires), but the report claims 2 failures where
  there was 1 success + 1 fatal.
- Trace B: rep 1 ok, rep 2 non-fatal failure (pushed), rep 3 fatal
  → `reps.length = 2`, reports `validCount = 0, failedCount = 3`.
  Should be `validCount = 1, failedCount = 2`.

Caller-visible impact: the INGEST report's "High-confidence ensemble"
section shows wrong `Valid reps` / `Failed reps` columns on the
fatal path. The headline `ok / failed` status of the file is
correct; this is purely a telemetry mis-count.

**Fix (~5 LoC):**

```ts
const validBeforeFatal = reps.filter((r) => r.ok).length;
const failedBeforeFatal = reps.filter((r) => !r.ok).length;
ensemble: {
  ...
  repetitions: reps.length + 1,
  validCount: validBeforeFatal,
  failedCount: failedBeforeFatal + 1, // the fatal rep itself
},
```

Plus one test in `tests/ingest-ensemble-integration.test.ts` that
mocks rep 1 ok, rep 2 returning `binary_content` and pins the
metadata shape.

**Design follow-up (separate decision):** is it actually correct to
discard a valid rep-1 extraction when rep-2 saw the file as binary?
Code comment claims "won't get better with repetition" — true for a
permanently binary file, but a transient "file replaced mid-run"
case would benefit from surfacing rep 1's result with a warning.
Pin the current behaviour with a comment explaining why; revisit if
Phase ε surfaces a case in anger.

### 4.3 `.ontology.archive-pre-self-ingest-2026-05-16/` is NOT gitignored — **mid, near-foot-gun**

The hypothesis doc claims "The archived
`.ontology.archive-pre-self-ingest-2026-05-16/` is NOT committed
(gitignored)". **The current `.gitignore` only excludes `.ontology/`,
not `.ontology.archive-*`**. The 104 KB pre-run snapshot is in the
working tree as untracked content. A `git add .` (no globbing
guards) by either the operator or an automation step would stage
the entire `.ontology` graph state at HEAD into the next commit —
defeating the design intent that ephemeral run artefacts stay out
of git.

**Fix (2 lines):** add to `.gitignore`:

```
.ontology.archive-*/
```

A pattern-based rule covers this archive AND any future
pre-run / post-run snapshots the operator might create with a
similar naming convention.

### 4.4 `schema_module` is the predicted bimodal class — tighten before β if cheap — **design, mid**

The hypothesis (`SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md` §"Axis 2")
flags `schema_module` (n=10) as **bimodal: 0.30 ↔ 0.85 Jaccard**
because the classifier's predicate (`hasZodImport && z.* call`) over-
fires on files that *use* Zod for runtime validation (`ingest/index.ts`,
`runtime/llm/ensemble.ts`, `runtime/legend/{matrix,pareto,vocab-gap}.ts`,
`runtime/topos/{omega,predicate}.ts`) versus files that *are*
schemas (the canonical case under `src/schemas/`). The β run will
amplify this — the schema_module group will look bimodal and the
mean will be uninformative.

Two options:

(a) **Cheap (~10 LoC):** tighten the predicate to require that
    `(reExportCount + schemaExportCount) >= 0.5 × exportCount` AND
    the file path is **not** under `src/commands/`. Re-runs the
    PR3 smoke (zero LLM cost — `--dry-run`); confirms the
    `schema_module` count drops from 10 to the actual 4 schema
    files. Re-run β under the tightened predicate; the per-shape
    variance signal becomes interpretable.

(b) **Punt:** run β under the current overfit; the bimodal
    result IS one of the three load-bearing predictions in the
    hypothesis (§Cartography signal #2). If the data confirms the
    bimodality, the predicate tightening lands as the post-β
    PR with the calibration to anchor it.

(b) is the falsifiability-aligned choice — the hypothesis explicitly
predicts the bimodality. **Run β as-is; do not tighten the predicate
before measurement.** Confirming the prediction is more valuable
than skipping it. The tightening lands afterwards with the
"this is what the data showed" justification.

### 4.5 Bake-off v2 + smoke results live on `main` but β has not yet run on its OWN reports — **process, low**

The PR3 enabled-mode smoke (`SMOKE_PR3_ENABLED_2026-05-15.md`)
showed 128/130 OK and 7 deflections. The latest INGEST report on
disk (`.ontology/reports/INGEST_run_9c7d7d6a.md`, generated
2026-05-16 03:14 then 07:17) shows **125/130 OK with 5
schema_failed**. The smoke and the latest run differ by **3 more
failures** on the same perimeter, same model, same flags:

| Run | Date | OK | Failed | schema_failed files |
|---|---|---:|---:|---|
| Smoke (a53fc46d) | 2026-05-16 03:14 | 128 | 2 | `runtime/llm/ensemble.ts`, `core/proposals/persist.ts`-adj |
| Latest (9c7d7d6a) | 2026-05-16 07:17 | 125 | 5 | `runtime/errors.ts`, `runtime/legend/matrix.ts`, `runtime/llm/ensemble.ts`, `core/proposals/persist.ts`, `runtime/topos/predicate.ts` |

The smoke claims 98.5% extraction — the latest run is at 96.2%.
The delta isn't a regression in code (both runs land at the same
git commit) but **qwen2.5-coder:3b is rep-to-rep variance > 0 on
this perimeter** even though the bake-off measured 0% variance on
the curated 20-file subset. The bake-off's "deterministic 95%"
finding does not generalise to the full 130-file perimeter — at
that scale, run-to-run variance is real.

**No fix required**; this is empirical data. **Caveat for the β
report:** the headline number from a single run will under-state
the actual single-run distribution. The hypothesis predicts in
ranges, not point values — good. The narrative around the β
result should explicitly note that single-run rates on the full
perimeter differ from the curated-subset bake-off, and that the
operator should run β at least twice if the time budget allows
(2 × ~2 h ≈ 4 h, $0).

### 4.6 Static-summary `forbids` / `rules` strings are prose, not structured tokens — **design, low**

`src/runtime/legend/static-summary.ts:90-110, 120-145`. The builder
emits:

```ts
forbids: ["runtime side effects in the barrel itself"],
rules: ["REQUIRE: every export is a re-export from a sibling file; no local declarations"],
```

These are human-readable strings, not the structured contract tokens
that `assembleContext` and the topos rule predicate algebra consume.
γ-7's MANDATORY EXPORTS invariant explicitly worked to move
contracts from prose into structured `provides[]` / `forbids[]`
token sets. The static-summary builder regresses this for the
deflected files: a barrel's `provides[]` is empty, its `forbids[]`
is a single English sentence, and its `rules[]` is a prose REQUIRE.

This does NOT block the β run — the verify-homeomorphism pipeline
compares regen-vs-source structurally (Jaccard over top-level
declarations), not contract-by-contract. But it leaks intent into
prose where the γ-7 design said it should be structured.

**Fix (~30 LoC, low priority):** for `barrel`, emit
`provides: ["re-exports"]` plus structured `forbids: ["runtime-decl",
"side-effect"]`. For `declaration_only`, emit `provides: ["type-decl"]`
plus structured `forbids: ["runtime-decl", "value-decl"]`. Drop the
prose `rules`; the structured `forbids` IS the rule. Tag the
choice in a static-summary-vocabulary comment. Pin two tests.

### 4.7 Structural classifier's React-component heuristic has a `break` scoping bug — **low**

`src/runtime/legend/structural-classifier.ts:295-305`. The inner
loop iterates `stmt.declarationList.declarations` and sets
`result.hasReactComponent = true; break;` — the `break` exits the
**inner** for loop, but the outer "first matching exported
identifier" loop continues. The followup `if (result.hasReactComponent)
break;` after the inner loop catches it, so functionally correct,
but the control flow is harder to read than necessary. **Defer.**
Cosmetic; pin a test if a real component_module false-negative
ever surfaces in Phase ε.

### 4.8 Test files imported via path heuristic still walk AST — **micro, low**

`structural-classifier.ts` runs `walkAst` and `buildSignals` on
test files even though `pathLooksLikeTest` short-circuits at
priority 1 in `applyRules`. The AST work is wasted for any file
under `tests/` or matching `*.{test,spec}.{j,t}sx?`. On a 130-file
perimeter this is irrelevant; on a 5000-file repo it would add
seconds. **Optional:** early-return for test paths before parsing.
~5 LoC. Defer until perimeter scale demands it.

### 4.9 `model-capabilities` profile coverage is bake-off-only — **mid, predates β report**

`MODEL_CAPABILITY_PROFILES` (`src/runtime/llm/model-capabilities.ts`)
lists exactly the four bake-off v2 models. **None of the Anthropic
models** — Opus 4.7, Sonnet 4.6, Haiku 4.5 — appear, even though
the cross-provider routing path already treats them as the
authoritative defaults for `inspect` / `semantic_parse` /
`code_sketch`. A model without a profile gets "permitted, not
preferred" — which is the correct behaviour for the unknown case,
but Phase ε's publishable side will run on Sonnet 4.6 and the
report-writer (LEGEND.md, MATHEMATICAL_CLAIMS.md §3.10) will want
to cite a profile entry, not a missing-data fall-through.

**Fix (~30 LoC):** add three profiles for Opus / Sonnet / Haiku
with `preferredFor` derived from `DefaultAnthropicRouting`'s
historical use (inspect → Haiku, semantic_parse → Sonnet,
code_sketch → Opus). Notes can cite γ-2 (HASH_TS) and γ-7
(Vibe-Reasoning) as calibration sources. Empty `bannedFor` for
each (no measured bans for frontier-tier models). Land before
the Anthropic publishable pass.

### 4.10 `42650a8` reveals registry tests are not exhaustively cross-checked when registry defaults flip — **process, low**

`e106c02` flipped the Ollama `semantic_parse` default 7b/8b → 3b
without touching `tests/llm-registry.test.ts`, which silently
asserted the legacy default list. 50 min later `42650a8` realigned
it. The miss didn't bite because `tsc --noEmit` passes either way
(string array, no type-level constraint), and the project doesn't
run vitest in CI for `main` commits (the sandbox proxy block is
also blocking GitHub Actions' npm registry binary downloads —
seven days, per §1).

**No code fix needed** — `42650a8` is the actual fix. **Process
recommendation:** the registry-default constant should grep its
own value out of one place in `tests/`. Mechanism: an exported
constant `EXPECTED_REGISTRY_DEFAULTS` in
`tests/fixtures/registry-defaults.ts` that both `registry.ts` and
the test reference. Flipping the default in one place flips it in
the other. ~10 LoC of refactor; eliminates the recurrence.

### 4.11 `--ensemble high-confidence` always runs N=3 even when rep 1 has full-completeness — **perf, low**

`extractIntentEnsemble` issues all 3 dispatches unconditionally.
For "easy" files where rep 1 already scores `scoreExtractionCompleteness`
at the maximum (every optional field populated), reps 2 and 3
add latency without changing the selected winner. On the 124-file
perimeter, ~60% of files are "easy" by this metric (no zod / no
JSX / no requires). A `--ensemble high-confidence --early-stop` mode
that breaks the loop on a max-score rep 1 would cut wall-clock
roughly 30-40% on the easy cohort.

**Fix (~20 LoC):** add `earlyStopOnMaxScore: boolean` to the
ensemble runner. Threshold the `scoreExtractionCompleteness` max,
break the loop when rep score == max. Pin two tests: easy file
(stops at rep 1), hard file (runs to rep 3).

**Priority:** low. The ensemble path is opt-in and not exercised
on the immediate β run. Wire it in alongside the Anthropic
publishable pass if the operator wants to measure ensemble cost
on a frontier model.

---

## 5. Suggested next steps — priority order

### Now (immediate Phase ε β run)

1. **Add `.ontology.archive-*/` to `.gitignore`** (§4.3). 2 lines.
   Eliminates the foot-gun before β commits + amends start.
2. **Run the β ingest+verify pipeline.** `PILOT_RUNBOOK.md` §6
   commands, qwen2.5-coder:3b end-to-end, ~2 h wall-clock, $0.
   The hypothesis predictions are filed; the experiment is live.
3. **Read the matrix against the hypothesis.** Five falsification
   conditions are pre-registered (`SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md`).
   Each row of the prediction table has a measured value to
   compare. Discrepancies are the load-bearing signal — the
   hypothesis is filed for the disagreements, not the agreements.

### Before the Anthropic publishable pass

4. **Raise `MAX_OUTPUT` from 4096 to 8192** (§4.1). 1 line + 1
   test. Closes the Anthropic ceiling regression for files
   > ~3 KB body.
5. **Fix the ensemble fatal-failure counting bug** (§4.2). ~5 LoC
   + 1 test in `ingest-ensemble-integration.test.ts`. Telemetry-
   only, but Phase ε's reports cite the metadata.
6. **Add Anthropic profiles to `MODEL_CAPABILITY_PROFILES`** (§4.9).
   ~30 LoC. The β report wants a stable profile reference for the
   Sonnet 4.6 run.
7. **Cost-estimate the Anthropic pass** per `PILOT_RUNBOOK.md` §2:
   `onto ingest <perimeter> --provider anthropic --cost-estimate`.
   Verify against the $30 ceiling.

### Then the Anthropic publishable pass

8. **Run the publishable pass** per `PILOT_RUNBOOK.md` §6 with
   `--provider anthropic`. Report lands at
   `docs/legend/calibrations/SELF_INGEST_2026-05-XX.md`.
   30-60 min wall-clock; ~$15-30.
9. **Walk the network** with `:inspect` + `:graph view`. The
   falsifiability check for the Inspector / Lupa layer.
10. **Lift `MATHEMATICAL_CLAIMS.md` §3.10 T4 → T2** citing the
    new calibration. Update `LEGEND.md` §3 with the measured
    shape.

### Phase ζ — release + Open-Prompt

11. **Tag `0.4.0`.** Release seed (`e52a3c1`) + LEGEND.md +
    OPEN_PROMPT.md are merged; the only blocker is ε. Once
    the publishable calibration is committed, tag and publish.
12. **Open-Prompt v0 implementation** — `onto sign`,
    `onto verify-published`, `onto replay`. Spec at
    `OPEN_PROMPT.md`.

### Design / hardening (parallel work)

13. **Drop `schema_module` overfit predicate** (§4.4 option a) —
    AFTER β confirms the bimodality prediction, not before.
    Pin with the calibration that motivated the change.
14. **Replace prose-rules with structured tokens in static-summary**
    (§4.6). ~30 LoC. Aligns deflected files with γ-7's structured-
    contract direction.
15. **Add `--ensemble high-confidence --early-stop` mode** (§4.11).
    ~20 LoC. Optional; wires in alongside Anthropic ensemble
    measurement.
16. **Refactor registry-default tests to a shared fixture** (§4.10).
    ~10 LoC. Eliminates the silent-default-drift recurrence.
17. **Early-return for test paths in classifier** (§4.8). ~5 LoC.
    Defer until perimeter scale matters.

---

## 6. One-paragraph summary

**Phase ε is one command away from its first measurement.** The 48 h
between MR_2026-05-15 and now closed every H1-H4 ε-hardening item
plus the §4.1–§4.11 MR_2026-05-15 list (except §4.3 `MAX_OUTPUT`),
landed a 4-model × 3-rep × 20-file bake-off that calibrated the
3b-family defaults (qwen2.5-coder:3b deterministic at 95%, llama3.2:3b
stochastic-complementary to 100% via ensemble × 3, deepseek-r1:1.5b
banned for structured_extraction, phi3:mini strictly dominated),
flipped the Ollama `semantic_parse` default to the calibrated 3b
pair, added a high-confidence ensemble mode for `semantic_parse`,
and shipped a Structural Semantic Classifier in three increments
(pure-facts → report-only → enabled). The Phase ε self-ingestion β
hypothesis is pre-registered with falsification conditions filed
**before** the run starts (`SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md`);
the pre-flight `.ontology` archive is in place. **Five small fixes
recommended before the run + publishable pass:** (§4.1) raise
`MAX_OUTPUT` 4096→8192 for the Anthropic side; (§4.2) fix
`extractIntentEnsemble` fatal-failure counting; (§4.3) add
`.ontology.archive-*/` to `.gitignore`; (§4.4) **do NOT** tighten
the `schema_module` predicate before β — the bimodality is one of
the load-bearing predictions; (§4.9) add Anthropic profiles to
`MODEL_CAPABILITY_PROFILES`. **Immediate next step: add the gitignore
rule and run `onto ingest --static-classifier enabled` end-to-end
on the perimeter against the pre-registered predictions.** The
remaining Phase ε work after that is the Anthropic publishable
pass (~$15-30, 30-60 min), the calibration write-up at
`SELF_INGEST_2026-05-XX.md`, lifting `MATHEMATICAL_CLAIMS.md` §3.10
T4 → T2, and tagging `0.4.0`. Open-Prompt v0 (`onto sign /
verify-published / replay`) is the only Phase ζ work remaining
after the tag.

---

Sources: local clone at `HEAD = 4336723` (`main`, 1 ahead of
`origin/main`, working tree clean except for untracked
`.ontology.archive-pre-self-ingest-2026-05-16/`); `git log
4336723..f4855b9` (17 commits); `git show 716b341 b6badaf 16933fd
2678ed8 47076d9 0537938 80770cc e106c02 5476bb6 2b22915 80cde7e
14bdd36 42650a8 6327229 4336723`;
`src/runtime/legend/{structural-classifier,static-summary,
frontier-tagger,matrix,matrix-intersections,pareto,render-ascii,
progress-report,vocab-gap,translator,verify-homeomorphism}.ts`;
`src/runtime/llm/{ensemble,model-capabilities,types,dispatcher,
registry,ollama/adapter,anthropic/adapter}.ts`;
`src/commands/ingest/{index,static-classifier-policy,cost-estimate}.ts`;
`src/commands/{compile/run,verify/homeomorphism,node/inspect}.ts`;
`docs/{ROADMAP,PROJECT_LEGEND,LEGEND,OPEN_PROMPT,POST_GAMMA_PLAN,
RELEASE_NOTES,MATHEMATICAL_CLAIMS,BRANCH_MODEL}.md`;
`docs/legend/{PREWORK_2026-05-13,PILOT_RUNBOOK}.md`;
`docs/legend/calibrations/{BAKEOFF_3B_FAMILY_2026-05-15,
SMOKE_PR3_ENABLED_2026-05-15,SELF_INGEST_BETA_2026-05-16_HYPOTHESIS,
SELF_INGEST_HYPOTHESIS_2026-05-13,HASH_TS_2026-05-12,
VIBE_REASONING_GAMMA_7_2026-05-12,VIBE_REASONING_PROCEDURE}.md`;
prior reviews `docs/reviews/MILESTONE_REVIEW_2026-05-{13,14,15}.md`;
`.ontology/reports/INGEST_run_9c7d7d6a.md` (latest enabled-mode run,
2026-05-16 07:17). `tsc --noEmit` is clean from the sandbox;
`npm test` blocked by the missing `@rolldown/binding-linux-arm64-gnu`
binary in the sandboxed npm install. The GitHub proxy 403 is still
in effect (seven consecutive days), and the local repo is the
source of truth — `git pull` from the user's machine before acting
on this report.
