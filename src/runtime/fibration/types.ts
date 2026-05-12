// Types for the branch fibration view of the Ontology graph.
//
// The base category B is the linear sequence of events (the temporal log).
// The total category E is "labelled events" — events tagged with a branch.
// The functor p: E → B forgets the branch label. A *fiber* over a branch b
// is the subgraph of nodes and edges that live on branch b.
//
// All types here are read-only: nothing in this module mutates state. The
// `CartesianLift` shape *describes* the proposed projection of a node from
// one branch to another; it does not actually create the lifted node.

import type { OntologyNode, OntologyEdge } from "../../schemas/ontology.js";

// A FiberInput is the read-only payload required to compute fibers. It does
// not depend on `OntologyState` because the canonical state object is just
// metadata; the actual nodes and edges live in their own loaders. Keeping
// the input narrow lets tests construct fixtures without touching disk and
// lets future callers (e.g. branch-aware compile, branch-merge proposals)
// pass slices of the graph directly.
export interface FiberInput {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
}

// A BranchFiber is the induced subgraph for a single branch.
//   - `nodes`  : every node whose `coordinates.branch === branch`.
//   - `edges`  : every edge whose endpoints are *both* in the fiber. Edges
//                are filtered structurally (induced subgraph) regardless of
//                the edge's own `branch` field, because membership is
//                determined by node membership: an edge between a `main`
//                node and a `feature/x` node does not belong to either
//                fiber as a *category-theoretic morphism in the fiber*.
//   - `size`   : convenience cardinalities. Always equal to `.nodes.length`
//                and `.edges.length` — surfaced for ergonomic logging.
export interface BranchFiber {
  branch: string;
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  size: { nodes: number; edges: number };
}

// A FiberByLabel<T> is the generic shape `computeFiberBy` returns
// (Project Legend Phase β-3). Mirrors BranchFiber but with the label
// type parameterised so the same library powers both the temporal
// branch fibration (T = string branch name) and the spatial path
// fibration (T = string directory path). T must be usable as a Map
// key — a plain string is the canonical case.
//
// `BranchFiber` stays as the named alias for the branch case (callers
// import it directly today, and the `branch` field name reads better
// in that context than the generic `label`).
export interface FiberByLabel<T> {
  label: T;
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  size: { nodes: number; edges: number };
}

// A BranchProjection is the result of `computeAllFibers`: the partition of
// the graph into per-branch fibers. The base sequence — the unique sorted
// list of branches that appear in the input — is surfaced explicitly so
// downstream consumers do not have to recompute it.
export interface BranchProjection {
  branches: string[];
  fibers: BranchFiber[];
}

// A CartesianLift describes the proposed re-labelling of a node from one
// branch to another. In fibration language: given a base morphism
// f: b → b' (a branch relabel) and a node N over b, the cartesian lift of
// f at N is a node N' over b' that agrees with N along p (i.e. has the
// same kind, abstraction, manifestation, and other base-invariant data).
// We do NOT mutate or persist; we only describe the proposal. The actual
// creation of N' is the responsibility of the (future) branch-aware
// proposal pipeline.
export interface CartesianLift {
  source: { node: OntologyNode; branch: string };
  targetBranch: string;
  proposed: {
    id: string;
    coordinates: OntologyNode["coordinates"];
  };
  // Documentation of which invariants the lift preserves. These are always
  // `true` for a well-formed cartesian lift; the fields exist so callers can
  // assert against the contract and so the surface reads as a category
  // diagram rather than a magic constant.
  preserves: {
    kind: true;
    abstraction: true;
    manifestation: true;
  };
}
