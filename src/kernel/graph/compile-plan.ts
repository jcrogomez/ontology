// Compile plan computation: Kahn's topological sort over a node's dependency
// closure. Read-only, deterministic, cycle-detecting. The plan is the
// pre-computed order in which the eventual compiler (Bootstrap 0.8) will
// dispatch each node's prompt against the model. Today this PR exposes the
// plan as a *preview* — through `onto compile --plan` and the walker's
// `:plan` command — so users can validate topology before any artifact
// generation lands.
//
// Edge type semantics (see WALKER_INTERFACE.md "Topology-driven compilation"):
//   HARD dependency       → must compile before
//   validates_against     → parallel pass, not in plan order
//   documents / tests     → post-pass, not in plan order
//   runtime relationships → not in plan order at all
//   contradicts           → halt with conflict (this PR)
//   supersedes            → predecessor excluded from closure (this PR)
//
// The closure walk uses the HARD_DEPENDENCY_EDGE_TYPES family. After the
// closure is computed we apply two post-filters that close axiom 8:
//   1. supersedes(X, Y) inside the closure means X is the canonical version
//      and Y is deprecated. We drop Y from the closure (with a warning),
//      since Y must not be re-emitted now that X exists. If the focal
//      itself is superseded we halt loudly: a user trying to compile a
//      deprecated node deserves an explicit message rather than a silently
//      retargeted plan.
//   2. contradicts(X, Y) inside the closure means the user's graph is
//      internally inconsistent. We halt with reason="conflict" and report
//      the offending pair so the user can fix the contradiction explicitly
//      (axiom 8: contradictions must surface as failures, not be papered
//      over).

import type { OntologyEdge } from "../schemas/ontology.js";

export const HARD_DEPENDENCY_EDGE_TYPES = [
  "depends_on",
  "inherits_from",
  "refines",
  "implements",
  "uses_token",
] as const satisfies readonly OntologyEdge["type"][];

type HardDependencyEdgeType = (typeof HARD_DEPENDENCY_EDGE_TYPES)[number];

export interface CompileStep {
  // The node compiled at this step.
  nodeId: string;
  // Edge ids of the hard dependencies this node waits on. Empty for nodes
  // with no dependencies in the closure (those compile first).
  dependsOn: string[];
}

// A non-fatal note attached to a successful plan. Today the only carrier is
// "node Y excluded because X supersedes it"; the structure is open so future
// passes (e.g., dead-token detection) can attach their own observations.
export interface CompilePlanWarning {
  kind: "superseded";
  // The successor (kept in the closure).
  successor: string;
  // The predecessor (excluded from the closure).
  predecessor: string;
}

// Reported pair when the closure contains a contradicts edge.
export interface CompilePlanConflict {
  // The endpoints of the offending `contradicts` edge.
  from: string;
  to: string;
  edgeId: string;
}

export type CompilePlan =
  | { ok: true; focalId: string; steps: CompileStep[]; closure: string[]; warnings: CompilePlanWarning[] }
  | {
      ok: false;
      // "cycle" — a dependency cycle was detected within the closure; no
      // valid topological order exists. The set of nodes that could not be
      // sequenced is reported under `unresolved`.
      reason: "cycle";
      focalId: string;
      partialSteps: CompileStep[];
      unresolved: string[];
    }
  | {
      ok: false;
      // "conflict" — the closure contains at least one `contradicts` edge.
      // Axiom 8: explicit failure rather than an order-of-compilation arbiter.
      reason: "conflict";
      focalId: string;
      conflicts: CompilePlanConflict[];
    }
  | {
      ok: false;
      // "superseded_focal" — the user requested a compile rooted at a node
      // that is itself superseded by another. A silent retarget would mask
      // a stale reference; we halt and name the successor so the caller
      // knows what to compile instead.
      reason: "superseded_focal";
      focalId: string;
      successor: string;
    };

