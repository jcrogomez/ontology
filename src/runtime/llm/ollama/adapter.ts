import { Ollama } from "ollama";
import type {
  LlmAdapter,
  LlmModelHandle,
  LlmRequest,
  LlmResponse,
} from "../types.js";

export function createOllamaAdapter(options?: {
  host?: string;
  defaultModel?: string;
}): LlmAdapter {
  const host = options?.host || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const ollama = new Ollama({ host });
  const defaultModel = options?.defaultModel || "llama3.1:8b";

  return {
    provider: "ollama",

    async health() {
      try {
        await ollama.ps();
        return { ok: true };
      } catch (err: unknown) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async listModels(): Promise<LlmModelHandle[]> {
      try {
        const response = await ollama.list();
        return response.models.map((model) => ({
          id: model.name,
          provider: "ollama",
          name: model.name,
          tier: "balanced",
          multimodal: false,
          temperatureDefault: 0.2,
          notes: "Discovered from local Ollama runtime.",
        }));
      } catch (err: unknown) {
        // If Ollama is down, listModels could throw, but the requirements
        // said graceful failure in tests... Wait, requirement says:
        // listModels returns array or graceful failure. If we throw, we can catch in tests.
        // Let's just let it throw or handle gracefully.
        // Actually, let's just throw network errors, as adapter should generally let network errors bubble up,
        // except health() which returns ok:false.
        throw err;
      }
    },

    async generate(request: LlmRequest): Promise<LlmResponse> {
      const model = request.model || defaultModel;

      const messages = [];
      if (request.system) {
        messages.push({ role: "system", content: request.system });
      }
      messages.push({ role: "user", content: request.prompt });

      // Phase ε H2: Ollama defaults to num_ctx=2048 (input) and a
      // model-defined num_predict (often 128 for chat templates) —
      // both silently truncate non-trivial source files and their
      // extractions. When the caller computed an explicit budget,
      // forward it; otherwise fall back to the model's own defaults
      // so we don't regress mock-provider tests or interactive use.
      const ollamaOptions: Record<string, unknown> = {
        temperature: request.temperature,
      };
      if (request.contextWindow !== undefined) {
        ollamaOptions.num_ctx = request.contextWindow;
      }
      if (request.maxTokens !== undefined) {
        ollamaOptions.num_predict = request.maxTokens;
      }
      const ollamaRequest = {
        model,
        messages,
        options: ollamaOptions,
        format: request.json ? "json" : undefined,
      };

      const t0 = performance.now();
      const response = await ollama.chat(ollamaRequest);
      const evalDurationMs = performance.now() - t0;

      let jsonParsed: unknown;
      if (request.json) {
        try {
          jsonParsed = JSON.parse(response.message.content);
        } catch (e) {
          jsonParsed = undefined;
        }
      }

      return {
        text: response.message.content,
        json: jsonParsed,
        model: response.model || model,
        provider: "ollama",
        usage: {
          promptTokens: response.prompt_eval_count,
          completionTokens: response.eval_count,
          totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
          evalCount: response.eval_count,
          evalDurationMs: evalDurationMs,
        },
        raw: response,
      };
    },
  };
}
