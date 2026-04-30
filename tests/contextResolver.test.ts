import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { loadWorkspace, buildPromptPacket } from '../src/core/contextResolver.js';
import { createSeedFiles } from '../src/core/init-seeds.js';
import { writeYamlFile } from '../src/utils/fs.js';

describe('contextResolver', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'onto-resolver-'));
    const seeds = createSeedFiles('TestProject');

    // Create necessary directories manually or mock the config paths structure
    const fs = await import('node:fs/promises');
    await fs.mkdir(join(cwd, 'ontology', 'canon'), { recursive: true });
    await fs.mkdir(join(cwd, 'ontology', 'domain'), { recursive: true });
    await fs.mkdir(join(cwd, 'ontology', 'tasks'), { recursive: true });
    await fs.mkdir(join(cwd, 'ontology', 'components'), { recursive: true });
    await fs.mkdir(join(cwd, 'ontology', 'tokens'), { recursive: true });

    for (const seed of seeds) {
      await writeYamlFile(join(cwd, seed.path), seed.value);
    }
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('loads workspace correctly', async () => {
    const workspace = await loadWorkspace(cwd);

    expect(workspace.config.projectName).toBe('TestProject');
    expect(workspace.domainEntities.length).toBeGreaterThan(0);
    expect(workspace.tasks.length).toBeGreaterThan(0);
    expect(Object.keys(workspace.components).length).toBeGreaterThan(0);
  });

  it('buildPromptPacket filters correctly for IDE intent (substring match)', async () => {
    const workspace = await loadWorkspace(cwd);
    const packet = buildPromptPacket(workspace, 'estoy compilando una vista');

    expect(packet.intent).toBe('estoy compilando una vista');
    expect(packet.domainEntities.map(d => d.name).sort()).toEqual(['Pipeline', 'Workspace'].sort());
    expect(packet.tasks.map(t => t.id).sort()).toEqual(['shift_abstraction_level', 'trigger_compilation'].sort());
    expect(packet.target).toBe('react-web');
  });

  it('buildPromptPacket throws an aggregated error if required entities are missing', async () => {
    const workspace = await loadWorkspace(cwd);

    // Explicitly remove Pipeline domain and trigger_compilation task, and a component
    workspace.domainEntities = workspace.domainEntities.filter(d => d.name !== 'Pipeline');
    workspace.tasks = workspace.tasks.filter(t => t.id !== 'trigger_compilation');
    delete workspace.components['CodeViewer'];

    expect(() => buildPromptPacket(workspace, 'compile')).toThrowError("Semantic context resolution failed. The following required entities are missing from the workspace: Domain('Pipeline'), Task('trigger_compilation'), Component('CodeViewer').");
  });

  it('buildPromptPacket returns all entities for non-ide intent', async () => {
    const workspace = await loadWorkspace(cwd);
    const packet = buildPromptPacket(workspace, 'Just a normal task');

    expect(packet.intent).toBe('Just a normal task');
    expect(packet.domainEntities.length).toBe(workspace.domainEntities.length);
    expect(packet.tasks.length).toBe(workspace.tasks.length);
    expect(packet.componentSummaries.length).toBe(Object.keys(workspace.components).length);
  });
});
