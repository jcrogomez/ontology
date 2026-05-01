import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempProject, cleanupTempProject } from './helpers/temp-project.js';
import { runCli } from './helpers/run-cli.js';
import { OntologyNodeSchema } from '../src/schemas/ontology.js';
import { hashObject } from '../src/core/integrity/hash.js';

describe('Bootstrap 0.2 Node Create Tests', () => {
  let tempDir: string;
  let ontologyDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    ontologyDir = path.join(tempDir, '.ontology');
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  describe('node create successes', () => {
    beforeEach(() => {
      runCli(tempDir, ['init']);

      const result = runCli(tempDir, [
        'node', 'create',
        '--level', 'domain',
        '--kind', 'entity',
        '--prompt', 'Harvest has seededQuantity, harvestedQuantity and status.'
      ]);

      expect(result.status).toBe(0);
    });

    it('node create increments nodeCount', () => {
      const stateContent = fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8');
      const stateData = JSON.parse(stateContent);
      expect(stateData.nodeCount).toBe(2);
    });

    it('node create increments eventCount', () => {
      const stateContent = fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8');
      const stateData = JSON.parse(stateContent);
      expect(stateData.eventCount).toBe(2);
    });

    it('node create updates lastEventId', () => {
      const stateContent = fs.readFileSync(path.join(ontologyDir, 'state.json'), 'utf-8');
      const stateData = JSON.parse(stateContent);

      const eventsContent = fs.readFileSync(path.join(ontologyDir, 'events.jsonl'), 'utf-8');
      const events = eventsContent.trim().split('\n').map(line => JSON.parse(line));
      const latestEvent = events[events.length - 1];

      expect(stateData.lastEventId).toBe(latestEvent.eventId);
    });

    it('node create appends node_created event', () => {
      const eventsContent = fs.readFileSync(path.join(ontologyDir, 'events.jsonl'), 'utf-8');
      const events = eventsContent.trim().split('\n').map(line => JSON.parse(line));
      const latestEvent = events[events.length - 1];

      expect(latestEvent.eventType).toBe('node_created');
      expect(latestEvent.payload.nodeId).toBe('node_0001');
    });

    it('created node validates with OntologyNodeSchema', () => {
      const nodePath = path.join(ontologyDir, 'nodes', 'node_0001.json');
      expect(fs.existsSync(nodePath)).toBe(true);

      const nodeContent = fs.readFileSync(nodePath, 'utf-8');
      const nodeData = JSON.parse(nodeContent);

      const validationResult = OntologyNodeSchema.safeParse(nodeData);
      expect(validationResult.success).toBe(true);
    });

    it('created node hash matches recomputed hash', () => {
      const nodePath = path.join(ontologyDir, 'nodes', 'node_0001.json');
      const nodeContent = fs.readFileSync(nodePath, 'utf-8');
      const nodeData = JSON.parse(nodeContent);

      const savedHash = nodeData.integrity.hash;
      expect(savedHash).toBeDefined();

      const { hash: _, ...integrityWithoutHash } = nodeData.integrity;
      const nodeForHashing = {
        ...nodeData,
        integrity: integrityWithoutHash
      };

      const recomputedHash = hashObject(nodeForHashing);
      expect(savedHash).toBe(recomputedHash);
    });
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
