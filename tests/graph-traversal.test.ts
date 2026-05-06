import { describe, it, expect } from "vitest";
import {
  getNeighbors,
  findShortestPath,
  extractSubgraph,
} from "../src/runtime/graph/traversal.js";
import type { OntologyEdge } from "../src/schemas/ontology.js";

// Compact edge factory for fixtures.
function edge(id: string, from: string, to: string, type: OntologyEdge["type"]): OntologyEdge {
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

describe("getNeighbors", () => {
  const edges = [
    edge("e1", "A", "B", "depends_on"),
    edge("e2", "A", "C", "documents"),
    edge("e3", "D", "A", "refines"),
  ];

  it("returns both incoming and outgoing neighbors by default", () => {
    const result = getNeighbors("A", edges);
    expect(result.length).toBe(3);
    const ids = new Set(result.map(r => r.neighborId));
    expect(ids).toEqual(new Set(["B", "C", "D"]));
  });

  it("--direction out only surfaces outgoing edges", () => {
    const result = getNeighbors("A", edges, { direction: "out" });
    expect(result.map(r => r.neighborId).sort()).toEqual(["B", "C"]);
    expect(result.every(r => r.direction === "out")).toBe(true);
  });

  it("--direction in only surfaces incoming edges", () => {
    const result = getNeighbors("A", edges, { direction: "in" });
    expect(result.map(r => r.neighborId)).toEqual(["D"]);
    expect(result.every(r => r.direction === "in")).toBe(true);
  });

  it("edgeTypes filter narrows by type", () => {
    const result = getNeighbors("A", edges, { edgeTypes: ["depends_on"] });
    expect(result.map(r => r.neighborId)).toEqual(["B"]);
  });

  it("returns an empty list when the focal has no incident edges", () => {
    expect(getNeighbors("Z", edges)).toEqual([]);
  });
});

describe("findShortestPath", () => {
  // A graph with two routes from S to T:
  //   S → M1 → M2 → T   (3 hops, type=depends_on)
  //   S → DIRECT → T    (2 hops, type=refines)
  const edges = [
    edge("e1", "S", "M1", "depends_on"),
    edge("e2", "M1", "M2", "depends_on"),
    edge("e3", "M2", "T", "depends_on"),
    edge("e4", "S", "DIRECT", "refines"),
    edge("e5", "DIRECT", "T", "refines"),
    edge("e6", "S", "DEAD", "documents"),
  ];

  it("returns an empty path when from === to", () => {
    expect(findShortestPath("X", "X", edges)).toEqual([]);
  });

  it("returns the BFS shortest path", () => {
    const path = findShortestPath("S", "T", edges);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
    expect(path![0].from).toBe("S");
    expect(path![1].to).toBe("T");
  });

  it("respects edgeTypes filter and finds the longer typed route", () => {
    const path = findShortestPath("S", "T", edges, { edgeTypes: ["depends_on"] });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
  });

  it("returns null when no typed path exists", () => {
    const path = findShortestPath("S", "T", edges, { edgeTypes: ["validates_against"] });
    expect(path).toBeNull();
  });

  it("returns null when target is unreachable", () => {
    const path = findShortestPath("DEAD", "T", edges);
    expect(path).toBeNull();
  });

  it("respects --max-depth: a too-short bound rejects longer paths", () => {
    const path = findShortestPath("S", "T", edges, { edgeTypes: ["depends_on"], maxDepth: 2 });
    expect(path).toBeNull();
  });

  it("does not walk edges in reverse: backwards traversal is excluded", () => {
    // Edge points S→T; asking T→S should fail because we don't traverse backwards.
    const fwdEdges = [edge("e1", "S", "T", "depends_on")];
    expect(findShortestPath("T", "S", fwdEdges)).toBeNull();
    expect(findShortestPath("S", "T", fwdEdges)).toEqual([fwdEdges[0]]);
  });
});

describe("extractSubgraph", () => {
  // A small graph centered at FOCAL:
  //   FOCAL — depends_on → A — depends_on → B
  //   C — documents → FOCAL
  //   FAR — depends_on → B  (so FAR is 3 hops from FOCAL)
  const edges = [
    edge("e1", "FOCAL", "A", "depends_on"),
    edge("e2", "A", "B", "depends_on"),
    edge("e3", "C", "FOCAL", "documents"),
    edge("e4", "FAR", "B", "depends_on"),
  ];

  it("depth=0 returns just the focal node", () => {
    const slice = extractSubgraph("FOCAL", edges, { depth: 0 });
    expect(slice.nodeIds).toEqual(["FOCAL"]);
    expect(slice.edges).toEqual([]);
  });

  it("depth=1 includes immediate neighbors via edges in either direction", () => {
    const slice = extractSubgraph("FOCAL", edges, { depth: 1 });
    expect(new Set(slice.nodeIds)).toEqual(new Set(["FOCAL", "A", "C"]));
    expect(slice.edges.length).toBe(2);
  });

  it("depth=2 expands further but only includes edges entirely inside the slice", () => {
    const slice = extractSubgraph("FOCAL", edges, { depth: 2 });
    expect(new Set(slice.nodeIds)).toEqual(new Set(["FOCAL", "A", "C", "B"]));
    // The FAR→B edge has FAR outside the slice, so it must be excluded.
    expect(slice.edges.find(e => e.edgeId === "e4")).toBeUndefined();
    expect(slice.edges.length).toBe(3);
  });

  it("edgeTypes filter restricts membership", () => {
    const slice = extractSubgraph("FOCAL", edges, { depth: 2, edgeTypes: ["depends_on"] });
    // C reaches FOCAL only via documents; with documents filtered out, C is excluded.
    expect(slice.nodeIds).not.toContain("C");
    expect(slice.nodeIds).toContain("A");
    expect(slice.nodeIds).toContain("B");
  });

  it("nodeIds is sorted deterministically", () => {
    const slice = extractSubgraph("FOCAL", edges, { depth: 2 });
    expect(slice.nodeIds).toEqual([...slice.nodeIds].sort());
  });
});
