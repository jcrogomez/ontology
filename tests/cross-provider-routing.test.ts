import { describe, it, expect } from "vitest";
import { resolveNodeModel } from "../src/runtime/llm/resolve-node-model.js";
import {
  getDefaultModelForTask,
  DefaultAnthropicRouting,
  DefaultOllamaRouting,
} from "../src/runtime/llm/registry.js";
import { resolveProviderRate } from "../src/commands/ingest/cost-estimate.js";
import type { OntologyModel } from "../src/schemas/ontology.js";

// Tests for the cross-provider routing infrastructure landed after the
// γ-7 calibration review. The old behaviour forced the `--provider
// anthropic` CLI users into a single hardcoded model (Opus 4.7) for
// every task — `inspect`, `semantic_parse`, `code_sketch` all paid the
// frontier price regardless of need. These tests pin:
//
//   - The resolver no longer rejects anthropic / literal (the gate
//     bug surfaced by the reviewer at resolve-node-model.ts:46).
//   - The Anthropic routing table maps tasks → tiers in a way that
//     mirrors Ollama (the categorical-routing claim from the design).
//   - getDefaultModelForTask returns the right model per (provider,
//     task) pair, and stays undefined for providers without a table.

const registry = {
  models: [
    { id: "mock_default", provider: "mock", name: "deterministic-mock-model" },
    { id: "ollama-coder", provider: "ollama", name: "qwen2.5-coder:7b" },
    { id: "anthropic-opus", provider: "anthropic", name: "claude-opus-4-7" },
    { id: "anthropic-haiku", provider: "anthropic", name: "claude-haiku-4-5" },
  ] as OntologyModel[],
};

describe("resolveNodeModel — cross-provider dispatch", () => {
  it("resolves mock_default for backward compat", () => {
    const r = resolveNodeModel("mock_default", registry);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolved.provider).toBe("mock");
      expect(r.resolved.model).toBe("deterministic-mock-model");
    }
  });

  it("resolves an ollama entry", () => {
    const r = resolveNodeModel("ollama-coder", registry);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolved.provider).toBe("ollama");
      expect(r.resolved.model).toBe("qwen2.5-coder:7b");
    }
  });

  it("resolves an anthropic entry (regression — used to fail with unsupported_provider)", () => {
    const r = resolveNodeModel("anthropic-opus", registry);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolved.provider).toBe("anthropic");
      expect(r.resolved.model).toBe("claude-opus-4-7");
    }
  });

  it("resolves a second anthropic entry at a different tier (haiku)", () => {
    // Pins that the resolver does NOT collapse all anthropic entries
    // to a canonical one — each ref keeps its own model identifier so
    // the dispatcher routes the correct tier per node.
    const r = resolveNodeModel("anthropic-haiku", registry);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolved.provider).toBe("anthropic");
      expect(r.resolved.model).toBe("claude-haiku-4-5");
    }
  });

  it("returns ref_not_found for a missing id", () => {
    const r = resolveNodeModel("nonexistent", registry);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("ref_not_found");
      expect(r.message).toContain("nonexistent");
    }
  });

  it("rejects providers the dispatcher does not support (e.g. openai)", () => {
    const partialRegistry = {
      models: [
        { id: "openai-gpt-X", provider: "openai", name: "gpt-X" } as OntologyModel,
      ],
    };
    const r = resolveNodeModel("openai-gpt-X", partialRegistry);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unsupported_provider");
      expect(r.message).toContain("openai");
    }
  });
});

describe("DefaultAnthropicRouting — tier mapping per task", () => {
  it("maps inspect to the fast tier (haiku)", () => {
    // Inspector is short prose; haiku is appropriate. The γ-7 plan
    // explicitly named this trade-off — Opus inspect was 5× the cost
    // for negligible quality gain on a 3-5 sentence summary.
    expect(DefaultAnthropicRouting.inspect.tier).toBe("fast");
    expect(DefaultAnthropicRouting.inspect.preferred[0]).toBe("claude-haiku-4-5");
  });

  it("maps semantic_parse (ingest extraction) to the balanced tier (sonnet)", () => {
    expect(DefaultAnthropicRouting.semantic_parse.tier).toBe("balanced");
    expect(DefaultAnthropicRouting.semantic_parse.preferred[0]).toBe("claude-sonnet-4-6");
  });

  it("maps code_sketch (compile-back) to the critic tier (opus)", () => {
    // The γ-2 + γ-7 calibrations validated this assignment empirically
    // — Opus on code_sketch lands publishable ε on hash.ts and a
    // 36→65% delta on the Vibe-Reasoning sweep. Downgrade here would
    // regress the publishable claim.
    expect(DefaultAnthropicRouting.code_sketch.tier).toBe("critic");
    expect(DefaultAnthropicRouting.code_sketch.preferred[0]).toBe("claude-opus-4-7");
  });

  it("maps node_critique to the critic tier", () => {
    expect(DefaultAnthropicRouting.node_critique.tier).toBe("critic");
    expect(DefaultAnthropicRouting.node_critique.preferred[0]).toBe("claude-opus-4-7");
  });

  it("covers every LlmTask defined in types.ts (no gaps)", () => {
    // If a new LlmTask is added without a corresponding routing entry,
    // the dispatcher silently falls through to the adapter default —
    // defeating the categorical-routing claim. This test pins the
    // mirror property: every task in DefaultOllamaRouting MUST also
    // appear in DefaultAnthropicRouting, so future additions can't
    // get away with adding routing for one provider but not the other.
    const ollamaTasks = Object.keys(DefaultOllamaRouting).sort();
    const anthropicTasks = Object.keys(DefaultAnthropicRouting).sort();
    expect(anthropicTasks).toEqual(ollamaTasks);
  });
});

