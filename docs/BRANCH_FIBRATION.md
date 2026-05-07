# Branch Fibration

Status: experimental, read-only library. No CLI surface yet (see *Future
Work*). All helpers live under `src/runtime/fibration/`.

This module models Ontology branches as a **Grothendieck fibration** over the
base category of operations. It is a pure, additive view: nothing here mutates
state, emits events, or persists artefacts. The library exists so that future
features — branch-aware compile, branch-merge proposals, multi-branch query —
have a single well-typed surface to build on.

## Why this exists

Ontology already records a `coordinates.branch` on every node and a `branch`
field on every edge. The temporal log in `.ontology/events.jsonl` is also
branch-tagged. Today these labels are passive: they decorate records but no
runtime concept treats "the subgraph living on branch X" as a first-class
mathematical object. Several upcoming features need exactly that:

- **Branch-aware compile.** "Compile the fiber over branch *feature/x*" is a
  sharper query than "compile the whole graph and discard whatever is not on
  *feature/x*".
- **Branch-merge proposals.** Merging branches is a natural transformation
  between two functors into a fiber; reasoning about it requires the fibers
  themselves to exist.
- **Multi-branch inspection.** Users want to see "what changed on *feature/x*
  that is not on *main*" without reloading the whole graph.

Modelling the structure as a fibration gives us a single shared vocabulary for
all three.

## Plain-English explanation

A *branch* is a label that every node and edge carries. Imagine the temporal
log of events as a single straight line: that's the **base**. Now imagine that
each event is actually a stack of cards, one card per branch the event might
belong to: that's the **total space**. Looking down the stack, you see the
event; looking sideways across one fixed branch, you see all the events (and
nodes, and edges) that live on that branch — that is the **fiber** over the
branch.

Switching a node from one branch to another is a **cartesian lift**: you keep
everything about the node identical (its kind, its abstraction level, its
manifestation, its prompt, its inputs) and only change which "card in the
stack" it sits on. The library does not actually *create* the lifted node — it
only describes the proposal — because creating it is a graph mutation that
belongs to the proposal pipeline.

## The mathematical model, briefly

A **Grothendieck fibration** is a functor `p: E → B` such that for every
morphism `f: b → b'` in the base and every object `E` over `b'`, there is a
*cartesian* morphism `f̃: E' → E` over `f`. In our case:

| Fibration concept                  | Ontology construct                                                    |
| ---------------------------------- | --------------------------------------------------------------------- |
| Base category `B`                  | The temporal log `.ontology/events.jsonl` viewed as a linear sequence |
| Total category `E`                 | Events tagged by branch (every record carries `branch`)               |
| Functor `p: E → B`                 | Forget the branch label                                               |
| Object over branch `b`             | A node whose `coordinates.branch === b`                               |
| Fiber `p^{-1}(b)`                  | The induced subgraph of nodes + edges on branch `b`                   |
| Base morphism `f: b → b'`          | A "branch relabel" operation                                          |
| Cartesian lift of `f` at node `N`  | A node `N'` over `b'` agreeing with `N` on kind/abstraction/etc.      |
| Natural transformation             | A branch-merge proposal (future work)                                 |

The library implements *fibers* and *cartesian lifts* explicitly. The base
category and the functor `p` are implicit (they are the existing event log and
the existing `coordinates.branch` projection).

### Edges as morphisms in a fiber

A fiber is a category. Its morphisms are edges between nodes that both live on
the same branch. Cross-branch edges (a node on `main` linked to a node on
`feature/x`) are not morphisms in any single fiber — they are not in the fiber
over `main` (the target endpoint is missing) nor in the fiber over `feature/x`
(the source endpoint is missing). The library drops them when computing
fibers; this is the read-only equivalent of the rule that "merging branches
must reconcile cross-branch edges".

## API

### Types

```ts
import type {
  FiberInput,
  BranchFiber,
  BranchProjection,
  CartesianLift,
} from "./runtime/fibration";
```

- `FiberInput` — read-only `{ nodes, edges }` payload. Constructed by the
  caller from `loadNodes()` / `loadEdges()` (or any other source).
- `BranchFiber` — `{ branch, nodes, edges, size }`. The induced subgraph for
  one branch.
