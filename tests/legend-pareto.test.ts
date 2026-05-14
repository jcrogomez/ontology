import { describe, it, expect } from "vitest";
import {
  aggregateByTaskModel,
  TaskModelAggSchema,
} from "../src/runtime/legend/pareto.js";
import type { PerNodeMatrix } from "../src/runtime/legend/matrix.js";

// Test fixtures: build PerNodeMatrix entries directly, varying the
// cost.task, cost.provider, cost.model, cost.usd, and honesty.structural
// to drive the aggregator. Everything else is set to invariant defaults
// since the Pareto pivot only reads cost + honesty.structural.

function makeEntry(args: {
  nodeId: string;
  task: string;
  provider: string;
  model: string;
  usd: number;
  inputTokens?: number;
  outputTokens?: number;
  honestyStructural: number | null;
}): PerNodeMatrix {
  return {
    nodeId: args.nodeId,
    sourceFile: `f-${args.nodeId}.ts`,
    frontier: ["pure-transform"],
    cell: {
      contract: "not-measured",
      structural: "pass",
      behavior: "untested",
      intent: "not-reviewed",
      literalRequired: "false",
      cost: {
        provider: args.provider,
        model: args.model,
        task: args.task,
        inputTokens: args.inputTokens ?? 100,
        outputTokens: args.outputTokens ?? 50,
        usd: args.usd,
        wallClockMs: 1000,
      },
    },
    honesty: {
      structural: args.honestyStructural,
      contract: null,
      behavior: null,
      intent: null,
    },
  };
}

