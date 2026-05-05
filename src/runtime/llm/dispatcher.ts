import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { createMockLlmAdapter } from './mock.js';
import { createOllamaAdapter } from './ollama/adapter.js';

export async function dispatchLlmRequest(
  request: LlmRequest,
  options?: {
    provider?: LlmProvider;
    ollamaHost?: string;
    defaultModel?: string;
  }
): Promise<LlmResponse> {
  const provider = options?.provider ?? 'mock';

  if (provider === 'openai' || provider === 'anthropic' || provider === 'local') {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  if (provider === 'ollama') {
    const adapter = createOllamaAdapter({
      host: options?.ollamaHost,
      defaultModel: options?.defaultModel
    });
    return adapter.generate(request);
  }

  if (provider === 'mock') {
    const adapter = createMockLlmAdapter();
    return adapter.generate(request);
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}
