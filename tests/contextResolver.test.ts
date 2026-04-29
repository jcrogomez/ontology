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

  it('buildPromptPacket filters correctly for harvest intent (substring match)', async () => {
    const workspace = await loadWorkspace(cwd);
    const packet = buildPromptPacket(workspace, 'estoy cosechando unos frutos');

    expect(packet.intent).toBe('estoy cosechando unos frutos');
    expect(packet.domainEntities.map(d => d.name).sort()).toEqual(['HarvestBatch', 'InventoryLot'].sort());
    expect(packet.tasks.map(t => t.id)).toEqual(['confirm_harvest_batch']);
    expect(packet.target).toBe('react-web');
  });

  it('buildPromptPacket throws an aggregated error if required entities are missing', async () => {
    const workspace = await loadWorkspace(cwd);

    // Explicitly remove InventoryLot domain and confirm_harvest_batch task, and a component
    workspace.domainEntities = workspace.domainEntities.filter(d => d.name !== 'InventoryLot');
    workspace.tasks = workspace.tasks.filter(t => t.id !== 'confirm_harvest_batch');
    delete workspace.components['NumericWeightInput'];

    expect(() => buildPromptPacket(workspace, 'harvest')).toThrowError("Semantic context resolution failed. The following required entities are missing from the workspace: Domain('InventoryLot'), Task('confirm_harvest_batch'), Component('NumericWeightInput').");
  });

  it('buildPromptPacket returns all entities for non-harvest intent', async () => {
    const workspace = await loadWorkspace(cwd);
    const packet = buildPromptPacket(workspace, 'Just a normal task');

    expect(packet.intent).toBe('Just a normal task');
    expect(packet.domainEntities.length).toBe(workspace.domainEntities.length);
    expect(packet.tasks.length).toBe(workspace.tasks.length);
    expect(packet.componentSummaries.length).toBe(Object.keys(workspace.components).length);
  });
});
