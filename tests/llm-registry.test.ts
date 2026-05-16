import { describe, it, expect } from 'vitest';
import { DefaultOllamaRouting, getDefaultRoutingForTask } from '../src/runtime/llm/registry.js';
import { LlmTask } from '../src/runtime/llm/types.js';

describe('Ollama Model Registry Schema', () => {
  it('routing contains semantic_parse', () => {
    expect(DefaultOllamaRouting).toHaveProperty('semantic_parse');
    expect(DefaultOllamaRouting.semantic_parse.preferred).toBeDefined();
  });

  it('routing contains node_expand', () => {
    expect(DefaultOllamaRouting).toHaveProperty('node_expand');
    expect(DefaultOllamaRouting.node_expand.preferred).toBeDefined();
  });

  it('routing contains code_sketch', () => {
    expect(DefaultOllamaRouting).toHaveProperty('code_sketch');
    expect(DefaultOllamaRouting.code_sketch.preferred).toBeDefined();
  });

  it('getDefaultRoutingForTask returns tier and preferred', () => {
    // semantic_parse defaults were recalibrated by bake-off v2
    // (BAKEOFF_3B_FAMILY_2026-05-15.md §2.1 + §5; commit e106c02):
    // qwen2.5-coder:3b delivered deterministic ~95% single-run OK
    // rate and llama3.2:3b is the high-confidence ensemble fallback.
    // Both fit under the M1 5.3 GiB VRAM ceiling the 7-8B family
    // stressed.
    const routing = getDefaultRoutingForTask('semantic_parse');
    expect(routing).toBeDefined();
    expect(routing.tier).toBe('fast');
    expect(routing.preferred).toEqual(['qwen2.5-coder:3b', 'llama3.2:3b']);
  });

  it('unknown task fails clearly', () => {
    // Cast an unknown string to test the runtime error throwing
    expect(() => getDefaultRoutingForTask('unknown_task' as LlmTask)).toThrow('Unknown routing task: unknown_task');
  });
});
