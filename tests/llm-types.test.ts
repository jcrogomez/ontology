import { describe, it, expect } from 'vitest';
import type {
  LlmProvider,
  LlmTask,
  LlmRoutingTier,
  LlmModelHandle,
  LlmRequest,
  LlmUsage,
  LlmResponse,
  LlmAdapter
} from '../src/runtime/llm/types.js';

describe('LLM Runtime Types', () => {
  it('should allow constructing a valid LlmModelHandle', () => {
    const handle: LlmModelHandle = {
      id: 'mock-model-1',
      provider: 'mock',
      name: 'Mock Model',
      tier: 'fast',
      contextWindow: 8192,
      multimodal: false,
      temperatureDefault: 0.7,
      notes: 'Used for testing'
    };

    expect(handle.id).toBe('mock-model-1');
    expect(handle.provider).toBe('mock');
  });

  it('should reject invalid LlmModelHandle (missing required fields)', () => {
    // @ts-expect-error - missing 'multimodal' and 'temperatureDefault'
    const invalidHandle: LlmModelHandle = {
      id: 'mock-model-2',
      provider: 'openai',
      name: 'Invalid Model',
      tier: 'balanced'
    };
  });

  it('should reject invalid LlmModelHandle (invalid literal types)', () => {
    // @ts-expect-error - invalid provider
    const invalidProvider: LlmModelHandle = {
      id: 'mock-model-3',
      provider: 'invalid-provider',
      name: 'Model',
      tier: 'fast',
      multimodal: false,
      temperatureDefault: 1.0
    };

    // @ts-expect-error - invalid tier
    const invalidTier: LlmModelHandle = {
      id: 'mock-model-4',
      provider: 'anthropic',
      name: 'Model',
      tier: 'invalid-tier',
      multimodal: true,
      temperatureDefault: 0.5
    };
  });

  it('should allow constructing a valid LlmRequest', () => {
    const request: LlmRequest = {
      task: 'semantic_parse',
      prompt: 'Parse this context.',
      model: 'gpt-4o-mini',
      temperature: 0.0,
      json: true
    };

    expect(request.task).toBe('semantic_parse');
    expect(request.prompt).toBe('Parse this context.');
  });

  it('should reject invalid LlmRequest (missing prompt)', () => {
    // @ts-expect-error - missing 'prompt'
    const invalidRequest: LlmRequest = {
      task: 'node_expand'
    };
  });

  it('should reject invalid LlmRequest (invalid task)', () => {
    // @ts-expect-error - invalid task
    const invalidRequest: LlmRequest = {
      task: 'invalid_task',
      prompt: 'Do something'
    };
  });

  it('should allow constructing a valid LlmResponse with LlmUsage', () => {
    const usage: LlmUsage = {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      evalCount: 1,
      evalDurationMs: 150
    };

    const response: LlmResponse = {
      text: 'Here is the response',
      model: 'llama-3',
      provider: 'ollama',
      usage
    };

    expect(response.text).toBe('Here is the response');
    expect(response.usage?.totalTokens).toBe(30);
  });

  it('should reject invalid LlmResponse (missing text)', () => {
    // @ts-expect-error - missing 'text'
    const invalidResponse: LlmResponse = {
      model: 'local-model',
      provider: 'local'
    };
  });

  it('should allow constructing a valid LlmAdapter', async () => {
    const adapter: LlmAdapter = {
      provider: 'mock',
      generate: async (request: LlmRequest): Promise<LlmResponse> => {
        return {
          text: `Mock response for ${request.task}`,
          model: 'mock-model',
          provider: 'mock'
        };
      },
      listModels: async (): Promise<LlmModelHandle[]> => {
        return [];
      },
      health: async () => {
        return { ok: true };
      }
    };

    expect(adapter.provider).toBe('mock');
    const response = await adapter.generate({ task: 'code_sketch', prompt: 'write code' });
    expect(response.text).toContain('code_sketch');
  });

  it('should reject invalid LlmAdapter (missing generate method)', () => {
    // @ts-expect-error - missing 'generate'
    const invalidAdapter: LlmAdapter = {
      provider: 'ollama'
    };
  });
});
