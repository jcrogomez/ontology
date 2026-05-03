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

  it('node create increments nodeCount', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');
    const stateBefore = JSON.parse(fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8'));

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    const stateAfter = JSON.parse(fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8'));
    expect(stateAfter.nodeCount).toBe(stateBefore.nodeCount + 1);
  });

  it('node create increments eventCount', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');
    const stateBefore = JSON.parse(fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8'));

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    const stateAfter = JSON.parse(fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8'));
    expect(stateAfter.eventCount).toBe(stateBefore.eventCount + 1);
  });

  it('node create updates lastEventId', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');
    const stateBefore = JSON.parse(fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8'));

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    const stateAfter = JSON.parse(fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8'));
    expect(stateAfter.lastEventId).not.toBe(stateBefore.lastEventId);
  });

  it('node create appends node_created event', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    const eventsContent = fs.readFileSync(path.join(ontologyDir, 'events.jsonl'), 'utf-8');
    const events = eventsContent.trim().split('\n').map(line => JSON.parse(line));
    const latestEvent = events[events.length - 1];

    expect(latestEvent.eventType).toBe('node_created');
  });

  it('created node validates with OntologyNodeSchema', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    const validateResult = runCli(tempDir, ['validate']);
    expect(validateResult.status).toBe(0);
  });

  it('created node hash matches recomputed hash', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    // Run validate since validate checks hash integrity
    const validateResult = runCli(tempDir, ['validate']);
    expect(validateResult.status).toBe(0);
  });

  it('node create preserves previous event chain', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');
    const stateBefore = JSON.parse(fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8'));

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    const eventsContent = fs.readFileSync(path.join(ontologyDir, 'events.jsonl'), 'utf-8');
    const events = eventsContent.trim().split('\n').map(line => JSON.parse(line));
    const latestEvent = events[events.length - 1];

    expect(latestEvent.previousEventId).toBe(stateBefore.lastEventId);
  });

  it('node create does not mutate existing canon node', () => {
    runCli(tempDir, ['init']);
    const ontologyDir = path.join(tempDir, '.ontology');
    const canonPath = path.join(ontologyDir, 'nodes', 'node_0000_canon.json');
    const canonBefore = fs.readFileSync(canonPath, 'utf-8');

    const result = runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
    ]);
    expect(result.status).toBe(0);

    const canonAfter = fs.readFileSync(canonPath, 'utf-8');
    expect(canonAfter).toBe(canonBefore);
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
