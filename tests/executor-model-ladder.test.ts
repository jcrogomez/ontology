import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREMISE,
  deriveCaps,
  resolveLadder,
  type ModelPremise,
} from "../src/runtime/executor/model-ladder.js";
import type { OntologyModel } from "../src/kernel/schemas/ontology.js";

function model(over: Partial<OntologyModel> & { id: string }): OntologyModel {
  return {
    provider: "ollama",
    name: over.id,
    temperature: 0.2,
    multimodal: false,
    ...over,
  } as OntologyModel;
}

describe("deriveCaps", () => {
  it("defaults ollama to local/cheap/free/open-weights", () => {
    expect(deriveCaps(model({ id: "a", provider: "ollama" }))).toEqual({
      locality: "local",
      tier: "cheap",
      cost: "free",
      openWeights: true,
    });
  });

  it("defaults anthropic to cloud/frontier/paid/closed", () => {
    expect(deriveCaps(model({ id: "b", provider: "anthropic" }))).toEqual({
      locality: "cloud",
      tier: "frontier",
      cost: "paid",
      openWeights: false,
    });
  });

  it("respects explicit caps over the provider derivation", () => {
    const m = model({
      id: "c",
      provider: "ollama",
      caps: { locality: "cloud", tier: "mid", cost: "free", openWeights: true },
    });
    expect(deriveCaps(m).tier).toBe("mid");
    expect(deriveCaps(m).locality).toBe("cloud");
  });
});

describe("resolveLadder — DEFAULT_PREMISE ($0/local)", () => {
  const registry = {
    models: [
      model({ id: "mock_default", provider: "mock", name: "mock" }),
      model({
        id: "local_7b",
        provider: "ollama",
        name: "qwen2.5-coder:7b",
        caps: { locality: "local", tier: "cheap", cost: "free", openWeights: true },
      }),
      model({
        id: "cloud_open",
        provider: "ollama",
        name: "qwen3.6:27b",
        caps: { locality: "cloud", tier: "mid", cost: "free", openWeights: true },
      }),
      model({
        id: "frontier_paid",
        provider: "anthropic",
        name: "claude-opus-4-7",
        caps: { locality: "cloud", tier: "frontier", cost: "paid", openWeights: false },
      }),
    ],
  };

  it("excludes paid and mock, ordered cheap → capable", () => {
    const ladder = resolveLadder(DEFAULT_PREMISE, registry);
    expect(ladder.map((r) => r.model)).toEqual(["qwen2.5-coder:7b", "qwen3.6:27b"]);
  });

  it("a local-only premise drops the cloud rung", () => {
    const premise: ModelPremise = {
      allow: { locality: ["local"] },
      forbid: { provider: ["mock"] },
      order: ["tier"],
    };
    expect(resolveLadder(premise, registry).map((r) => r.model)).toEqual(["qwen2.5-coder:7b"]);
  });

  it("opting into paid adds the frontier rung at the top", () => {
    const premise: ModelPremise = {
      forbid: { provider: ["mock"] },
      order: ["tier"],
    };
    expect(resolveLadder(premise, registry).map((r) => r.model)).toEqual([
      "qwen2.5-coder:7b",
      "qwen3.6:27b",
      "claude-opus-4-7",
    ]);
  });

  it("a premise that excludes everything yields an empty ladder", () => {
    const premise: ModelPremise = { forbid: { cost: ["free", "paid"] }, order: ["tier"] };
    expect(resolveLadder(premise, registry)).toEqual([]);
  });
});
