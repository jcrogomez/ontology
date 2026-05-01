import { describe, it, expect } from 'vitest';
import { DefaultOllamaRouting, getDefaultRoutingForTask, RoutingTask } from '../src/runtime/llm/registry.js';

describe('Ollama Model Registry Schema', () => {
  it('routing contains semantic_parse', () => {
    expect(DefaultOllamaRouting).toHaveProperty('semantic_parse');
    expect(DefaultOllamaRouting.semantic_parse.preferred).toBeDefined();
  });

  it('routing contains code_sketch', () => {
    expect(DefaultOllamaRouting).toHaveProperty('code_sketch');
    expect(DefaultOllamaRouting.code_sketch.preferred).toBeDefined();
  });

  it('getDefaultRoutingForTask returns full routing object including preferred models', () => {
    const routing = getDefaultRoutingForTask('semantic_parse');
    expect(routing).toBeDefined();
    expect(routing.tier).toBe('fast');
    expect(routing.preferred).toEqual(['qwen2.5-coder:7b', 'llama3.1:8b']);
  });

  it('unknown task fails clearly', () => {
    // Cast an unknown string to test the runtime error throwing
    expect(() => getDefaultRoutingForTask('unknown_task' as RoutingTask)).toThrow('Unknown routing task: unknown_task');
  });
});
