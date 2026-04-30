import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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

function statusFromDiagnostics(diagnostics: Diagnostic[]): NodeStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error' || diagnostic.severity === 'blocking')) {
    return 'broken';
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'warning')) {
    return 'warning';
  }

  return 'clean';
}

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
  author = 'developer'
): PromptGraphState {
  if (Object.keys(graph.nodes).length > 0) {
    throw new Error('Graph already has a root prompt.');
  }

  const node: IntentNode = {
    id: randomUUID(),
    parentId: null,
    hierarchyLevel: 'project',
    promptText,
    artifacts: {},
    diagnostics: [],
    status: 'clean',
    createdAt: new Date().toISOString(),
    author
  };

  return PromptGraphStateSchema.parse({
    ...graph,
    nodes: {
      ...graph.nodes,
      [node.id]: node
    },
    head: node.id
  });
}

export function branchPrompt(
  graph: PromptGraphState,
  parentId: string,
  promptText: string,
  hierarchyLevel: HierarchyLevel,
  author = 'developer'
): PromptGraphState {
  if (!graph.nodes[parentId]) {
    throw new Error(`Parent node ${parentId} does not exist in the graph.`);
  }

  const node: IntentNode = {
    id: randomUUID(),
    parentId,
    hierarchyLevel,
    promptText,
    artifacts: {},
    diagnostics: [],
    status: 'clean',
    createdAt: new Date().toISOString(),
    author
  };

  return PromptGraphStateSchema.parse({
    ...graph,
    nodes: {
      ...graph.nodes,
      [node.id]: node
    },
    head: node.id
  });
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
    const graphNode: IntentNode | undefined = graph.nodes[currentId];

    if (!graphNode) {
      throw new Error(`Node ${currentId} not found in graph lineage.`);
    }

    lineage.unshift(graphNode);
    currentId = graphNode.parentId;
  }

  return lineage;
}

export function checkout(
  graph: PromptGraphState,
  nodeId: string
): PromptGraphState {
  if (!graph.nodes[nodeId]) {
    throw new Error(`Node ${nodeId} not found.`);
  }

  return PromptGraphStateSchema.parse({
    ...graph,
    head: nodeId
  });
}

export function updateNodeArtifacts(
  graph: PromptGraphState,
  nodeId: string,
  artifacts: Partial<PromptArtifactRefs>,
  diagnostics: Diagnostic[] = []
): PromptGraphState {
  const node = graph.nodes[nodeId];

  if (!node) {
    throw new Error(`Node ${nodeId} not found.`);
  }

  const updatedNode: IntentNode = {
    ...node,
    artifacts: {
      ...node.artifacts,
      ...artifacts
    },
    diagnostics,
    status: statusFromDiagnostics(diagnostics)
  };

  return PromptGraphStateSchema.parse({
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: updatedNode
    }
  });
}

export function serializeGraph(graph: PromptGraphState): string {
  const validGraph = PromptGraphStateSchema.parse(graph);
  return JSON.stringify(validGraph, null, 2);
}

export function parseGraph(json: string): PromptGraphState {
  return PromptGraphStateSchema.parse(JSON.parse(json));
}
