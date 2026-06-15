import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0024 — src/runtime/graph/compile-plan.ts
// Tested entry: computeCompilePlan(focalId, edges) — Kahn topological sort
// over the hard-dependency closure. The cases pin deterministic ordering on a
// small DAG (alphabetical tie-break, focal last), the cycle verdict shape,
// and the superseded-focal halt — all spots where a regen could re-derive a
// different-but-"valid" order or silently retarget instead of halting.

type Edge = {
  edgeId: string;
  from: string;
  to: string;
  type: string;
  createdAt?: string;
};

type PlanApi = {
  computeCompilePlan: (focalId: string, edges: Edge[]) => {
    ok: boolean;
    reason?: string;
    steps?: { nodeId: string; dependsOn: string[] }[];
    closure?: string[];
    unresolved?: string[];
    successor?: string;
  };
};

export const cases: BehaviorCase[] = [
  {
    name: "computeCompilePlan — diamond DAG sequences deps first, focal last",
    setup: () => ({
      focalId: "node_a",
      edges: [
        { edgeId: "e1", from: "node_a", to: "node_b", type: "depends_on" },
        { edgeId: "e2", from: "node_a", to: "node_c", type: "depends_on" },
        { edgeId: "e3", from: "node_b", to: "node_c", type: "depends_on" },
      ] as Edge[],
    }),
    invoke: (api, ctx) => {
      const c = ctx as { focalId: string; edges: Edge[] };
      return (api as PlanApi).computeCompilePlan(c.focalId, c.edges);
    },
    assert: (r) => {
      const v = r as { ok: boolean; steps?: { nodeId: string }[] };
      return (
        v.ok === true &&
        v.steps?.length === 3 &&
        v.steps[0].nodeId === "node_c" &&
        v.steps[2].nodeId === "node_a"
      );
    },
  },
  {
    name: "computeCompilePlan — independent leaves break ties alphabetically",
    setup: () => ({
      focalId: "root",
      edges: [
        // Listed b-first to make the deterministic re-sort observable.
        { edgeId: "e_b", from: "root", to: "b_leaf", type: "depends_on" },
        { edgeId: "e_a", from: "root", to: "a_leaf", type: "depends_on" },
      ] as Edge[],
    }),
    invoke: (api, ctx) => {
      const c = ctx as { focalId: string; edges: Edge[] };
      return (api as PlanApi).computeCompilePlan(c.focalId, c.edges);
    },
    assert: (r) => {
      const v = r as { ok: boolean; steps?: { nodeId: string }[] };
      return (
        v.ok === true &&
        v.steps?.length === 3 &&
        v.steps[0].nodeId === "a_leaf" &&
        v.steps[1].nodeId === "b_leaf"
      );
    },
  },
  {
    name: "computeCompilePlan — two-node cycle halts with sorted unresolved set",
    setup: () => ({
      focalId: "node_x",
      edges: [
        { edgeId: "e1", from: "node_x", to: "node_y", type: "depends_on" },
        { edgeId: "e2", from: "node_y", to: "node_x", type: "depends_on" },
      ] as Edge[],
    }),
    invoke: (api, ctx) => {
      const c = ctx as { focalId: string; edges: Edge[] };
      return (api as PlanApi).computeCompilePlan(c.focalId, c.edges);
    },
    assert: (r) => {
      const v = r as { ok: boolean; reason?: string; unresolved?: string[] };
      return v.ok === false && v.reason === "cycle" && v.unresolved?.length === 2;
    },
  },
  {
    name: "computeCompilePlan — superseded focal halts and names the successor",
    setup: () => ({
      focalId: "node_old",
      edges: [
        { edgeId: "e1", from: "node_new", to: "node_old", type: "supersedes" },
      ] as Edge[],
    }),
    invoke: (api, ctx) => {
      const c = ctx as { focalId: string; edges: Edge[] };
      return (api as PlanApi).computeCompilePlan(c.focalId, c.edges);
    },
    assert: (r) => {
      const v = r as { ok: boolean; reason?: string; successor?: string };
      return (
        v.ok === false &&
        v.reason === "superseded_focal" &&
        v.successor === "node_new"
      );
    },
  },
];
