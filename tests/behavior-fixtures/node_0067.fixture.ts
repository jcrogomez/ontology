import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0067 — src/core/nodes/node-id.ts
// Tested entry: createSequentialNodeId(nodeCount) — formats a counter
// into the canonical `node_NNNN` id. A regen that pads to the wrong
// width, pads with the wrong character, or truncates counts past four
// digits would diverge here.

type Api = { createSequentialNodeId: (nodeCount: number) => string };

export const cases: BehaviorCase[] = [
  {
    name: "createSequentialNodeId — small count zero-pads to four digits",
    setup: () => ({ count: 7 }),
    invoke: (api, ctx) =>
      (api as Api).createSequentialNodeId((ctx as { count: number }).count),
    assert: (r) => r === "node_0007",
  },
  {
    name: "createSequentialNodeId — four-digit count needs no padding",
    setup: () => ({ count: 1234 }),
    invoke: (api, ctx) =>
      (api as Api).createSequentialNodeId((ctx as { count: number }).count),
    assert: (r) => r === "node_1234",
  },
  {
    name: "createSequentialNodeId — five-digit count is not truncated",
    setup: () => ({ count: 12345 }),
    invoke: (api, ctx) =>
      (api as Api).createSequentialNodeId((ctx as { count: number }).count),
    assert: (r) => r === "node_12345",
  },
];
