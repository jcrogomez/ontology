import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0031 — src/runtime/legend/pareto.ts
// Tested entry: aggregateByTaskModel — pure group-by over the per-
// node matrix. Single-row input yields a single bucket; the Pareto
// frontier flag is trivially true on a single-element frontier.

interface PerNodeMatrixLike {
  nodeId: string;
  sourceFile: string;
  frontier: readonly string[];
  cell: {
    contract: string;
    structural: string;
    behavior: string;
    intent: string;
    literalRequired: string;
    cost: {
      provider: string;
      model: string;
      task: string;
      inputTokens: number;
      outputTokens: number;
      usd: number;
      wallClockMs: number;
    };
  };
  honesty: {
    structural: number | null;
    contract: number | null;
    behavior: number | null;
    intent: number | null;
  };
}

export const cases: BehaviorCase[] = [
  {
    name: "aggregateByTaskModel — one row yields one bucket on the frontier",
    setup: () => ({
      matrix: [
        {
          nodeId: "n1",
          sourceFile: "a.ts",
          frontier: ["pure-transform"],
          cell: {
            contract: "not-measured",
            structural: "pass",
            behavior: "pass",
            intent: "not-reviewed",
            literalRequired: "false",
            cost: {
              provider: "anthropic",
              model: "claude-opus-4-7",
              task: "code_sketch",
              inputTokens: 100,
              outputTokens: 200,
              usd: 0.01,
              wallClockMs: 1000,
            },
          },
          honesty: { structural: 0.8, contract: null, behavior: 1, intent: null },
        },
      ] satisfies PerNodeMatrixLike[],
    }),
    invoke: (api, ctx) =>
      (
        api as {
          aggregateByTaskModel: (m: readonly PerNodeMatrixLike[]) => Array<{
            task: string;
            provider: string;
            model: string;
            n: number;
            paretoFrontier?: boolean;
          }>;
        }
      ).aggregateByTaskModel((ctx as { matrix: PerNodeMatrixLike[] }).matrix),
    assert: (r) => {
      if (!Array.isArray(r) || r.length !== 1) return false;
      const o = r[0] as { task?: unknown; provider?: unknown; n?: unknown };
      return (
        o.task === "code_sketch" &&
        o.provider === "anthropic" &&
        o.n === 1
      );
    },
  },
];
