import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0092 — src/runtime/graph/traversal.ts (second fixture from this file)
// Tested entry: findShortestPath — pure BFS over an edge list. A
// two-hop chain a → b → c is the canonical case; a regen that
// inverts the direction or returns a different array order would
// diverge.

interface Edge {
  id: string;
  from: string;
  to: string;
  type: string;
}

export const cases: BehaviorCase[] = [
  {
    name: "findShortestPath — chain a → b → c yields both edges in order",
    setup: () => ({
      fromId: "a",
      toId: "c",
      edges: [
        { id: "e1", from: "a", to: "b", type: "depends_on" },
        { id: "e2", from: "b", to: "c", type: "depends_on" },
      ] satisfies Edge[],
    }),
    invoke: (api, ctx) => {
      const c = ctx as { fromId: string; toId: string; edges: Edge[] };
      return (
        api as {
          findShortestPath: (
            f: string,
            t: string,
            e: Edge[],
          ) => Edge[] | null;
        }
      ).findShortestPath(c.fromId, c.toId, c.edges);
    },
    assert: (r) => {
      if (!Array.isArray(r)) return false;
      const arr = r as Edge[];
      return (
        arr.length === 2 &&
        arr[0]?.id === "e1" &&
        arr[1]?.id === "e2"
      );
    },
  },
];
