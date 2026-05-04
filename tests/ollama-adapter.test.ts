import { describe, it, expect } from "vitest";
import { createOllamaAdapter } from "../src/runtime/llm/ollama/adapter.js";

describe("Ollama Adapter", () => {
  it("ollama adapter can be constructed", () => {
    const adapter = createOllamaAdapter();
    expect(adapter).toBeDefined();
  });

  it("ollama adapter exposes provider ollama", () => {
    const adapter = createOllamaAdapter();
    expect(adapter.provider).toBe("ollama");
  });

  it("ollama health returns ok or graceful failure", async () => {
    const adapter = createOllamaAdapter();
    const result = await adapter.health?.();
    expect(result).toBeDefined();
    expect(typeof result?.ok).toBe("boolean");
    if (!result?.ok) {
      expect(typeof result?.message).toBe("string");
    }
  });

  it("ollama listModels returns array or graceful failure", async () => {
    const adapter = createOllamaAdapter();
    try {
      const models = await adapter.listModels?.();
      expect(Array.isArray(models)).toBe(true);
    } catch (err: unknown) {
      // Graceful failure / soft-fails when Ollama is not running
      expect(err).toBeDefined();
      const message = err instanceof Error ? err.message : String(err);
      expect(
        message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("network") ||
        message.includes("Failed to fetch")
      ).toBe(true);
    }
  });

  it("ollama generate is skipped or soft-fails when Ollama is unavailable", async () => {
    const adapter = createOllamaAdapter();
    try {
      const response = await adapter.generate({
        task: "semantic_parse",
        prompt: "Hello",
      });
      // If Ollama is running and responds
      expect(response).toBeDefined();
      expect(response.provider).toBe("ollama");
    } catch (err: unknown) {
      // Soft-fail if Ollama is not running
      expect(err).toBeDefined();
      const message = err instanceof Error ? err.message : String(err);
      expect(
        message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("network") ||
        message.includes("Failed to fetch")
      ).toBe(true);
    }
  });
});
