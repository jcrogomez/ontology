import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0026 — src/runtime/graph/poset.ts
// Tested entry: validateEdgeDirection — pure check that an edge does
// not run against the abstraction poset (lower-abstraction artifact
// pointing to a higher-abstraction project via a "refines" edge is
// rejected, since "refines" semantically points downward).

interface DirectionInput {
  sourceLevel: string;
  targetLevel: string;
  edgeType: string;
}

export const cases: BehaviorCase[] = [
  {
    name: "validateEdgeDirection — refines from project → artifact is rejected",
    setup: () => ({
      sourceLevel: "project",
      targetLevel: "artifact",
      edgeType: "refines",
    }) satisfies DirectionInput,
    invoke: (api, ctx) =>
      (
        api as {
          validateEdgeDirection: (i: DirectionInput) => { ok: boolean };
        }
      ).validateEdgeDirection(ctx as DirectionInput),
    assert: (r) => {
      const o = r as { ok?: unknown };
      return o.ok === false;
    },
  },
];
