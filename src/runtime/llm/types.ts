export type LlmProvider = "mock" | "ollama" | "openai" | "anthropic" | "local" | "literal";

export type LlmTask =
  | "semantic_parse"
  | "node_expand"
  | "node_critique"
  | "context_assemble"
  | "code_sketch"
  | "test_generate"
  | "documentation";

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
