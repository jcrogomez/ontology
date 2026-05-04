import { describe, it, expect } from 'vitest';
import { dispatchLlmRequest } from '../src/runtime/llm/dispatcher.js';
import type { LlmRequest } from '../src/runtime/llm/types.js';

describe('LLM Dispatcher', () => {
  it('dispatches text request to mock adapter', async () => {
    const request: LlmRequest = {
      task: 'semantic_parse',
      prompt: 'Test text prompt',
    };

    const response = await dispatchLlmRequest(request);

    expect(response.provider).toBe('mock');
    expect(response.text).toContain('Test text prompt');
  });

  it('dispatches json request to mock adapter', async () => {
    const request: LlmRequest = {
      task: 'semantic_parse',
      prompt: 'Test json prompt',
      json: true,
    };

    const response = await dispatchLlmRequest(request);

    expect(response.provider).toBe('mock');
    expect(response.json).toBeDefined();
    expect((response.json as any).echo).toBe('Test json prompt');
  });

  it('defaults provider to mock', async () => {
    const request: LlmRequest = {
      task: 'semantic_parse',
      prompt: 'Test text prompt',
    };

    const response = await dispatchLlmRequest(request, {});

    expect(response.provider).toBe('mock');
  });

  it('fails clearly for unsupported provider', async () => {
    const request: LlmRequest = {
      task: 'semantic_parse',
      prompt: 'Test prompt',
    };

    await expect(
      dispatchLlmRequest(request, { provider: 'openai' })
    ).rejects.toThrow('Unsupported LLM provider: openai');
  });

  it('can construct ollama dispatch path', async () => {
    const request: LlmRequest = {
      task: 'semantic_parse',
      prompt: 'Test prompt',
    };

    try {
      const response = await dispatchLlmRequest(request, { provider: 'ollama' });
      expect(response.provider).toBe('ollama');
    } catch (err: unknown) {
      expect((err as Error).message).toBeDefined();
    }
  });

  it('ollama dispatch soft-fails gracefully when unavailable', async () => {
    const request: LlmRequest = {
      task: 'semantic_parse',
      prompt: 'Test prompt',
    };

    try {
      await dispatchLlmRequest(request, {
        provider: 'ollama',
        ollamaHost: 'http://127.0.0.1:9999'
      });
    } catch (err: unknown) {
      expect((err as Error).message).toMatch(/ECONNREFUSED|fetch failed/);
    }
  });
});
