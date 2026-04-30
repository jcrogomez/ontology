import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { DiagnosticSchema, type Diagnostic } from './diagnostics.js';

export const HierarchyLevelSchema = z.enum([
  'project',
  'canon',
  'domain',
  'task',
  'view',
  'component'
]);

export const NodeStatusSchema = z.enum([
  'clean',
  'warning',
  'broken',
  'stale'
]);

export const PromptArtifactRefsSchema = z.object({
  oslRef: z.string().optional(),
  astRef: z.string().optional(),
  codeRef: z.string().optional(),
  machineRef: z.string().optional(),
  previewUrl: z.string().optional()
});

export const IntentNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  hierarchyLevel: HierarchyLevelSchema,
  promptText: z.string(),
  artifacts: PromptArtifactRefsSchema.default({}),
  diagnostics: z.array(DiagnosticSchema).default([]),
  status: NodeStatusSchema.default('clean'),
  createdAt: z.string(),
  author: z.string().default('developer')
});

export const PromptGraphStateSchema = z.object({
  version: z.string(),
  projectName: z.string(),
  nodes: z.record(z.string(), IntentNodeSchema),
  head: z.string().nullable()
});

export type HierarchyLevel = z.infer<typeof HierarchyLevelSchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type PromptArtifactRefs = z.infer<typeof PromptArtifactRefsSchema>;
export type IntentNode = z.infer<typeof IntentNodeSchema>;
export type PromptGraphState = z.infer<typeof PromptGraphStateSchema>;

export function createEmptyGraph(projectName: string): PromptGraphState {
  return {
    version: '1.0.0',
    projectName,
    nodes: {},
    head: null
  };
}

export function addRootPrompt(
  graph: PromptGraphState,
  promptText: string,
  author?: string
): PromptGraphState {
  const hasRoot = Object.values(graph.nodes).some((node: IntentNode) => node.parentId === null);
  if (hasRoot) {
    throw new Error('Graph already has a root prompt.');
  }

  const id = randomUUID();
  const newNode: IntentNode = {
    id,
    parentId: null,
    hierarchyLevel: 'project',
    promptText,
    artifacts: {},
    diagnostics: [],
    status: 'clean',
    createdAt: new Date().toISOString(),
    author: author || 'developer'
  };

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [id]: newNode
    },
    head: id
  };
}

export function branchPrompt(
  graph: PromptGraphState,
  parentId: string,
  promptText: string,
  hierarchyLevel: HierarchyLevel,
  author?: string
): PromptGraphState {
  if (!graph.nodes[parentId]) {
    throw new Error(`Parent node ${parentId} does not exist in graph.`);
  }

  const id = randomUUID();
  const newNode: IntentNode = {
    id,
    parentId,
    hierarchyLevel,
    promptText,
    artifacts: {},
    diagnostics: [],
    status: 'clean',
    createdAt: new Date().toISOString(),
    author: author || 'developer'
  };

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [id]: newNode
    },
    head: id
  };
}

export function getNode(
  graph: PromptGraphState,
  nodeId: string
): IntentNode | undefined {
  return graph.nodes[nodeId];
}

export function getAncestors(
  graph: PromptGraphState,
  nodeId: string
): IntentNode[] {
  const lineage: IntentNode[] = [];
  let currentId: string | null = nodeId;

  while (currentId !== null) {
    const n: IntentNode | undefined = graph.nodes[currentId];
    if (!n) {
      throw new Error(`Missing node ${currentId} in lineage.`);
    }
    lineage.unshift(n);
    currentId = n.parentId;
  }

  return lineage;
}

export function checkout(
  graph: PromptGraphState,
  nodeId: string
): PromptGraphState {
  if (!graph.nodes[nodeId]) {
    throw new Error(`Node ${nodeId} does not exist in graph.`);
  }

  return {
    ...graph,
    head: nodeId
  };
}

export function updateNodeArtifacts(
  graph: PromptGraphState,
  nodeId: string,
  artifacts: Partial<PromptArtifactRefs>,
  diagnostics?: Diagnostic[]
): PromptGraphState {
  const node = graph.nodes[nodeId];
  if (!node) {
    throw new Error(`Node ${nodeId} does not exist in graph.`);
  }

  const mergedArtifacts = {
    ...node.artifacts,
    ...artifacts
  };

  const newDiagnostics = diagnostics ?? node.diagnostics;

  let status: NodeStatus = 'clean';
  if (newDiagnostics.length > 0) {
    const hasError = newDiagnostics.some(d => d.severity === 'error' || d.severity === 'blocking');
    const hasWarning = newDiagnostics.some(d => d.severity === 'warning');

    if (hasError) {
      status = 'broken';
    } else if (hasWarning) {
      status = 'warning';
    }
  }

  const updatedNode: IntentNode = {
    ...node,
    artifacts: mergedArtifacts,
    diagnostics: newDiagnostics,
    status
  };

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: updatedNode
    }
  };
}

export function serializeGraph(graph: PromptGraphState): string {
  PromptGraphStateSchema.parse(graph);
  return JSON.stringify(graph, null, 2);
}

export function parseGraph(json: string): PromptGraphState {
  const parsed = JSON.parse(json);
  return PromptGraphStateSchema.parse(parsed);
}
