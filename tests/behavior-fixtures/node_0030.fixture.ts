import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0030 — src/runtime/legend/matrix.ts
// Tested entry: honestyForCell — pure fold from a matrix cell + raw
// distance metrics to the four-axis honesty record. Formula is
// public (matrix.ts comment): structural = 0.5 * (1 - locDistance) +
// 0.5 * structuralJaccard. A regen that flips the weighting or drops
// either summand would diverge sharply.

interface MatrixCellLike {
  contract: string;
  structural: string;
  behavior: string;
  intent: string;
  literalRequired: string;
  cost: Record<string, unknown>;
}

export const cases: BehaviorCase[] = [
  {
    name: "honestyForCell — accepted+pass with measured metrics",
    setup: () => ({
      cell: {
        contract: "pass",
        structural: "pass",
        behavior: "pass",
        intent: "accepted",
        literalRequired: "true",
        cost: {
          provider: "anthropic",
          model: "claude-opus",
          task: "code_sketch",
          inputTokens: 0,
          outputTokens: 0,
          usd: 0,
          wallClockMs: 0,
        },
      } satisfies MatrixCellLike,
      metrics: { locDistance: 0.1, structuralJaccard: 0.9 },
    }),
    invoke: (api, ctx) => {
      const c = ctx as {
        cell: MatrixCellLike;
        metrics: { locDistance: number; structuralJaccard: number };
      };
      return (
        api as {
          honestyForCell: (
            cell: MatrixCellLike,
            metrics: { locDistance: number; structuralJaccard: number },
          ) => { structural: number; contract: number; behavior: number; intent: number };
        }
      ).honestyForCell(c.cell, c.metrics);
    },
    assert: (r) => {
      const o = r as { structural?: unknown; contract?: unknown; behavior?: unknown; intent?: unknown };
      return (
        typeof o.structural === "number" &&
        Math.abs((o.structural as number) - 0.9) < 1e-9 &&
        o.contract === 1 &&
        o.behavior === 1 &&
        o.intent === 1
      );
    },
  },
];
