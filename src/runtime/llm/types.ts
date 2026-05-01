export type TaskType = 'semantic_parse' | 'codegen' | 'evaluation' | 'embedding';

export interface ModelRunProvenance {
  taskType: TaskType;
  selectedModel: string;
  fallbackDepth: number;
  cacheHit: boolean;
  totalDurationMs: number;
  loadDurationMs?: number;
  promptEvalCount?: number;
  evalCount?: number;
  schemaValidated: boolean;
  schemaFailure?: string;
  toolCallsCount: number;
  queueWaitMs: number;
  resultHash: string;
  sourceNodeIds: string[];
  eventId: string;
}
