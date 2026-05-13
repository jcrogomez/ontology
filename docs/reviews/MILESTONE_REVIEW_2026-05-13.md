# Ontology — Milestone review 2026-05-13

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout at `main` (`6ea7e94` — "fix(legend): close 5 tooling
> gaps from γ-7 Vibe-Reasoning calibration", committed 2026-05-13
> 02:11 local). `git status` clean modulo a stray `.git/index.lock`
> on the workspace mount (read-side; no pending changes). **`git pull`
> from the sandbox blocked again — `HTTP 403` from the proxy to
> `github.com` (same posture as 2026-05-12 / -11 / -10). The local
> clone is the source of truth; run `git pull` locally before acting
> on this report.** The previous review (`MILESTONE_REVIEW_2026-05-12.md`)
> closed at Phase β merged + Phase γ-0/1/3 starting; in the 24 h since,
> γ-2/4/5/6/7 *and* the entire Phase δ have shipped, plus a tooling
> sweep that closes the five gaps the γ-7 Vibe-Reasoning calibration
> surfaced.

---

## 1. Headline status

The Project Legend journey is now one phase from publishable. **Phase γ
is fully closed** (γ-0 Anthropic adapter / γ-1 single-file ingest / γ-2
hash.ts calibration / γ-3 rich proposal payload / γ-4 TS *and* Python
static-edge inference / γ-5 directory ingest / γ-6 edge-proposal lift /
γ-7 signature invariants), and **Phase δ is fully closed** (δ-1 `onto
node inspect` Inspector / Lupa, δ-2 `onto verify-homeomorphism` dual
distance verdict). The γ-7 Vibe-Reasoning calibration report
(`docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md`)
measured a **+29pp lift in ε-equivalent verdicts and full elimination
of `divergent_both`** on a 22-file Python corpus, plus surfaced five
tooling gaps. All five are closed by today's commit `6ea7e94`:
per-node usage / cost in `verify-homeomorphism --json`,
`--report <path.md>` markdown writer, runId hashes that include
`maxTokens` and `thinking` (cache no longer pins empty results),
Anthropic adapter exponential-backoff retry on 429/5xx/network, and a
configurable `--no-thinking` knob threaded through `compile run`,
`compile run-batch`, and `verify-homeomorphism`. Commit message
reports **1064/1064 tests passing, `tsc --noEmit` clean**.

**Phase ε (self-ingestion on the Ontology codebase itself) is the
only remaining gate** between today and upgrading `MATHEMATICAL_CLAIMS.md`
§3.10 from T4 (rhetorical) to T2 (measured on n≈90). All
prerequisites are merged; the next dollar of API spend is the
$15–$30 Phase ε sweep. After ε, Phase ζ (release + Open-Prompt
seeds) is the only remaining stream on the Legend critical path.

---

## 2. What happened in the last 24 h

Five commits on `main`, all post-yesterday's review:

| Commit | Phase | Headline |
| --- | --- | --- |
| `2e8853e` | γ-7 | MANDATORY EXPORTS block in `assembleContext`; ingest extractor teaches comprehensive `provides` capture |
| `29b330c` | δ-2 | `onto verify-homeomorphism` — dual LoC + structural Jaccard distance, five-label verdict folder |
| `8779acc` | δ-1 | `onto node inspect` — Inspector / Lupa with `translator` cache + `sourceHash` invalidation |
| `7abd73e` | docs | γ-7 calibration measurement on 22 Vibe-Reasoning Python files |
| `6ea7e94` | tooling | Five γ-7 tooling-gap fixes (usage/cost, markdown report, runId hash, retry, `--no-thinking`) |

Plus two doc-sync commits (`f413bbc`, `7abd73e`). Net new tests:
`tests/post-gamma-7-tooling-gaps.test.ts` (+13 cases, +251 lines),
`tests/node-inspect-cli.test.ts`,
`tests/runtime/legend/verify-homeomorphism.test.ts` (visible from
the test directory listing — not measured line-for-line in this
review). The Vibe-Reasoning external pilot is closed; the γ-2
single-file `hash.ts` round-trip plus the γ-7 22-file corpus are
the two empirical anchors cited from `MATHEMATICAL_CLAIMS.md` §3.10.

