# Phase β-3 — Path fibration helpers (`computeFiberBy`)

**Branch to create:** `feat/path-fibration-helpers`
**Estimated work:** 60–90 minutes
**Type:** library generalisation, no CLI surface in this commit

---

## Goal

Generalise the existing branch fibration helpers in
`src/runtime/fibration/branch-fiber.ts` to operate over **arbitrary node →
label projections**, so the same library powers both the temporal-branch
fibration (already shipped) and the spatial-path fibration (needed by
[Project Legend](../../PROJECT_LEGEND.md) for token vocabulary
normalisation per file-path fiber, see §2.4 of that doc).

Specifically: add a generic helper `computeFiberBy(input, projection)`
that takes a `Node → label` function and returns one fiber per distinct
label. The existing `computeBranchFiber` becomes the canonical example
(label = `coordinates.branch`); a new `pathProjection` provides the
spatial analogue (label = parent directory of the first output file).

**No CLI surface in this commit.** The user-facing path-fiber command
lands in Phase γ when ingest needs it. β-3 is library-level only.

---

## Required reading before you start

In this order, with a one-paragraph mental summary after each:

1. `docs/PROJECT_LEGEND.md` §2.4 — the path fibration as a Grothendieck
   fibration over the directory poset.
2. `docs/BRANCH_FIBRATION.md` — the existing temporal-branch fibration,
   especially the partition property tested in
   `tests/runtime/fibration/branch-fiber.test.ts`.
3. `src/runtime/fibration/branch-fiber.ts` — the existing shape you are
   generalising. Note the signatures of `listBranches`,
   `computeBranchFiber`, `computeAllFibers`, `computeBranchFiberFromArrays`,
   and `describeCartesianLift`.
4. `src/runtime/fibration/types.ts` — the existing `FiberInput`,
   `BranchFiber`, `BranchProjection` types.
5. `src/runtime/fibration/index.ts` — what is currently re-exported.

---

## Scope — files you MAY touch

- `src/runtime/fibration/branch-fiber.ts` — add the generic helper next
  to the branch-specific one.
- `src/runtime/fibration/types.ts` — add the new generic types.
- `src/runtime/fibration/index.ts` — re-export the new symbols.
- New file: `tests/runtime/fibration/fiber-by.test.ts` — tests for the
  generic helper and the `pathProjection`.

## Scope — files you MUST NOT touch

- Any file in `src/cli.ts` or `src/commands/` — no CLI surface in this
  commit.
- Any file in `src/schemas/` — no schema changes.
- Any test file other than the new `tests/runtime/fibration/fiber-by.test.ts`.
  (Existing branch-fiber tests must continue to pass byte-identical.)

---

## Design decision

There are two ways to land this:

**Option A (recommended):** add `computeFiberBy` next to
`computeBranchFiber` in the same file `branch-fiber.ts`. Document in a
header comment that the file now hosts the generic helper plus the
branch-specific instance. Keep the file name.

**Option B:** rename `branch-fiber.ts` to `fiber.ts`, refactor every
branch-specific function to be a thin wrapper over the generic helper.
This is a bigger change because every import site needs updating.

**Go with Option A.** Option B is a follow-up refactor that should ship
on its own commit so the diff is reviewable as "renaming and wrappers"
without conflating with "adding the generic helper". A reviewer should
be able to skim β-3 and see *only* the generalisation.

---

## Concrete requirements

### Types (in `types.ts`)

```ts
/**
 * Generic fiber: a subgraph indexed by some label of type T. Mirrors
 * BranchFiber but with the label type parameterised. T is typically a
 * string (branch name, directory path) but can be any value usable as
 * a Map key.
 */
export interface FiberByLabel<T> {
  label: T;
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  size: { nodes: number; edges: number };
}
```

### Helpers (in `branch-fiber.ts`)

```ts
/**
 * Generalised fiber computation. Takes a projection that assigns a
 * label to each node (or returns undefined to exclude the node from
 * every fiber). Returns a Map keyed by the projection's distinct
 * outputs, with one fiber per label. Each fiber's edges are exactly
 * those whose both endpoints survived the node filter for that label.
 *
 * Partition property: ∑_label fiber.nodes.length === number of nodes
 * with defined projections.
 */
export function computeFiberBy<T>(
  input: FiberInput,
  projection: (node: OntologyNode) => T | undefined,
): Map<T, FiberByLabel<T>>;

/**
 * Spatial projection. Returns the parent directory of a node's first
 * output file, normalised via path.posix.dirname. Returns undefined
 * when the node has no outputs.files entries or no relativePath on the
 * first entry.
 *
 * Used by Project Legend's ingest pipeline to fiber the network by
 * file path so token vocabulary normalisation can suggest reusing
 * tokens that already exist within a directory fiber.
 */
export function pathProjection(node: OntologyNode): string | undefined;
```

