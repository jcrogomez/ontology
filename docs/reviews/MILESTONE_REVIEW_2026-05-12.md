# Ontology — Milestone review 2026-05-12

> Automated run of the Cowork scheduled task `ontology-pr-suggestions`.
> Local checkout at commit `5d8e552` on `feat/path-fibration-helpers`
> (1 commit ahead of `main` at `45b920b`). The sandbox proxy blocked
> `github.com` for the third day running (`HTTP 403 after CONNECT`), so
> the local clone is the source of truth — **run `git pull` locally
> before acting on this report.** Working tree is otherwise clean: two
> untracked entries (`.claude/`, `PAPER_DRAFT.md`) are workspace
> artifacts, not pending changes.

---

## 1. Headline status

The post-0.9 chapter is **fully closed.** Every item in §3.1–§3.15 of
yesterday's review (hardening sweep) is checked off in `ROADMAP.md` and
visible in `git log` between `cb616ef` and `e847417`. The plasticity
layer (`node update`, `node remove`, `edge remove`, `edge update`,
contract flags on `node create`, validator gate on `compile run`) is
landed end-to-end. Validator port onto the topos algebra is live; the
three-valued verdict is observable through `semanticLink`. `onto branch
list / fiber` exposes the fibration library; `onto compile run --branch`
restricts the plan to a single fiber. **Project Legend Phase β is now
underway** with three commits today across three sibling feature
branches.

---

## 2. What happened today

Three commits, all on unmerged sibling branches:

| Branch | Commit | Phase | Lines | Tests |
| --- | --- | --- | --- | --- |
| `feat/compile-run-batch-and-target` | `a09e1d7` | **β-1** — `onto compile run-batch` + `--target` | +620 | +14 cases (`compile-cli-run-batch.test.ts` 239, `compile-cli-target.test.ts` 95) |
| `feat/node-literal` | `c929c86` | **β-2** — `node.literal` escape hatch | +527 | +12 cases (`compile-cli-literal.test.ts` 260) |
| `feat/path-fibration-helpers` | `5d8e552` | **β-3** — `computeFiberBy(input, projection)` + `pathProjection` | +335 | +207 lines (`fiber-by.test.ts`) |

Commit messages report `tsc --noEmit` clean and full vitest suites green
on each branch (846/846, 844/844, and "added 207 test lines"
respectively). I could not re-run vitest locally — `@rolldown/binding-*`
in `node_modules` is `darwin-arm64` but the sandbox is `linux aarch64`.
**Run `npm test` locally on each branch before merging.**

The Legend prompt at `docs/legend/prompts/PHASE_BETA_3.md` was written
last night with the explicit plan *"launch β-3 only as a calibration
data point; β-1 and β-2 stay unstaged"*. In practice all three β phases
landed in one night — faster than planned. The Legend-prompts README
status table is therefore stale (β-1 / β-2 still marked `unstaged`).
See §5.12 below.

### β-1 — `run-batch` + `--target`

`onto compile run <id> --target <path>` writes the focal's artifact to
an arbitrary path instead of `.ontology/artifacts/generated/<id>.<ext>`.
Relative paths resolve against cwd; missing parent directories are
created. Upstream steps still land in `generated/`. The
`WriteArtifactResult.targeted: boolean` flag flows through the
`compilation_run` event so an auditor can tell overridden writes apart
from default ones.

`onto compile run-batch` walks N focals in one invocation. Plans are
computed per focal; the per-run persisted-run cache makes shared
upstream walks cheap on the second-and-later focals (validated by a
2-leaf shared-parent fixture: 4 persisted runs, not 6). Failure policy
is "continue past per-focal failures; exit 1 only when every focal
failed" — required for Legend's `verify-homeomorphism` reporting flow.
`--all-artifacts` (every code-manifestation node) and `--nodes <ids>`
(explicit subset) are mutually exclusive.

### β-2 — `node.literal` escape hatch

