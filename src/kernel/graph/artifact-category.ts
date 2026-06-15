// Artifact category — the codomain of the compiler functor F: I → C.
//
// MATHEMATICAL_CLAIMS.md §Axiom 6 / §3.2 graded the compiler "functor" as T2
// because we shipped an *object map* (node ↦ artifact) but never named the
// morphisms of the artifact category, so functoriality F(g∘f) = F(g)∘F(f)
// was unstated and untested. This module names that category explicitly and
// gives a non-circular functoriality check.
//
// Construction (deliberately built from the PLAN OUTPUT, not from the
// intention edges, so the check is not true-by-construction):
//   • objects      = the artifacts the plan actually emits (one per closure node)
//   • direct morph = for each compile step X, the targets Y that X *waited on*,
//                    read back from `step.dependsOn` (edge ids) → Y compiled
//                    before X. This is "depends-on by virtue of compile order".
//   • composition  = transitive closure of the direct morphisms.
//
// F: I → C then sends a node to its artifact and a hard-dependency edge to the
// corresponding artifact morphism. `verifyFunctoriality` confirms the functor
// laws by comparing C (derived from the plan) against I (the intention poset):
//   • identity     — F is a bijection on objects (each node ↦ exactly one
//                    artifact; no node emitted twice).
//   • morphisms    — every intention hard-dep edge in the closure has an image
//                    morphism realised by the compile order (dep precedes
//                    dependent).
//   • composition  — the transitive closure of C equals the transitive closure
//                    of I. This is the functoriality law: a *composite*
//                    intention morphism (e.g. C↝A through B, with no direct
//                    C→A edge) is sent to the *composite* of the images, i.e.
//                    F(g∘f) = F(g)∘F(f).

import type { OntologyEdge } from "../schemas/ontology.js";
import { computeCompilePlan, HARD_DEPENDENCY_EDGE_TYPES, type CompilePlan } from "./compile-plan.js";

type HardEdgeType = (typeof HARD_DEPENDENCY_EDGE_TYPES)[number];

export interface ArtifactCategory {
  /** Emitted artifacts, identified by the source node id. */
  objects: string[];
  /** The linear compile order (a linear extension of the dependency poset). */
  order: string[];
  /** Direct morphisms F(edge): artifact `from` depends on artifact `to`. */
  directMorphisms: Array<{ from: string; to: string }>;
  /** Transitive closure: reach.get(x) = artifacts reachable from x by composing morphisms. */
  reach: Map<string, Set<string>>;
}

function transitiveClosure(objects: string[], directEdges: Array<{ from: string; to: string }>): Map<string, Set<string>> {
  const adj = new Map<string, string[]>();
  for (const o of objects) adj.set(o, []);
  for (const e of directEdges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const reach = new Map<string, Set<string>>();
  for (const o of objects) {
    const seen = new Set<string>();
    const stack = [...(adj.get(o) ?? [])];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) stack.push(m);
    }
    reach.set(o, seen);
  }
  return reach;
}

/** Build the artifact category C from a successful compile plan and the edge set. */
export function buildArtifactCategory(
  plan: Extract<CompilePlan, { ok: true }>,
  edges: OntologyEdge[],
): ArtifactCategory {
  const edgeById = new Map<string, OntologyEdge>();
  for (const e of edges) edgeById.set(e.edgeId, e);

  const objects = plan.steps.map((s) => s.nodeId);
  const order = [...objects];

  // Direct morphisms read back from what each step actually waited on.
  const directMorphisms: Array<{ from: string; to: string }> = [];
  for (const step of plan.steps) {
    for (const edgeId of step.dependsOn) {
      const e = edgeById.get(edgeId);
      if (e) directMorphisms.push({ from: step.nodeId, to: e.to });
    }
  }

  return {
    objects,
    order,
    directMorphisms,
    reach: transitiveClosure(objects, directMorphisms),
  };
}

export interface FunctorialityReport {
  ok: boolean;
  /** Plan failed (cycle/conflict/superseded) — F is undefined on this diagram. */
  planFailed: boolean;
  /** Each closure node maps to exactly one artifact (bijection on objects). */
  identityPreserved: boolean;
  /** Every intention hard-dep edge has an image morphism realised by compile order. */
  morphismsPreserved: boolean;
  /** Transitive closures of I and C agree — F(g∘f) = F(g)∘F(f). */
  compositionPreserved: boolean;
  /** Human-readable notes on any law that failed. */
  violations: string[];
}

/**
 * Verify the compiler functor laws for the diagram rooted at `focalId`.
 *
 * Builds the artifact category from the plan, reconstructs the intention
 * category's hard-dependency poset over the same closure, and checks the
 * three functor laws by comparison. Returns a structured report; `ok` is true
 * iff identity, morphism-preservation and composition-preservation all hold.
 */
export function verifyFunctoriality(focalId: string, edges: OntologyEdge[]): FunctorialityReport {
  const plan = computeCompilePlan(focalId, edges);
  if (!plan.ok) {
    return {
      ok: false,
      planFailed: true,
      identityPreserved: false,
      morphismsPreserved: false,
      compositionPreserved: false,
      violations: [`compile plan failed (${plan.reason}); F is undefined on this diagram`],
    };
  }

  const violations: string[] = [];
  const C = buildArtifactCategory(plan, edges);
  const closure = new Set(plan.closure);

  // --- Identity: bijection on objects (no node emitted twice; objects == closure).
  const identityPreserved =
    C.objects.length === closure.size && new Set(C.objects).size === C.objects.length && C.objects.every((o) => closure.has(o));
  if (!identityPreserved) violations.push("identity: artifact objects are not in bijection with the closure nodes");

  // --- Intention category: hard-dep edges restricted to the closure, plus closure.
  const hardSet = new Set<HardEdgeType>(HARD_DEPENDENCY_EDGE_TYPES);
  const intentionDirect = edges
    .filter((e) => hardSet.has(e.type as HardEdgeType) && closure.has(e.from) && closure.has(e.to))
    .map((e) => ({ from: e.from, to: e.to }));
  const intentionReach = transitiveClosure(plan.closure, intentionDirect);

  // --- Morphisms preserved: every intention edge's image is realised by the
  //     compile order (the dependency precedes the dependent).
  const orderIndex = new Map(C.order.map((id, i) => [id, i] as const));
  let morphismsPreserved = true;
  for (const e of intentionDirect) {
    const fi = orderIndex.get(e.from);
    const ti = orderIndex.get(e.to);
    if (fi === undefined || ti === undefined || ti >= fi) {
      morphismsPreserved = false;
      violations.push(`morphism ${e.from}→${e.to} not realised by compile order (dep must precede dependent)`);
    }
  }

  // --- Composition preserved: the transitive closures agree on every object.
  //     This is the functoriality law proper — composite morphisms in I map to
  //     composite morphisms in C and vice versa.
  let compositionPreserved = true;
  for (const o of plan.closure) {
    const ci = intentionReach.get(o) ?? new Set<string>();
    const ca = C.reach.get(o) ?? new Set<string>();
    const same = ci.size === ca.size && [...ci].every((x) => ca.has(x));
    if (!same) {
      compositionPreserved = false;
      violations.push(
        `composition at ${o}: intention-reach {${[...ci].sort().join(",")}} ≠ artifact-reach {${[...ca].sort().join(",")}}`,
      );
    }
  }

  return {
    ok: identityPreserved && morphismsPreserved && compositionPreserved,
    planFailed: false,
    identityPreserved,
    morphismsPreserved,
    compositionPreserved,
    violations,
  };
}
