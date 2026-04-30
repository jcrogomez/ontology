import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  loadPromptGraph,
  savePromptGraph,
  graphExists,
  graphPath,
  GRAPH_FILE
} from '../src/core/promptGraphStore.js';
import { createEmptyGraph } from '../src/core/promptGraph.js';

describe('promptGraphStore', () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'ontology-test-store-'));
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('computes correct graph path', () => {
    const expectedPath = join(testRoot, GRAPH_FILE);
    expect(graphPath(testRoot)).toBe(expectedPath);
  });

  it('returns false for graphExists when graph does not exist', async () => {
    expect(await graphExists(testRoot)).toBe(false);
  });

  it('fails with a clear message when graph does not exist', async () => {
    await expect(loadPromptGraph(testRoot)).rejects.toThrow('Prompt graph not found. Run `onto init` first.');
  });

  it('creates .ontology dir and saves/loads graph successfully', async () => {
    const graph = createEmptyGraph('TestProject');

    // Check initial state
    expect(await graphExists(testRoot)).toBe(false);

    // Save graph
    await savePromptGraph(testRoot, graph);

    // Verify it exists
    expect(await graphExists(testRoot)).toBe(true);

    // Load graph and verify
    const loadedGraph = await loadPromptGraph(testRoot);
    expect(loadedGraph).toEqual(graph);
  });
});
