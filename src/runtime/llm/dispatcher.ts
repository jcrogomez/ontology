import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { createMockLlmAdapter } from './mock.js';
import { createOllamaAdapter } from './ollama/adapter.js';
import { createAnthropicAdapter } from './anthropic/adapter.js';
import {
  getDefaultModelForTask,
  getPreferredModelsForTask,
} from './registry.js';
import {
  isModelBannedForTask,
  llmTaskToTaskKind,
} from './model-capabilities.js';

export interface DispatchOptions {
  provider?: LlmProvider;
  ollamaHost?: string;
  defaultModel?: string;
  // Anthropic-specific override. When omitted the adapter reads
  // ANTHROPIC_API_KEY from the environment (SDK default).
  anthropicApiKey?: string;
}

// Build the ordered list of model candidates the dispatcher will try
// for a single request, accounting for the registry's `preferred[]`
// fallback semantic.
//
// Precedence (highest wins):
//   1. request.model — request-level override.
//   2. options.defaultModel — caller-resolved (per-node model.ref,
//      or CLI --model when an explicit override is set).
//   3. Task-derived list from the routing registry — when neither
//      override is set, the dispatcher tries each preferred[] entry
//      in order, falling back on `model-unavailable` errors only.
//
// When the candidate list is empty AND no override is set (e.g. the
// mock provider has no routing table), the list collapses to
// [undefined] — letting the adapter pick its built-in default.
//
// Exported for unit-testing the candidate-construction logic without
// firing an LLM adapter. See tests/llm-dispatcher.test.ts.
export function buildDispatchCandidates(
  request: LlmRequest,
  options: Pick<DispatchOptions, 'provider' | 'defaultModel'> | undefined,
): readonly (string | undefined)[] {
  const userOverride = options?.defaultModel ?? request.model;
  if (userOverride) return [userOverride];

  const provider = options?.provider ?? 'mock';
  if (provider === 'mock' || provider === 'literal') return [undefined];

  const preferred = getPreferredModelsForTask(provider, request.task);
  return preferred.length > 0 ? preferred : [undefined];
}

// Recognise the model-unavailable error family. Ollama returns
// "model 'X' not found" on 404; Anthropic surfaces "model_not_found"
// or similar in its error body. Both adapters bubble the message
// through unchanged. This match is intentionally permissive — a
// false positive (treating an unrelated error as "try next model")
// fails loudly via the next candidate's own error, and we'd rather
// fall back than block on an ambiguous string.
export function isModelUnavailableError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (message.includes('model not found')) return true;
  if (message.includes('model_not_found')) return true;
  if (message.includes('not pulled')) return true;
  if (message.includes('does not exist') && message.includes('model')) return true;
  // Anthropic 404 on a non-existent model id.
  if (message.includes('404') && message.includes('model')) return true;
  return false;
}

async function dispatchToAdapter(
  provider: LlmProvider,
  request: LlmRequest,
  options: DispatchOptions | undefined,
  model: string | undefined,
): Promise<LlmResponse> {
  if (provider === 'ollama') {
    const adapter = createOllamaAdapter({
      host: options?.ollamaHost,
      defaultModel: model,
    });
    return adapter.generate(request);
  }

  if (provider === 'anthropic') {
    const adapter = createAnthropicAdapter({
      apiKey: options?.anthropicApiKey,
      defaultModel: model,
    });
    return adapter.generate(request);
  }

  if (provider === 'mock') {
    const adapter = createMockLlmAdapter();
    return adapter.generate(request);
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

export async function dispatchLlmRequest(
  request: LlmRequest,
  options?: DispatchOptions,
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

  const candidates = buildDispatchCandidates(request, options);
  const taskKind = llmTaskToTaskKind(request.task);

  // Try each candidate. Capability ban + adapter dispatch run per
  // candidate. Only model-unavailable errors trigger fallback; bans,
  // schema errors, network failures, etc. propagate immediately.
  // Phase ε β′ (2026-05-16) surfaced the original gap: an undeployable
  // model listed first in `preferred[]` caused every dispatch to fail
  // in 2s with "model not found". The fix is here, not in registry
  // ordering — the ordering change at 598fb25 papered over the symptom.
  let lastUnavailableError: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // Capability-profile ban check (Phase ε E6 → step 3). If the
    // resolved model is documented to FAIL on this task kind by the
    // calibration profiles (model-capabilities.ts), refuse the
    // dispatch with a clear error rather than burning wall-clock +
    // API budget on a known-bad pairing. The check fires only when
    // the model is resolvable at this layer; when the adapter's
    // built-in default kicks in (candidate === undefined) we lack
    // the resolved name and the check is moot.
    if (candidate !== undefined && isModelBannedForTask(candidate, taskKind)) {
      throw new Error(
        `Model "${candidate}" is banned for task kind "${taskKind}" (LlmTask "${request.task}") by its calibration profile. See docs/legend/calibrations/BAKEOFF_3B_FAMILY_2026-05-15.md and src/runtime/llm/model-capabilities.ts for the evidence + alternative.`,
      );
    }

    try {
      return await dispatchToAdapter(provider, request, options, candidate);
    } catch (err) {
      const hasMore = i + 1 < candidates.length;
      if (hasMore && isModelUnavailableError(err)) {
        lastUnavailableError = err;
        continue;
      }
      throw err;
    }
  }

  // Unreachable in practice — the loop always either returns or
  // throws. Defensive guard so TypeScript narrows the return type.
  throw lastUnavailableError ?? new Error(
    `dispatchLlmRequest: candidate list exhausted with no result for task "${request.task}" on provider "${provider}"`,
  );
}