### Legend pipeline now end-to-end

The complete forward-and-back loop now runs concretely:

```
  source (.ts/.py)
    │  onto ingest <path> --cost-estimate          (zero-API pre-flight)
    │  onto ingest <path> --provider anthropic     (γ-1 single / γ-5 directory)
    ▼
  node_create proposals (with manifestation / language / requires /
                         provides / forbids / rules / literal / sourceFiles)
    │  onto graph infer-edges <dir> --create-proposals    (γ-6)
    │  onto proposal apply <id>                           (per node + edge)
    ▼
  applied node + edge network
    │  onto node inspect <id>                             (δ-1 — Inspector cache)
    │  onto verify-homeomorphism --all-artifacts          (δ-2 — round-trip diff)
    │           --report docs/legend/calibrations/X.md    (markdown report)
    │           --max-tokens 16384 --no-thinking          (large-file knobs)
    ▼
  five-label verdict folder + intent-faithful subcategory
```

The pipeline is ready for the self-ingestion sweep.

---

## 3. Repo / build status

- **Active branch:** `main` (`6ea7e94`).
- **`git status`:** clean. The `.git/index.lock` on the workspace
  mount is an artifact of a concurrent sandbox process; it has no
  pending content.
- **Open feature branches:** 19 local branches per `git branch`. Most
  are already-shipped feature branches preserved as audit history
  (`feat/walker-v0`, `feat/proposal-apply`, …). Two siblings
  (`claude/beautiful-nash-dc9ac0`, `feat/hello-world`) are tracked
  on the remote. None contain unmerged work for the milestone path —
  `git log main..` is empty on every check I ran.
- **`tsc --noEmit`:** **clean** in the sandbox (Linux aarch64).
  The TypeScript-only check is the one tool that does work end-to-end
  here.
- **`vitest run`:** still blocked in the sandbox (`@rolldown/binding-*`
  is `darwin-arm64`, sandbox is `linux aarch64`, the
  `linux-arm64-gnu` binding is 403'd by the npm registry proxy).
  **Run `npm test` locally** before any merge — commit message asserts
  1064/1064.
- **GitHub proxy:** still 403'd from the sandbox (`git pull`,
  `git fetch`, npm registry). Three days running. The local clone is
  the source of truth.

---

## 4. Bug list — new findings

Today's commits closed every flagged item from the 2026-05-12 review
(§4.1–§4.12). The following are **new**, scoped to the γ-7 / δ-1 /
δ-2 / 6ea7e94 surface that landed in the last 24 h.

### 4.1 Python `async def` is invisible to δ-2's structural Jaccard — **δ-2, real bug**

`src/runtime/legend/verify-homeomorphism.ts:99`
(`extractTopLevelDeclarations`):

```ts
const re = /^(?:def|class)\s+(\w+)\s*[\(:]/gm;
```

The regex only matches `def` and `class` at column 0 — it does **not**
match `async def`. Modern Python codebases (FastAPI, anyio, asyncio-
heavy services) will systematically under-report top-level
declarations on the *original* side, causing the structural Jaccard
to drop and producing **false `divergent_structural` verdicts** even
when the regen preserves the async functions faithfully.

The companion `tests/runtime/legend/verify-homeomorphism.test.ts`
covers `def`, `class`, nested `def`, dedup, `class X:` no-parens, and
empty files — but has **no `async def` case**. The 22-file Vibe-
Reasoning corpus did not exercise this path (none of the trace files
are async), so the calibration metric is honest *for that corpus* but
the regex is wrong as a general Python primitive. Phase ε will hit
async definitions in `src/runtime/llm/anthropic/adapter.ts`, `src/
walker/actions/run-from-walker.ts`, etc. (TypeScript `async function`
is fine — `parsed.exports` from the TS compiler API surfaces them
correctly).

