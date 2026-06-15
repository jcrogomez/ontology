# Branch Model — Materialization Semantics

Status: **design note, awaiting confirmation**. No code in `src/` depends on
this decision yet. It is the prerequisite artefact called out by PR #117's
commit body and the post-0.9 milestone reviews: before any `node_update`
code lands in Bootstrap 0.10 we have to pick how branches *physically*
relate to nodes on disk.

Companion read: [`BRANCH_FIBRATION.md`](../laws/BRANCH_FIBRATION.md) (mathematical
model). This document is about the **runtime** consequences of that model.

## The open question

`coordinates.branch` is already a per-node label, the fibration library
already partitions the graph into fibers, and `onto branch list / fiber`
exposes both read-only. The unresolved question is what happens when a
user **creates a branch X from main** (or any other parent):

> Do the existing nodes on the parent branch:
>   1. **Duplicate** eagerly into X (copy every record),
>   2. **Project** virtually into X via an overlay (read-through-shadow),
>   3. **Materialize** lazily — X starts empty, and a node only acquires
>      a fiber-resident record when something on X writes to it.

Each answer changes the storage layout, the event schema, the walker
`:branch` UX, and the merge semantics of any future `onto branch merge`.

## The three options, plainly

### Option A — Eager duplication

When `onto branch create X --from main` runs, every node currently on
`main` gets a new on-disk record whose `coordinates.branch === "X"`. The
new node has the same prompt, kind, abstraction, manifestation; only the
branch coordinate and the integrity hash differ. Edges are duplicated
analogously.

  - **Storage:** O(`|main|`) new files per branch, doubling for each
    additional branch off the same parent.
  - **Event schema:** `branch_created` is followed by N `node_created`
    + M `edge_created` events. The temporal log gets verbose but
    auditable.
  - **Walker UX:** unambiguous — `branch fiber X` returns a real,
    self-contained subgraph. `node_xxxx@main` and `node_xxxx@X` are
    separate ids.
  - **Merge semantics:** explicit. A merge is a 3-way diff between two
    real fibers.
  - **Cost:** branches become *heavy*. Creating a feature branch off a
    50k-node main is an actual 50k-record IO burst. Re-hashing also runs
    50k times.

### Option B — Overlay / read-through-shadow

Branch X starts with **zero** new node files. Reads on branch X resolve
through a parent-chain: look first under `coordinates.branch === "X"`,
fall back to `"main"` if not found. Writing on X creates a shadow
record that masks the parent.

  - **Storage:** O(1) at branch creation; grows only with edits on X.
  - **Event schema:** `branch_created` is a single event with a
    `parent_branch` field. A modification emits `node_shadowed` or
    similar; the original on `main` is left intact.
  - **Walker UX:** ambiguous by default — "is this node really on X, or
    is X reading it through main?". `branch fiber X` needs a union-of-
    parents resolution rather than a direct filter.
  - **Merge semantics:** complex. The shadow chain is itself the diff,
    but reconciling cross-shadow changes (X shadows N, then main mutates
    N) needs a defined precedence rule.
  - **Cost:** loaders, validators, and the fibration library all grow
    a "resolve through parent chain" awareness. The partition property
    of the current fibration ceases to hold literally: a node
    *logically* belongs to multiple fibers.

### Option C — Lazy materialization on touch

Branch X starts empty. A node only acquires a record on X the first
time something on X writes to it (a `node_update` proposal, a
cartesian lift, an explicit `onto branch lift node_xxxx`). Until that
moment, the user thinks of X as "a name without any nodes yet".

  - **Storage:** O(0) at branch creation; grows exactly with the
    delta authored on X.
  - **Event schema:** unchanged — `branch_created` is metadata only,
    every concrete change goes through the existing `node_created` /
    `node_updated` flow with the new branch coordinate.
  - **Walker UX:** clear — `node_xxxx` is "on" branch X iff and only
    iff a file with that branch coordinate exists. `branch fiber X`
    returns exactly the records authored on X. No shadow chain.
  - **Merge semantics:** straightforward — a merge proposes one or
    more cartesian lifts from X back onto the parent, each with a real
    record on both sides.
  - **Cost:** the user's mental model of "branch" cannot be "a private
    workspace that inherits everything from main". A branch is a set
    of changes, not a snapshot. Queries that span the inheritance chain
    need a `--include-parent-branch` flag (and we have to add it).

## Decision: **Option C — confirmed 2026-05-13**

