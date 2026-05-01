import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createTempProject, cleanupTempProject } from './helpers/temp-project.js';
import { runCli } from './helpers/run-cli.js';
import {
  assertOntologyProject,
  loadState,
  loadNodes,
  loadNodeById,
  loadEvents,
  loadEdges,
  loadModelsRegistry,
  loadProcessorsRegistry
} from '../src/core/project/load.js';

describe('core/project/load observational loaders', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempProject();
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tempDir);
  });

  it('loaders fail clearly before init', () => {
    expect(() => assertOntologyProject()).toThrow('.ontology directory not found');
    expect(() => loadState()).toThrow('Missing required file: .ontology/state.json');
    expect(() => loadNodes()).toThrow('Missing required directory: .ontology/nodes');
    expect(() => loadEvents()).toThrow('Missing required file: .ontology/events.jsonl');
    expect(() => loadEdges()).toThrow('Missing required file: .ontology/edges.jsonl');
    expect(() => loadModelsRegistry()).toThrow('Missing required file: .ontology/models/registry.json');
    expect(() => loadProcessorsRegistry()).toThrow('Missing required file: .ontology/processors/registry.json');
  });

  it('loadState works after init', () => {
    runCli(tempDir, ['init']);
    const state = loadState();
    expect(state.initialized).toBe(true);
    expect(state.schemaVersion).toBe('0.1.0');
    expect(state.nodeCount).toBe(1);
  });

  it('loadNodes works after init', () => {
    runCli(tempDir, ['init']);
    const nodes = loadNodes();
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('node_0000_canon');
  });

  it('loadNodeById returns canon after init', () => {
    runCli(tempDir, ['init']);
    const node = loadNodeById('node_0000_canon');
    expect(node).not.toBeNull();
    expect(node?.id).toBe('node_0000_canon');
  });

  it('loadNodeById returns null for missing node', () => {
    runCli(tempDir, ['init']);
    const node = loadNodeById('node_invalid');
    expect(node).toBeNull();
  });

  it('loadEvents works after init', () => {
    runCli(tempDir, ['init']);
    const events = loadEvents();
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('system_init');
  });

  it('loadEdges works after init', () => {
    runCli(tempDir, ['init']);
    const edges = loadEdges();
    expect(Array.isArray(edges)).toBe(true);
  });

  it('load registries works after init', () => {
    runCli(tempDir, ['init']);
    const models = loadModelsRegistry();
    expect(models.models.length).toBeGreaterThan(0);

    const processors = loadProcessorsRegistry();
    expect(processors.processors.length).toBeGreaterThan(0);
  });
});
