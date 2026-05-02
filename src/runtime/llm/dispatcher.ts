import type { LlmProvider, LlmRequest, LlmResponse, LlmTask } from './types.js';
import { createMockLlmAdapter } from './mock.js';

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
  options?: { provider?: LlmProvider }
): Promise<LlmResponse> {
  const provider = options?.provider ?? 'mock';

  if (provider !== 'mock') {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const adapter = createMockLlmAdapter();
  return adapter.generate(request);
}
