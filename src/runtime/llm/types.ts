export type LlmProvider = "mock" | "ollama" | "openai" | "anthropic" | "local" | "literal";

export type LlmTask =
  | "semantic_parse"
  | "node_expand"
  | "node_critique"
  | "context_assemble"
  | "code_sketch"
  | "test_generate"
  | "documentation"
  // Project Legend δ-1: Inspector / Lupa renders a human-readable
  // summary of a node's intent. One LLM call per node lifetime,
  // cached on the node as `translator`.
  | "inspect";

export type LlmRoutingTier =
  | "tiny"
  | "fast"
  | "balanced"
  | "deep"
  | "critic"
  | "multimodal";

export interface LlmModelHandle {
  id: string;
  provider: LlmProvider;
  name: string;
  tier: LlmRoutingTier;
  contextWindow?: number;
  multimodal: boolean;
  temperatureDefault: number;
  notes?: string;
}

export interface LlmRequest {
  task: LlmTask;
  model?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  json?: boolean;
  schemaName?: string;
  metadata?: Record<string, unknown>;
  // Optional maximum output tokens for the dispatch. When omitted,
  // each adapter applies its own conservative default (anthropic:
  // 8192). Set higher when the artifact may be large — Vibe-Reasoning
  // calibration surfaced 4096 as insufficient for files >~3KB once
  // adaptive thinking consumes part of the output budget.
  maxTokens?: number;
  // Optional input context window for the dispatch. Phase ε H2
  // discovery: Ollama defaults to num_ctx=2048 which silently
  // truncates source files of typical Ontology size (5-20 KB ≈
  // 1500-6000 tokens). When provided, the Ollama adapter forwards
  // this as `num_ctx`. Anthropic and other adapters that manage
  // context-window allocation themselves ignore the field. Adaptive
  // sizing in the ingest pipeline computes this from file size +
  // system prompt size + output budget.
  contextWindow?: number;
  // Optional thinking-mode override. When omitted, providers that
  // support adaptive thinking (anthropic Opus 4.7) leave it on. Pass
  // "disabled" to suppress thinking — useful for large prompts where
  // adaptive thinking exhausts the output budget and the response
  // comes back as empty text. Vibe-Reasoning γ-7 calibration surfaced
  // this on visualize_adaptive_strategy.py. Adapters that do not
  // support thinking (mock, ollama) ignore the field.
  thinking?: "adaptive" | "disabled";
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  evalCount?: number;
  evalDurationMs?: number;
}

export interface LlmResponse {
  text: string;
  json?: unknown;
  model: string;
  provider: LlmProvider;
  usage?: LlmUsage;
  raw?: unknown;
}

export interface LlmAdapter {
  provider: LlmProvider;
  generate(request: LlmRequest): Promise<LlmResponse>;
  listModels?(): Promise<LlmModelHandle[]>;
  health?(): Promise<{ ok: boolean; message?: string }>;
}