Optional `node.literal?: string` field pins the compiled artifact
verbatim. `compileNode` short-circuits the dispatch+persist slice and
synthesises a persisted run with `provider: "literal"`,
`model: "literal"`. The run id is content-addressed on the literal
bytes plus upstream context, so byte-identical literals collapse to the
same id (re-compile is a cache hit). The post-dispatch slice
(`projectArtifact` → `writeArtifact` → `validateLanguage` →
`validateIntent` → optional runtime-check → emit event) runs unchanged
— literals are *not* exempt from the semantic gate. `projectArtifact`
passes literals through verbatim (never strips a markdown fence: if the
user pinned the bytes, they pinned them). CLI surface:
`onto node create --literal <text> | --literal-file <path>`,
`onto node update --literal | --literal-file | --clear-literal`
(mutually exclusive).

Schema additions: `node.literal?: string`, `LlmProvider` gains a
`"literal"` variant. The dispatcher throws if `"literal"` reaches it —
defensive, since `compileNode` is supposed to bypass dispatch entirely.

### β-3 — `computeFiberBy(input, projection)` + `pathProjection`

Generic fibration helper. `computeFiberBy<T>(input, (n) => T |
undefined)` returns `Map<T, FiberByLabel<T>>`; the existing
`computeBranchFiber` is recovered as the case `projection = n =>
n.coordinates.branch`. `pathProjection(node)` returns
`path.posix.dirname(node.outputs.files[0])` (or `undefined` if the node
has no output file) — the spatial analogue of the temporal branch
fibration, used by Legend's ingest pipeline for per-directory token
vocabulary normalisation (`PROJECT_LEGEND.md` §2.4). Library-only, no
CLI surface in this commit.

The partition property is preserved: $\sum_{label} |\text{fiber}_{label}| =
\#\{n \mid \text{projection}(n) \neq \texttt{undefined}\}$. Cross-label
edges are dropped from every fiber (induced-subgraph rule). Test
coverage (207 lines) exercises three-label partitions, isolated-node
fibers, the `path.posix` cross-platform invariant, and the
branch-recovery special case.

---

## 3. Repo / build status

- **Active branch:** `feat/path-fibration-helpers` (1 commit ahead of `main`).
- **`main` HEAD:** `45b920b` "docs: LaTeX pass + sharpened pitch + Legend β-3 prompt ready" (no source changes since yesterday).
- **Three sibling feature branches** carry today's β work, **none yet merged.** See merge order recommendation in §5.
- **`git status`:** clean (untracked `.claude/`, `PAPER_DRAFT.md` — see §5.14).
- **`tsc --noEmit`:** not re-run in this sandbox; commit messages report clean.
- **`vitest run`:** still cannot execute in the sandbox (rolldown native binding mismatch).
- **`npm test` locally:** required on each branch before merge.
- **Untracked artifacts of note:** `PAPER_DRAFT.md` (16 KB Spanish-language paper draft, post-0.9 — disposition undecided).
- **Local branch backlog:** 13 already-shipped feature branches still local (`feat/walker-v0`, `feat/proposal-apply`, …) — optional `git branch -d` sweep.

---

## 4. Bug list — new findings

The §3.1–§3.15 backlog from prior reviews is closed. Findings below are
**new**, scoped to today's three branches.

### 4.1 `writeArtifact --target` is not crash-atomic — **β-1**

`src/runtime/compile/artifact-writer.ts:50`. The `--target` path does
`fs.writeFileSync(absolutePath, options.content, "utf-8")` directly. A
SIGKILL or out-of-disk mid-write truncates the **user's real source
file** — Legend's verify-homeomorphism flow lands artifacts at real
source paths byte-for-byte comparable to the file on disk, so this
write is much higher-stakes than the legacy
`generated/<nodeId>.<ext>` write.

The §3.2 fix for `writeJson` (PR `17022e9`) does not cover this code
path because `writeArtifact` writes plain UTF-8, not JSON.