**Fix (1 line + 1 test):**

```ts
const re = /^(?:(?:async\s+)?def|class)\s+(\w+)\s*[\(:]/gm;
```

Add a Python test fixture with `async def` to pin it. Estimated
~5 min. **Blocking for Phase ε** — without it, the published ε
on any async-heavy file is artificially worse than the model
actually produced.

### 4.2 No `node_inspected` event emitted by `onto node inspect` — **δ-1, design gap**

`src/commands/node/inspect.ts:138` writes the translator cache via
`writeJson(nodePath, updatedNode)` and exits — no event is appended
to `events.jsonl`, and the `OntologyEventSchema` event-type enum
(`src/schemas/ontology.ts:259-279`) has no `node_inspected` entry.

`POST_GAMMA_PLAN.md` §1.3 explicitly called for it:

> Nuevo evento `node_inspected` en `events.schema.ts` con
> `previousEventId` chain.

This was descoped in the actual δ-1 implementation. The implication
is honest at one level — the translator is metadata, not a semantic
mutation — but it diverges from the audit-chain pattern the rest of
the kernel follows (`node_updated`, `node_removed`, `edge_updated`,
`compilation_run`, `proposal_*` all emit). `onto runs verify` and
similar audit tools won't see inspect operations, and Phase ε's
"inspect every node in the network" pass will leave no replayable
trace of which model produced which translator at which time. The
translator carries `model` / `provider` / `generatedAt` inline, so
the data isn't *lost*, but it's not in the temporal log either.

**Three resolution paths:**

(a) **Implement as planned:** add `node_inspected` to the enum, emit
on every translator write (both fresh and `--regenerate`), with
payload `{ nodeId, model, provider, sourceHash, runId? }`.
Recommended for Phase ε — gives the self-ingestion sweep a replayable
"how many inspects? at what cost?" timeline.

(b) **Formally close as no-op:** add a line to `PROJECT_LEGEND.md`
§3 / `POST_GAMMA_PLAN.md` §1.3 saying "translator is metadata, not
a semantic mutation; no event by design".

(c) **Defer to Phase ε prerequisites:** ship as part of the ε feature
branch, since ε is the first sweep that will inspect at scale.

Recommend (a) before ε; the event cost is trivial and the audit
benefit is real once you're paying for 90 inspect calls.

### 4.3 No `homeomorphism_verified` event emitted — **δ-2, design gap**

Same shape as 4.2. `POST_GAMMA_PLAN.md` §2.4 called for emitting
`homeomorphism_verified` per node;
`src/commands/verify/homeomorphism.ts` doesn't, and the enum doesn't
list it. The verdict counts plus per-node `usage` end up in the JSON
report and optional markdown report, but never on the temporal log.
A future "did this network ever verify clean?" audit query has no
direct event-log path; it'd have to re-derive from the report files
on disk.

Same three resolution paths as 4.2. Recommend (a). Payload
suggestion: `{ nodeId, verdict, locDistance, structuralJaccard,
regenRunId, costUSD }`. Phase ε's report will be far easier to
cross-reference against a real audit timeline if these events exist.

### 4.4 Anthropic retry has no jitter — **6ea7e94, mid-severity**

`src/runtime/llm/anthropic/adapter.ts:73`:

```ts
const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;  // 1500, 3000, 6000
```

