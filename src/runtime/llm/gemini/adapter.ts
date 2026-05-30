import { GoogleGenAI } from "@google/genai";
import type {
  LlmAdapter,
  LlmModelHandle,
  LlmRequest,
  LlmResponse,
} from "../types.js";

// Gemini adapter for the Ontology LLM dispatcher.
//
// Reads `GEMINI_API_KEY` from the environment (or `options.apiKey`). Mirrors
// the Anthropic adapter so the dispatcher treats providers uniformly. Two
// reasons this adapter matters for the Semillas/Project use case:
//   1. Single-vendor consolidation — the same Gemini key already used for the
//      TTS (gemini-2.5-pro-preview-tts) now also drives text generation, so
//      there is no Anthropic dependency.
//   2. Web search via Google Search grounding. When `request.webSearch` is
//      set, we attach the `googleSearch` tool; Gemini issues real searches and
//      we harvest the grounding citations into a FUENTES list appended to the
//      response — the same contract as the Anthropic web_search path.
//
// Model defaulting mirrors Anthropic: request.model > options.defaultModel >
// DEFAULT_MODEL. Default is gemini-2.5-flash (fast + cheap + strong
// multilingual prose). Pass --model gemini-2.5-pro for the publication cut.

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_TOKENS = 8192;

export interface GeminiAdapterOptions {
  apiKey?: string;
  defaultModel?: string;
}

export function createGeminiAdapter(
  options?: GeminiAdapterOptions,
): LlmAdapter {
  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Gemini adapter requires GEMINI_API_KEY in the environment (or pass apiKey via options).`,
    );
  }
  const ai = new GoogleGenAI({ apiKey });
  const defaultModel = options?.defaultModel || DEFAULT_MODEL;

  return {
    provider: "gemini",

    async health() {
      // Lightweight: the SDK constructs lazily, so a key presence check is
      // the cheapest honest signal. A real generation probe would bill.
      return { ok: true };
    },

    async listModels(): Promise<LlmModelHandle[]> {
      // Static handles for the tiers we route to. Avoids a network round-trip
      // and the (paged) models.list surface.
      return [
        {
          id: "gemini-2.5-pro",
          provider: "gemini",
          name: "gemini-2.5-pro",
          tier: "critic",
          multimodal: true,
          temperatureDefault: 1,
          notes: "Frontier tier — publication-quality prose, deep reasoning.",
        },
        {
          id: "gemini-2.5-flash",
          provider: "gemini",
          name: "gemini-2.5-flash",
          tier: "balanced",
          multimodal: true,
          temperatureDefault: 1,
          notes: "Fast + cheap balanced tier. Strong multilingual prose.",
        },
      ];
    },

    async generate(request: LlmRequest): Promise<LlmResponse> {
      const model = request.model || defaultModel;

      // Google Search grounding when the node opted into web search.
      const tools = request.webSearch ? [{ googleSearch: {} }] : undefined;

      // thinkingConfig: Gemini 2.5 thinks by default; "disabled" zeroes the
      // budget for large prompts where thinking would eat the output budget.
      const thinkingConfig =
        request.thinking === "disabled" ? { thinkingBudget: 0 } : undefined;

      const t0 = performance.now();
      const response = await ai.models.generateContent({
        model,
        contents: request.prompt,
        config: {
          maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(request.temperature !== undefined
            ? { temperature: request.temperature }
            : {}),
          ...(request.system ? { systemInstruction: request.system } : {}),
          ...(tools ? { tools } : {}),
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });
      const evalDurationMs = performance.now() - t0;

      let text = response.text ?? "";

      // Harvest Google Search grounding citations into a FUENTES list so the
      // research artifact is verifiable (parity with the Anthropic path).
      if (request.webSearch) {
        const seen = new Set<string>();
        const sources: string[] = [];
        const candidates = (response as { candidates?: unknown[] }).candidates;
        const chunks =
          Array.isArray(candidates) && candidates[0]
            ? ((candidates[0] as {
                groundingMetadata?: { groundingChunks?: unknown[] };
              }).groundingMetadata?.groundingChunks ?? [])
            : [];
        for (const c of chunks) {
          const web = (c as { web?: { uri?: unknown; title?: unknown } }).web;
          const uri = web?.uri;
          const title = web?.title;
          if (typeof uri === "string" && !seen.has(uri)) {
            seen.add(uri);
            sources.push(
              typeof title === "string" && title.length > 0
                ? `- ${title} (${uri})`
                : `- ${uri}`,
            );
          }
        }
        if (sources.length > 0) {
          text += `\n\nFUENTES:\n${sources.join("\n")}`;
        }
      }

      let jsonParsed: unknown;
      if (request.json) {
        try {
          jsonParsed = JSON.parse(text);
        } catch {
          jsonParsed = undefined;
        }
      }

      const usage = (response as {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      }).usageMetadata;

      return {
        text,
        json: jsonParsed,
        model,
        provider: "gemini",
        usage: {
          promptTokens: usage?.promptTokenCount,
          completionTokens: usage?.candidatesTokenCount,
          totalTokens: usage?.totalTokenCount,
          evalCount: usage?.candidatesTokenCount,
          evalDurationMs,
        },
        raw: response,
      };
    },
  };
}