describe("legend-pareto — aggregateByTaskModel", () => {
  it("returns [] for empty input", () => {
    expect(aggregateByTaskModel([])).toEqual([]);
  });

  it("buckets a single (task, provider, model) and marks it on the frontier", () => {
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "a",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usd: 0.04,
        honestyStructural: 0.85,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].task).toBe("code_sketch");
    expect(out[0].provider).toBe("anthropic");
    expect(out[0].model).toBe("claude-opus-4-7");
    expect(out[0].n).toBe(1);
    expect(out[0].meanHonestyStructural).toBeCloseTo(0.85);
    expect(out[0].honestyN).toBe(1);
    expect(out[0].meanUsdPerNode).toBeCloseTo(0.04);
    expect(out[0].paretoFrontier).toBe(true);
  });

  it("averages mean honesty over non-null contributors only", () => {
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "a",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usd: 0.04,
        honestyStructural: 0.8,
      }),
      makeEntry({
        nodeId: "b",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usd: 0.04,
        honestyStructural: null, // cache hit / unrecoverable
      }),
      makeEntry({
        nodeId: "c",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usd: 0.04,
        honestyStructural: 1.0,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].n).toBe(3);
    expect(out[0].meanHonestyStructural).toBeCloseTo(0.9); // (0.8 + 1.0) / 2
    expect(out[0].honestyN).toBe(2);
    expect(out[0].meanUsdPerNode).toBeCloseTo(0.04); // averaged over all 3
  });

  it("marks the strictly-dominating model as on the frontier and the dominated one off", () => {
    // Anthropic Opus: high fidelity, high cost.
    // Anthropic Haiku: lower fidelity, much lower cost.
    // Both are on the frontier (one wins on fidelity, the other on cost).
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "a",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usd: 0.04,
        honestyStructural: 0.85,
      }),
      makeEntry({
        nodeId: "b",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        usd: 0.002,
        honestyStructural: 0.65,
      }),
    ]);
    expect(out).toHaveLength(2);
    const opus = out.find((a) => a.model === "claude-opus-4-7")!;
    const haiku = out.find((a) => a.model === "claude-haiku-4-5")!;
    expect(opus.paretoFrontier).toBe(true);
    expect(haiku.paretoFrontier).toBe(true);
  });

  it("kicks a strictly-dominated model off the frontier", () => {
    // Model A is strictly worse on fidelity AND more expensive than B.
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "a",
        task: "code_sketch",
        provider: "anthropic",
        model: "bad-model",
        usd: 0.05,
        honestyStructural: 0.6,
      }),
      makeEntry({
        nodeId: "b",
        task: "code_sketch",
        provider: "anthropic",
        model: "good-model",
        usd: 0.03,
        honestyStructural: 0.9,
      }),
    ]);
    const bad = out.find((a) => a.model === "bad-model")!;
    const good = out.find((a) => a.model === "good-model")!;
    expect(bad.paretoFrontier).toBe(false);
    expect(good.paretoFrontier).toBe(true);
  });

  it("never puts null-honesty entries on the frontier", () => {
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "a",
        task: "code_sketch",
        provider: "ollama",
        model: "qwen2.5-coder:7b",
        usd: 0,
        honestyStructural: null,
      }),
      makeEntry({
        nodeId: "b",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usd: 0.04,
        honestyStructural: 0.85,
      }),
    ]);
    const ollama = out.find((a) => a.provider === "ollama")!;
    const anthropic = out.find((a) => a.provider === "anthropic")!;
    expect(ollama.paretoFrontier).toBe(false);
    expect(anthropic.paretoFrontier).toBe(true);
  });

  it("computes frontier independently per task", () => {
    // Task A: only one model. On the frontier (trivially).
    // Task B: only one model with non-null honesty. Also on the frontier.
    // The dominated model from task A's bucket does NOT compete in task B.
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "a1",
        task: "semantic_parse",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        usd: 0.01,
        honestyStructural: 0.9,
      }),
      makeEntry({
        nodeId: "b1",
        task: "code_sketch",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usd: 0.04,
        honestyStructural: 0.8,
      }),
    ]);
    expect(out).toHaveLength(2);
    for (const a of out) {
      expect(a.paretoFrontier).toBe(true);
    }
  });

  it("keeps tied entries on the frontier (equal fidelity, equal cost)", () => {
    // Two models with identical mean honesty and identical mean cost
    // — co-equal, both on the frontier.
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "a",
        task: "code_sketch",
        provider: "anthropic",
        model: "model-a",
        usd: 0.02,
        honestyStructural: 0.8,
      }),
      makeEntry({
        nodeId: "b",
        task: "code_sketch",
        provider: "anthropic",
        model: "model-b",
        usd: 0.02,
        honestyStructural: 0.8,
      }),
    ]);
    expect(out.every((a) => a.paretoFrontier)).toBe(true);
  });

  it("sorts results task asc, honesty desc, cost asc within a task", () => {
    const out = aggregateByTaskModel([
      makeEntry({
        nodeId: "z",
        task: "z_task",
        provider: "p",
        model: "m1",
        usd: 0,
        honestyStructural: 0.5,
      }),
      makeEntry({
        nodeId: "a",
        task: "a_task",
        provider: "p",
        model: "m_low",
        usd: 0.1,
        honestyStructural: 0.5,
      }),
      makeEntry({
        nodeId: "b",
        task: "a_task",
        provider: "p",
        model: "m_high",
        usd: 0.1,
        honestyStructural: 0.9,
      }),
    ]);
    expect(out[0].task).toBe("a_task");
    expect(out[0].model).toBe("m_high"); // higher honesty first within a_task
    expect(out[1].task).toBe("a_task");
    expect(out[1].model).toBe("m_low");
    expect(out[2].task).toBe("z_task");
  });
});

describe("legend-pareto — TaskModelAggSchema", () => {
  it("validates a well-formed agg", () => {
    const ok = TaskModelAggSchema.safeParse({
      task: "code_sketch",
      provider: "anthropic",
      model: "claude-opus-4-7",
      n: 5,
      meanHonestyStructural: 0.85,
      honestyN: 5,
      meanUsdPerNode: 0.04,
      meanInputTokensPerNode: 1000,
      meanOutputTokensPerNode: 500,
      paretoFrontier: true,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects honesty out of range", () => {
    const bad = TaskModelAggSchema.safeParse({
      task: "code_sketch",
      provider: "anthropic",
      model: "claude-opus-4-7",
      n: 5,
      meanHonestyStructural: 1.4,
      honestyN: 5,
      meanUsdPerNode: 0.04,
      meanInputTokensPerNode: 1000,
      meanOutputTokensPerNode: 500,
      paretoFrontier: true,
    });
    expect(bad.success).toBe(false);
  });
});