The maintainer confirmed Option C (lazy materialisation on touch) on
2026-05-13, after the recommendation had stood unchallenged for five
days in this document. The three reasons below remain the load-bearing
justification; Bootstrap 0.10 is now unblocked.

## Why Option C (load-bearing rationale, preserved)

Three concrete reasons:

1. **Schema-consistent.** The existing schema treats `coordinates.branch`
   as a single value per node — `node.coordinates.branch === "X"` is a
   point on a partition, not a tag on a multi-valued set. The fibration
   tests in `tests/runtime/fibration/branch-fiber.test.ts` enforce the
   partition property literally (`flatMap(fiber.nodes).length === total`).
   Option C is the only one of the three that preserves this without a
   breaking schema change.

2. **Math-consistent.** The Grothendieck fibration model documented in
   `BRANCH_FIBRATION.md` is *the* mathematical justification for branches
   in this codebase. Under that model, fibers are disjoint pre-images;
   a node lives in exactly one fiber. Options A and B both stretch the
   model: A introduces structural duplicates that need an explicit
   "lifted from" link to recover the math, and B turns the fibers into
   non-disjoint subsets (now the model has to switch to a different
   construction, e.g. a sieve). C is the literal interpretation.

3. **Operationally cheap and honest.** A branch costs nothing until the
   user authors something on it. A user looking at `onto branch fiber X`
   sees exactly what was actually authored on X — no virtual shadow
   inheritance to surprise them. The "branch X depends on main" semantic
   that Options A and B encode implicitly is recovered explicitly via
   the existing `--include-parent-branch` style flag pattern, which keeps
   the implicit dependency observable in the audit log.

The trade-off — users who model "branches" mentally on git might expect
implicit inheritance — is real but recoverable through documentation and
read-side flags. We pay it once in onboarding rather than carrying it
forever in the loaders.

## What this means for Bootstrap 0.10

If Option C is accepted, the concrete work that opens up is:

1. **`onto branch create <name> [--from <parent>]`** — metadata-only;
   records a `branch_created` event with parent reference. No node files
   are touched. Validates that `<name>` does not already exist.

2. **`node_update` propagation rules.** A `node_update` proposal targets
   the focal's *current* branch. If the user is operating on branch X
   but the focal lives on main, the proposal pipeline either:
     - requires an explicit cartesian lift first (`onto branch lift
       node_xxxx`) and then targets the lifted node, **or**
     - silently lifts as part of `node_update` (less ceremony, more
       implicit work — to be decided).
   The recommendation here is the **explicit lift first** path: it keeps
   the temporal log clean (one `node_created` event for the lift, one
   `proposal_created` for the update), and it matches the principle of
   not surprising users with implicit moves.

3. **Read-side queries that span branches** add a
   `--include-parent-branch` flag (or `--branch X+parent`). The default
   stays branch-pure.

4. **Merge proposals** become `onto branch merge X → main` with two
   sub-proposals: one cartesian lift per node modified on X, plus
   conflict-resolution proposals where the same node was modified on
   both sides. Out of scope for 0.10; recorded here as the natural
   shape once the foundation is in place.

If Options A or B are preferred instead, the schema and loaders need
broader changes — the partition tests need rewriting, the `coordinates`
schema needs a parent-branch field (B) or a "duplicates from" id field
(A), and the fibration library's contracts need a refresh.

## Open questions deferred to the implementation PR

  - **Naming convention for lifted ids.** The fibration library proposes
    `<sourceId>@<targetBranch>` (e.g. `node_0001@feature`). The CLI
    surface should make this discoverable in `node show`, `node list`,
    and `graph subgraph`. Default-on `@branch` suffix in the display,
    suppressed when the branch matches the listing context?
  - **Branch deletion.** Does deleting a branch keep its temporal log
    (cheap to keep, useful for audit) or does it sweep events too?
    Recommendation: keep the log; the branch is a label, deletion is
    just "no future writes on this label".
  - **Cross-branch edges.** `computeBranchFiber` today filters edges by
    "both endpoints on the branch". A `node_update` on X that introduces
    an edge to a main-resident node is a cross-branch edge. Allow,
    forbid, or auto-lift? Recommendation: forbid by default; require an
    explicit lift of the main endpoint first. This preserves the
    fiber's structural integrity.

These are not blockers for picking the materialization model — they are
follow-up choices once Option C is in place.

---

*Updated 2026-05-13 (decision confirmed). Once a model is selected and the user signs off, this
note becomes the canonical reference for the Bootstrap 0.10 implementation
PR. The follow-up work above is recorded in `docs/ROADMAP.md` and tracked
through the milestone reviews.*
