import { describe, it, expect } from "vitest";
import { computeCompilePlan } from "../src/runtime/graph/compile-plan.js";
import type { OntologyEdge } from "../src/schemas/ontology.js";

function edge(id: string, from: string, to: string, type: OntologyEdge["type"] = "depends_on"): OntologyEdge {
  return {
    edgeId: id,
    from,
    to,
    type,
    branch: "main",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdByEventId: "evt_test",
    integrity: { hash: "h", schemaVersion: "1.0" },
  } as OntologyEdge;
}

describe("computeCompilePlan", () => {
  it("returns a single-step plan for a node with no dependencies", () => {
    const plan = computeCompilePlan("X", []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.steps).toEqual([{ nodeId: "X", dependsOn: [] }]);
    expect(plan.closure).toEqual(["X"]);
  });

  it("orders dependencies before dependents along a linear chain", () => {
    // C depends_on B depends_on A. To compile C: A first, then B, then C.
    const edges = [
      edge("e1", "C", "B"),
      edge("e2", "B", "A"),
    ];
    const plan = computeCompilePlan("C", edges);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.steps.map(s => s.nodeId)).toEqual(["A", "B", "C"]);
  });

  it("handles a diamond: two intermediate deps both pointing at the same root", () => {
    // D depends_on B, C; B depends_on A; C depends_on A.
    const edges = [
      edge("e1", "D", "B"),
      edge("e2", "D", "C"),
      edge("e3", "B", "A"),
      edge("e4", "C", "A"),
    ];
    const plan = computeCompilePlan("D", edges);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const seq = plan.steps.map(s => s.nodeId);
    expect(seq[0]).toBe("A");          // A has no deps → first
    expect(seq[seq.length - 1]).toBe("D");  // D depends on everything → last
    // B and C are independent; deterministic alpha tiebreak puts B before C.
    expect(seq.indexOf("B")).toBeLessThan(seq.indexOf("C"));
    expect(plan.closure.sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("respects all hard-dependency edge types (depends_on, refines, inherits_from, implements, uses_token)", () => {
    const edges = [
      edge("e1", "X", "A", "depends_on"),
      edge("e2", "X", "B", "refines"),
      edge("e3", "X", "C", "inherits_from"),
      edge("e4", "X", "D", "implements"),
      edge("e5", "X", "E", "uses_token"),
    ];
    const plan = computeCompilePlan("X", edges);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // All five dependency types must contribute the dep to the closure.
    expect(plan.closure.sort()).toEqual(["A", "B", "C", "D", "E", "X"]);
    // X compiles last.
    expect(plan.steps[plan.steps.length - 1].nodeId).toBe("X");
  });

  it("ignores non-hard edge types (validates_against, documents, tests, etc.)", () => {
    const edges = [
      edge("e1", "X", "A", "validates_against"),
      edge("e2", "X", "B", "documents"),
      edge("e3", "X", "C", "tests"),
      edge("e4", "X", "D", "emits"),
    ];
    const plan = computeCompilePlan("X", edges);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // None of those edge types contribute deps to the plan.
    expect(plan.closure).toEqual(["X"]);
    expect(plan.steps.map(s => s.nodeId)).toEqual(["X"]);
  });

  it("detects a cycle and reports the unresolved nodes", () => {
    // A depends_on B, B depends_on A — cycle.
    const edges = [
      edge("e1", "A", "B"),
      edge("e2", "B", "A"),
    ];
    const plan = computeCompilePlan("A", edges);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("cycle");
    expect(plan.unresolved.sort()).toEqual(["A", "B"]);
    expect(plan.partialSteps).toEqual([]); // nothing was sequenced
  });

  it("partial sequencing when only part of the closure cycles", () => {
    // ROOT depends_on A. A is a clean leaf.
    // BAD1 depends_on BAD2, BAD2 depends_on BAD1 (cycle). BAD1 also depends_on A.
    // ROOT depends_on BAD1, so the cycle is reachable from ROOT.
    const edges = [
      edge("e1", "ROOT", "A"),
      edge("e2", "ROOT", "BAD1"),
      edge("e3", "BAD1", "BAD2"),
      edge("e4", "BAD2", "BAD1"),
      edge("e5", "BAD1", "A"),
    ];
    const plan = computeCompilePlan("ROOT", edges);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("cycle");
    // A is the one node with no deps — it should be sequenced before the
    // cycle is detected.
    expect(plan.partialSteps[0].nodeId).toBe("A");
    expect(plan.unresolved.sort()).toEqual(["BAD1", "BAD2", "ROOT"]);
  });

  it("returns a deterministic order across runs (alpha tiebreak)", () => {
    // Three independent leaves; all are dependencies of FOCAL.
    const edges = [
      edge("e1", "FOCAL", "Z"),
      edge("e2", "FOCAL", "M"),
      edge("e3", "FOCAL", "A"),
    ];
    const a = computeCompilePlan("FOCAL", edges);
    const b = computeCompilePlan("FOCAL", edges);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Same input must produce same step order.
    expect(a.steps.map(s => s.nodeId)).toEqual(b.steps.map(s => s.nodeId));
    // Alpha tiebreak: A before M before Z, then FOCAL last.
    expect(a.steps.map(s => s.nodeId)).toEqual(["A", "M", "Z", "FOCAL"]);
  });

  it("each step records the edge ids it depends on", () => {
    const edges = [
      edge("e_xa", "X", "A"),
      edge("e_xb", "X", "B"),
    ];
    const plan = computeCompilePlan("X", edges);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const xStep = plan.steps.find(s => s.nodeId === "X")!;
    expect(xStep.dependsOn.sort()).toEqual(["e_xa", "e_xb"]);
    const aStep = plan.steps.find(s => s.nodeId === "A")!;
    expect(aStep.dependsOn).toEqual([]);
  });

  it("excludes edges whose far endpoint is outside the closure", () => {
    // FOCAL depends on A. A is dependency-free. There's also a wandering
    // edge OUTSIDE → SOMEWHERE that should not influence the plan.
    const edges = [
      edge("e1", "FOCAL", "A"),
      edge("e2", "OUTSIDE", "SOMEWHERE"),
    ];
    const plan = computeCompilePlan("FOCAL", edges);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.closure).toEqual(["A", "FOCAL"]);
  });

  describe("contradicts edges (axiom 8 — explicit failure)", () => {
    it("halts with reason='conflict' when the closure contains a contradicts edge", () => {
      // FOCAL depends on A, FOCAL also contradicts A. Both are inside the
      // closure → axiom 8 says fail loud, do not arbitrate the order.
      const edges = [
        edge("e1", "FOCAL", "A", "depends_on"),
        edge("e2", "FOCAL", "A", "contradicts"),
      ];
      const plan = computeCompilePlan("FOCAL", edges);
      expect(plan.ok).toBe(false);
      if (plan.ok) return;
      expect(plan.reason).toBe("conflict");
      if (plan.reason !== "conflict") return;
      expect(plan.conflicts).toEqual([
        { from: "FOCAL", to: "A", edgeId: "e2" },
      ]);
    });

    it("ignores contradicts edges between nodes that are NOT both in the closure", () => {
      // A and B contradict each other but neither is in FOCAL's closure.
      // The plan succeeds; the contradiction is irrelevant to this compile.
      const edges = [
        edge("e1", "A", "B", "contradicts"),
        // FOCAL has no deps; closure = {FOCAL}.
      ];
      const plan = computeCompilePlan("FOCAL", edges);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.closure).toEqual(["FOCAL"]);
    });

    it("reports multiple contradicts edges in deterministic order", () => {
      const edges = [
        edge("e1", "FOCAL", "A", "depends_on"),
        edge("e2", "FOCAL", "B", "depends_on"),
        edge("e3", "B", "A", "contradicts"),
        edge("e4", "A", "B", "contradicts"),
      ];
      const plan = computeCompilePlan("FOCAL", edges);
      expect(plan.ok).toBe(false);
      if (plan.ok) return;
      expect(plan.reason).toBe("conflict");
      if (plan.reason !== "conflict") return;
      expect(plan.conflicts.map(c => c.edgeId)).toEqual(["e3", "e4"]);
    });
  });

  describe("supersedes edges (axiom 8 — predecessor excluded)", () => {
    it("excludes a superseded predecessor from the closure (and warns)", () => {
      // V2 supersedes V1. FOCAL depends on V2 (canonical); V1 is not
      // referenced from focal directly, but if it were the closure-walk
      // would skip it.
      const edges = [
        edge("e1", "FOCAL", "V2", "depends_on"),
        edge("e2", "V2", "V1", "supersedes"),
        // Suppose V2 still has an inherited dep on V1's parent A:
        edge("e3", "V2", "A", "depends_on"),
      ];
      const plan = computeCompilePlan("FOCAL", edges);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.closure).toEqual(["A", "FOCAL", "V2"]);
      expect(plan.closure).not.toContain("V1");
    });

    it("emits a warning when a superseded predecessor is reachable via hard deps", () => {
      // FOCAL depends on V1 directly (the user has a stale ref). V2
      // supersedes V1. The closure walk drops V1; the warning surfaces.
      const edges = [
        edge("e1", "FOCAL", "V1", "depends_on"),
        edge("e2", "V2", "V1", "supersedes"),
      ];
      const plan = computeCompilePlan("FOCAL", edges);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.closure).not.toContain("V1");
      expect(plan.warnings).toEqual([
        { kind: "superseded", successor: "V2", predecessor: "V1" },
      ]);
    });

    it("halts with reason='superseded_focal' when the focal itself is deprecated", () => {
      // V2 supersedes V1; the user asks for a compile of V1.
      const edges = [
        edge("e1", "V2", "V1", "supersedes"),
      ];
      const plan = computeCompilePlan("V1", edges);
      expect(plan.ok).toBe(false);
      if (plan.ok) return;
      expect(plan.reason).toBe("superseded_focal");
      if (plan.reason !== "superseded_focal") return;
      expect(plan.successor).toBe("V2");
    });

    it("a non-superseded compile produces an empty warnings array (regression guard)", () => {
      const plan = computeCompilePlan("X", []);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.warnings).toEqual([]);
    });
  });
});
