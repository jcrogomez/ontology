import { LlmTask, LlmRoutingTier } from "./types.js";

export type OllamaRoutingEntry = {
  tier: LlmRoutingTier;
  preferred: readonly string[];
};

export const DefaultOllamaRouting = {
  semantic_parse: {
    tier: "fast",
    preferred: ["qwen2.5-coder:7b", "llama3.1:8b"]
  },
  node_expand: {
    tier: "balanced",
    preferred: ["qwen2.5:14b", "llama3.1:8b"]
  },
  node_critique: {
    tier: "critic",
    preferred: ["qwen2.5:14b", "deepseek-r1:14b"]
  },
  context_assemble: {
    tier: "fast",
    preferred: ["llama3.1:8b"]
  },
  code_sketch: {
    tier: "balanced",
    preferred: ["qwen2.5-coder:14b", "qwen2.5-coder:7b"]
  },
  test_generate: {
    tier: "balanced",
    preferred: ["qwen2.5-coder:14b", "qwen2.5-coder:7b"]
  },
  documentation: {
    tier: "fast",
    preferred: ["llama3.1:8b", "qwen2.5:7b"]
  },
  // Project Legend δ-1 — the Inspector. Short prose summary, doesn't
  // need the heavy critic tier; a fast model is fine and keeps the
  // per-node lifetime cost low.
  inspect: {
    tier: "fast",
    preferred: ["llama3.1:8b", "qwen2.5:7b"]
  }
} as const satisfies Record<LlmTask, OllamaRoutingEntry>;

export function getDefaultRoutingForTask(task: LlmTask): OllamaRoutingEntry {
  const routing = DefaultOllamaRouting[task];
  if (!routing) {
    throw new Error(`Unknown routing task: ${String(task)}`);
  }
  return routing;
}
