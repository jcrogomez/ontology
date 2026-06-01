// Axiom 6 / §3.2 — compiler functoriality rigor pin.
//
// The prior audit graded F: I → C at T2 because it was "an object map, not a
// functor in the strict sense": the artifact category's morphisms were never
// named, so F(g∘f) = F(g)∘F(f) was unstated. `src/runtime/graph/artifact-category.ts`
// names the artifact category (built from the PLAN OUTPUT, so the check is not
// true-by-construction) and `verifyFunctoriality` checks the three functor
// laws. This file exercises it on the diagrams that actually stress
// composition: a 3-chain with a purely transitive dependency, and a diamond
// (composition through two distinct paths == associativity).

import { describe, it, expect } from "vitest";
import {
  verifyFunctoriality,
  buildArtifactCategory,
} from "../src/runtime/graph/artifact-category.js";
import { computeCompilePlan } from "../src/runtime/graph/compile-plan.js";
import type { OntologyEdge } from "../src/schemas/ontology.js";

function edge(id: string, from: string, to: string, type: OntologyEdge["type"] = "depends_on"): OntologyEdge {
  return {
    edgeId: id,
    from,
    to,
    type,
    branch: "main",
    createdAt: "2026-06-01T00:00:00.000Z",
    createdByEventId: "evt_test",
    integrity: { hash: "h", schemaVersion: "1.0" },
  } as OntologyEdge;
}

describe("Axiom 6 — compiler functor laws", () => {
  it("preserves composition on a linear chain with a PURELY TRANSITIVE dependency", () => {
    // C depends_on B, B depends_on A. There is NO direct C→A edge.
    // In the intention category I the composite morphism C↝A exists
    // (g∘f where f: B→A, g: C→B). Functoriality demands F(g∘f) = F(g)∘F(f):
    // the artifact category must realise C↝A as the composite of C↝B and B↝A.
    const edges = [edge("e1", "C", "B"), edge("e2", "B", "A")];

    const report = verifyFunctoriality("C", edges);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.identityPreserved).toBe(true);
    expect(report.morphismsPreserved).toBe(true);
    expect(report.compositionPreserved).toBe(true);

    // Spell out the composite explicitly: C reaches A in the artifact category
    // even though no direct C→A edge was ever drawn.
    const plan = computeCompilePlan("C", edges);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const C = buildArtifactCategory(plan, edges);
    expect(C.reach.get("C")).toEqual(new Set(["B", "A"]));
    // ...and the direct morphisms are ONLY the drawn edges (composition is
    // derived, not pre-baked), so the check is not circular.
    expect(C.directMorphisms).toEqual([
      { from: "B", to: "A" },
      { from: "C", to: "B" },
    ]);
    // The compile order is a linear extension of the poset: A ≺ B ≺ C.
    expect(C.order).toEqual(["A", "B", "C"]);
  });

  it("preserves composition through two paths of a diamond (associativity)", () => {
    // D→B→A and D→C→A. The composite D↝A can be formed two ways
    // (D→B→A and D→C→A); both must agree — functor composition is associative
    // and well-defined regardless of path.
    const edges = [
      edge("e1", "D", "B"),
      edge("e2", "D", "C"),
      edge("e3", "B", "A"),
      edge("e4", "C", "A"),
    ];
    const report = verifyFunctoriality("D", edges);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);

    const plan = computeCompilePlan("D", edges);
    if (!plan.ok) return;
    const cat = buildArtifactCategory(plan, edges);
    expect(cat.reach.get("D")).toEqual(new Set(["B", "C", "A"]));
    // A is terminal in this diagram (no outgoing dependency).
    expect(cat.reach.get("A")).toEqual(new Set());
  });

  it("identity law: a node with no dependencies maps to a single artifact with no morphisms", () => {
    const report = verifyFunctoriality("X", []);
    expect(report.ok).toBe(true);
    expect(report.identityPreserved).toBe(true);
    const plan = computeCompilePlan("X", []);
    if (!plan.ok) return;
    const cat = buildArtifactCategory(plan, []);
    expect(cat.objects).toEqual(["X"]);
    expect(cat.directMorphisms).toEqual([]);
    expect(cat.reach.get("X")).toEqual(new Set());
  });

  it("functoriality holds across all five hard-dependency edge types", () => {
    // F must be a functor for every morphism class that participates in the
    // intention category, not just depends_on.
    const edges = [
      edge("e1", "X", "A", "depends_on"),
      edge("e2", "A", "B", "refines"),
      edge("e3", "B", "C", "inherits_from"),
      edge("e4", "C", "D", "implements"),
      edge("e5", "D", "E", "uses_token"),
    ];
    const report = verifyFunctoriality("X", edges);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    // The full chain composes: X reaches everything downstream.
    const plan = computeCompilePlan("X", edges);
    if (!plan.ok) return;
    const cat = buildArtifactCategory(plan, edges);
    expect(cat.reach.get("X")).toEqual(new Set(["A", "B", "C", "D", "E"]));
  });

  it("F is undefined on a non-well-formed diagram (cycle) — reported, not silently 'preserved'", () => {
    // A↔B cycle: no topological order exists, so F has no codomain object map.
    // The honest report says planFailed, not ok=true.
    const edges = [edge("e1", "A", "B"), edge("e2", "B", "A")];
    const report = verifyFunctoriality("A", edges);
    expect(report.ok).toBe(false);
    expect(report.planFailed).toBe(true);
    expect(report.compositionPreserved).toBe(false);
  });
});
