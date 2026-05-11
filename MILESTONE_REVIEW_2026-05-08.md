# Ontology — Milestone review 2026-05-08

> Automated review by the Cowork scheduled task `ontology-pr-suggestions`.
> Run on local checkout of `main` at commit `a939db5` (PR #115).
> The task asked for a `git pull` first; the sandbox could not reach github.com (HTTP 403 from the proxy), but git reports `Your branch is up to date with 'origin/main'`, so the audit is against the latest known main. **Re-run `git pull` locally before acting on this report** in case origin moved in the last few minutes.

---

## 1. Where we are right now

The repo's documentation says **Bootstrap 0.8 — Hello World** and version `0.2.0-alpha.1`, but the git log tells a different story. Bootstrap 0.8 was PR #102; since then **13 more PRs (103-115) have landed on main**, and four of them are exactly the things `ROADMAP.md` lists as "post-Bootstrap 0.8" / "Bootstrap 0.9":

| PR  | Lands                                                                                                     | Roadmap section it closes                       |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 103 | `feat(compile): strip markdown code fence from artifacts when manifestation=code`                         | compiler hardening                              |
| 104 | `feat(compile): parse-check artifact against declared language` (axiom 8, first half)                    | compiler hardening                              |
| 105 | `feat(compile): thread refinement-parent context into per-node compile`                                   | "thread upstream-step outputs into prompts"    |
| 106 | `feat(walker): accept --model and --host on :run and :compile`                                            | walker UX                                       |
| 107 | `chore(test): bump vitest hookTimeout to 30s`                                                             | test reliability                                |
| 108 | `feat(compile): per-node model.ref routing via the registry`                                              | model registry plumbing                         |
| 109 | `fix(compile): system-prompt format leak — XML <context> tags`                                            | bugfix                                          |
| 110 | `feat(compile): optional --runtime-check executes the artifact post parse-validation`                     | compiler hardening (axiom 8, second half)       |
| 111 | `feat(fibration): branches as Grothendieck fibers over the event log`                                     | **Bootstrap 0.9 — branch fibration**            |
| —   | `feat(query): onto query — Yoneda search by Hom-profile`                                                  | **Bootstrap 0.9 — Yoneda query**                |
| —   | `feat(effects): Result/Effect/EffectWithLog monad library with proven laws`                               | **Bootstrap 0.9 — effect monad**                |
| —   | `feat(topos): three-valued Ω predicate algebra over node rules`                                           | **Bootstrap 0.9 — topos predicate algebra**     |
| 112 | `feat(compile-plan): enforce contradicts and supersedes (closes axiom 8 in planner)`                      | compiler hardening                              |
| 113 | `feat(prompt): PromptAST parser — strip @requires/@provides/@expand markers`                              | **Bootstrap 0.7 — PromptAST (axiom 4)**         |
| 114 | `feat(walker): :validate, :branch list, :context, :query, :compile --runtime-check`                       | walker hardening                                |
| 115 | `feat(compile): refactor compileNode onto EffectWithLog (no try/catch at the top)`                        | "Compiler refactor onto EffectWithLog"          |

So in practical terms the milestone state is:

- **Axiom 4 (prompts as rewrite rules)** — running concrete code (PR #113).
- **Axiom 6 (compiler functor)** — hardened: upstream context threading, per-node model routing, language parse-check, optional runtime execution, EffectWithLog refactor.
- **Axiom 7 (code as compiled shadow)** — already shipped in 0.8, now stronger because parse + runtime verification catch silent breakage.
- **Axiom 8 (contradictions surface as failures)** — closed end-to-end: `contradicts`/`supersedes` in the planner, `validateLanguage` after write, `runtimeCheck` opt-in.
- **Bootstrap 0.9 categorical extensions** — all four libraries (`query`, `effects`, `fibration`, `topos`) merged. Of those, `query` has a CLI command (`onto query`) and walker integration (`:query`); `fibration` has only a walker `:branch list` surface; `topos` and `effects` are still library-only (`effects` is in concrete use inside `compileNode`).
- **Walker** has gained `:validate`, `:branch list`, `:context`, `:query`, and `:compile --runtime-check`.

In other words, Ontology is functionally well past 0.8 and the 0.9 categorical layer is in. **The README, ROADMAP, RELEASE_NOTES, and `package.json` version have not been updated to reflect any of this.**

---

## 2. Build status

- `tsc --noEmit` — passes cleanly.
- `vitest run` — could not be executed inside the sandbox: vitest 4.x pulls a `rolldown` native binding, and `node_modules/` was installed for darwin/macOS so the linux-arm64 binding is missing and unfetchable from this environment. **Please run `npm test` locally to confirm green** — there is no reason to expect breakage from a static read, but the suite has 60+ files and it's worth confirming.

---

## 3. Bugs / smells worth attention

The audit was a static read of recent additions. Nothing below blocks the next merge; they are listed in roughly descending importance.

### 3a. Documentation drift is the loudest signal

`README.md`, `docs/ROADMAP.md`, and `docs/RELEASE_NOTES.md` still talk about Bootstrap 0.8 as the head, with PromptAST and most of 0.9 marked planned. PR #113 made axiom 4 structural; PR #112 closed axiom 8 in the planner; PRs #103-#110 hardened the compiler considerably. A user landing on the README today gets a meaningfully out-of-date picture of capability. Same for `package.json` (`"version": "0.2.0-alpha.1"`) and `program.version("0.2.0-alpha.1")` in `src/cli.ts`.

### 3b. `computeCompilePlan` silently drops dependencies on superseded nodes

`src/runtime/graph/compile-plan.ts:154` skips a node from BFS the moment it appears in `supersededBy`. If `A depends_on B` and someone wrote `supersedes(B', B)`, the plan compiles `A` **without** `B` in the closure — even when `B'` is unreachable from `A` and so cannot replace it. Today the only signal is a `CompilePlanWarning` of kind `"superseded"`. This may be exactly the intended semantics ("supersedes means stop using the old node"), but the asymmetry between the loud halt on `contradicts` and the silent drop on `supersedes` deserves either a doc note in `COMPILER.md` or a reachability check that fails loud when the successor is not in the closure.

### 3c. Refinement parent loading is N²-ish

In `compile-plan-runner.ts:collectUpstream`, the runner does `loadNodeById(parentId, cwd)` on every parent for every step, even though every parent appears earlier in the same plan and was already loaded by the runner. For deep refinement chains this is a noticeable amount of disk I/O. The refactor is small: pre-load the closure into a `Map<string, OntologyNode>` once and look up there.

### 3d. The `runtimeCheck` timeout boundary has a subtle off-by-one

`src/runtime/compile/post/runtime-check.ts:95` reports a timeout failure when `r.signal === "SIGTERM" && durationMs >= spec.timeoutMs - 100`. The 100 ms slack is fine in practice, but if `spec.timeoutMs` is small (the lower clamp is 100 ms) the condition reduces to `durationMs >= 0`, which is always true — so any SIGTERM at the lower bound is reported as "timeout". That's still arguably correct, but the slack should probably scale (e.g. `min(100, timeoutMs * 0.1)`) or be doc'd.

### 3e. `state.json` and `events.jsonl` are not crash-safe

`writeJson` in `src/core/fs/json.ts` calls `fs.writeFileSync` directly on the target — a SIGKILL or out-of-disk mid-write produces a truncated JSON the kernel will refuse to parse. `appendJsonl` similarly does not flush + sync. The "single-writer" caveat in the docs is already noted, but the kernel is the system's source of truth; switching `writeJson` to write-to-temp + atomic-rename is a small change with a real failure-mode payoff. This is the same root cause as the "concurrent invocations are not lock-protected" limitation called out in `ROADMAP.md` and `RELEASE_NOTES.md`.

### 3f. `runFromWalker` is not on the EffectWithLog refactor

PR #115 moved `compileNode` to `EffectWithLog`. `src/walker/actions/run-from-walker.ts` still has the original try/catch tower, including catching dispatch failure with a `provider === "ollama"` special case that won't match the `mock` provider's failure shape. Worth porting for consistency once the dust settles on #115.

### 3g. `tests/runtime/effects` covers monad laws but not `compileNode`'s log accumulation

PR #115's whole point is that **logs survive failure**. The tests at `tests/runtime/effects/io.test.ts` exercise the law mechanically, but I did not find a `compileNode` test that asserts `result.logs` is non-empty when (e.g.) `validate_failed` fires. Worth adding so a future regression in the bind-with-log tower is caught.

### 3h. `parsePromptAST` regex is line-anchored but not multiline-mode-anchored

`src/runtime/prompt/parse.ts:24` declares `MARKER_LINE = /^[ \t]*@(requires|provides|expand)[ \t]*:[ \t]*(.*)$/` without the `/m` flag, then iterates `lines = raw.split(/\r?\n/)` and runs the regex on each line individually. That works (the `^` and `$` anchors then mean start/end of the *line*, which is what we want), but anyone who copy-pastes the regex into a multiline match later will be confused. A short comment, or switching to `/m` and a single global pass, would clarify intent.

---

## 4. Suggested next steps

Roughly in priority order. None of these are large.

### Now (housekeeping the milestone)

1. **Update the docs to reflect reality.** README "Status" section, RELEASE_NOTES with PRs #103-#115, ROADMAP "Bootstrap 0.9" → ✓, "Compiler refactor onto EffectWithLog" → ✓ in follow-ups, "PromptAST" → ✓. Bump the `package.json` and `cli.ts` version (probably `0.3.0-alpha.0` given the scope of the categorical layer landing).
2. **CATEGORICAL_VISION.md and the four 0.9 docs** are already in the repo; skim them and add a single "Status" line at the top of each so a reader knows the library is implemented vs. described.

### Next (the actual roadmap)

3. **CLI surface for fibration.** Today `:branch list` exists in the walker only. Add `onto branch list` and `onto branch fiber <branch>` (read-only) — the helpers in `src/runtime/fibration/branch-fiber.ts` are pure, this is a 50-line CLI wiring PR.
4. **`onto compile run --branch <name>`**: walk one fiber instead of the whole graph, reusing `computeBranchFiber`. Roadmap calls it out as a 0.9 follow-up; cheap because the plan computation is already pure over an `edges` array.
5. **`onto branch lift <nodeId> --to <branch>`** as an `edge_create`/`node_create` proposal generator. `describeCartesianLift` already returns the proposed shape.
6. **Validator port onto topos algebra.** `intent-validator.ts` is unchanged; `compileNodeRules` exists and matches the gluing decision under a closed-world assumption. A behavioural-equivalence test plus the swap is small.
7. **Semantic linker CLI.** `semanticLink({ includeEdges: true })` is programmatic-only. `onto link <focalId>` (and a walker `:link`) close that hole and unlock "show me what tokens this node sees, with sources".

### Hardening / cleanup

8. **Atomic `writeJson`** (point 3e above) and consider an advisory lock on `state.json` writes (a tiny lockfile + `proper-lockfile` or hand-rolled).
9. **`compile-plan-runner` parent caching** (point 3c).
10. **`compileNode` log assertions** in tests (point 3g).
11. **Port `runFromWalker` to EffectWithLog** (point 3f).
12. **Decide & document `supersedes` reachability** (point 3b).

### Looking further

13. **`run prompt --as-proposal` for edge targets.** Listed in ROADMAP as planned; the discriminated-union `mutation` schema already supports `edge_create`, so the gap is purely CLI surface + a model-driven edge candidate.
14. **Walker v2.** Plane / time / branch / manifestation rotation, proposal-review pane. The walker has eight action files now and has clearly outgrown its v1 layout; a v2 redesign (especially a side panel for the run/plan/query result) would help readability.
15. **Visual DAG Studio.** The graph CLI + query + fibration give a web UI everything it needs to render an interactive map. Reasonable next milestone after the docs and CLI gaps above.

---

## 5. One-paragraph summary

The repo is in much better shape than its docs claim. The 0.9 categorical layer (query, effects, fibration, topos) is merged; PromptAST landed; the compiler is hardened with code-fence stripping, language parse-checks, optional runtime execution, per-node model routing, upstream-context threading, and an EffectWithLog refactor that retires the top-level try/catch. The most useful single thing to do this week is update README / ROADMAP / RELEASE_NOTES / package.json to match what is actually shipped — followed by exposing fibration as a CLI surface and enabling `--branch` filtering on `compile run`. The bugs flagged above are minor and none block the next merge; the atomicity gap on `writeJson` is the only one with operational consequence outside development.

Sources: local clone at commit `a939db5` (main); `git log --oneline -50`; `docs/ROADMAP.md`; `docs/RELEASE_NOTES.md`; `README.md`; `package.json`; `src/runtime/compile/*`, `src/runtime/graph/compile-plan.ts`, `src/runtime/prompt/parse.ts`, `src/runtime/topos/*`, `src/runtime/query/representable.ts`, `src/runtime/fibration/branch-fiber.ts`, `src/runtime/effects/io.ts`, `src/walker/actions/*`, `src/core/fs/json.ts`, `src/core/state/state-store.ts`, `src/cli.ts`.
