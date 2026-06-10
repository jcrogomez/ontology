import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0093 — src/commands/ingest/cost-estimate.ts
// Tested entries: estimateInputTokens, resolveProviderRate,
// computeCostEstimate — the pure estimator core (no fs path is
// touched; file sizes are passed in). A regen with a wrong
// chars/token divisor, a dropped per-file wrapper constant, a missed
// model-prefix rate row, or a system-prompt overhead counted per-file
// instead of once would diverge here.

type FileSizeInfo = { path: string; cwdRelative: string; sizeChars: number };
type Api = {
  estimateInputTokens: (fileSizeChars: number) => number;
  resolveProviderRate: (
    provider: string,
    model?: string,
  ) => { inputUsdPerMillion: number; outputUsdPerMillion: number; modelLabel: string };
  computeCostEstimate: (
    files: FileSizeInfo[],
    provider: string,
    model?: string,
  ) => {
    fileCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    perFile: Array<{ inputTokens: number; outputTokens: number; costUsd: number }>;
    notes: string[];
  };
};

export const cases: BehaviorCase[] = [
  {
    name: "estimateInputTokens — ceil(chars/3.5) plus the 50-token wrapper",
    setup: () => ({ sizes: [0, 1, 3500, 3501] }),
    invoke: (api, ctx) =>
      (ctx as { sizes: number[] }).sizes.map((s) =>
        (api as Api).estimateInputTokens(s),
      ),
    assert: (r) =>
      Array.isArray(r) && r[0] === 50 && r[1] === 51 && r[2] === 1050 && r[3] === 1051,
  },
  {
    name: "resolveProviderRate — mock is zero-cost, sonnet prefix matches dated ids",
    setup: () => ({
      mock: "mock",
      anthropic: "anthropic",
      sonnetDated: "claude-sonnet-4-6-20250901",
    }),
    invoke: (api, ctx) => {
      const c = ctx as { mock: string; anthropic: string; sonnetDated: string };
      return [
        (api as Api).resolveProviderRate(c.mock),
        (api as Api).resolveProviderRate(c.anthropic, c.sonnetDated),
      ];
    },
    assert: (r) =>
      Array.isArray(r) &&
      (r[0] as { inputUsdPerMillion: number }).inputUsdPerMillion === 0 &&
      (r[1] as { inputUsdPerMillion: number }).inputUsdPerMillion === 3.0 &&
      (r[1] as { outputUsdPerMillion: number }).outputUsdPerMillion === 15.0,
  },
  {
    name: "computeCostEstimate — totals include system prompt once, not per file",
    setup: () => ({
      files: [
        { path: "/v/a.ts", cwdRelative: "a.ts", sizeChars: 3500 },
        { path: "/v/b.ts", cwdRelative: "b.ts", sizeChars: 700 },
      ] as FileSizeInfo[],
      provider: "anthropic",
      model: "claude-opus-4-7",
    }),
    invoke: (api, ctx) => {
      const c = ctx as { files: FileSizeInfo[]; provider: string; model: string };
      const e = (api as Api).computeCostEstimate(c.files, c.provider, c.model);
      return {
        fileCount: e.fileCount,
        totalInputTokens: e.totalInputTokens,
        totalOutputTokens: e.totalOutputTokens,
        perFileInput: e.perFile.map((f) => f.inputTokens),
      };
    },
    // a.ts → 1050, b.ts → 250, system prompt 1100 once → 2400 total.
    assert: (r) => {
      const v = r as {
        fileCount: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        perFileInput: number[];
      };
      return (
        v.fileCount === 2 &&
        v.perFileInput[0] === 1050 &&
        v.perFileInput[1] === 250 &&
        v.totalInputTokens === 2400 &&
        v.totalOutputTokens === 800
      );
    },
  },
];
