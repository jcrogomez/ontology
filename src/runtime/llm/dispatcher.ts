import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { createMockLlmAdapter } from './mock.js';
import { createOllamaAdapter } from './ollama/adapter.js';
import { createAnthropicAdapter } from './anthropic/adapter.js';

export async function dispatchLlmRequest(
  request: LlmRequest,
  options?: {
    provider?: LlmProvider;
    ollamaHost?: string;
    defaultModel?: string;
    // Anthropic-specific override. When omitted the adapter reads
    // ANTHROPIC_API_KEY from the environment (SDK default).
    anthropicApiKey?: string;
  }
): Promise<LlmResponse> {
  const provider = options?.provider ?? 'mock';

  if (provider === 'openai' || provider === 'local') {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  // "literal" is the non-LLM escape hatch — compileNode short-circuits
  // before reaching the dispatcher when a node has `literal` set, so we
  // should never see it here. Surface the misuse loudly rather than
  // silently passing the request to a generative provider.
  if (provider === 'literal') {
    throw new Error(`Cannot dispatch through the "literal" provider; compileNode is expected to bypass dispatch when node.literal is set`);
  }

  if (provider === 'ollama') {
    const adapter = createOllamaAdapter({
      host: options?.ollamaHost,
      defaultModel: options?.defaultModel
    });
    return adapter.generate(request);
  }

  if (provider === 'anthropic') {
    const adapter = createAnthropicAdapter({
      apiKey: options?.anthropicApiKey,
      defaultModel: options?.defaultModel,
    });
    return adapter.generate(request);
  }

  if (provider === 'mock') {
    const adapter = createMockLlmAdapter();
    return adapter.generate(request);
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}