**Fix (~6 lines):** write to `absolutePath + ".tmp." + process.pid`,
then `fs.renameSync` onto the target. Mirror the pattern in
`src/core/fs/json.ts`. Test: assert that a successful run leaves no
`.tmp.*` siblings; assert that pre-existing target content survives a
synthetic mid-write failure (mock `fs.writeFileSync` to throw after
N bytes).

### 4.2 `writeArtifact --target` clobbers without confirmation — **β-1**

Same file as 4.1. The default path writes to a throwaway directory; the
`--target` path overwrites whatever was at the user's chosen location
with no `--force` gate and no `.bak` sidecar. For an interactive `onto
compile run --target src/main.py` against a non-empty file, the user's
work disappears silently.

**Fix options:**
- (a) Refuse if target exists unless `--force` is passed. Conservative
  default; pairs naturally with Legend's "regenerate this file" flow
  where the user knows they want overwrite.
- (b) Write `target + ".bak"` before overwriting; refuse if `.bak`
  already exists unless `--force`. Slightly heavier but recoverable.
- (c) Status quo + a `clobbered: boolean` flag in the
  `compilation_run` event payload + a one-line stderr warning. The
  audit trail records the loss; recovery is still on the user.

Recommend (a) — Legend's main use case (`verify-homeomorphism`) will
always pass `--force` because the whole point is rewriting; an
interactive user gets protected by default.

### 4.3 `run-batch --nodes` doesn't filter non-code-manifestation nodes — **β-1**

`src/commands/compile/run-batch.ts:resolveFocals`. The `--nodes` path
accepts any id present in `state`. It dedupes but does not check that
each id is a `manifestation === "code"` node. An abstract / canon /
domain id slips through and `runCompilePlan` fails per-focal with a
generic error inside the loop instead of an actionable resolve-time
message.

The `--all-artifacts` path already filters to `manifestation === "code"`
— `--nodes` should do the same (with a warning for skipped ids).

**Fix (~10 lines):** after the unknown-id check, partition into
`{ codeFocals, nonCodeFocals }`; if `nonCodeFocals.length > 0` and
`--strict` is unset, emit a warning listing them and continue with
`codeFocals`; if `--strict`, fail with the list.

### 4.4 `run-batch --nodes --branch` doesn't pre-check membership — **β-1**

`resolveFocals` threads `--branch` through to `runCompilePlan` but does
not verify at resolve time that each `--nodes` entry lives on
`--branch`. Off-branch focals produce a per-focal `focal_off_branch`
failure inside the loop instead of an actionable resolve-time error.

**Fix:** in the `--nodes` path, when `options.branch` is set, also
reject (or warn-and-skip, consistent with 4.3) ids whose
`coordinates.branch !== options.branch`.

### 4.5 `run-batch` JSON `ok` field disagrees with exit code — **β-1**

`run-batch.ts:~125`. `ok: failedCount < results.length` is `true`
whenever **any** focal succeeded, including the partial-success case
where N-1 of N failed. The CLI exit code also returns 0 on partial
success. But a downstream caller parsing the JSON sees `ok: true` and
reasonably assumes "the whole batch succeeded". The two are subtly
incompatible.

**Fix:** rename the field to `anySucceeded` (or `partialSuccess`), and
add a separate `allSucceeded: boolean` that matches the human's
intuition. Or invert the convention and have `ok: allSucceeded`
explicitly. Either way the field and the exit code should agree on what
"ok" means.

### 4.6 `--literal-file` doesn't validate UTF-8 / binary content — **β-2**

`src/commands/node/create.ts:~75` and `src/commands/node/update.ts`.
Reads with `fs.readFileSync(path, "utf-8")` — same shape as the §3.13
finding for `--candidate-file` (closed by commit `14ecc51`). Passing a
PNG by accident produces a garbled `node.literal` field with embedded
U+FFFD replacement characters; that field is **load-bearing** (it
participates in the node hash and propagates verbatim to the compiled
artifact), so the failure is silent until the artifact is opened.

