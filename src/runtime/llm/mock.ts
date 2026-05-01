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

      return {
        text: `[mock:${request.task}] ${request.prompt}`,
        model,
        provider: "mock",
      };
    },
  };
}
