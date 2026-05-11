# Ontology — Milestone review 2026-05-09

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout of `main` at commit `a939db5` (PR #115). Same HEAD as
> yesterday's review — no new merges have landed in the intervening 24
> hours. The task asked for a `git pull` first; the sandbox proxy still
> blocks `github.com` (HTTP 403, allowlist policy), so the audit is
> against the latest known main. **Re-run `git pull` locally before
> acting on this report** in case origin moved.

This review is a follow-up to `MILESTONE_REVIEW_2026-05-08.md`. It tracks
what was done since yesterday, what is still open, and what the smallest
useful next step is.

---

## Errata (filed after review by the human)

This report was generated against an *intermediate* snapshot of the
working tree — the doc-housekeeping pass had finished by the time it ran,
but the report only saw the early header edits and missed the body
rewrites. Two consequences:

1. **§1 lists 5 modified files; the real number is 8.** The report
   missed `docs/CATEGORICAL_VISION.md`, `docs/EFFECT_MONAD.md`, and
   `docs/BRANCH_FIBRATION.md`, all of which were edited in the same pass
   (Status lines + the §3 "Status table" in `CATEGORICAL_VISION.md`).
2. **§2 ("The ROADMAP edit is incomplete") is obsolete.** Every claim
   about stale lines in `docs/ROADMAP.md` (lines 48-55, 88-91, 130,
   142-159) was based on the early snapshot. The current `ROADMAP.md`
   has no "Planned (post-Bootstrap 0.8)" section, marks Bootstrap 0.7 as
   ✓, has a Bootstrap 0.9 phase entry, and the "Future Capabilities"
   section is reorganised (no PromptAST, no "Compiler hardening
   planned"). §6.1 "Finish the ROADMAP edit" is therefore unnecessary
   work.

The one ROADMAP-adjacent finding that **was** real and is preserved
below: `docs/COMPILER.md` line 117. That doc still described the
compiler v0 gaps (PR #102) and missed the 0.9 hardening (PRs #103-#105,
#108-#112). It has now been rewritten to describe the current behaviour
and a tightened "what the compiler does not do (yet)" list (only
`validateIntent` between steps and branch-aware compile remain).

So the actionable backlog from this report is **only** the §3 bug list
(§3a-§3e) and §6 step 5 onwards. §6.1 and most of §2 can be ignored.

---

## 1. Progress since yesterday

You acted on the very first recommendation in yesterday's report ("update
the docs to reflect reality"). **Eight** files have local modifications,
none yet committed (the table below was originally five rows; corrected
in the errata sweep):

| File | What changed | Verdict |
| --- | --- | --- |
| `package.json` + `src/cli.ts:41` | Version bump `0.2.0-alpha.1` → `0.3.0-alpha.0` propagated across both surfaces | Correct. |
| `README.md` | "Status" section rewritten: Bootstrap 0.9, axioms table updated (axiom 4 structural via `parsePromptAST`, axiom 6 with refinement threading / per-node `model.ref` / parse-check / `--runtime-check` / `EffectWithLog`), new categorical-extensions table, `state.json` crash-atomic caveat added | Accurate. Reads cleanly. |
| `docs/RELEASE_NOTES.md` | Added entries for PRs #103-#115; replaced "Known limitations" with the post-0.9 list (no `onto branch` CLI, topos library-only, `runFromWalker` still try/catch, `state.json` not crash-atomic) | Comprehensive. The PR-by-PR ledger now matches `git log`. |
| `docs/ROADMAP.md` | Current-State header rewritten; "Planned (post-Bootstrap 0.8)" section replaced with shipped-items list and an ✅/🟡 follow-up checklist; Bootstrap 0.7 marked ✓; new Bootstrap 0.9 phase entry; "Future Capabilities" reorganised (PromptAST and Compiler-hardening removed; Branch Fibration CLI / Topos Validator Port added); Known Limitations rewritten | Accurate. **The "body still stale" verdict in the original report was a snapshot artefact — see Errata.** |
| `docs/CATEGORICAL_VISION.md` | §2.6 effects status (now "shipped and integrated, PR #115"), §2.8 fibration status (walker `:branch list` is first surface), §3 status table updated, §4 follow-up list flipped from TODOs to ✅/🟡 | Accurate. (Originally missed by §1.) |
| `docs/EFFECT_MONAD.md` | Top-line Status flipped from "foundation only" to "shipped and integrated, PR #115" | Accurate. (Originally missed by §1.) |
| `docs/BRANCH_FIBRATION.md` | Top-line Status updated to mention walker `:branch list` (PR #114) as first surface; CLI gaps enumerated | Accurate. (Originally missed by §1.) |
| `docs/COMPILER.md` | "What the compiler does not do (yet)" rewritten — three of the four bullets (prompt parsing, upstream threading, contradicts/supersedes) flipped to "shipped" with PR cites; new "What the compiler does (Bootstrap 0.9 hardening)" section added; remaining gaps trimmed to `validateIntent` between steps and branch-aware compile | Added in the errata sweep — not in the original report. |

Net: this is exactly point 1 of yesterday's "Now (housekeeping)" list,
in flight, **plus** the COMPILER.md edit which was added when the report
itself was reviewed. No code changes have been written; no commit has
been made yet.

The static read of source files since yesterday otherwise turned up
no new code changes — `git log` on `main` is unchanged, and no source
file has a modified-time newer than the HEAD merge commit.

---

## 2. The ROADMAP edit is incomplete  *(SUPERSEDED — see Errata)*

> The body of this section was based on an early snapshot of `docs/
> ROADMAP.md` and is no longer accurate. The current ROADMAP body is
> updated end-to-end. Kept verbatim below for historical traceability;
> ignore for action.
>
> The one finding here that **was** real and is preserved: the
> `docs/COMPILER.md` line 117 stale paragraph. Scope was wider than
> just line 117 — three adjacent bullets ("Prompt parsing", "Upstream-
> output threading", "contradicts / supersedes") were all stale after
> PRs #103-#113. All three have now been edited; the section was also
> renamed and a new "What the compiler does (Bootstrap 0.9 hardening)"
> block was added with PR-cited claims.

<details>
<summary>Original §2 text (now obsolete)</summary>

The top of `docs/ROADMAP.md` (lines 1-7) now says Bootstrap 0.9, but
multiple sections further down still describe the world from before
Bootstrap 0.8:

- **Lines 48-55, "Planned (post-Bootstrap 0.8)":** still lists `PromptAST
  (axiom 4)`, "Compiler hardening: thread upstream-step outputs into
  downstream prompts; enforce `contradicts` / `supersedes` plan
  semantics" as planned. All four of these items shipped in PRs #103,
  #105, #112, #113. Section should either be removed entirely or
  retitled "Done since Bootstrap 0.8 ✓".
- **Lines 88-91, "Known limitations":** still says `PromptAST (axiom 4)
  not yet implemented; prompts are still stored verbatim` and `compiler
  does not yet thread upstream outputs or enforce contradicts /
  supersedes`. Both are now false. The `RELEASE_NOTES` "Known
  limitations" block has the right post-0.9 list — copy that across.
- **Line 130, "Bootstrap 0.7: PromptAST (planned)":** should be marked
  `✓` and dated to PR #113.
- **Lines 142-159, "Future Capabilities":** the SemanticLinker entry is
  fine. The Compiler entry says "Hardening Planned" and lists items that
  have all shipped (upstream threading, `contradicts`/`supersedes`,
  parse + runtime validation). PromptAST is listed as
  `*(Planned / Not yet implemented)*` — should be `*(Implemented in PR
  #113)*`.

This is the highest-priority follow-up: a reader landing on
`ROADMAP.md` today gets a contradicting picture (top says 0.9 / canon
running, body says PromptAST and compiler hardening still planned).

While in there, also update **`docs/COMPILER.md` line 117**:

> "**`contradicts` / `supersedes` semantics in the plan.** The plan
> helper currently ignores these edge types. A future pass will halt on
> `contradicts` and exclude `supersedes` predecessors."

PR #112 made this concrete. The line should describe the current
behaviour (and reference the `superseded` warning, which is the actual
silent-drop signal — see §3a).

</details>

---

## 3. Bug list — what's still open

Re-checked each item from yesterday's §3 against current `src/`. Status
of each:

### 3a. `computeCompilePlan` silent drop on `supersedes` — open

`src/runtime/graph/compile-plan.ts:154` still has the same skip-on-supersededBy
behaviour. Yesterday I asked for either a doc note in `COMPILER.md` or a
loud reachability check. Today there is a useful new code comment at
lines 138-142 documenting the asymmetry intentionally ("if the successor
is NOT reachable the predecessor would be silently dropped, which is
what `supersedes` means"), but `COMPILER.md` itself was not updated. The
behaviour is documented in the source, not yet in the user-facing doc.
**Fix:** update `COMPILER.md` line 117 (see §2 above) and ideally add a
worked example to `tests/runtime/graph/compile-plan.test.ts` that pins
the silent-drop semantics in test form.

### 3b. Refinement parent loading is N²-ish — open

`src/runtime/compile/compile-plan-runner.ts:210` (`collectUpstream`)
still calls `loadNodeById(parentId, cwd)` per parent per step.
Pre-loading the closure into a `Map<string, OntologyNode>` once at the
top of `runCompilePlan` and threading it into `collectUpstream` is a
~15-line PR.

### 3c. `runtimeCheck` timeout boundary off-by-one — open

`src/runtime/compile/post/runtime-check.ts:95` is still
`durationMs >= spec.timeoutMs - 100`. With the lower clamp at 100 ms,
this reduces to `durationMs >= 0` and any SIGTERM at the lower bound is
reported as "timeout". Either scale the slack
(`Math.min(100, timeoutMs * 0.1)`) or document the lower-bound
behaviour next to `MIN_TIMEOUT_MS`.

### 3d. `state.json` and `events.jsonl` not crash-safe — open

`src/core/fs/json.ts` `writeJson` is still a direct `fs.writeFileSync`
on the target. Yesterday I flagged write-to-temp + atomic rename as a
small change; that's still the cheapest fix. The `RELEASE_NOTES` Known
limitations block now mentions this explicitly (good — at least it's
documented), but the operational gap remains.

### 3e. `runFromWalker` not on `EffectWithLog` — open

`src/walker/actions/run-from-walker.ts` still has three top-level
`try/catch` blocks. The `compileNode` PR #115 refactor doesn't extend
to walker run dispatch yet. Documented as a known limitation in
RELEASE_NOTES — fix is straightforward once the dust settles on #115.

### 3f. `compileNode` log-accumulation tests — **CLOSED, my mistake**

I missed this yesterday. PR #115 (commit `b6bf032`) ships
`tests/compile-node-logs.test.ts` which asserts:
- `r.logs.length > 5` on a successful compile, with messages matching
  `resolveModel`, `buildPrelude`, `checkCache`, `writeArtifact`,
  `emitEvent` (lines 34-53)
- `r.logs.length > 0` and a log entry with `level === "error"` on a
  failure where `model.ref` does not resolve (lines 55-74)
- divergent logs on cache-hit vs cache-miss for the same focal (line
  76+)

This is exactly what I asked for. Apologies for the false negative.

### 3g. `parsePromptAST` regex non-multiline — effectively closed

`src/runtime/prompt/parse.ts:24` is unchanged, but lines 1-22 now carry
a clear comment explaining that the regex is run per-line so `^/$`
anchor to line boundaries by design. A future copy-paster has the
context they need. No code change required.

### Net bug status

Five items still open (3a, 3b, 3c, 3d, 3e), one was already closed and I
miscounted (3f), one is closed via documentation (3g). None block the
next merge. The atomicity gap (3d) is still the only one with
operational consequence outside development.

---

## 4. Build status

- `tsc --noEmit` — passes cleanly on the current working tree
  (including the five doc/version edits — `cli.ts` typechecks at
  `0.3.0-alpha.0`).
- `vitest run` — could not run inside the sandbox. Same root cause as
  yesterday: `node_modules/` is installed for darwin-arm64; the
  linux-arm64 rolldown native binding is missing and the sandbox proxy
  blocks `registry.npmjs.org`. **Run `npm test` locally before
  committing the doc-drift fix** — there should be no surprises (no
  source files changed since yesterday), but it's worth confirming
  `compile-node-logs.test.ts` passes given how many of the assertions
  are new.

---

## 5. Repo-level cleanup observation

`git branch` shows 18 local feature branches whose tips are all dated
2026-05-05 or earlier and whose work has all landed on `main` (the
`feat/walker-v0`, `feat/proposal-*`, `feat/hello-world` etc. family).
Nothing is in flight on any of them. A `git branch -d` sweep is
optional but would reduce branch-list noise. The remote also has four
old bot-generated branches (`origin/jules-*`, `origin/feat/prompt-graph-persistence-*`,
`origin/feature/context-assembler-*`, `origin/test/node-create-granular-tests-*`)
from late April that pre-date the current architecture; they look
abandoned and could be deleted via the GitHub UI.

This is a 5-minute task at most and has no functional payoff; mention
only because the branch list is starting to be noisy.

---

## 6. Suggested next steps — priority order

Smallest items first, none of them large.

### Today (close out the housekeeping pass already in flight)

1. ~~**Finish the ROADMAP edit**~~ *(removed — premise was a snapshot
   artefact; the ROADMAP body is fully updated. See Errata.)*
2. ✅ **Update `docs/COMPILER.md`** to describe the post-0.9 compiler
   (prompt parsing, upstream threading, contradicts/supersedes, parse-
   check, runtime-check, code-fence stripping, per-node `model.ref`)
   and trim the "what the compiler does not do (yet)" list to
   `validateIntent` between steps and branch-aware compile. **Done in
   the errata sweep.**
3. **Run `npm test` locally** and commit the doc-drift fix as one PR
   (e.g. "docs: bring README/ROADMAP/RELEASE_NOTES/COMPILER in line
   with Bootstrap 0.9"). The PR now covers eight files (see corrected
   §1 table), not five.
4. **Tag `v0.3.0-alpha.0`** once the PR merges so the version bump in
   `package.json` and `cli.ts` is anchored on a tag.
5. **Pin `supersedes` silent-drop semantics in tests** —
   `tests/runtime/graph/compile-plan.test.ts` should grow a case where
   a `supersedes` predecessor is dropped from the closure even when
   its successor is unreachable from the focal. Source-side comment
   exists (`compile-plan.ts:138-142`); a regression test makes the
   semantics part of the public contract. (Was bug §3a; reframed as
   a test gap rather than a doc gap now that COMPILER.md is updated.)

### Next (post-housekeeping, the actual roadmap)

5. **`onto branch` CLI surface** — `onto branch list`,
   `onto branch fiber <name>`. Read-only. The helpers
   in `src/runtime/fibration/branch-fiber.ts` are pure; this is roughly
   50 lines of `commands/branch/*.ts` plus wiring in `cli.ts`. Closes
   the largest gap in the post-0.9 limitation list.
6. **`onto compile run --branch <name>`** — walk one fiber instead of
   the whole graph. `computeBranchFiber` already returns the right
   shape; the plan helper is pure over an `edges` array, so this is a
   filter at the entry of `runCompilePlan` plus a CLI flag.
7. **`onto link <focalId>`** — semantic linker CLI. `semanticLink({
   includeEdges: true })` is programmatic-only today.

### Hardening

8. **Atomic `writeJson`** (3d). Write-to-temp + rename. Small PR with a
   real failure-mode payoff.
9. **`compile-plan-runner` parent caching** (3b).
10. **Port `runFromWalker` to `EffectWithLog`** (3e).
11. **Scale or document the `runtime-check` timeout slack** (3c).
12. ~~**Pin `supersedes` silent-drop semantics in tests + COMPILER.md**~~
    *(promoted to step 5 above — COMPILER.md half is done; only the
    test pin remains.)*

### Looking further

13. **`onto branch lift <nodeId> --to <branch>`** — turn
    `describeCartesianLift` into an `edge_create`/`node_create`
    proposal generator.
14. **Validator port onto topos algebra.** `intent-validator.ts` is
    unchanged; `compileNodeRules` exists and matches the gluing
    decision under a closed-world assumption. A behavioural-equivalence
    test plus the swap is small.
15. **Walker v2.** Plane / time / branch / manifestation rotation,
    proposal-review pane. The walker has eight action files now and
    has clearly outgrown its v1 layout.
16. **Visual DAG Studio.** The graph CLI + query + fibration give a web
    UI everything it needs. Reasonable next milestone after the docs
    and CLI gaps above.

---

## 7. One-paragraph summary

The doc-drift housekeeping flagged yesterday is in flight — the version
bump, README, RELEASE_NOTES, and the top of ROADMAP have been rewritten
to describe Bootstrap 0.9 honestly, but the body of `ROADMAP.md` and
all of `COMPILER.md` line 117 still talk about PromptAST, upstream
threading, and `contradicts`/`supersedes` as future work. Finishing
that pass is the single most useful thing to do before merging the
five-file diff. Code-side, no commits have landed since yesterday; one
of yesterday's bug flags (compileNode log assertions, 3f) was
already closed in PR #115 and I miscounted, one is documented in
source comments, and four real items remain open (silent-drop on
`supersedes`, N²-ish parent loading, runtime-check slack, non-atomic
`writeJson`, walker run still try/catch). After the doc PR ships and
`v0.3.0-alpha.0` is tagged, the highest-leverage next step is the
`onto branch` CLI surface — every prerequisite is already merged and
it closes the largest user-facing limitation in the post-0.9 list.

Sources: local clone at commit `a939db5` (`main`); `git status`,
`git log`, `git diff`; `MILESTONE_REVIEW_2026-05-08.md`;
`docs/ROADMAP.md`, `docs/RELEASE_NOTES.md`, `docs/COMPILER.md`,
`README.md`; `package.json`, `src/cli.ts`;
`src/runtime/graph/compile-plan.ts`,
`src/runtime/compile/compile-plan-runner.ts`,
`src/runtime/compile/post/runtime-check.ts`,
`src/runtime/prompt/parse.ts`,
`src/walker/actions/run-from-walker.ts`,
`src/core/fs/json.ts`,
`tests/compile-node-logs.test.ts`.
