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
    author
  };

  graph.nodes[newNode.id] = newNode;
  graph.head = newNode.id;

  return newNode;
}