- `BranchProjection` — `{ branches, fibers }`. The whole partition.
- `CartesianLift` — the *shape* of a proposed branch relabel. No mutation.

### Functions

```ts
import {
  listBranches,
  computeBranchFiber,
  computeBranchFiberFromArrays,
  computeAllFibers,
  describeCartesianLift,
} from "./runtime/fibration";

// 1. Enumerate every branch in the graph (sorted, deterministic).
const branches = listBranches({ nodes, edges });

// 2. Project to a single branch.
const main = computeBranchFiber({ nodes, edges }, "main");
console.log(main.size); // { nodes: N, edges: M }

// 3. Project all branches at once.
const projection = computeAllFibers({ nodes, edges });
for (const fiber of projection.fibers) {
  console.log(`${fiber.branch}: ${fiber.size.nodes} nodes`);
}

// 4. Describe (do NOT create) the cartesian lift of a node onto another branch.
const lift = describeCartesianLift(node, "feature/x");
// lift.proposed.id is a suggestion ('node_xxx@feature/x'), not a guarantee.
// lift.proposed.coordinates.branch === 'feature/x'.
// All other coordinates are unchanged: kind, abstraction, manifestation, time, plane.
```

### Functor properties (also asserted in tests)

1. **Sub-graph closure.** Every node in `computeBranchFiber(input, "main")
   .nodes` satisfies `n.coordinates.branch === "main"`.
2. **Induced subgraph.** Every edge in a fiber has *both* endpoints in that
   fiber. Cross-branch edges are dropped.
3. **Determinism.** `listBranches` returns lexicographically sorted unique
   branches regardless of input order.
4. **Cartesian preservation.** `describeCartesianLift` changes *only* the
   `branch` coordinate. Kind, abstraction, manifestation (and every other
   field of the node) are passed through verbatim.
5. **Partition.** `computeAllFibers(input).fibers.flatMap(f => f.nodes)` has
   length exactly `input.nodes.length`. Nodes are partitioned by branch.

## CLI surface

There is **no `onto graph fibers` subcommand in this PR.** The existing
`graph` command is registered directly in `src/cli.ts` rather than via a
per-subcommand registration pattern, and adding a fibers subcommand would
require editing `src/cli.ts` — which is owned by the surrounding refactor and
out of scope for this change. The library is fully callable programmatically;
a CLI wrapper is deferred to the follow-up that introduces `onto branch list`
/ `onto branch fiber` / `onto branch lift` (see *Future Work*).

To inspect fibers programmatically today:

```ts
import { loadNodes, loadEdges } from "./core/project/load.js";
import { computeAllFibers } from "./runtime/fibration";

const projection = computeAllFibers({
  nodes: loadNodes(),
  edges: loadEdges(),
});
console.log(JSON.stringify(projection, null, 2));
```

## Future work

This module deliberately stops short. Each item below is intentionally not
implemented here so the read-only surface stays tiny.

- **`onto branch` CLI verbs.** A future PR can add `onto branch list`
  (wraps `listBranches`), `onto branch fiber <name>` (wraps
  `computeBranchFiber`), and `onto branch lift <id> <target>` (wraps
  `describeCartesianLift` and routes the result into the proposal pipeline).
- **Branch-aware compile.** `compile-plan` currently iterates over the whole
  graph. A `compile --branch <name>` mode can call `computeBranchFiber` once
  and feed the resulting subgraph into the existing pipeline.
- **Branch-merge proposals.** A merge from branch `a` into branch `b` is a
  natural transformation `η: F_a ⇒ F_b` where `F_a, F_b: I → Fiber` pick out
  the per-branch images of a shared diagram `I`. The library does not yet
  expose `BranchMergeProposal`; once it does, the proposal pipeline can
  re-use the existing parent-hash invariants to validate each component of
  the transformation.
- **Multi-branch query.** `onto graph fibers --diff main feature/x` would
  surface "nodes in `feature/x` that are not on `main`" and vice versa. The
  building blocks (`computeBranchFiber`, `describeCartesianLift`) are
  already in place.
- **Persistence of cartesian lifts.** Once branch-aware proposals exist,
  `describeCartesianLift` becomes the canonical builder for
  `ProposalNodeCreatePayload` records that materialise on a different
  branch. The `proposed.id` suggestion is intentionally just a hint; the
  proposal pipeline owns id generation.
