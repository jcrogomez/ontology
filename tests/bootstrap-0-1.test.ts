import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempProject, cleanupTempProject } from './helpers/temp-project.js';
import { runCli } from './helpers/run-cli.js';

describe('Bootstrap 0.1 Smoke Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it('Test 1: init creates necessary files', () => {
    const result = runCli(tempDir, ['init']);
    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
    }
    expect(result.status).toBe(0);

    const ontologyDir = path.join(tempDir, '.ontology');
    expect(fs.existsSync(path.join(ontologyDir, 'state.json'))).toBe(true);
    expect(fs.existsSync(path.join(ontologyDir, 'events.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(ontologyDir, 'edges.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(ontologyDir, 'nodes', 'node_0000_canon.json'))).toBe(true);

    // Check registries
    expect(fs.existsSync(path.join(ontologyDir, 'models', 'registry.json'))).toBe(true);
    expect(fs.existsSync(path.join(ontologyDir, 'processors', 'registry.json'))).toBe(true);
  });

  it('Test 2: init then validate exits 0 and prints stable message', () => {
    runCli(tempDir, ['init']);
    const result = runCli(tempDir, ['validate']);
    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
    }

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('NETWORK KERNEL IS STABLE');
  });

  it('Test 3: corruption detection (hash mismatch)', () => {
    runCli(tempDir, ['init']);

    // Edit node_0000_canon.json rule without breaking schema
    const canonPath = path.join(tempDir, '.ontology', 'nodes', 'node_0000_canon.json');
    const canonContent = fs.readFileSync(canonPath, 'utf-8');
    const canonData = JSON.parse(canonContent);

    // Modify one of the rules to trigger a hash mismatch without breaking the Zod schema
    if (canonData.rules && canonData.rules.length > 0) {
        canonData.rules[0] = canonData.rules[0] + ' (corrupted)';
    }

    fs.writeFileSync(canonPath, JSON.stringify(canonData, null, 2), 'utf-8');

    const result = runCli(tempDir, ['validate']);

    expect(result.status).not.toBe(0);
    // Combine stdout and stderr since error messages might be on stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain('Hash mismatch');
  });

  it('fails when previousEventId does not point to the prior event', () => {
    runCli(tempDir, ['init']);
    runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has status.'
    ]);

    const eventsPath = path.join(tempDir, '.ontology', 'events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
    const second = JSON.parse(lines[1]);
    second.previousEventId = 'evt_broken';
    lines[1] = JSON.stringify(second);
    fs.writeFileSync(eventsPath, lines.join('\n') + '\n', 'utf-8');

    const result = runCli(tempDir, ['validate']);
    const output = result.stdout + result.stderr;

    expect(result.status).not.toBe(0);
    expect(output).toContain('previousEventId');
  });

  it('fails when event sequence is corrupted', () => {
    runCli(tempDir, ['init']);
    runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has status.'
    ]);

    const eventsPath = path.join(tempDir, '.ontology', 'events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
    const second = JSON.parse(lines[1]);
    second.sequence = 99; // Corrupt sequence
    lines[1] = JSON.stringify(second);
    fs.writeFileSync(eventsPath, lines.join('\n') + '\n', 'utf-8');

    const result = runCli(tempDir, ['validate']);
    const output = result.stdout + result.stderr;

    expect(result.status).not.toBe(0);
    expect(output).toContain('sequence');
  });

  it('fails when state.lastEventId does not match the actual last event', () => {
    runCli(tempDir, ['init']);
    runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has status.'
    ]);

    const statePath = path.join(tempDir, '.ontology', 'state.json');
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    const stateData = JSON.parse(stateContent);
    stateData.lastEventId = 'evt_fake';
    fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2), 'utf-8');

    const result = runCli(tempDir, ['validate']);
    const output = result.stdout + result.stderr;

    expect(result.status).not.toBe(0);
    expect(output).toContain('state declares evt_fake');
  });

  it('fails when a model reference is invalid', () => {
    runCli(tempDir, ['init']);
    runCli(tempDir, [
      'node', 'create',
      '--level', 'domain',
      '--kind', 'entity',
      '--prompt', 'Harvest has status.'
    ]);

    const registryPath = path.join(tempDir, '.ontology', 'models', 'registry.json');
    const content = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content);
    // Corrupt registry by clearing it
    registry.models = [];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

    const result = runCli(tempDir, ['validate']);
    const output = result.stdout + result.stderr;

    expect(result.status).not.toBe(0);
    expect(output).toContain("missing 'mock_default' model");
  });

  it('Test 4: inspect prints expected output', () => {
    runCli(tempDir, ['init']);
    const result = runCli(tempDir, ['inspect']);
    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
    }

    expect(result.status).toBe(0);

    const output = result.stdout;
    expect(output).toContain('Ontology Mathematical Canon');
    expect(output).toContain('Nodes');
    expect(output).toContain('Events');
    expect(output).toContain('Compilation not enabled yet');
  });
});
