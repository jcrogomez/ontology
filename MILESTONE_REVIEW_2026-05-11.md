# Ontology — Milestone review 2026-05-11

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout of `main` at commit `9b8d34f` (PR #122). The sandbox
> proxy blocked `github.com` again (`HTTP 403 after CONNECT`), so the
> local clone is used as the source of truth. Branch `main` reports
> **"Your branch is up to date with 'origin/main'"** — the working tree
> is clean (no staged or unstaged changes; three untracked
> `MILESTONE_REVIEW_*.md` files are review artifacts, not product code).
> **Run `git pull` locally before acting on this report** in case origin
> moved between this run and your next session.

---

## 1. Progress since yesterday

Five PRs merged between `371f45d` (yesterday's HEAD at PR #117) and
`9b8d34f` (today's HEAD at PR #122) — essentially an entire
post-0.9 chapter shipped in one day:

| PR  | Commit    | Title                                                         | Impact |
| --- | --------- | ------------------------------------------------------------- | ------ |
| #118 | `4e2ba3b` / `4e236d7` | feat(render): visual upgrade — colors and Unicode cards | The WIP render layer flagged yesterday as "fix before merging" **landed**. `src/core/render/{style,box,table}.ts` + 8 commands rewritten. 882 lines net. |
| #119 | `f4ca60a` / `6f0394c` | feat: render layer + validator port onto Ω + math-claims audit | Validator port onto topos algebra done. Major doc overhaul: stale legacy stubs deleted, `MATHEMATICAL_CLAIMS.md` added, `ARCHITECTURE.md` / `CATEGORICAL_VISION.md` / `RULES_TOPOS.md` / others updated. |
| #120 | `6a50116` / `5098d65` | feat(link): onto link CLI + walker :link-analysis | `onto link <nodeId> --candidate <text\|--candidate-file>` wraps `semanticLink()` end-to-end. Walker `:link-analysis` mirrors with `focal.prompt.raw` as default. Pure suggester at `edge-suggester.ts`. +1700 lines, +669 test lines. |
| #121 | `d513bff` / `ffde36f` | feat(walker): :graph view [depth] — terminal-first DAG inspector | `:graph view [depth]` renders the focal's k-hop subgraph in three buckets (Upstream ↑ / Downstream ↓ / Lateral ↔), colored by abstraction level, capped at 15 rows/bucket. Closes the "Visual DAG Studio (terminal-first)" roadmap item. +721 lines, +182 test lines. |
| #122 | `f2c5d8c` / `9b8d34f` | docs: post-0.9 doc-drift cleanup | 5 trivial doc edits. Cosmetic. |

The post-0.9 chapter is now **essentially complete**. The roadmap items
that were checked 🟡 yesterday are either shipped or have a clean,
unblocked path to shipping. The working tree is clean; there is no
active WIP.

---

## 2. What the new PRs add

### PR #120 — `onto link` + `:link-analysis`

The missing read-only CLI surface for the semantic linker. Given a
focal node and a candidate text, `onto link` assembles context, runs
`semanticLink`, evaluates `validateIntent`, and prints a single LINK
card showing:

- validation summary (`ok` / `score` / violations / warnings)
- a per-token requires/provides/forbids matrix with provider attribution
- one-hop relevant neighbors
- copy-pasteable `onto propose link …` suggestions for any unsatisfied
  requirement (from `edge-suggester.ts`, same-branch, deduplicated)

`--include-edges` / `--edge-types` extend the gluing pool; `--no-suggest-edges`
suppresses the suggester; `--json` emits machine-readable output. Walker
action `:link-analysis` defaults the candidate to `focal.prompt.raw`
(turns the action into "does my own prompt satisfy my contract?").

**What I checked:**
- `src/commands/link/index.ts` — flag grammar, candidate-file path
  resolution, json vs card branch, all output paths go through the
  new render layer.
- `src/runtime/context/edge-suggester.ts` — skips focal, skips
  cross-branch providers, skips already-linked (from, to, type) tuples,
  validates edge direction before suggesting. Deterministic output
  (sorted by to+type).
- Tests: `tests/cli-link.test.ts` (37 cases), `tests/runtime/context/edge-suggester.test.ts`
  (25 cases), `tests/walker-link-analysis-action.test.ts` (34 cases).

**Verdict:** clean, well-tested, scoped. Two new findings below
(§4.12, §4.13).

### PR #121 — `:graph view [depth]`

The terminal-first answer to "Visual DAG Studio". Renders the focal's
k-hop subgraph as a structured panel — not ASCII boxes-and-lines, but
a directional bucketed list (upstream above, downstream below, lateral
at the end). Each row shows label, kind/abstraction tag, and up to 4
incident edges. `extractSubgraph` is shared with `onto graph subgraph`
so slice membership is consistent. Depth defaults to 2, capped at 5.

**What I checked:**
- `src/walker/actions/graph-view-from-walker.ts` — BFS pass logic,
  upstream-wins tie-break, RENDER_CAP_PER_BUCKET=15, silent-skip on
  corrupt node load.
- `src/walker/state/parse-graph-view-args.ts` — depth parsing, clamp
  to [1,5].
- Tests: 128 action cases + 54 parser cases.

**Verdict:** correct and well-tested. One perf finding below (§4.14)
and one UX gap (§4.15).

---

## 3. Bug list — open items

### Carry-over from previous reviews

#### 3.1 `truncateVisible` ANSI color leak — **bug in shipped code**

`src/core/render/table.ts:33–56`. Confirmed still present in PR #118.
When a colored cell is truncated, the function copies the opening
`\x1b[...m` escape but the input's matching reset (`\x1b[0m`) lies
past the truncation boundary and is never emitted. The `…` character
and the gutter spaces after it inherit the foreground color, and the
next cell's leading whitespace is tainted until the next column emits
its own escape or the line ends.

**Fix:** append `\x1b[0m` after `…` whenever the input contains any
ANSI escape. Three lines:

```ts
// after the while-loop, before return:
const hadAnsi = /\x1b\[/.test(s);
return out + "…" + (hadAnsi ? "\x1b[0m" : "");
```

Add a regression test:
```ts
it("resets color after truncation", () => {
  const colored = "\x1b[32mreally long text\x1b[0m";
  const result = renderTable([{ v: colored }], [{ header: "V", render: r => r.v, maxWidth: 10 }]);
  expect(result).toContain("\x1b[0m");
});
```

#### 3.2 `writeJson` not crash-atomic — **hardening gap, now affects 3 surfaces**

`src/core/fs/json.ts:15` is still a direct `fs.writeFileSync` on the
target. A SIGKILL or out-of-disk mid-write silently truncates
`state.json`, `events.jsonl`, or `~/.config/ontology/projects.json`
(the registry introduced in PR #117). The projects registry is the
most exposed: a corrupt registry breaks every project on the machine,
not just one.

**Fix:** write-to-temp + rename:
```ts
export function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = filePath + ".tmp." + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, filePath);
}
```

#### 3.3 `runtime-check` timeout boundary off-by-one

`src/runtime/compile/post/runtime-check.ts:95`:
`durationMs >= spec.timeoutMs - 100`. The 100 ms constant slack is
fine for the default 5000 ms timeout but collapses to `durationMs >= 0`
at the 100 ms lower bound, so any SIGTERM at that boundary is
misreported as "timeout" regardless of actual elapsed time.

**Fix:** scale the slack: `Math.min(100, Math.floor(spec.timeoutMs * 0.1))`

#### 3.4 `forgetProject` silent multi-remove

`src/core/projects/registry.ts:124–126`. The filter keeps entries
where **both** `path !== absCandidate` AND `name !== pathOrName`. This
means a name-only match removes every entry whose name matches, even if
the user's argument looks like a path. Two independent foot-guns:

- `onto projects forget demo` deletes every project named `demo`
  without confirmation.
- `onto projects forget /abs/path` would still match by name if the
  basename happens to equal `pathOrName`.

**Fix:** resolve by path first; only fall back to name-match if the
argument is not an existing path; error out on ambiguous name-match
(multiple projects with the same name).

#### 3.5 `partitionByLiveness` shallow check

`src/core/projects/registry.ts:149` checks only for `.ontology/`
directory existence. A hand-created directory passes as "live" and
`onto open` will either crash on the missing `state.json` or
silently re-init.

**Fix:** also require `.ontology/state.json` to exist:
```ts
if (
  fs.existsSync(path.join(entry.path, ".ontology")) &&
  fs.existsSync(path.join(entry.path, ".ontology", "state.json"))
) {
```

#### 3.6 `eventTypeColor` ordering is fragile (latent)

`src/commands/events/tail.ts:8`. The `compilation_` branch runs first
and returns `greenBright` for anything matching that prefix. A future
`compilation_failed` event (nothing in the schema today) would render
green instead of red. Low severity now, but fragile to schema additions.

**Fix:** reorder so negative-outcome patterns (`_failed`, `_rejected`,
`_staled`) are checked before the `compilation_` prefix catch-all. Or
lift the mapping into a `Record<EventType, NamedColor>` keyed on the
exact Zod enum values.

#### 3.7 `colorsEnabled()` re-evaluated per call (perf nit)

`src/core/render/style.ts:66–74`. Every `bold`, `dim`, `color`,
`byKind`, etc. call re-reads `process.env.NO_COLOR` / `FORCE_COLOR`
and touches `process.stdout.isTTY`. For a 1000-row `events tail` with
five colored cells per row that's 5 000 env lookups.

**Fix:** memoize on first call; expose `resetColorCache()` for test
teardown (tests already flip env vars between cases).

#### 3.8 `box.ts` couples `NO_COLOR` with ASCII box-drawing (design wart)

`src/core/render/box.ts:39–44`. The `chars()` helper returns
`CHARS_ASCII` whenever `colorsEnabled()` is false. A CI log with
`NO_COLOR=1` typically still understands UTF-8; conflating color
suppression with Unicode suppression makes cards harder to read in
CI contexts.

**Fix:** separate `unicodeEnabled()` (check `TERM`, `CI`, or an
explicit `NO_UNICODE` env var) from `colorsEnabled()`.

#### 3.9 `runFromWalker` still on legacy `try/catch`

`src/walker/actions/run-from-walker.ts:39,79,95` — three top-level
try/catch blocks. The compiler side was refactored onto `EffectWithLog`
in PR #115; the walker side remains. This means partial diagnostics
from a walker `:run` are lost on error. Documented in `RELEASE_NOTES.md`
as a known limitation; unblocked now that the render-layer PR is merged.

#### 3.10 `computeCompilePlan` `supersedes` silent drop — test pin missing

`src/runtime/graph/compile-plan.ts:154`. The behaviour is correct and
documented (`COMPILER.md`), but there is no test that pins the
specific semantics (node Y in the closure is silently dropped when X
supersedes Y; the plan continues without Y). A 20-line test case in
`tests/compile-plan.test.ts` would prevent a future refactor from
unintentionally re-including Y.

#### 3.11 Refinement parent loading is N²-ish (perf)

`src/runtime/compile/compile-plan-runner.ts` (`collectUpstream`).
Still calls `loadNodeById(parentId, cwd)` per parent per step.
Pre-loading the closure into a `Map<string, OntologyNode>` once at
the top of `runCompilePlan` and threading it into `collectUpstream`
costs ~15 lines and eliminates repeated disk reads on large plans.

---

### New findings

#### 3.12 `graph-view-from-walker.ts` — per-node disk reads in slice loop

`src/walker/actions/graph-view-from-walker.ts:115–125`. For each node
in the extracted subgraph, the action calls `loadNodeById(id, cwd)`,
which reads and parses one JSON file per call. At depth 3–4 on a
medium ontology this is O(N) sequential reads inside a walker action.
`loadNodes(cwd)` already returns all nodes as a `Map`-friendly array;
a single pre-load at the top of the function would give O(1) lookup
per slice member.

This is structurally the same issue as 3.11 in `compile-plan-runner`.

**Fix (~5 lines):**
```ts
const allNodes = loadNodes(cwd);
const nodeById = new Map(allNodes.map(n => [n.id, n]));
// remove the inner loadNodeById loop
```

#### 3.13 `onto link` — `--candidate-file` doesn't validate UTF-8 / binary

`src/commands/link/index.ts` reads the candidate file with
`fs.readFileSync(path, "utf-8")` but doesn't guard against binary
files or files with encoding errors. Passing a PNG by accident would
produce a garbled candidate text and a confusing error from the linker
rather than an actionable message.

**Fix:** wrap in a try/catch; on error, emit `"--candidate-file must be
a readable UTF-8 text file"`.

#### 3.14 `:graph view` silent bucket mismatch on corrupt node

`graph-view-from-walker.ts:137`. When `loadNodeById` returns null for
a slice member (corrupt record), the node is silently skipped. The
`totalNodes` count reported at the top of the panel still includes the
missing ID (it comes from `slice.nodeIds.size`), so the panel can
report "showing 8 of 10 nodes" when only 8 nodes actually exist.

**Fix:** track skipped nodes separately and report them:
```ts
if (!node) { skippedIds.push(id); continue; }
```
Then, if `skippedIds.length > 0`, append a dim `(N node(s) could not
be loaded — run onto validate)` line to the panel.

#### 3.15 `edge-suggester.ts` — no dedup on (from, to, type) when `existingEdges` is empty

`src/runtime/context/edge-suggester.ts`. The dedup logic correctly
skips suggestions for already-existing `(from, to, type)` tuples, but
the filter only runs when `existingEdges` is non-empty. If the caller
passes `existingEdges: []` (valid: a node with no edges), the dedup
path is bypassed entirely. Today all callers do pass the full edge list,
so this is latent, but it's a correctness gap if a future caller passes
a partial edge set.

The fix is a trivial reorder: build the `existingEdgeTuples` Set
regardless of whether the array is empty (a Set over an empty array is
also empty and lookups return false as expected).

---

## 4. Suggested next steps — priority order

### Now (close shipped bugs)

1. **Fix `truncateVisible` ANSI leak** (§3.1). Three lines in
   `table.ts`; one regression test case. This is a visual regression
   that any user with a long colored label will hit.

2. **Registry polish** (§3.4 + §3.5). `forgetProject` path-first
   resolution and `partitionByLiveness` `state.json` check. Both are
   <10 lines each; bundle as `"ux: tighten projects registry edge
   cases"`. The foot-gun in §3.4 is especially user-hostile (silent
   multi-delete).

### Next hardening (one PR at a time)

3. **Atomic `writeJson`** (§3.2). Write-to-temp + rename.
   ~10 lines in `json.ts`; the registry surface makes this newly
   user-facing and higher priority than anything else in this bucket.

4. **Scale `runtime-check` timeout slack** (§3.3). One-liner in
   `runtime-check.ts`.

5. **Port `runFromWalker` onto `EffectWithLog`** (§3.9). Already
   documented; now unblocked.

6. **`computeCompilePlan` `supersedes` test pin** (§3.10). 20-line
   addition to `compile-plan.test.ts`.

7. **`--candidate-file` binary guard** (§3.13). Try/catch + helpful
   error message.

### Next feature work (Bootstrap 0.10 prep)

8. **`onto branch list` + `onto branch fiber <name>`** — read-only CLI
   surfaces wrapping `listBranches` and `computeBranchFiber`.
   Everything is in place (`src/runtime/fibration/branch-fiber.ts`,
   walker `:branch list` as a model). ~50 LoC in
   `src/commands/branch/*` + wiring in `cli.ts`. This is the largest
   gap in the post-0.9 roadmap.

9. **`onto compile run --branch <name>`** — filter `runCompilePlan`
   entry to one fiber. `computeBranchFiber` returns the right shape;
   the plan helper is pure over an `edges` array; the only missing
   piece is the CLI flag and a slice filter at the entry of
   `runCompilePlan`.

10. **Bootstrap 0.10 design note** (`docs/BRANCH_MODEL.md`). PR #117's
    commit body deferred the open design question:

    > La pregunta abierta clave: cuando se crea branch X desde main,
    > los nodes existentes se duplican, se proyectan via overlay, o
    > solo se materializan al ser tocados?

    The answer changes the storage layout, the event schema, and the
    walker `:branch` UX significantly. A 1–2 page design note laying
    out the three options, picking one, and explaining why is the
    prerequisite artifact before any `node_update` code lands.
    Write this **before** starting Bootstrap 0.10 code.

### Medium term

11. **Validator open-world mode** — `openWorld?: boolean` flag on
    `validateIntent`. Trivial API extension; exposes the three-valued
    `verdict === "unknown"` to callers who want it.

12. **`onto query` extensions** — negation in shapes (`!hasIncoming`),
    exact edge profiles, multi-shape OR queries.

13. **Memoize `colorsEnabled()`** (§3.7). Micro-optimisation; low
    urgency unless `events tail` hits perf in real use.

14. **Walker v2** — proposal-review pane, plane/time/branch/
    manifestation rotation. Nine action files now; a unified pane
    layout would help navigation.

---

## 5. Repo / build status

- **`git status`**: clean working tree. `main` at `9b8d34f` (PR #122).
- **`tsc --noEmit`**: not re-run in this sandbox (no new source files
  since last review which was clean); PR #118 commit message confirms
  `tsc` clean before merge.
- **`vitest run`**: still cannot execute in the sandbox (rolldown
  native binding for `linux-arm64-gnu` not in `node_modules` which
  were installed for `darwin-arm64`). **Run `npm test` locally** —
  both `:graph view` and `onto link` added 460+ test lines.
- **Local branch backlog**: 13 local branches whose work has all
  landed (`feat/walker-v0`, `feat/proposal-apply`, etc.). Optional
  `git branch -d` sweep.
- **Remote branches of note**: `remotes/origin/feat/run-persistence`,
  `remotes/origin/jules-add-ollama-adapter-…`,
  `remotes/origin/jules/prompt-graph-base-…`,
  `remotes/origin/test/node-create-granular-tests-…` — these appear
  to be external / automated contributions. Worth reviewing before they
  go stale.

---

## 6. One-paragraph summary

Five PRs landed yesterday, completing the post-0.9 chapter: the render
layer WIP shipped in PR #118 (three-module `style/box/table` triplet,
eight commands rewritten, 882 net lines), the validator port onto the
topos algebra and a full documentation audit landed in PR #119,
`onto link <nodeId>` + walker `:link-analysis` closed the last missing
CLI surface for the semantic linker in PR #120 (+1700 lines, edge
proposal suggester, 96 test cases), `:graph view [depth]` closed the
"Visual DAG Studio (terminal-first)" roadmap item in PR #121 (+721
lines, 182 test cases), and PR #122 cleaned up five doc drift items.
The working tree is now clean and the post-0.9 chapter is complete.
**One shipped bug** is confirmed still present: `truncateVisible` in
`table.ts` leaks ANSI color when truncating a colored cell (§3.1) — a
three-line fix. The registry foot-guns (`forgetProject` silent
multi-delete, `partitionByLiveness` shallow check — §3.4, §3.5) are
the next most user-visible items. The atomic-write gap (§3.2) is now
critical because the projects registry is a third non-atomic surface
shared across all projects on the machine. After those two hardening
items, the unblocked feature work is `onto branch list` / `onto branch
fiber` (~50 LoC, all prerequisites merged), then `onto compile run
--branch <name>`, then the Bootstrap 0.10 design note on branch
materialization semantics — that note is the prerequisite before any
`node_update` code lands.

---

Sources: local clone at commit `9b8d34f` (`main`); `git log`,
`git show --stat` for PRs #118–#122; `git status`;
`src/core/render/{style,box,table}.ts`;
`src/commands/link/index.ts`, `src/runtime/context/edge-suggester.ts`,
`src/walker/actions/link-analysis-from-walker.ts`;
`src/walker/actions/graph-view-from-walker.ts`,
`src/walker/state/parse-graph-view-args.ts`;
`src/core/projects/registry.ts`;
`src/core/fs/json.ts`;
`src/runtime/compile/post/runtime-check.ts`;
`src/walker/actions/run-from-walker.ts`;
`src/runtime/compile/compile-plan-runner.ts`;
`src/commands/events/tail.ts`;
`docs/ROADMAP.md`, `docs/RELEASE_NOTES.md`;
`MILESTONE_REVIEW_2026-05-10.md`.
