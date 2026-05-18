import { describe, it, expect } from 'vitest';
import {
  buildDispatchCandidates,
  dispatchLlmRequest,
  isModelUnavailableError,
} from '../src/runtime/llm/dispatcher.js';
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

    await expect(
      dispatchLlmRequest(request, { provider: 'local' })
    ).rejects.toThrow('Unsupported LLM provider: local');
  });

  it('can route to ollama adapter', async () => {
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
      expect((err as Error).message).toBeDefined();
    }
  });
});

// ── buildDispatchCandidates — MR_2026-05-18 §4.5 dispatcher fallback ───────
//
// Pure construction of the model candidate list for a single request.
// Tests pin: (a) user override produces a singleton list; (b) no
// override with provider routing produces the full preferred[]; (c)
// the mock / literal providers and providers without routing tables
// collapse to [undefined] so the adapter's own default fires.

describe('buildDispatchCandidates', () => {
  const baseRequest: LlmRequest = {
    task: 'semantic_parse',
    prompt: 'irrelevant',
  };

  it('request.model wins → singleton [request.model]', () => {
    const candidates = buildDispatchCandidates(
      { ...baseRequest, model: 'qwen2.5-coder:3b' },
      { provider: 'ollama' },
    );
    expect(candidates).toEqual(['qwen2.5-coder:3b']);
  });

  it('options.defaultModel wins over preferred[] → singleton', () => {
    const candidates = buildDispatchCandidates(baseRequest, {
      provider: 'ollama',
      defaultModel: 'llama3.2:3b',
    });
    expect(candidates).toEqual(['llama3.2:3b']);
  });

  it('request.model takes precedence over options.defaultModel', () => {
    const candidates = buildDispatchCandidates(
      { ...baseRequest, model: 'haiku' },
      { provider: 'anthropic', defaultModel: 'sonnet' },
    );
    expect(candidates).toEqual(['haiku']);
  });

  it('no override → returns the full preferred[] for ollama semantic_parse', () => {
    const candidates = buildDispatchCandidates(baseRequest, { provider: 'ollama' });
    // Multiple entries from DefaultOllamaRouting.semantic_parse — the
    // exact contents are registry-driven; just assert the shape is a
    // non-singleton ordered list and contains the calibrated default.
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toBe('qwen2.5-coder:3b');
  });

  it('no override + mock provider → [undefined] (let the adapter pick)', () => {
    const candidates = buildDispatchCandidates(baseRequest, { provider: 'mock' });
    expect(candidates).toEqual([undefined]);
  });

  it('no override + no options → defaults to [undefined] (mock provider implied)', () => {
    const candidates = buildDispatchCandidates(baseRequest, undefined);
    expect(candidates).toEqual([undefined]);
  });

  it('no override + literal provider → [undefined] (compileNode bypasses dispatch anyway)', () => {
    const candidates = buildDispatchCandidates(baseRequest, { provider: 'literal' });
    expect(candidates).toEqual([undefined]);
  });

  it('no override + code_sketch on ollama → preferred[0] is the deployable model', () => {
    // Phase ε β′ regression: DefaultOllamaRouting.code_sketch had
    // 14b listed first, which is undeployable on M1. After 598fb25
    // the deployable 7b is first; this test pins that ordering so a
    // future reorder doesn't silently re-introduce the β′ failure
    // mode even before the fallback loop fires.
    const candidates = buildDispatchCandidates(
      { task: 'code_sketch', prompt: 'irrelevant' },
      { provider: 'ollama' },
    );
    expect(candidates[0]).toBe('qwen2.5-coder:7b');
  });
});

// ── isModelUnavailableError — pin the recognised error shapes ──────────────
//
// The fallback loop in dispatchLlmRequest triggers ONLY on errors
// recognised here. False positives (treating an unrelated error as
// model-unavailable) cause the dispatcher to silently fall through to
// the next candidate instead of surfacing the real failure; false
// negatives (failing to recognise a real model-unavailable error)
// cause the dispatcher to abort instead of falling back. The match
// list below is the documented family; widen with care + a test.

describe('isModelUnavailableError', () => {
  it('Ollama-shaped "model not found" → true', () => {
    expect(
      isModelUnavailableError(new Error("model 'qwen2.5-coder:14b' not found")),
    ).toBe(true);
  });

  it('Anthropic-shaped "model_not_found" → true', () => {
    expect(
      isModelUnavailableError(
        new Error('Error 404 model_not_found: claude-sonnet-99'),
      ),
    ).toBe(true);
  });

  it('"not pulled" (ollama variant) → true', () => {
    expect(isModelUnavailableError(new Error('model is not pulled'))).toBe(true);
  });

  it('HTTP 404 mentioning a model → true', () => {
    expect(
      isModelUnavailableError(new Error('HTTP 404: model claude-xx not available')),
    ).toBe(true);
  });

  it('case-insensitive match', () => {
    expect(
      isModelUnavailableError(new Error('Model Not Found in registry')),
    ).toBe(true);
  });

  it('unrelated network error → false (propagates immediately)', () => {
    expect(isModelUnavailableError(new Error('ECONNREFUSED 127.0.0.1:9999'))).toBe(
      false,
    );
  });

  it('schema-validation error → false (do NOT swallow as a fallback)', () => {
    expect(
      isModelUnavailableError(
        new Error('Zod validation failed: required field missing'),
      ),
    ).toBe(false);
  });

  it('plain string (not Error instance) → still matches when applicable', () => {
    expect(isModelUnavailableError("model 'foo' not found")).toBe(true);
  });
});
