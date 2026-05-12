import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmAdapter,
  LlmModelHandle,
  LlmRequest,
  LlmResponse,
} from "../types.js";

// Anthropic adapter for the Ontology LLM dispatcher.
//
// Reads `ANTHROPIC_API_KEY` from the environment (the SDK default). The
// adapter is built for the Project Legend ingest workflow where the
// extraction template is the same across many calls in a session — the
// system prompt block is tagged with `cache_control: ephemeral` so
// Anthropic's prompt cache absorbs the repeated bytes (~0.1× input cost
// on hits, ~1.25× on the initial write). Minimum cacheable prefix on
// Opus 4.7 is 4096 tokens; below that the cache silently no-ops, which
// is fine — extraction grows over time and the cache turns on
// automatically when the system prompt crosses the threshold.
//
// Model defaulting:
//   - When `request.model` is set, it wins (per-node `model.ref`
//     resolution path).
//   - Otherwise we use `defaultModel` (configured at adapter construction
//     time), falling back to `claude-opus-4-7` — the frontier per the
//     skill's model table at the time of writing.
//
// Adaptive thinking is enabled by default. Opus 4.7's adaptive mode lets
// the model decide whether to think; extraction-style tasks tend to
// benefit from a short reasoning pass before emitting a structured
// answer. Effort is `high` — the right default for intelligence-sensitive
// extraction work without paying for `xhigh`/`max`. Both can be tuned
// later by widening LlmRequest if a use case needs it.
//
// Output is non-streaming. Extraction responses are bounded (typical
// outputs are a few hundred tokens of structured intent), so streaming
// would add complexity without reducing latency meaningfully. If a future
// caller needs streaming, swap to `client.messages.stream()` and feed
// `getFinalMessage()` back through the same response shape.

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicAdapterOptions {
  apiKey?: string;
  defaultModel?: string;
  // Forwarded to the SDK constructor. The SDK reads ANTHROPIC_API_KEY
  // from env when apiKey is undefined.
}

export function createAnthropicAdapter(
  options?: AnthropicAdapterOptions,
): LlmAdapter {
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Anthropic adapter requires ANTHROPIC_API_KEY in the environment (or pass apiKey via options).`,
    );
  }
  const client = new Anthropic({ apiKey });
  const defaultModel = options?.defaultModel || DEFAULT_MODEL;

  return {
    provider: "anthropic",

    async health() {
      // Cheap probe: list a single model. Anything other than a clean
      // 200 surfaces as ok:false so model-doctor can render the
      // underlying message rather than a generic failure.
      try {
        await client.models.list({ limit: 1 });
        return { ok: true };
      } catch (err: unknown) {
        if (err instanceof Anthropic.AuthenticationError) {
          return {
            ok: false,
            message: `Anthropic authentication failed: ${err.message}`,
          };
        }
        if (err instanceof Anthropic.APIError) {
          return {
            ok: false,
            message: `Anthropic API error (${err.status}): ${err.message}`,
          };
        }
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async listModels(): Promise<LlmModelHandle[]> {
      const out: LlmModelHandle[] = [];
      for await (const m of client.models.list()) {
        out.push({
          id: m.id,
          provider: "anthropic",
          name: m.display_name ?? m.id,
          tier: "balanced",
          multimodal: false,
          temperatureDefault: 0,
          notes: "Discovered from Anthropic /v1/models.",
        });
      }
      return out;
    },

    async generate(request: LlmRequest): Promise<LlmResponse> {
      const model = request.model || defaultModel;

      // Build the system block with prompt caching enabled. When the
      // system prompt is empty we omit the field entirely (sending an
      // empty array tags an empty string for caching, which would
      // silently never reach the 4096-token minimum and waste a
      // breakpoint).
      const systemBlocks = request.system
        ? [
            {
              type: "text" as const,
              text: request.system,
              cache_control: { type: "ephemeral" as const },
            },
          ]
        : undefined;

      const t0 = performance.now();
      const response = await client.messages.create({
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        ...(systemBlocks ? { system: systemBlocks } : {}),
        messages: [{ role: "user", content: request.prompt }],
        // Adaptive thinking + high effort: the recommended pairing for
        // most intelligence-sensitive tasks on Opus 4.7. Disable with
        // a future `request.thinking = false` if a caller needs to
        // suppress it.
        thinking: { type: "adaptive" },
        // effort lives under output_config on the messages API. Skipping
        // it would default to "high" anyway on Opus 4.7, but being
        // explicit makes the operational intent legible.
      });
      const evalDurationMs = performance.now() - t0;

      // The response.content is an array of blocks. Concatenate every
      // text block (skip thinking blocks — they're internal reasoning,
      // not the artifact body). For ingest the model returns one text
      // block; for other tasks we still flatten conservatively.
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      let jsonParsed: unknown;
      if (request.json) {
        try {
          jsonParsed = JSON.parse(text);
        } catch {
          jsonParsed = undefined;
        }
      }

      return {
        text,
        json: jsonParsed,
        model: response.model,
        provider: "anthropic",
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
          evalCount: response.usage.output_tokens,
          evalDurationMs,
        },
        raw: response,
      };
    },
  };
}