### Re-exports (in `index.ts`)

Add these two symbols to the existing re-export block. Keep all
existing re-exports unchanged. The order in the re-export should mirror
the source file order.

### Tests (in `tests/runtime/fibration/fiber-by.test.ts`)

Cover, at minimum, these invariants:

1. **One fiber per distinct projection output.** Build a small input
   with nodes whose projection returns three distinct strings; assert
   `computeFiberBy(input, p).size === 3`.
2. **Undefined-projected nodes are excluded.** Half the nodes return a
   defined label; the other half return `undefined`. Assert that the
   returned map covers only the labelled nodes.
3. **Edge intra-fiber filter.** Construct a node A on label "x" and a
   node B on label "y" with an edge A→B; assert that neither fiber's
   `edges` array contains that edge (cross-label edges are dropped).
4. **Partition property.** For an input where every node has a defined
   projection, sum of `fiber.nodes.length` across all fibers === number
   of nodes total.
5. **Branch-fiber equivalence.** `computeFiberBy(input, n =>
   n.coordinates.branch)` produces the same `nodes`/`edges`/`size` as
   `computeBranchFiber(input, branch)` for each branch in
   `listBranches(input)`.
6. **`pathProjection` on artifact node.** Construct a node with
   `outputs.files = [{ relativePath: "src/runtime/foo.ts" }]`; assert
   `pathProjection(node) === "src/runtime"`.
7. **`pathProjection` undefined when no outputs.** Construct a node with
   `outputs.files = []` or missing outputs entirely; assert `undefined`.

Use the same fixture style as `tests/runtime/fibration/branch-fiber.test.ts`
(`mkNode`, `mkEdge` helpers) so the test file reads consistently with
its sibling.

---

## Quality gates

Run **all three** before committing:

```bash
npx tsc --noEmit          # must be clean (no output)
npx vitest run tests/runtime/fibration/        # all fibration tests green
npx vitest run            # full suite green — no regressions elsewhere
```

If `npx vitest run` reports a regression in a file unrelated to your
change, do not "fix" the regression. Stop and report the failing test
name in your final summary. The most likely cause of an unrelated
regression is that your `index.ts` re-export accidentally collided
with another export — check for shadowing first.

---

## Commit

When all three gates are green, commit on a new branch
`feat/path-fibration-helpers` with this message verbatim (note the
trailing co-author line):

```
feat(fibration): generalise to computeFiberBy(input, projection)

Project Legend Phase β-3. Adds a generic helper that takes a Node →
label projection and returns one fiber per distinct label.
computeBranchFiber stays the canonical example (label =
coordinates.branch); pathProjection provides the spatial analogue
(label = path.dirname(node.outputs.files[0].relativePath)).

No CLI surface in this commit — that lands when ingest needs it.
The existing BranchFiber API is unchanged; new FiberByLabel<T> type
is a sibling with a generic parameter.

Test coverage:
  - one fiber per distinct projection output
  - undefined-projected nodes are excluded
  - cross-label edges are dropped from every fiber
  - partition property: sum of fiber sizes = total nodes
  - branch-fiber equivalence under the canonical projection
  - pathProjection on artifact / non-artifact nodes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Do NOT push.** Leave the branch local. The user will review and
merge in the morning.

---

## Stop conditions

Stop the work and report (do not push through) if any of these happen:

- **3 consecutive typecheck failures.** Means the generic types are not
  composing cleanly. Report the last error message in your summary.
- **An existing branch-fiber test regresses** after your change. Means
  the equivalence between `computeFiberBy` and `computeBranchFiber` is
  subtly broken. Report which test failed and what the diff looks like.
- **The runtime exceeds 90 minutes** of focused work. Report whatever
  state you reached; the user prefers a clear "I got this far" over
  a forced shipping.
- **You realise Option B is actually necessary** because the generic
  types cannot be expressed without restructuring the file. In that
  case stop, do not refactor, and report so the user can decide.

---

## Reporting

When done, write one paragraph at the bottom of your final message
covering:

1. What landed (file paths + LoC counts).
2. Test counts: total tests in `tests/runtime/fibration/` after your
   change, and the count delta from before.
3. Any deviation from this brief and why (e.g. "I added a fourth helper
   `listLabels` because the partition test was cleaner with it").
4. Anything you noticed about the existing code that the user might
   want to address in a follow-up but that was out of scope here.

The user will read this in the morning; brevity is welcome (under 200
words).