// Compute the compile plan rooted at `focalId`. The plan begins with the
// transitive dependency closure of the focal — the focal itself and every
// node reachable by walking the focal's outgoing hard-dependency edges.
// Steps are emitted in dependency order: a node never appears before any of
// its hard dependencies inside the closure. The focal is the LAST step in a
// well-formed plan.
//
// Determinism: ties between independent nodes are broken alphabetically by
// id, so two runs over the same graph produce the same plan.
export function computeCompilePlan(focalId: string, edges: OntologyEdge[]): CompilePlan {
  const hardSet = new Set<HardDependencyEdgeType>(HARD_DEPENDENCY_EDGE_TYPES);
  const dependencyEdges = edges.filter(e => hardSet.has(e.type as HardDependencyEdgeType));

  // First pass — supersedes index. An edge from=X, to=Y, type=supersedes
  // means X is the canonical successor and Y is the deprecated predecessor.
  // Many successors per predecessor is technically possible (chained
  // deprecations); we record the first encountered successor for messaging
  // and excluded predecessors are tracked as a Set.
  const supersededBy = new Map<string, string>();
  for (const e of edges) {
    if (e.type === "supersedes" && !supersededBy.has(e.to)) {
      supersededBy.set(e.to, e.from);
    }
  }

  // Halt early if the focal itself is superseded — silent retargeting would
  // mask a stale reference. Name the successor so the caller can re-issue
  // the compile against it explicitly.
  if (supersededBy.has(focalId)) {
    return {
      ok: false,
      reason: "superseded_focal",
      focalId,
      successor: supersededBy.get(focalId)!,
    };
  }

  // BFS the closure following X→Y where the edge is a dependency. X depends
  // on Y means we must include Y because X cannot compile without it. Skip
  // any node that is superseded — its successor (if also reachable) carries
  // the canonical version; if the successor is NOT reachable the predecessor
  // would be silently dropped, which is what `supersedes` means.
  const adjOut = new Map<string, OntologyEdge[]>();
  for (const e of dependencyEdges) {
    if (!adjOut.has(e.from)) adjOut.set(e.from, []);
    adjOut.get(e.from)!.push(e);
  }

  const closure = new Set<string>();
  const stack: string[] = [focalId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (closure.has(id)) continue;
    if (supersededBy.has(id)) continue; // excluded — see Edge type semantics
    closure.add(id);
    for (const e of adjOut.get(id) ?? []) {
      if (!closure.has(e.to) && !supersededBy.has(e.to)) stack.push(e.to);
    }
  }

  // Halt if the closure contains a `contradicts` edge — axiom 8 demands
  // contradictions surface as explicit failures, not as a planning order
  // arbitrated by topological sort.
  const conflicts: CompilePlanConflict[] = [];
  for (const e of edges) {
    if (e.type === "contradicts" && closure.has(e.from) && closure.has(e.to)) {
      conflicts.push({ from: e.from, to: e.to, edgeId: e.edgeId });
    }
  }
  if (conflicts.length > 0) {
    conflicts.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    return { ok: false, reason: "conflict", focalId, conflicts };
  }

  // Collect the warnings for any superseded predecessors that were reachable
  // from the focal (i.e., the user's graph still references them via hard
  // deps). The closure already excludes these; warning surfaces them so the
  // caller can clean the graph at their leisure.
  const warnings: CompilePlanWarning[] = [];
  for (const e of edges) {
    if (e.type !== "supersedes") continue;
    // Predecessor was reachable via deps from focal? Cheap test: any hard-dep
    // edge in the closure points to it.
    const reachable = dependencyEdges.some(d => d.to === e.to && closure.has(d.from));
    if (reachable || focalId === e.to) {
      warnings.push({ kind: "superseded", successor: e.from, predecessor: e.to });
    }
  }
  warnings.sort((a, b) => a.predecessor.localeCompare(b.predecessor));

  // Build inDeg counts inside the closure. inDeg[X] = how many hard deps X
  // still has unresolved. A node with inDeg 0 can compile next.
  const inDeg = new Map<string, number>();
  for (const id of closure) inDeg.set(id, 0);
  for (const e of dependencyEdges) {
    if (closure.has(e.from) && closure.has(e.to)) {
      inDeg.set(e.from, (inDeg.get(e.from) ?? 0) + 1);
    }
  }

  // Sorted ready queue keeps the result deterministic.
  const ready: string[] = Array.from(closure).filter(id => (inDeg.get(id) ?? 0) === 0).sort();

  const steps: CompileStep[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    const stepDeps = dependencyEdges
      .filter(e => e.from === id && closure.has(e.to))
      .map(e => e.edgeId)
      .sort();
    steps.push({ nodeId: id, dependsOn: stepDeps });

    // Compiling `id` removes one outgoing dependency from anyone that depends
    // on `id` — i.e., for each raw edge e where e.to === id and e.from is
    // inside the closure, decrement inDeg[e.from]. When that hits 0 they're
    // ready to compile.
    const newlyReady: string[] = [];
    for (const e of dependencyEdges) {
      if (e.to === id && closure.has(e.from)) {
        const nd = (inDeg.get(e.from) ?? 0) - 1;
        inDeg.set(e.from, nd);
        if (nd === 0) newlyReady.push(e.from);
      }
    }
    if (newlyReady.length > 0) {
      // Re-sort the ready queue when new entries land so determinism holds
      // for any input ordering.
      ready.push(...newlyReady);
      ready.sort();
    }
  }

  if (steps.length < closure.size) {
    const sequenced = new Set(steps.map(s => s.nodeId));
    return {
      ok: false,
      reason: "cycle",
      focalId,
      partialSteps: steps,
      unresolved: Array.from(closure).filter(id => !sequenced.has(id)).sort(),
    };
  }

  return {
    ok: true,
    focalId,
    steps,
    closure: Array.from(closure).sort(),
    warnings,
  };
}
