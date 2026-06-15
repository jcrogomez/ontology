import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0029 — src/runtime/legend/matrix-intersections.ts
// Tested entry: entryMatchesIntersection — pure predicate. Given a
// per-node matrix entry and a {name, tags} spec, returns true iff
// the entry's frontier contains every required tag. The semantics
// rest entirely on set-containment.

interface PerNodeMatrixLike {
  nodeId: string;
  sourceFile: string;
  frontier: readonly string[];
  cell: Record<string, unknown>;
  honesty: Record<string, number | null>;
}
interface IntersectionSpec {
  name: string;
  tags: readonly string[];
}

export const cases: BehaviorCase[] = [
  {
    name: "entryMatchesIntersection — entry holds all required tags → true",
    setup: () => ({
      entry: {
        nodeId: "n1",
        sourceFile: "x.ts",
        frontier: ["io-bound", "structural-drift"],
        cell: {
          contract: "not-measured",
          structural: "fail",
          behavior: "untested",
          intent: "not-reviewed",
          literalRequired: "false",
          cost: {
            provider: "anthropic",
            model: "claude",
            task: "code_sketch",
            inputTokens: 0,
            outputTokens: 0,
            usd: 0,
            wallClockMs: 0,
          },
        },
        honesty: { structural: 0, contract: null, behavior: null, intent: null },
      } satisfies PerNodeMatrixLike,
      spec: {
        name: "io-bound ∧ structural-drift",
        tags: ["io-bound", "structural-drift"],
      } satisfies IntersectionSpec,
    }),
    invoke: (api, ctx) => {
      const c = ctx as { entry: PerNodeMatrixLike; spec: IntersectionSpec };
      return (
        api as {
          entryMatchesIntersection: (
            e: PerNodeMatrixLike,
            s: IntersectionSpec,
          ) => boolean;
        }
      ).entryMatchesIntersection(c.entry, c.spec);
    },
    assert: (r) => r === true,
  },
  {
    name: "entryMatchesIntersection — missing tag → false",
    setup: () => ({
      entry: {
        nodeId: "n2",
        sourceFile: "y.ts",
        frontier: ["io-bound"],
        cell: {
          contract: "not-measured",
          structural: "pass",
          behavior: "untested",
          intent: "not-reviewed",
          literalRequired: "false",
          cost: {
            provider: "anthropic",
            model: "claude",
            task: "code_sketch",
            inputTokens: 0,
            outputTokens: 0,
            usd: 0,
            wallClockMs: 0,
          },
        },
        honesty: { structural: 1, contract: null, behavior: null, intent: null },
      } satisfies PerNodeMatrixLike,
      spec: {
        name: "io-bound ∧ structural-drift",
        tags: ["io-bound", "structural-drift"],
      } satisfies IntersectionSpec,
    }),
    invoke: (api, ctx) => {
      const c = ctx as { entry: PerNodeMatrixLike; spec: IntersectionSpec };
      return (
        api as {
          entryMatchesIntersection: (
            e: PerNodeMatrixLike,
            s: IntersectionSpec,
          ) => boolean;
        }
      ).entryMatchesIntersection(c.entry, c.spec);
    },
    assert: (r) => r === false,
  },
];
