import type { TaskType } from './types.js';

export function resolveModelForTask(task: TaskType): string {
  switch (task) {
    case 'semantic_parse':
      return 'qwen3:8b';
    case 'codegen':
      return 'qwen3-coder:30b';
    case 'evaluation':
      return 'deepseek-r1:8b';
    case 'embedding':
      return 'qwen3-embedding:4b';
    default:
      return 'qwen3:8b';
  }
}