Pure exponential backoff. Two cooperating callers (e.g. a Phase ε
self-ingestion sweep alongside a concurrent `verify-homeomorphism
--all-artifacts`) that both hit a 429 in the same second will retry
in the same second, and the same second after that. The 6ea7e94
commit message correctly identifies 429-recovery as the motivation;
the implementation choices that survive concurrent callers add
±jitter on top of the exponential base. For sequential callers
(today's only path) this is fine; once Phase ε runs anything in
parallel it'll matter.

**Fix (~3 lines):** `delay = base * 2 ** attempt + Math.random() * 500`.
Don't need decorrelated full jitter — additive jitter on the exponential
base is sufficient for the use case and keeps the wait predictable.

### 4.5 `computeTranslatorSourceHash` does not include `node.literal` — **δ-1, edge case**

`src/runtime/legend/translator.ts:67`:

```ts
const payload = {
  prompt: node.prompt?.raw ?? "",
  rules, provides, requires, forbids,
};
```

A β-2 literal node pins its output via `node.literal` and
short-circuits the compile dispatch. The translator summary should
reflect *what the node does*; if a node's `literal` changes, the
node's effective behaviour changes, and the cached summary becomes
stale. Today, `--regenerate` is the only workaround.

The hash already ignores `label` (correctly framed as metadata in
the docstring). `literal` is **not** metadata — it's the artifact
itself, sometimes load-bearing (regexes, magic constants). Including
it in the hash is defensive and costs nothing.

**Fix (~2 lines):** add `literal: node.literal ?? ""` to the payload
in `computeTranslatorSourceHash`. Pin with a test asserting that
mutating `literal` triggers cache invalidation.

### 4.6 `verify-homeomorphism --all-artifacts` runs sequentially with no concurrency — **δ-2, performance**

`src/commands/verify/homeomorphism.ts:148` is a serial `for` loop
over candidates. For Phase ε (90 nodes × ~5–8s wall-clock per
dispatch) this is 7.5–12 min; for a real-time iteration loop it's
unwieldy. The Anthropic SDK + the retry layer in 6ea7e94 are
concurrency-safe; the limit is just the loop shape.

**Fix:** add `--concurrency <n>` flag (default 1, max 10), use
`p-limit` or hand-roll a chunked Promise.all. The retry-with-jitter
fix in 4.4 becomes more important under concurrency.

**Lower priority than 4.1–4.5.** The current serial path is honest
and predictable for the publishable measurement; concurrency is a
post-ε ergonomics win.

### 4.7 `computeFiberBy` still drops unprojected nodes silently — **β-3 carry-over**

Flagged in 2026-05-12 §4.9. `pathProjection` returns `undefined` for
artifact nodes without `outputs.files[0]`; those nodes are excluded
from every fiber with no caller-visible diagnostic.

Not blocking ε (no caller uses the helper in a context where this
matters today), but the `findUnprojected` companion helper proposed
in yesterday's report would close the diagnostic gap before any
γ/δ caller starts asking "where did node X go?".

### 4.8 `pathProjection` first-output-only — **β-3 carry-over**

Same as 2026-05-12 §4.10. Reads `node.outputs.files[0]`; multi-output
nodes land in only the first directory's fiber. Documented; not
blocking ε.

### 4.9 No advisory lock under `.ontology/.lock` — **hardening, now more pressing**

Open follow-up since post-0.9. Atomic writes are in place
(`writeJson`, `writeArtifactPending`); concurrent-writer protection
is not. With δ-2 now writing to `.ontology/verify/<nodeId>.<ext>`
and δ-1 writing to `.ontology/nodes/<id>.json`, two simultaneous
`onto verify-homeomorphism --all-artifacts` invocations (or one
verify alongside an `onto node inspect` loop) can step on each
other under SIGKILL. Phase ε is a single-shot sweep so the *probability*
is low, but the next chapter of usage (CI runs, scheduled
verifications) will collide eventually.

`POST_GAMMA_PLAN.md` §5.1 estimates ~3 h of dev + ~85 LoC + ~80 lines
of test. Recommended before Phase ζ release.

### 4.10 No `BRANCH_MODEL.md` Option C confirmation — **carry-over from 2026-05-10**

Same as the last three reviews. Option C is recommended in
`docs/BRANCH_MODEL.md` (lazy materialisation on touch); no maintainer
confirmation has landed. Bootstrap 0.10 (cross-branch `node_update`),
`onto branch lift`, future branch-merge proposals all gate on this.
5-minute decision; pure documentation.

---

## 5. Suggested next steps — priority order

### Now (close gaps before paying for Phase ε)

1. **§4.1 `async def` fix in Python declaration regex** — 1-line code
   change + 1 fixture test. **Blocking for ε** if the perimeter
   includes any async file in `src/`.

2. **§4.2 + §4.3 audit events for inspect / verify-homeomorphism** —
   add `node_inspected` and `homeomorphism_verified` to the enum,
   emit from the two commands, payload as proposed. Phase ε is the
   first sweep that benefits from these. ~30 LoC + tests.

3. **§4.5 include `node.literal` in `computeTranslatorSourceHash`** —
   2-line fix. Defensive correctness; eliminates a stale-summary
   foot-gun.

4. **§4.4 add jitter to the Anthropic retry backoff** — 3-line fix.
   Cheap insurance once anything goes parallel.

5. **§4.10 confirm `BRANCH_MODEL.md` Option C** — 5-min maintainer
   decision; unblocks Bootstrap 0.10 storylines.

### Phase ε — self-ingestion (after items 1–5)

6. **`onto ingest --cost-estimate src/runtime src/commands src/schemas
   --include ts`** — validate the $15–30 budget per
   `POST_GAMMA_PLAN.md` §3.3. The cost-estimate path is zero-API; safe
   to run today regardless of the items above. If the estimate
   reports >$30, escalate before paying.

7. **Pilot on a small subdirectory first.** `src/runtime/legend/`
   alone (translator.ts + verify-homeomorphism.ts) is the natural
   smoke test — ~600 LoC, two files, single-digit dollars. Run the
   full G→F→verify loop; check that the inspector cache catches on
   re-inspect; check that the verifier reports `epsilon_equivalent`
   on this code that the maintainer arguably authored *with the
   intent already factored out*. If the pilot looks healthy, scale
   to the full perimeter.

8. **Full Phase ε sweep** — `onto ingest src/runtime src/commands
   src/schemas --include ts --provider anthropic > ingest.json`;
   apply all proposals; `onto graph infer-edges ... --create-
   proposals` + apply; `onto node inspect` over the whole network
   (the per-node-lifetime LLM call); `onto verify-homeomorphism
   --all-artifacts --report docs/legend/calibrations/SELF_INGEST_
   2026-05-XX.md`. Total wall-clock ≈ 30–60 min, total API ≈ $15–30.

9. **Walk the network in the walker** with `:inspect` and `:graph view`.
   This is the falsifiability check per `POST_GAMMA_PLAN.md` §3.9:
   if the inspected network reads as fluent and the operator can
   navigate it without diving back to source, the compression-meets-
   legibility hypothesis survives.

10. **Classify the divergent / unrecoverable cohort** per §3.10. The
    bias of this codebase is that some files (parsers, regex-heavy
    static analyzers, the LLM adapter's specific SDK calls) are
    intent-resistant by construction — those become `node.literal`
    candidates or are honestly named in the intent-resistant
    complement. The faithful fraction is the number that gets cited.

11. **Update `MATHEMATICAL_CLAIMS.md` §3.10** — T4 → T2 with cite to
    `SELF_INGEST_2026-05-XX.md`. The single sentence is "operationally
    measured on n=N≈90, ε=X, intent-faithful fraction = Y, divergent
    cohort characterised in §… of the report".

### Phase ζ — release + Open-Prompt seeds (after ε)

12. **§4.9 advisory lock** before ζ release. Concurrent-writer
    protection becomes table-stakes when a user starts running
    scheduled verifications.

13. **`docs/LEGENS.md` release note** end-to-end from γ-0 through
    ε with the measured ε from item 11.

14. **`docs/OPEN_PROMPT.md` skeleton** — formalize `PROJECT_LEGEND.md`
    §4 as a spec; the commands (`onto sign`, `onto verify-published`,
    `onto replay`) follow per `POST_GAMMA_PLAN.md` §4.

15. **Tag `0.4.0`** with `RELEASE_NOTES.md` + `CHANGELOG.md` update.

### Hardening (parallel to ε / ζ)

16. **Walker v2 PR-1 (proposal review pane)** can start in parallel
    with ε — it's UX-only, no core overlap. The pane will be useful
    *during* the ε sweep itself (proposal-apply pre-screening at
    scale).

17. **§4.6 `--concurrency` on `verify-homeomorphism`** — post-ε
    ergonomics. Keep the publishable measurement serial for
    determinism; the knob is for iterative dev loops.

18. **§4.7 `findUnprojected` companion helper** for `computeFiberBy`
    — bite-sized; close it whenever the fibration library next gets
    a touch.

---

## 6. One-paragraph summary

**Phase γ + δ closed in 24 h.** γ-7 prompt invariants
(`2e8853e`), δ-2 `onto verify-homeomorphism` with dual LoC + structural
Jaccard (`29b330c`), δ-1 `onto node inspect` Inspector / Lupa with
`translator` cache + `sourceHash` invalidation (`8779acc`), γ-7
Vibe-Reasoning calibration measured on 22 Python files (`7abd73e` —
+29pp ε-equivalent, `divergent_both` cohort fully eliminated), and
today's tooling sweep (`6ea7e94`) that closed every gap that
calibration surfaced (per-node usage in `--json`, `--report <path.md>`
markdown writer, runId hashes that include `maxTokens` + `thinking`,
adapter retry with exponential backoff on 429/5xx/network,
`--no-thinking` knob threaded through three commands; +13 tests,
1064/1064 passing, `tsc --noEmit` clean per commit message). **Phase ε
(self-ingestion on this codebase, n≈90) is the single remaining gate**
between today and upgrading `MATHEMATICAL_CLAIMS.md` §3.10 T4 → T2.
**Five small fixes are recommended before paying for the ε sweep:**
(§4.1) the Python declaration regex misses `async def` — 1-line fix +
1 test, otherwise the published ε will be artificially worse on async
files in `src/`; (§4.2 + §4.3) `onto node inspect` and `onto
verify-homeomorphism` don't emit audit events, which `POST_GAMMA_PLAN.md`
called for and which the Phase ε replayable timeline will want;
(§4.4) the new Anthropic retry has no jitter — additive jitter on the
exponential base is sufficient and matters once anything goes
parallel; (§4.5) the translator `sourceHash` ignores `node.literal`,
producing stale summaries on literal mutations. **Then run Phase ε in
two passes:** pilot on `src/runtime/legend/` (~600 LoC, single-digit
dollars), full sweep on `src/runtime + src/commands + src/schemas`
(~$15–30, 30–60 min wall-clock), produce
`SELF_INGEST_2026-05-XX.md`, lift §3.10 to T2. **Phase ζ release**
follows directly: advisory lock first (§4.9 — table-stakes for any
scheduled verification), then `LEGENS.md` release note, then
`OPEN_PROMPT.md` spec skeleton, then tag `0.4.0`. **Hardening that
can parallelize with ε:** Walker v2 PR-1 (proposal review pane —
useful *during* the ε proposal-apply loop), `BRANCH_MODEL.md`
Option C confirmation (5-min decision, unblocks Bootstrap 0.10).

---

Sources: local clone at commit `6ea7e94` (`main`); `git log
--since="2026-05-12 00:00"`; `git show 6ea7e94`;
`src/runtime/legend/{translator.ts, verify-homeomorphism.ts}`;
`src/commands/{node/inspect.ts, verify/homeomorphism.ts}`;
`src/runtime/llm/anthropic/adapter.ts`;
`src/runtime/static/python.ts`;
`src/schemas/ontology.ts`;
`tests/runtime/legend/verify-homeomorphism.test.ts`;
`docs/ROADMAP.md`, `docs/POST_GAMMA_PLAN.md`,
`docs/RELEASE_NOTES.md`, `docs/BRANCH_MODEL.md`;
`docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md`;
prior review `docs/reviews/MILESTONE_REVIEW_2026-05-12.md`. The
sandbox proxy blocked `github.com` for the fourth consecutive day,
so the GitHub-PR / Issues surface was not reviewed; `git pull`
locally before acting.
