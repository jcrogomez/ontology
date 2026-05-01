import type { LlmTask } from './types.js';

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