**Fix:** mirror `14ecc51` — read the file as a buffer, scan for a NUL
byte; reject with the message
`"--literal-file must be a readable UTF-8 text file"`.

### 4.7 `LITERAL_MODEL_NAME = "literal"` can collide with an ollama model name — **β-2**

`src/runtime/compile/compile-node.ts:~615`. The synthetic literal run
records `model: "literal"` as a plain string. An (admittedly unlikely)
user model named `"literal"` would render indistinguishably from a
hand-pinned literal in the persisted-run audit. The
`provider: "literal"` field is the safer discriminator, but the model
field reads more naturally.

**Low severity.** If we ever surface this in `onto runs show`, prefer
a sentinel like `__literal__` or `<literal>` that lexically cannot be
a real model name. Optional. Pin it in a test instead of changing the
constant if you want belt-and-braces.

### 4.8 `node.literal` + `--runtime-check` runs user-pinned code — **β-2 (design clarification)**

`compileNode` runs `runtimeCheckE` against any code-manifestation
artifact when `--runtime-check` is on, **including** an artifact
produced via the literal short-circuit. Likely intentional (the gate
is "did this run cleanly?" regardless of provenance) but `COMPILER.md`
doesn't say so explicitly.

**Action:** one paragraph in `COMPILER.md` clarifying that
`node.literal` bypasses dispatch but does **not** bypass any
post-dispatch validation. Pin with one test case in
`compile-cli-literal.test.ts` asserting that a deliberately broken
literal (e.g. `import nonexistent_module`) fails with
`reason: "runtime_failed"` when `--runtime-check` is set.

### 4.9 `computeFiberBy` silently drops unprojected nodes with no diagnostic — **β-3**

`src/runtime/fibration/branch-fiber.ts:computeFiberBy`. A node whose
projection returns `undefined` is excluded from every fiber. This is
correct for the path projection (artifact nodes with no
`outputs.files` set are not yet routable), but the caller gets no
indication of *how many* nodes were dropped or *which ones*. For
Legend's "find every artifact node missing an output path" diagnostic,
this information is the whole point.

The signature in `PROJECT_LEGEND.md` §2.4 implies the helper is
purely partitioning; an explicit `unprojected: OntologyNode[]` (or just
`unprojectedCount: number`) sidecar would close the diagnostic gap
without breaking the partition shape.

**Fix option:** change the return type to
`{ fibers: Map<T, FiberByLabel<T>>; unprojected: OntologyNode[] }`.
Or leave the `Map` and add a sibling helper `findUnprojected(input,
projection): OntologyNode[]`.

### 4.10 `pathProjection` first-output-only — **β-3 (design note)**

`pathProjection` reads `node.outputs.files[0]`. A node with **multiple**
output files lands in only the first file's directory fiber. For
Legend's per-directory token vocabulary, that's a reasonable default
(the first declared output is the "primary"). But a node that emits
both `src/lib/a.ts` and `tests/lib/a.test.ts` is filed under `src/lib`
only — the test file's directory has no projector pulling it in.

