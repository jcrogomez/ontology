import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { createMockLlmAdapter } from './mock.js';
import { createOllamaAdapter } from './ollama/adapter.js';
import { createAnthropicAdapter } from './anthropic/adapter.js';
import { getDefaultModelForTask } from './registry.js';
import {
  isModelBannedForTask,
  llmTaskToTaskKind,
} from './model-capabilities.js';

export async function dispatchLlmRequest(
  request: LlmRequest,
  options?: {
    provider?: LlmProvider;
    ollamaHost?: string;
    defaultModel?: string;
    // Anthropic-specific override. When omitted the adapter reads
    // ANTHROPIC_API_KEY from the environment (SDK default).
    anthropicApiKey?: string;
  }
): Promise<LlmResponse> {
  const provider = options?.provider ?? 'mock';

  if (provider === 'openai' || provider === 'local') {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  // "literal" is the non-LLM escape hatch — compileNode short-circuits
  // before reaching the dispatcher when a node has `literal` set, so we
  // should never see it here. Surface the misuse loudly rather than
  // silently passing the request to a generative provider.
  if (provider === 'literal') {
    throw new Error(`Cannot dispatch through the "literal" provider; compileNode is expected to bypass dispatch when node.literal is set`);
  }

  // Task-based default model. Precedence (lowest to highest):
  //   1. adapter's built-in DEFAULT_MODEL (last-resort)
  //   2. provider/task default from the routing registry (this layer)
  //   3. options.defaultModel — caller-resolved (per-node model.ref,
  //      or CLI --model when an explicit override is set)
  //   4. request.model — request-level override
  // The dispatcher resolves layers 1-3 here; the adapter resolves 4.
  // Effect: `--provider anthropic` alone (no --model) routes
  // semantic_parse → sonnet-4-6, inspect → haiku-4-5, code_sketch →
  // opus-4-7 — the categorical-routing claim from the design becomes
  // operational, instead of every task hitting whatever the adapter
  // hardcoded.
  const taskDefault = !options?.defaultModel && !request.model
    ? getDefaultModelForTask(provider, request.task)
    : undefined;
  const effectiveDefaultModel = options?.defaultModel ?? taskDefault;

  // Capability-profile ban check (Phase ε E6 → step 3). If the
  // resolved model is documented to FAIL on this task kind by the
  // calibration profiles (model-capabilities.ts), refuse the dispatch
  // with a clear error rather than burning wall-clock + API budget on
  // a known-bad pairing. The check fires only when the model is
  // resolvable at this layer (request.model or effectiveDefaultModel
  // is set); when the adapter's built-in default kicks in we lack the
  // resolved name here and the check is moot.
  const resolvedModel = request.model ?? effectiveDefaultModel;
  if (resolvedModel) {
    const taskKind = llmTaskToTaskKind(request.task);
    if (isModelBannedForTask(resolvedModel, taskKind)) {
      throw new Error(
        `Model "${resolvedModel}" is banned for task kind "${taskKind}" (LlmTask "${request.task}") by its calibration profile. See docs/legend/calibrations/BAKEOFF_3B_FAMILY_2026-05-15.md and src/runtime/llm/model-capabilities.ts for the evidence + alternative.`,
      );
    }
  }

  if (provider === 'ollama') {
    const adapter = createOllamaAdapter({
      host: options?.ollamaHost,
      defaultModel: effectiveDefaultModel,
    });
    return adapter.generate(request);
  }

  if (provider === 'anthropic') {
    const adapter = createAnthropicAdapter({
      apiKey: options?.anthropicApiKey,
      defaultModel: effectiveDefaultModel,
    });
    return adapter.generate(request);
  }

  if (provider === 'mock') {
    const adapter = createMockLlmAdapter();
    return adapter.generate(request);
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}
