import type { LlmProvider, LlmRequest, LlmResponse, LlmTask } from './types.js';
import { createMockLlmAdapter } from './mock.js';
import { createOllamaAdapter } from './ollama/adapter.js';

export function resolveModelForTask(task: LlmTask): string {
  switch (task) {
    case 'semantic_parse':
      return 'qwen3:8b';
    case 'code_sketch':
      return 'qwen3-coder:30b';
    case 'node_critique':
      return 'deepseek-r1:8b';
    case 'context_assemble':
      return 'qwen3-embedding:4b';
    default:
      return 'qwen3:8b';
  }
}

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
