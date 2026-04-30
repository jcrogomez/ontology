import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  parseGraph,
  serializeGraph,
  type PromptGraphState
} from './promptGraph.js';
import { pathExists } from '../utils/fs.js';

export const GRAPH_DIR = '.ontology';
export const GRAPH_FILE_NAME = 'graph.json';
export const GRAPH_FILE = `${GRAPH_DIR}/${GRAPH_FILE_NAME}`;

export function graphPath(root: string): string {
  return join(root, GRAPH_FILE);
}

export async function graphExists(root: string): Promise<boolean> {
  return pathExists(graphPath(root));
}

export async function loadPromptGraph(root: string): Promise<PromptGraphState> {
  const path = graphPath(root);

  if (!(await pathExists(path))) {
    throw new Error('Prompt graph not found. Run `onto init` first.');
  }

  return parseGraph(await readFile(path, 'utf8'));
}

export async function savePromptGraph(
  root: string,
  graph: PromptGraphState
): Promise<void> {
  const path = graphPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeGraph(graph), 'utf8');
}