describe("getDefaultModelForTask — per-provider auto-pick", () => {
  it("returns the haiku model for anthropic + inspect", () => {
    expect(getDefaultModelForTask("anthropic", "inspect")).toBe("claude-haiku-4-5");
  });

  it("returns the sonnet model for anthropic + semantic_parse", () => {
    expect(getDefaultModelForTask("anthropic", "semantic_parse")).toBe("claude-sonnet-4-6");
  });

  it("returns the opus model for anthropic + code_sketch", () => {
    expect(getDefaultModelForTask("anthropic", "code_sketch")).toBe("claude-opus-4-7");
  });

  it("returns the calibrated qwen-coder 3b for ollama + semantic_parse", () => {
    // Updated 2026-05-15 per BAKEOFF_3B_FAMILY_2026-05-15.md §5:
    // qwen2.5-coder:3b is the deterministic calibration default for
    // structured_extraction (95% single-run, zero variance × 3 reps,
    // fits comfortably in M1's 5.3 GiB unified VRAM).
    expect(getDefaultModelForTask("ollama", "semantic_parse")).toBe("qwen2.5-coder:3b");
  });

  it("returns undefined for providers without a routing table (mock, literal)", () => {
    expect(getDefaultModelForTask("mock", "inspect")).toBeUndefined();
    expect(getDefaultModelForTask("literal", "code_sketch")).toBeUndefined();
  });
});

describe("resolveProviderRate — task-aware cost estimation", () => {
  // The γ-7 calibration found cost-estimate was over-quoting by ~40%
  // when `--provider anthropic` was passed without `--model`, because
  // the helper defaulted to Opus 4.7 even when the dispatcher would
  // actually route to Sonnet (semantic_parse) or Haiku (inspect).
  // These tests pin that the helper now consults the task-default
  // routing when the model is unset.

  it("picks Sonnet pricing when provider=anthropic + task=semantic_parse (ingest)", () => {
    const rate = resolveProviderRate("anthropic", undefined, "semantic_parse");
    // Sonnet 4.6: $3/M input, $15/M output (vs Opus $5/M, $25/M).
    expect(rate.inputUsdPerMillion).toBe(3.0);
    expect(rate.outputUsdPerMillion).toBe(15.0);
    expect(rate.modelLabel).toBe("claude-sonnet-4-6");
  });

  it("picks Opus pricing when provider=anthropic + task=code_sketch (verify)", () => {
    const rate = resolveProviderRate("anthropic", undefined, "code_sketch");
    expect(rate.inputUsdPerMillion).toBe(5.0);
    expect(rate.outputUsdPerMillion).toBe(25.0);
    expect(rate.modelLabel).toBe("claude-opus-4-7");
  });

  it("picks Haiku pricing when provider=anthropic + task=inspect (Inspector)", () => {
    const rate = resolveProviderRate("anthropic", undefined, "inspect");
    // Haiku 4.5: $1/M input, $5/M output (5× cheaper than Opus).
    expect(rate.inputUsdPerMillion).toBe(1.0);
    expect(rate.outputUsdPerMillion).toBe(5.0);
    expect(rate.modelLabel).toBe("claude-haiku-4-5");
  });

  it("explicit --model overrides the task default", () => {
    // User said "I want Opus on ingest even though it's overkill" —
    // the explicit choice wins.
    const rate = resolveProviderRate("anthropic", "claude-opus-4-7", "semantic_parse");
    expect(rate.modelLabel).toBe("claude-opus-4-7");
    expect(rate.inputUsdPerMillion).toBe(5.0);
  });

  it("falls back to Opus when neither model nor task is provided (conservative)", () => {
    const rate = resolveProviderRate("anthropic");
    expect(rate.modelLabel).toBe("claude-opus-4-7");
  });

  it("ollama with task labels the model in modelLabel ($0 either way)", () => {
    // The label tracks the registry's preferred[0]. Updated to
    // qwen2.5-coder:3b after the 2026-05-15 bake-off calibration.
    const rate = resolveProviderRate("ollama", undefined, "semantic_parse");
    expect(rate.inputUsdPerMillion).toBe(0);
    expect(rate.outputUsdPerMillion).toBe(0);
    expect(rate.modelLabel).toBe("ollama:qwen2.5-coder:3b");
  });

  it("mock stays free regardless of task", () => {
    const rate = resolveProviderRate("mock", undefined, "code_sketch");
    expect(rate.inputUsdPerMillion).toBe(0);
    expect(rate.outputUsdPerMillion).toBe(0);
    expect(rate.modelLabel).toContain("mock");
  });
});
