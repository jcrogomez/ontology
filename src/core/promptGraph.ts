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
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathExists } from '../utils/fs.js';
import type { Diagnostic } from './diagnostics.js';

export type HierarchyLevel =
  | 'project'
  | 'canon'
  | 'domain'
  | 'task'
  | 'view'
  | 'component';

export type IntentNode = {
  id: string;
  parentId: string | null;
  hierarchyLevel: HierarchyLevel;
  promptText: string;
  artifacts: {
    oslRef?: string;
    astRef?: string;
    codeRef?: string;
    machineRef?: string;
    previewUrl?: string;
  };
  diagnostics: Diagnostic[];
  status: 'clean' | 'warning' | 'broken' | 'stale';
  createdAt: string;
  author: string;
};

export type PromptGraph = {
  version: string;
  projectName: string;
  nodes: Record<string, IntentNode>;
  head: string | null;
};

export async function loadPromptGraph(cwd: string): Promise<PromptGraph> {
  const graphPath = join(cwd, '.ontology', 'graph.json');

  if (!(await pathExists(graphPath))) {
    throw new Error('Prompt graph not found. Run `onto init` first.');
  }

  const content = await readFile(graphPath, 'utf-8');

  if (!content.trim()) {
    throw new Error('Prompt graph is empty. Run `onto init` first.');
  }

  const graph = JSON.parse(content) as PromptGraph;
  return graph;
}

export async function savePromptGraph(cwd: string, graph: PromptGraph): Promise<void> {
  const graphPath = join(cwd, '.ontology', 'graph.json');
  await writeFile(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
}

export function branchPrompt(
  graph: PromptGraph,
  parentId: string,
  promptText: string,
  hierarchyLevel: HierarchyLevel,
  author: string
): IntentNode {
  if (!graph.nodes[parentId]) {
    throw new Error(`Parent node ${parentId} not found in graph.`);
  }

  const newNode: IntentNode = {
    id: randomUUID(),
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
    author
  };

  graph.nodes[newNode.id] = newNode;
  graph.head = newNode.id;

  return newNode;
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { DiagnosticSchema } from './diagnostics.js';

export const HierarchyLevelSchema = z.enum(['project', 'canon', 'domain', 'task', 'view', 'component']);
export type HierarchyLevel = z.infer<typeof HierarchyLevelSchema>;

export const ArtifactsSchema = z.object({
  oslRef: z.string().optional(),
  astRef: z.string().optional(),
  codeRef: z.string().optional(),
});

export const NodeStatusSchema = z.enum([
  'clean',
  'warning',
  'broken',
  'stale'
]);

export const IntentNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  hierarchyLevel: HierarchyLevelSchema,
  promptText: z.string(),
  artifacts: ArtifactsSchema,
  diagnostics: z.array(DiagnosticSchema).default([]),
  status: NodeStatusSchema.default('clean'),
  timestamp: z.number(),
  author: z.string().default('developer'),
});

export type IntentNode = z.infer<typeof IntentNodeSchema>;

export const GraphStateSchema = z.object({
  nodes: z.record(z.string(), IntentNodeSchema),
  head: z.string().nullable(),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

export class PromptGraph {
  private state: GraphState;

  constructor(initialState?: GraphState) {
    this.state = initialState ?? { nodes: {}, head: null };
  }

  public addRoot(promptText: string, hierarchyLevel: HierarchyLevel = 'project', author: string = 'developer'): IntentNode {
    const id = randomUUID();
    const node: IntentNode = {
      id,
      parentId: null,
      hierarchyLevel,
      promptText,
      artifacts: {},
      diagnostics: [],
      status: 'clean',
      timestamp: Date.now(),
      author,
    };
    this.state.nodes[id] = node;
    this.state.head = id;
    return node;
  }

  public branch(parentId: string, promptText: string, hierarchyLevel: HierarchyLevel, author: string = 'developer'): IntentNode {
    if (!this.state.nodes[parentId]) {
      throw new Error(`Parent node ${parentId} does not exist in the graph.`);
    }

    const id = randomUUID();
    const node: IntentNode = {
      id,
      parentId,
      hierarchyLevel,
      promptText,
      artifacts: {},
      diagnostics: [],
      status: 'clean',
      timestamp: Date.now(),
      author,
    };

    this.state.nodes[id] = node;
    this.state.head = id;
    return node;
  }

  public updateArtifacts(nodeId: string, artifacts: z.infer<typeof ArtifactsSchema>, diagnostics: z.infer<typeof DiagnosticSchema>[] = []) {
    if (!this.state.nodes[nodeId]) throw new Error(`Node ${nodeId} not found.`);

    this.state.nodes[nodeId].artifacts = { ...this.state.nodes[nodeId].artifacts, ...artifacts };
    this.state.nodes[nodeId].diagnostics = diagnostics;

    let status: z.infer<typeof NodeStatusSchema> = 'clean';
    for (const diag of diagnostics) {
      if (diag.severity === 'error' || diag.severity === 'blocking') {
        status = 'broken';
        break;
      } else if (diag.severity === 'warning') {
        status = 'warning';
      }
    }

    this.state.nodes[nodeId].status = status;
  }

  public getAncestors(nodeId: string): IntentNode[] {
    const lineage: IntentNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const currentNode: IntentNode | undefined = this.state.nodes[currentId];
      if (!currentNode) {
        break;
      }
      lineage.unshift(currentNode);
      currentId = currentNode.parentId;
    }
    return lineage;
  }

  public getNode(nodeId: string): IntentNode | undefined {
    return this.state.nodes[nodeId];
  }

  public getHead(): string | null {
    return this.state.head;
  }

  public checkout(nodeId: string): void {
    if (!this.state.nodes[nodeId]) throw new Error(`Node ${nodeId} not found.`);
    this.state.head = nodeId;
  }

  public serialize(): string {
    return JSON.stringify(this.state, null, 2);
  }

  public static deserialize(json: string): PromptGraph {
    const parsed = JSON.parse(json);
    const validState = GraphStateSchema.parse(parsed);
    return new PromptGraph(validState);
  }
}
