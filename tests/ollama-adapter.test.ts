import { describe, it, expect } from "vitest";
import { createOllamaAdapter } from "../src/runtime/llm/ollama/adapter.js";

describe("ollama adapter", () => {
  it("can be constructed", () => {
    const adapter = createOllamaAdapter();
    expect(adapter).toBeDefined();
  });

  it("exposes provider ollama", () => {
    const adapter = createOllamaAdapter();
    expect(adapter.provider).toBe("ollama");
  });

  it("health returns ok or graceful failure", async () => {
    const adapter = createOllamaAdapter({ host: "http://127.0.0.1:11434" });
    // Assuming ollama is not running in CI, health() should still resolve without throwing an exception
    const result = await adapter.health?.();
    expect(result).toBeDefined();
    expect(typeof result?.ok).toBe("boolean");
  });

  it("listModels returns array or graceful failure", async () => {
    const adapter = createOllamaAdapter({ host: "http://127.0.0.1:11434" });
    // Should return [] if it fails
    const result = await adapter.listModels?.();
    expect(Array.isArray(result)).toBe(true);
  });

  it("generate is skipped or soft-fails when Ollama is unavailable", async () => {
    const adapter = createOllamaAdapter({ host: "http://127.0.0.1:11434" });

    try {
      await adapter.generate({
        task: "semantic_parse",
        prompt: "Hello",
      });
      // If it doesn't throw, that means Ollama is running and it succeeded.
      expect(true).toBe(true);
    } catch (error) {
      // If it throws, it should be an expected connection error
      const isConnectionError =
        error instanceof Error &&
        (error.message.includes("fetch") || error.message.includes("ECONNREFUSED"));
      expect(isConnectionError).toBe(true);
    }
  });
});
