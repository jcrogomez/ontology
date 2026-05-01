import { describe, it, expect } from "vitest";
import { createMockLlmAdapter } from "../src/runtime/llm/mock.js";
import type { LlmRequest } from "../src/runtime/llm/types.js";

describe("LLM Mock Adapter", () => {
  it("health returns ok", async () => {
    const adapter = createMockLlmAdapter();
    const healthResult = await adapter.health?.();

    expect(healthResult).toBeDefined();
    expect(healthResult?.ok).toBe(true);
    expect(healthResult?.message).toBe("Mock LLM adapter ready.");
  });

  it("listModels returns mock_default", async () => {
    const adapter = createMockLlmAdapter();
    const models = await adapter.listModels?.();

    expect(models).toBeDefined();
    expect(Array.isArray(models)).toBe(true);
    expect(models?.length).toBe(1);
    expect(models?.[0]).toMatchObject({
      id: "mock_default",
      provider: "mock",
      name: "deterministic-mock-model",
      tier: "fast",
      multimodal: false,
      temperatureDefault: 0,
    });
  });

  it("generate text is deterministic", async () => {
    const adapter = createMockLlmAdapter();

    const request1: LlmRequest = {
      task: "node_expand",
      prompt: "Test prompt",
    };

    const request2: LlmRequest = {
      task: "node_expand",
      prompt: "Test prompt",
    };

    const response1 = await adapter.generate(request1);
    const response2 = await adapter.generate(request2);

    expect(response1.text).toBe("[mock:node_expand] Test prompt");
    expect(response1.provider).toBe("mock");
    expect(response1.model).toBe("mock_default");
    expect(response1.json).toBeUndefined();

    // Deterministic check
    expect(response1).toEqual(response2);
  });

  it("generate json returns parseable object", async () => {
    const adapter = createMockLlmAdapter();

    const request: LlmRequest = {
      task: "semantic_parse",
      prompt: "Parse this",
      json: true,
    };

    const response = await adapter.generate(request);

    expect(response.provider).toBe("mock");
    expect(response.model).toBe("mock_default");

    const expectedPayload = {
      ok: true,
      task: "semantic_parse",
      echo: "Parse this",
    };

    expect(response.json).toEqual(expectedPayload);
    expect(response.text).toBe(JSON.stringify(expectedPayload));

    // Check it's parseable
    const parsed = JSON.parse(response.text);
    expect(parsed).toEqual(expectedPayload);
  });
});
