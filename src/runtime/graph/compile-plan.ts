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
//   contradicts           → halt with conflict (not yet enforced here)
//   supersedes            → predecessor excluded (not yet enforced here)
//
// This v0 of the helper handles ONLY the hard-dependency family. The other
// edge semantics are documented in the RFC and will be wired in as the
// compiler grows; v0 is sufficient for the hello-world path because a
// minimum graph uses depends_on / refines / inherits_from / implements / uses_token.

import type { OntologyEdge } from "../../schemas/ontology.js";

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

export type CompilePlan =
  | { ok: true; focalId: string; steps: CompileStep[]; closure: string[] }
  | {
      ok: false;
      // "cycle" — a dependency cycle was detected within the closure; no
      // valid topological order exists. The set of nodes that could not be
      // sequenced is reported under `unresolved`.
      reason: "cycle";
      focalId: string;
      partialSteps: CompileStep[];
      unresolved: string[];
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

  // BFS the closure following X→Y where the edge is a dependency. X depends
  // on Y means we must include Y because X cannot compile without it.
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
    closure.add(id);
    for (const e of adjOut.get(id) ?? []) {
      if (!closure.has(e.to)) stack.push(e.to);
    }
  }

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
  };
}
