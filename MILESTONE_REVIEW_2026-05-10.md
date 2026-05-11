# Ontology — Milestone review 2026-05-10

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout of `main` at commit `371f45d` (PR #117). The task asked
> for a `git pull` first; the sandbox proxy still blocks `github.com`
> (`HTTP 403 from proxy after CONNECT`), so the audit is against the
> latest known main. **Re-run `git pull` locally before acting on this
> report** in case origin moved between this run and your next session.

This review is a follow-up to `MILESTONE_REVIEW_2026-05-09.md`. It tracks
what landed since yesterday, what is in flight on the working tree, and
what the smallest useful next step is.

---

## 1. Progress since yesterday

**Two PRs merged on `main`** between `a939db5` (yesterday's HEAD) and
`371f45d` (today's HEAD):

| PR  | Commit    | Title                                                        | Verdict                                                                                                                                                                                                  |
| --- | --------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #116 | `06b96c2` / `e3563fc` | docs: align Bootstrap 0.9 docs + version bump to 0.3.0-alpha.0 | The doc-drift sweep flagged in yesterday's §1 / §2 / §6.1 is shipped. README, ROADMAP, RELEASE_NOTES, COMPILER, CATEGORICAL_VISION, EFFECT_MONAD, BRANCH_FIBRATION are all consistent with the post-0.9 reality. |
| #117 | `282ea71` / `371f45d` | feat(open): project picker (`onto open`) + walker `:link` action | Two **new** user-facing surfaces (1149 lines, 12 files, +23 tests). See §2. |

The PR ledger now has 117 entries; `git log --oneline` is the canonical
source of truth.

**On the working tree, an unrelated render-layer rewrite is in flight**
(uncommitted, 11 modified files + 4 new files). See §3.

So today's report covers three independent things:

- (§2) the just-merged `onto open` / walker `:link` work,
- (§3) the WIP render layer,
- (§4) the carry-over bug list, plus new findings.

---

## 2. PR #117 — `onto open` and walker `:link`

This is the right shape: two small, orthogonal UX surfaces wrapped in
one PR with clean scope ("ortogonales al modelo categorico, en
preparación de Bootstrap 0.10").

**Pieza A — projects registry + `onto open`.** Adds a global registry at
`~/.config/ontology/projects.json` (XDG-respecting), three commands
(`onto open`, `onto projects list`, `onto projects forget`), and an Ink
TUI picker. `onto init` auto-registers; failure is non-fatal.

**Pieza B — walker `:link`.** Mirrors `onto propose link` from inside
the walker: same `createProposal` helper, same `edge_create` validation
(self-loop, edge type, poset direction). Source endpoint is implicitly
the focal cell (rejects `--from` on purpose).

**What I checked:**

- `src/core/projects/registry.ts` — round-trip JSON, sort by recency,
  partition live/stale. Schema is parsed by Zod on load, defaults are
  honored. Storage path follows `XDG_CONFIG_HOME` → `~/.config` correctly.
- `src/commands/open.tsx` — Ink picker with k/j/arrow nav, stale entries
  rendered grey and unselectable, "Create new project" sentinel as the
  last item, escape/SIGINT defense via `waitUntilExit().then`.
- `src/walker/state/parse-link-args.ts` — flag grammar is `--to <id>
  --type <T> [--rationale <text>]`, rationale eats the rest of the line
  so the user can write a sentence without quoting; `--from` is rejected
  with a helpful message.
- `src/walker/actions/link-from-walker.ts` — proposal creation reuses
  the CLI's persist helper, both endpoint hashes are pinned, poset
  direction is pre-validated so the user gets immediate feedback in the
  TUI instead of a deferred `staled-on-apply`.
- 23 new tests (10 registry, 7 link-args parser, 5 walker link action)
  covering the happy paths and the four rejection paths
  (self-loop / bad edge type / missing target / wrong poset direction).

**Verdict:** clean, well-tested, scoped. Two new bugs surfaced (see
§4.6, §4.7).

---

## 3. WIP — non-Ink render layer (uncommitted)

`git status` shows 11 modified files and 4 new files, all dated today
(2026-05-09 21:47–22:01). Pattern is consistent across the diff: a
small, dependency-free rendering layer that replaces ad-hoc
`padEnd`/`console.log` columns and key-value blocks with one shared
helper set.

**New files (`src/core/render/`, ~14 KB total):**

| File       | Surface                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style.ts` | `color`, `bold`, `dim`, `italic`, `underline`, `byLevel`/`byKind`/`byManifestation`/`byStatus`, `statusGlyph`, `stripAnsi`, `visibleWidth`. Honors `NO_COLOR` and `FORCE_COLOR`, no deps. |
| `box.ts`   | Unicode-framed cards with optional title / footer / horizontal divider, ASCII fallback, `kvLines` helper for aligned key:value blocks.                                            |
| `table.ts` | `renderTable` over a `ColumnSpec[]` — left/right align, `maxWidth` + truncation with `…`, ANSI-aware `visibleWidth`. Two-space gutter default.                                    |

**Tests:** `tests/render-layer.test.ts` (~190 lines) covers all three
modules — color/dim/bold escape codes, NO_COLOR degradation, status
buckets, box title/footer/divider, table header/divider/rows, right-
alignment, truncation, ANSI-aware alignment.

**Commands rewritten to use the new layer:**

| File                            | Before                                                                                                | After                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/events/tail.ts`   | Ad-hoc `padEnd` columns, plain `console.log`.                                                          | `renderTable`, semantic event-type coloring (`eventTypeColor`).                                                              |
| `src/commands/inspect.ts`       | Multiline template literal block.                                                                     | `box(...)` card with three sections (summary kv, canon, status), green dots for status lines.                                |
| `src/commands/node/list.ts`     | `padEnd` columns.                                                                                     | `renderTable` with `statusGlyph` + `byKind`/`byLevel`/`byStatus`/`byManifestation`.                                          |
| `src/commands/node/show.ts`     | One `console.log` per field, ad-hoc context list printer.                                              | `box` card with three sections (identity kv, context, rules), title `NODE  <id>`, footer = first 16 chars of integrity hash. |
| `src/commands/proposal/list.ts` | `padEnd` row.                                                                                          | `renderTable` with status glyph + `byStatus`.                                                                                 |
| `src/commands/query/run-query.ts` | `padEnd` columns.                                                                                    | `renderTable` with status glyph + colored cells, `maxWidth: 50` on the label column.                                          |
| `src/commands/runs/list.ts`     | `padEnd` row.                                                                                          | `renderTable` with provider color, `maxWidth: 24` on the model column, right-aligned duration.                                |
| `src/commands/runs/show.ts`     | One `console.log` per field, manual section dividers (`""`).                                            | `box` card with 4–5 sections (summary, input, model, output, optional validation), title + 16-char hash footer.              |
| `tests/cli-observability.test.ts` | Asserts on legacy `Canon:` / `ID:` strings.                                                          | Asserts on the canon's actual rule text (`Ontology is a typed, temporal…`) and on the new `Seq` event header.                |
| `tests/node-observability.test.ts` | Asserts the legacy fixed-width formatting (`ID:            node_0000_canon`).                       | Asserts the load-bearing strings in the rendered card.                                                                       |

**State of the WIP:**

- `tsc --noEmit` is clean. Render layer types resolve, every `byStatus`
  call against `NodeStatus | ProposalStatus` is exhaustive against the
  Zod schemas (`src/schemas/ontology.ts:60-68` for nodes, `:433-438`
  for proposals).
- `vitest run` cannot execute in this sandbox (rolldown native binding
  for `linux-arm64-gnu` is not in `node_modules` because they were
  installed for darwin-arm64; the sandbox proxy blocks
  `registry.npmjs.org`). **Run `npm test` locally before merging** —
  the test surface is wider than yesterday's because the render-layer
  tests are net-new and four observability tests changed assertion
  shape.
- Diffs are otherwise net-shorter (-197 lines of column-padding
  arithmetic for +229 lines of declarative cells).

**Verdict:** the rewrite is the right shape. The shared layer means
future surfaces (e.g. `onto branch list`, `onto link` CLI) get
consistent visuals out of the box, the walker palette stays in sync via
`byLevel`/`byKind`, and `--json` output paths are unchanged (verified
by reading every diff: every JSON branch returns before the new render
calls). Two real bugs (§4.6) and one minor design wart (§4.7) — fix
those before the PR merges.

---

## 4. Bug list — open items

### Carry-over from yesterday (still open)

#### 4.1 `computeCompilePlan` silent drop on `supersedes` — open

`src/runtime/graph/compile-plan.ts:154` still has the same
skip-on-`supersededBy` behaviour. A worked example to
`tests/runtime/graph/compile-plan.test.ts` that pins the silent-drop
semantics in test form is a 20-line PR. The COMPILER.md half is now
done (PR #116).

#### 4.2 Refinement parent loading is N²-ish — open

`src/runtime/compile/compile-plan-runner.ts:210` (`collectUpstream`)
still calls `loadNodeById(parentId, cwd)` per parent per step. Pre-load
the closure into a `Map<string, OntologyNode>` once at the top of
`runCompilePlan` and thread it into `collectUpstream`. ~15 lines.

#### 4.3 `runtime-check` timeout boundary off-by-one — open

`src/runtime/compile/post/runtime-check.ts:95` is still `durationMs >=
spec.timeoutMs - 100`. With the lower clamp at 100 ms, this reduces to
`durationMs >= 0` and any SIGTERM at the lower bound is reported as
"timeout". Either scale the slack (`Math.min(100, timeoutMs * 0.1)`)
or document the lower-bound behaviour next to the clamp.

#### 4.4 `state.json` and `events.jsonl` not crash-safe — open

`src/core/fs/json.ts:15` `writeJson` is still a direct
`fs.writeFileSync` on the target. Yesterday's recommendation
(write-to-temp + rename + fsync) is unchanged. **PR #117 raises the
stakes** because `~/.config/ontology/projects.json` is a third
non-atomic surface and it is now user-facing across projects (a
crash mid-write corrupts the registry for every project on the
machine, not just one).

#### 4.5 `runFromWalker` not on `EffectWithLog` — open

`src/walker/actions/run-from-walker.ts` still has three top-level
`try/catch` blocks (lines 39, 79, 95). Documented as a known
limitation in `RELEASE_NOTES.md`; fix is straightforward once the
render-layer PR is merged.

### New findings

#### 4.6 `table.ts` `truncateVisible` leaks ANSI color — **bug, fix before merging WIP**

`src/core/render/table.ts:33-56`. When a colored cell is truncated, the
function copies the opening `\x1b[...m` escape but the input's matching
reset (`\x1b[0m`) is past the truncation boundary and is never emitted.
The trailing `…` and the gutter spaces inherit the foreground color,
and the next cell's leading whitespace is colored too until the next
column emits its own escape.

Repro:

```ts
renderTable(
  [{ label: byKind("function", "really long label that gets truncated") }],
  [{ header: "Label", render: r => r.label, maxWidth: 12 }],
);
```

Fix: append `\x1b[0m` after `…` whenever the truncated input contained
any ANSI escape. Three lines.

#### 4.7 `box.ts` couples `NO_COLOR` with ASCII fallback — design wart

`src/core/render/box.ts:39-44` returns `CHARS_ASCII` whenever
`colorsEnabled()` is false. The two signals don't have to travel
together — a CI log with `NO_COLOR=1` typically still understands
UTF-8. Splitting `unicodeEnabled()` from `colorsEnabled()` (and
falling back to ASCII only on legacy terminals or when an explicit
opt-out is set) keeps the cards readable in NO_COLOR contexts.

#### 4.8 `events/tail.ts` `eventTypeColor` ordering is fragile — latent bug

`src/commands/events/tail.ts:7-15`. The first `if` matches anything
starting with `compilation_`, so a hypothetical `compilation_failed`
event would be greenBright, not red. Today the schema (`OntologyEvent`)
does not define such an event so the bug is theoretical, but the
heuristic is brittle to schema additions. Cheapest fix: re-order so the
`_failed` / `_rejected` / `_staled` branch wins; long-term, lift the
mapping into a `Record<EventType, NamedColor>` keyed on the actual Zod
enum.

#### 4.9 `projects/registry.ts` `forgetProject` partial-name match — foot-gun

`src/core/projects/registry.ts:120-130`. `forgetProject("demo")`
silently removes **every** entry whose `name` is `"demo"`. The
docstring acknowledges it ("if multiple projects share the same name,
all matching entries are removed"), but the implicit
delete-many-from-a-name is the wrong default. Two cleanups, either
sufficient:

- Resolve `pathOrName` first; if it looks like a path on disk, match
  by path. Only fall back to name-match if the name is unique. Error
  out with a clear message if it isn't.
- Always require a path for `forget`; route the picker through a
  separate `forgetByName(name)` that throws on ambiguity.

#### 4.10 `projects/registry.ts` liveness check is shallow — minor

`partitionByLiveness` only checks for the existence of the
`.ontology/` directory. A directory created by hand without a
`state.json` would be reported as live and the picker would crash on
open (or worse, silently re-init the project). Cheapest fix: also
require `.ontology/state.json` to exist.

#### 4.11 `style.ts` `colorsEnabled()` re-evaluated per call — perf nit

`src/core/render/style.ts:66-74`. Every `wrap`, `color`, `bold`, `dim`,
`byKind`, … call re-reads `process.env.NO_COLOR` / `FORCE_COLOR` and
re-touches `process.stdout.isTTY`. For a 1000-row events tail with five
colored cells per row, that's 5k env lookups. Memoise on first call and
expose an explicit `resetColorCache()` for the test suite that already
flips env vars between cases.

### Closed since yesterday

- §3a (compile-plan supersedes silent drop) **doc** half is closed by
  PR #116. The test pin (4.1 above) remains open.
- §3f (compileNode log assertions) was closed in PR #115 and was
  miscounted yesterday.

---

## 5. Suggested next steps — priority order

### Now (close the WIP cleanly)

1. **Fix the `truncateVisible` ANSI leak** (4.6). Three lines. The
   regression test for it is two lines on top of the existing
   `truncates cells that exceed maxWidth` case in
   `tests/render-layer.test.ts`.
2. **Run `npm test` locally.** `tsc` already passes. The two
   observability tests changed assertion shape and the render-layer
   tests are net-new; both are green by inspection but verify before
   committing.
3. **Decouple ASCII fallback from `NO_COLOR`** (4.7) if you agree —
   trivial in `box.ts:39-44`.
4. **Commit the render-layer refactor as one PR** (e.g. "feat(render):
   unified non-Ink render layer for observability commands"). It is
   self-contained, the diff is net-shorter, and `dist/` rebuild is
   small.

### Next (one small bug per session, same shape as PR #116)

5. **Atomic `writeJson`** (4.4). `fs.writeFileSync(tmp, …)` →
   `fs.renameSync(tmp, target)` → `fs.fsyncSync` if available. The
   registry surface introduced in PR #117 makes this newly user-facing,
   so it is now the highest-priority hardening item.
6. **`projects/registry.ts` polish** — `forgetProject` ambiguity
   handling (4.9) and `partitionByLiveness` `state.json` check (4.10).
   Both are <10 lines each and stop user-visible foot-guns. Bundle as
   one "ux: tighten projects registry edge cases" PR.
7. **Pin `supersedes` silent-drop semantics in tests** (4.1).
8. **Scale or document the `runtime-check` timeout slack** (4.3).

### Next (the actual roadmap — Bootstrap 0.10 prep)

9. **`onto branch list` and `onto branch fiber <name>`** — read-only
   CLI surfaces wrapping `listBranches` and `computeBranchFiber`. The
   helpers are pure; this is roughly 50 LoC in `src/commands/branch/*`
   plus wiring in `cli.ts`. Closes the largest gap in the post-0.9
   limitation list.
10. **`onto compile run --branch <name>`** — walk one fiber instead of
    the whole graph. `computeBranchFiber` already returns the right
    shape; the plan helper is pure over an `edges` array, so this is a
    filter at the entry of `runCompilePlan` plus a CLI flag.
11. **`onto link <focalId>`** — semantic linker CLI.
    `semanticLink({ includeEdges: true })` is programmatic-only today.
12. **node_update with auto-branch (Bootstrap 0.10).** PR #117's commit
    body flags this as the next milestone and explicitly defers the
    open design question:

    > La pregunta abierta clave: cuando se crea branch X desde main,
    > los nodes existentes se duplican, se proyectan via overlay, o
    > solo se materializan al ser tocados?

    Resolve that **before** any code lands — the answer changes the
    storage layout, the event schema, and the walker `:branch` UX
    significantly. A 1–2 page design note in `docs/` (`BRANCH_MODEL.md`?)
    that lays out the three options, picks one, and explains why is the
    right artifact.

### Hardening backlog

13. **Port `runFromWalker` to `EffectWithLog`** (4.5).
14. **Refinement-parent caching in `compile-plan-runner`** (4.2).
15. **Memoize `colorsEnabled()`** (4.11).
16. **Validator port onto topos algebra** — `intent-validator.ts` ↔
    `compileNodeRules` behavioural-equivalence test, then swap.
17. **Walker v2** — proposal-review pane + plane/time/branch/
    manifestation rotation. The walker now has nine action files
    (`run`, `link`, `propose`, `plan`, `compile`, `validate`, `branch`,
    `context`, `query`); a unified pane layout would help.

### Looking further

18. **`onto branch lift <nodeId> --to <branch>`** — turn
    `describeCartesianLift` into an `edge_create`/`node_create`
    proposal generator.
19. **Visual DAG Studio.** The graph CLI + query + fibration give a
    web UI everything it needs. Reasonable next milestone after the
    CLI gaps in steps 9–11.

---

## 6. Repo / build status

- `git status`: 11 modified, 4 untracked (the render-layer WIP).
  Working tree on `main` at `371f45d`. Two untracked
  `MILESTONE_REVIEW_*.md` are review artifacts and intentionally not
  in `.gitignore` — fine.
- `tsc --noEmit`: clean.
- `vitest run`: cannot run in the sandbox (same rolldown linux-arm64
  binding miss as yesterday). **Run `npm test` locally** before
  committing the render-layer PR.
- 18 local feature branches whose work has all landed remain. Optional
  `git branch -d` sweep — same observation as yesterday.

---

## 7. One-paragraph summary

Two PRs landed since yesterday: #116 closed the doc-drift sweep cleanly
(README/ROADMAP/RELEASE_NOTES/COMPILER all consistent with post-0.9
reality, version bump committed) and #117 added two small UX surfaces
ortogonal to the categorical model — `onto open` with a global project
registry under `~/.config/ontology/projects.json`, and a walker
`:link` action that proposes `edge_create` proposals from the focal
cell. PR #117 is well-tested (+23 tests) and the registry / TUI / link
parser are all clean reads. On the working tree, an unrelated render-
layer rewrite for non-Ink command output is in flight — one new
`src/core/render/{style,box,table}.ts` triplet (zero deps, NO_COLOR-
aware) plus eight rewritten observability commands plus a 190-line
test file. `tsc --noEmit` is clean; vitest cannot run in the sandbox.
There is one **real bug** in the WIP that should be fixed before the
PR merges (`truncateVisible` leaks ANSI color when it cuts a colored
cell), one design wart (the box helpers couple `NO_COLOR` with ASCII
fallback unnecessarily), and one latent ordering bug in
`eventTypeColor` whose impact is theoretical today. Two new findings
in `projects/registry.ts` (partial-name `forgetProject`, shallow
liveness check) are foot-guns rather than bugs. The four carry-over
bugs from yesterday (compile-plan silent drop, parent loading N²,
runtime-check slack, non-atomic `writeJson`) are unchanged; the
non-atomic write is now newly user-facing because the projects registry
is a third surface that suffers from it. After the render-layer PR
ships, the highest-leverage next step is still the `onto branch` CLI
surface (every prerequisite is merged), then atomic `writeJson`, then
the Bootstrap 0.10 design note on branch semantics that PR #117
deferred. No items block the next merge.

---

Sources: local clone at commit `371f45d` (`main`); `git status`,
`git log`, `git diff`, `git show 282ea71`;
`MILESTONE_REVIEW_2026-05-09.md`;
`docs/ROADMAP.md`, `docs/RELEASE_NOTES.md`, `README.md`,
`package.json`;
`src/core/render/{style,box,table}.ts`, `tests/render-layer.test.ts`;
`src/commands/{events/tail,inspect,node/list,node/show,proposal/list,query/run-query,runs/list,runs/show}.ts`,
`tests/{cli-observability,node-observability}.test.ts`;
`src/commands/open.tsx`, `src/commands/projects/{forget,list}.ts`,
`src/core/projects/registry.ts`,
`src/walker/actions/link-from-walker.ts`,
`src/walker/state/parse-link-args.ts`;
`src/runtime/graph/compile-plan.ts`,
`src/runtime/compile/compile-plan-runner.ts`,
`src/runtime/compile/post/runtime-check.ts`,
`src/walker/actions/run-from-walker.ts`,
`src/core/fs/json.ts`,
`src/schemas/ontology.ts`;
`tsc --noEmit` (clean).
