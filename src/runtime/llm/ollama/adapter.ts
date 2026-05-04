import { Ollama } from "ollama";
import type {
  LlmAdapter,
  LlmRequest,
  LlmResponse,
  LlmModelHandle,
} from "../types.js";

export function createOllamaAdapter(options?: {
  host?: string;
  defaultModel?: string;
}): LlmAdapter {
  const host =
    options?.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const defaultModel = options?.defaultModel ?? "llama3.1:8b";
  const client = new Ollama({ host });

  return {
    provider: "ollama",

    async health() {
      try {
        await client.list();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async listModels(): Promise<LlmModelHandle[]> {
      try {
        const response = await client.list();
        return response.models.map((model) => ({
          id: model.name,
          provider: "ollama",
          name: model.name,
          tier: "balanced",
          multimodal: false,
          temperatureDefault: 0.7,
        }));
      } catch (error) {
        return [];
      }
    },

    async generate(request: LlmRequest): Promise<LlmResponse> {
      const model = request.model ?? defaultModel;

      const messages = [];
      if (request.system) {
        messages.push({ role: "system", content: request.system });
      }
      messages.push({ role: "user", content: request.prompt });

      try {
        const response = await client.chat({
          model,
          messages,
          format: request.json ? "json" : undefined,
          options: {
            temperature: request.temperature,
          },
        });

        let jsonPayload: unknown = undefined;
        if (request.json) {
          try {
            jsonPayload = JSON.parse(response.message.content);
          } catch (error) {
            // "sin explotar" as requested by user
            return {
              text: response.message.content,
              json: undefined,
              model,
              provider: "ollama",
              usage: {
                evalCount: response.eval_count,
                evalDurationMs: response.eval_duration ? response.eval_duration / 1e6 : undefined,
                promptTokens: response.prompt_eval_count,
              },
              raw: response,
            };
          }
        }

        return {
          text: response.message.content,
          json: jsonPayload,
          model,
          provider: "ollama",
          usage: {
            evalCount: response.eval_count,
            evalDurationMs: response.eval_duration ? response.eval_duration / 1e6 : undefined,
            promptTokens: response.prompt_eval_count,
          },
          raw: response,
        };
      } catch (error) {
        // Soft fail if Ollama is unavailable during generate?
        // Wait, the prompt says "ollama generate is skipped or soft-fails when Ollama is unavailable" for tests.
        throw error;
      }
    },
  };
}
