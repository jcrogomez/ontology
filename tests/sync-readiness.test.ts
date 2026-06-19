import { describe, it, expect } from "vitest";
import { computeSyncReadiness } from "../src/kernel/graph/sync-readiness.js";
import type { OntologyEdge } from "../src/kernel/schemas/ontology.js";

// dep edge: `from` depends on `to` (to is "below" from in the order).
function dep(from: string, to: string): OntologyEdge {
  return {
    edgeId: `edge_${from}_${to}`,
    from,
    to,
    type: "depends_on",
    branch: "main",
    createdAt: "2026-06-18T00:00:00.000Z",
    createdByEventId: "evt",
    integrity: { hash: "h", schemaVersion: "1" },
  } as unknown as OntologyEdge;
}

const S = (...ids: string[]) => new Set(ids);

describe("computeSyncReadiness — the syncable order ideal", () => {
  it("a fully-ready chain is entirely in the ideal", () => {
    // A → B → C (A depends on B depends on C)
    const r = computeSyncReadiness({
      shadowed: S("A", "B", "C"),
      ready: S("A", "B", "C"),
      edges: [dep("A", "B"), dep("B", "C")],
    });
    expect(r.ideal).toEqual(["A", "B", "C"]);
    expect(r.blockedReady).toEqual([]);
    expect(r.blockers).toEqual([]);
    expect(r.frontier).toEqual([]);
  });

  it("an unready LEAF blocks everything above it (high leverage)", () => {
    // C not ready; A and B both transitively depend on it.
    const r = computeSyncReadiness({
      shadowed: S("A", "B", "C"),
      ready: S("A", "B"),
      edges: [dep("A", "B"), dep("B", "C")],
    });
    expect(r.ideal).toEqual([]); // nothing batch-syncable: all need C
    expect(r.blockedReady).toEqual(["A", "B"]); // atomically fine, blocked from below
    expect(r.blockers).toEqual([{ nodeId: "C", blockedDescendants: 2 }]);
    expect(r.frontier).toEqual(["C"]); // fix C first
  });

  it("an unready TOP node blocks nothing; the down-set below it stays in the ideal", () => {
    const r = computeSyncReadiness({
      shadowed: S("A", "B", "C"),
      ready: S("B", "C"),
      edges: [dep("A", "B"), dep("B", "C")],
    });
    expect(r.ideal).toEqual(["B", "C"]);
    expect(r.blockedReady).toEqual([]);
    expect(r.blockers).toEqual([{ nodeId: "A", blockedDescendants: 0 }]);
    expect(r.frontier).toEqual(["A"]);
  });

  it("ranks blockers by transitive dependents and picks the deepest as the antichain", () => {
    // diamond: TOP → L, TOP → R, L → BASE, R → BASE. BASE and L unready.
    const r = computeSyncReadiness({
      shadowed: S("TOP", "L", "R", "BASE"),
      ready: S("TOP", "R"),
      edges: [dep("TOP", "L"), dep("TOP", "R"), dep("L", "BASE"), dep("R", "BASE")],
    });
    // BASE blocks TOP, L, R (3); L blocks TOP (1).
    expect(r.blockers).toEqual([
      { nodeId: "BASE", blockedDescendants: 3 },
      { nodeId: "L", blockedDescendants: 1 },
    ]);
    // L has BASE (a blocker) below it → not minimal. BASE is the fix-first antichain.
    expect(r.frontier).toEqual(["BASE"]);
    expect(r.ideal).toEqual([]); // everything needs BASE
  });

  it("abstract (non-shadowed) dependencies are transparent — they neither block nor count", () => {
    // A depends on X (abstract, no shadow) which depends on C (ready).
    const r = computeSyncReadiness({
      shadowed: S("A", "C"), // X is not shadowed
      ready: S("A", "C"),
      edges: [dep("A", "X"), dep("X", "C")],
    });
    expect(r.ideal).toEqual(["A", "C"]); // X doesn't break the closure
    expect(r.blockers).toEqual([]);
  });

  it("independent ready nodes with no edges are all in the ideal", () => {
    const r = computeSyncReadiness({ shadowed: S("A", "B"), ready: S("A", "B"), edges: [] });
    expect(r.ideal).toEqual(["A", "B"]);
  });
});

// The ideal behaves as an order-theoretic CLOSURE/selection operator on the
// ready set. These properties are the T1 anchor for the (B) framing: the
// trustworthy core can only GROW as readiness grows — "adding a fixture or
// fixing extraction never shrinks the batch-syncable set". A violation at the
// graph level would mean a governance regression (e.g. a node silently lost).
describe("computeSyncReadiness — closure-operator properties", () => {
  const EDGES = [dep("TOP", "L"), dep("TOP", "R"), dep("L", "BASE"), dep("R", "BASE")];
  const SH = S("TOP", "L", "R", "BASE");

  it("extensive-by-selection: every ideal member is itself ready", () => {
    const r = computeSyncReadiness({ shadowed: SH, ready: S("TOP", "R", "BASE"), edges: EDGES });
    expect(r.ideal.every((id) => S("TOP", "R", "BASE").has(id))).toBe(true);
  });

  it("down-closed: every shadowed dependency of an ideal member is also in the ideal", () => {
    const r = computeSyncReadiness({ shadowed: SH, ready: SH, edges: EDGES });
    const ideal = new Set(r.ideal);
    // BASE below L,R,TOP; if TOP is ideal so must be L,R,BASE.
    if (ideal.has("TOP")) expect(["L", "R", "BASE"].every((d) => ideal.has(d))).toBe(true);
  });

  it("MONOTONE: ready ⊆ ready' ⟹ ideal(ready) ⊆ ideal(ready')", () => {
    const ladder = [
      S("R"),
      S("R", "BASE"),
      S("R", "BASE", "L"),
      S("R", "BASE", "L", "TOP"),
    ];
    let prev: string[] = [];
    for (const ready of ladder) {
      const ideal = computeSyncReadiness({ shadowed: SH, ready, edges: EDGES }).ideal;
      // each step only ADDS to the ideal — never removes
      expect(prev.every((id) => ideal.includes(id))).toBe(true);
      prev = ideal;
    }
    // the top of the ladder (everything ready) is the whole graph
    expect(prev.sort()).toEqual(["BASE", "L", "R", "TOP"]);
  });

  it("idempotent selection: the ideal of an already-ideal ready-set is itself", () => {
    const first = computeSyncReadiness({ shadowed: SH, ready: SH, edges: EDGES }).ideal;
    const second = computeSyncReadiness({ shadowed: SH, ready: new Set(first), edges: EDGES }).ideal;
    expect(second).toEqual(first);
  });
});
