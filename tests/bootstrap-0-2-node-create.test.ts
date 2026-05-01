import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempProject, cleanupTempProject } from './helpers/temp-project.js';
import { runCli } from './helpers/run-cli.js';

describe('Bootstrap 0.2 Node Create Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it('Test 1: node create successfully creates a node', () => {
    runCli(tempDir, ['init']);

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);

    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
    }

    // If the node create isn't fully implemented yet, let's gracefully continue but record the failure.
    // Based on user prompt, tests shouldn't be skipped but should run.
    expect(result.status).toBe(0);

    const ontologyDir = path.join(tempDir, '.ontology');
    const nodePath = path.join(ontologyDir, 'nodes', 'node_0001.json');
    expect(fs.existsSync(nodePath)).toBe(true);

    const stateContent = fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8');
    const stateData = JSON.parse(stateContent);
    expect(stateData.nodeCount).toBe(2);
    expect(stateData.eventCount).toBe(2);
    expect(stateData.edgeCount).toBe(0);

    const eventsContent = fs.readFileSync(path.join(ontologyDir, 'events.jsonl'), 'utf-8');
    const events = eventsContent.trim().split('\n').map(line => JSON.parse(line));
    const latestEvent = events[events.length - 1];
    expect(latestEvent.eventType).toBe('node_created');

    const validateResult = runCli(tempDir, ['validate']);
    expect(validateResult.status).toBe(0);
  });

  it('Test 2: node create with invalid level fails', () => {
    runCli(tempDir, ['init']);

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'invalid_level',
      '--kind', 'entity',
      '--prompt', 'Test prompt'
    ]);

    expect(result.status).not.toBe(0);

    const nodePath = path.join(tempDir, '.ontology', 'nodes', 'node_0001.json');
    expect(fs.existsSync(nodePath)).toBe(false);

    const validateResult = runCli(tempDir, ['validate']);
    expect(validateResult.status).toBe(0);
  });

  it('Test 3: node create with invalid kind fails', () => {
    runCli(tempDir, ['init']);

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'invalid_kind',
      '--prompt', 'Test prompt'
    ]);

    expect(result.status).not.toBe(0);

    const nodePath = path.join(tempDir, '.ontology', 'nodes', 'node_0001.json');
    expect(fs.existsSync(nodePath)).toBe(false);
  });

  it('Test 4: edit node without updating hash causes validation failure', () => {
    runCli(tempDir, ['init']);

    const createResult = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Initial prompt.'
    ]);
    expect(createResult.status).toBe(0);

    const nodePath = path.join(tempDir, '.ontology', 'nodes', 'node_0001.json');
    expect(fs.existsSync(nodePath)).toBe(true);

    const nodeContent = fs.readFileSync(nodePath, 'utf-8');
    const nodeData = JSON.parse(nodeContent);

    // Corrupt prompt.raw without updating the hash
    if (nodeData.prompt) {
      nodeData.prompt.raw = 'Corrupted prompt.';
    }

    fs.writeFileSync(nodePath, JSON.stringify(nodeData, null, 2), 'utf-8');

    const validateResult = runCli(tempDir, ['validate']);
    expect(validateResult.status).not.toBe(0);
    const output = validateResult.stdout + validateResult.stderr;
    expect(output).toContain('Hash mismatch');
    expect(output).toContain('node_0001');
  });
});
