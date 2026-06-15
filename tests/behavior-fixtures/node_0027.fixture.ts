import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0027 — src/runtime/graph/traversal.ts
// Tested entry: getNeighbors — pure edge filter. Given a focal id, a
// list of edges, and a direction, returns the immediate neighbours.
// A regen that reverses the from/to convention, drops the direction
// label, or returns a different array shape would diverge.

interface Edge {
  id: string;
  from: string;
  to: string;
  type: string;
}

export const cases: BehaviorCase[] = [
  {
    name: "getNeighbors — outgoing edge from focal yields one neighbour",
    setup: () => ({
      focalId: "node-a",
      edges: [
        { id: "e1", from: "node-a", to: "node-b", type: "depends_on" },
      ] satisfies Edge[],
      options: { direction: "out" as const },
    }),
    invoke: (api, ctx) => {
      const c = ctx as {
        focalId: string;
        edges: Edge[];
        options: { direction: "in" | "out" };
      };
      return (
        api as {
          getNeighbors: (
            f: string,
            e: Edge[],
            o?: { direction?: "in" | "out" },
          ) => Array<{ neighborId: string; direction: string }>;
        }
      ).getNeighbors(c.focalId, c.edges, c.options);
    },
    assert: (r) => {
      if (!Array.isArray(r) || r.length !== 1) return false;
      const e = r[0] as { neighborId?: unknown; direction?: unknown };
      return e.neighborId === "node-b" && e.direction === "out";
    },
  },
];
