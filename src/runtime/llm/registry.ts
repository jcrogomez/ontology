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
  }
} as const;

export type RoutingTask = keyof typeof DefaultOllamaRouting;

export function getDefaultRoutingForTask(task: RoutingTask) {
  const routing = DefaultOllamaRouting[task];
  if (!routing) {
    throw new Error(`Unknown routing task: ${String(task)}`);
  }
  return routing;
}
