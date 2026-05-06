import type { LlmAdapter, LlmRequest, LlmResponse, LlmModelHandle } from "./types.js";

export function createMockLlmAdapter(): LlmAdapter {
  return {
    provider: "mock",

    async health(): Promise<{ ok: boolean; message?: string }> {
      return { ok: true, message: "Mock LLM adapter ready." };
    },

    async listModels(): Promise<LlmModelHandle[]> {
      return [
        {
          id: "mock_default",
          provider: "mock",
          name: "deterministic-mock-model",
          tier: "fast",
          multimodal: false,
          temperatureDefault: 0,
        },
      ];
    },

    async generate(request: LlmRequest): Promise<LlmResponse> {
      const model = request.model || "mock_default";

      if (request.json === true) {
        const payload = {
          ok: true,
          task: request.task,
          echo: request.prompt,
        };

        return {
          text: JSON.stringify(payload),
          json: payload,
          model,
          provider: "mock",
        };
      }

      // For task=code_sketch the mock acts as the IDENTITY functor: it returns
      // the prompt verbatim, no [mock:...] prefix. This makes the mock provider
      // a degenerate-but-valid case of axiom 6 (compiler functor): one-node
      // compilation where the prompt IS the artifact. Real Ollama (or any
      // other provider) performs a non-identity transformation. Both are
      // mathematically valid functors. See examples/hello-world/ for the
      // canonical demo using this contract.
      if (request.task === "code_sketch") {
        return {
          text: request.prompt,
          model,
          provider: "mock",
        };
      }

      return {
        text: `[mock:${request.task}] ${request.prompt}`,
        model,
        provider: "mock",
      };
    },
  };
}