This is documented in the file ("if a future schema migration enriches
the shape, the projection can be tightened") but worth flagging as a
known limitation in `PROJECT_LEGEND.md` §2.4 *before* Phase γ ingest
lands a multi-output convention.

### 4.11 Cross-label edge drop also drops legitimate "inter-fiber" structure — **β-3 (design note)**

For the branch fibration, cross-branch edges are dropped from every
fiber. That matches the existing `BranchFiber` semantics. For the
**path** fibration, an edge `depends_on` between
`src/main.py` (fiber `src`) and `lib/util.py` (fiber `lib`) is dropped
from both fibers — but Legend's eventual "show me inter-module
dependencies" diagnostic *wants* those edges. This is exactly what the
old `extractSubgraph` already does for a different purpose, but the
shape is different.

**Action:** when Legend Phase γ writes the ingest core, design a
companion helper `findCrossFiberEdges(input, projection)` that returns
the edges dropped by `computeFiberBy`. Independent module, complements
the fibration library. Not a blocker for β-3 merge.

### 4.12 Three sibling branches will conflict on merge — **logistics**

`feat/compile-run-batch-and-target` and `feat/node-literal` both edit
`src/runtime/compile/compile-node.ts` in overlapping regions:

- β-1 adds `targetPath?: string` to `CompileNodeOptions` and threads it
  through `writeArtifactE`.
- β-2 adds the literal short-circuit (`runLiteralShortCircuit`, a new
  pre-dispatch branch), the `LlmProvider = "literal"` enum entry, the
  `projectArtifactE` pass-through for literals, and a new
  `node.literal` schema field.

The edits don't overwrite each other line-for-line, but they touch the
same `compileNode` body and the same `CompileNodeOptions` interface.
Whichever lands first, the second needs a rebase. **β-3 is the cleanest
of the three** (single new helper + new types file + isolated test
file). Recommend merge order:

1. **β-3 first** — zero conflicts, clean diff, calibration win.
2. **β-1 second** — apply the §4.1 + §4.2 fixes first, then merge.
3. **β-2 last** — rebase on top of β-1's compile-node.ts; apply §4.6;
   merge.

---

## 5. Suggested next steps — priority order

### Now (close shipped concerns before merging this week's work)

1. **§4.1 atomic write for `writeArtifact --target`.** ~6 LoC + one
   regression test. Blocking for β-1 merge.

2. **§4.2 `--target` clobber protection.** Recommend Option (a):
   refuse if target exists unless `--force`. ~10 LoC. Blocking for β-1
   merge because the failure mode is "user loses their work".

3. **§4.6 `--literal-file` binary-byte guard.** Mirror commit
   `14ecc51`. ~8 LoC. Blocking for β-2 merge.

4. **Merge β-3** (`feat/path-fibration-helpers`). No fixes needed; the
   cleanest of the three branches. Calibration data point.

### Next (sequence the remaining β merges)

5. **Rebase β-1 onto `main` post-§4.1 / §4.2 fixes; merge.**

6. **Rebase β-2 onto post-β-1 `main`** — resolve `compile-node.ts`
   conflict; apply §4.6; merge.

7. **Apply §4.3 + §4.4** (`run-batch --nodes` filters by manifestation
   and by branch). Either folded into β-1 pre-merge or shipped as a
   follow-up PR.

8. **Apply §4.5** (`run-batch` JSON `ok`/`allSucceeded` split). Schema
   change in machine-readable output; consider before any external
   consumer wires up `run-batch --json` parsing.

9. **§4.8** — one paragraph in `COMPILER.md` clarifying that
   `node.literal` does **not** bypass `validateIntent` /
   `validateLanguage` / `runtimeCheck`; pin with one test in
   `compile-cli-literal.test.ts`.

### Project Legend Phase γ — unblocked after β merges

10. **Write `PHASE_GAMMA_1.md`** (`onto ingest <path>` core) and
    `PHASE_GAMMA_2.md` (TS static-analysis edge inference). The β-3
    library is ready; γ-1 wires it into a CLI that reads source files,
    builds `node_create` proposals via the Inspector, and uses
    `pathProjection` to bucket suggestions by directory. γ-2 parses
    TypeScript imports / exports and emits `depends_on` / `uses_token`
    edge proposals without an LLM call. Both prompts can be written
    today against the current `main`.

11. **Confirm `BRANCH_MODEL.md` Option C.** The recommendation has
    been on the doc since 2026-05-10. Nothing blocks confirmation
    today, and **every Bootstrap 0.10 storyline** (cross-branch
    `node_update`, `onto branch lift`, future merge-proposals) gates on
    it. A two-sentence confirmation comment from the maintainer in the
    doc unblocks the queue.

### Hygiene

12. **Refresh `docs/legend/prompts/README.md` status table.** β-1 /
    β-2 are no longer `unstaged`; they're on feature branches. β-3 is
    not `ready` anymore; it's shipped (modulo merge). Optionally
    backfill `PHASE_BETA_1.md` / `PHASE_BETA_2.md` for reproducibility
    — even with the work done, the prompts document the *design
    contract* the agent worked against. Useful if a future
    investigation asks "why does run-batch's failure policy
    `continue-then-aggregate`?".

13. **§4.9 / §4.10 / §4.11** (β-3 design notes). One docstring update
    in `PROJECT_LEGEND.md` §2.4 noting:
    - `pathProjection` reads only `outputs.files[0]`;
    - unprojected-node count is not exposed in `computeFiberBy`'s
      return shape (planned diagnostic helper in Phase γ);
    - cross-fiber edges are dropped (planned companion helper in
      Phase γ).

14. **Resolve `PAPER_DRAFT.md`.** Either commit it under `docs/paper/`
    with a stable filename, or `.gitignore` it. Currently it sits in
    `git status` on every check.

15. **Optional `git branch -d` sweep.** 13 local feature branches
    whose work has fully landed (`feat/walker-v0` through
    `feat/proposal-apply`, etc.). Pruning them tightens
    `git branch` output and reduces tab-completion noise.

---

## 6. One-paragraph summary

The post-0.9 chapter is fully closed — every §3.1–§3.15 hardening item
from the prior reviews is shipped on `main`. **Project Legend Phase β**
opened today with three commits on three sibling feature branches: β-1
(`run-batch` + `--target` — Layer 1 multi-file orchestration, 620 lines,
14 test cases), β-2 (`node.literal` escape hatch — Layer 2 irreducible
specificity, 527 lines, 12 test cases), and β-3 (`computeFiberBy` +
`pathProjection` — Layer 5 path fibration, 335 lines, 207 test lines).
None of the three is merged yet. **Three findings block merge:** §4.1
(`writeArtifact --target` not crash-atomic — same shape as the §3.2
fix, now applied to a higher-stakes write path), §4.2 (`--target`
clobbers without confirmation — Legend will set `--force` but an
interactive user needs the gate), and §4.6 (`--literal-file` doesn't
reject binary content — same shape as the §3.13 fix already closed for
`--candidate-file`). **Recommended merge order:** β-3 first (no
conflicts, no fixes needed) → β-1 (after §4.1 + §4.2) → β-2 (rebase on
β-1's `compile-node.ts`, after §4.6). With β merged, Phase γ is
unblocked — the immediate next prompts to write are `PHASE_GAMMA_1.md`
(`onto ingest <path>` core) and `PHASE_GAMMA_2.md` (TS static-analysis
edge inference). One non-code item also blocks the next milestone:
`BRANCH_MODEL.md` Option C has been the recommendation since 2026-05-10
but is still labelled "awaiting confirmation"; every Bootstrap 0.10
storyline waits on a two-sentence maintainer confirmation in that
file.

---

Sources: local clone at commit `5d8e552` (`feat/path-fibration-helpers`,
1 ahead of `main@45b920b`); `git log`, `git show` for `a09e1d7`,
`c929c86`, `5d8e552`; `git diff main..feat/path-fibration-helpers`;
`src/commands/compile/run-batch.ts`,
`src/runtime/compile/artifact-writer.ts`,
`src/runtime/compile/compile-node.ts`,
`src/runtime/fibration/branch-fiber.ts`,
`src/runtime/fibration/types.ts`,
`src/commands/node/{create,update}.ts`,
`src/schemas/ontology.ts`, `src/runtime/llm/dispatcher.ts`;
`docs/ROADMAP.md`, `docs/PROJECT_LEGEND.md`,
`docs/BRANCH_MODEL.md`, `docs/legend/prompts/README.md`,
`docs/legend/prompts/PHASE_BETA_3.md`;
prior review `docs/reviews/MILESTONE_REVIEW_2026-05-11.md`.
