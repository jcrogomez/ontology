import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { createCliProgram } from '../src/cli/program.js';
import {
  buildPromptPacket,
  findRelevantContext,
  loadWorkspace
} from '../src/core/contextResolver.js';
import { initOntologyProject } from '../src/core/init.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe('context resolver', () => {
  it('loadWorkspace loads an initialized project', async () => {
    const workspaceRoot = await createInitializedWorkspace();

    const workspace = await loadWorkspace(workspaceRoot);

    expect(workspace.rootDir).toBe(workspaceRoot);
    expect(workspace.config.projectName).toBe('workspace');
    expect(workspace.canon).toHaveLength(1);
    expect(workspace.domainEntities).toHaveLength(2);
    expect(workspace.tasks).toHaveLength(1);
    expect(Object.keys(workspace.componentRegistry.components)).toEqual([
      'Screen',
      'HeaderSummary',
      'NumericWeightInput',
      'VarianceAlert',
      'StickyPrimaryButton',
      'OfflineSyncBadge'
    ]);
    expect(workspace.tokens).toHaveLength(1);
  });

  it('harvest or cosecha intent selects HarvestBatch and InventoryLot', async () => {
    const workspace = await loadWorkspace(await createInitializedWorkspace());

    const relevant = findRelevantContext(
      workspace,
      'Necesito confirmar la cosecha con peso y merma.'
    );

    expect(relevant.domainEntities.map((entity) => entity.name)).toEqual([
      'HarvestBatch',
      'InventoryLot'
    ]);
  });

  it('harvest or cosecha intent selects confirm_harvest_batch', async () => {
    const workspace = await loadWorkspace(await createInitializedWorkspace());

    const relevant = findRelevantContext(
      workspace,
      'Confirm harvest variance and queue offline sync.'
    );

    expect(relevant.tasks.map((task) => task.id)).toEqual([
      'confirm_harvest_batch'
    ]);
  });

  it('harvest or cosecha intent selects the harvest confirmation components', async () => {
    const workspace = await loadWorkspace(await createInitializedWorkspace());

    const relevant = findRelevantContext(
      workspace,
      'cosecha con guantes y merma'
    );

    expect(relevant.components.map((component) => component.id)).toEqual([
      'Screen',
      'HeaderSummary',
      'NumericWeightInput',
      'VarianceAlert',
      'StickyPrimaryButton',
      'OfflineSyncBadge'
    ]);
  });

  it('unknown intent falls back to all loaded entities, tasks, and components', async () => {
    const workspace = await loadWorkspace(await createInitializedWorkspace());

    const relevant = findRelevantContext(
      workspace,
      'general operational dashboard'
    );

    expect(relevant.domainEntities).toHaveLength(workspace.domainEntities.length);
    expect(relevant.tasks).toHaveLength(workspace.tasks.length);
    expect(relevant.components).toHaveLength(
      Object.keys(workspace.componentRegistry.components).length
    );
  });

  it('invalid YAML throws an error containing the file path', async () => {
    const workspaceRoot = await createInitializedWorkspace();
    const brokenFile = join(
      workspaceRoot,
      'ontology/domain/harvest_batch.yaml'
    );

    await writeFile(
      brokenFile,
      'id: harvest_batch\nversion: 1.0.0\nname: HarvestBatch\nfields: "broken"\n',
      'utf8'
    );

    await expect(loadWorkspace(workspaceRoot)).rejects.toThrow(
      new RegExp(brokenFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
  });

  it('onto context prints YAML and does not write files', async () => {
    const workspaceRoot = await createInitializedWorkspace();
    const viewsDirectory = join(workspaceRoot, 'ontology/views');
    const filesBefore = await readdir(viewsDirectory);
    let output = '';
    const program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => workspaceRoot,
      write: (text: string) => {
        output += text;
      }
    });

    await program.parseAsync([
      'node',
      'onto',
      'context',
      'cosecha con guantes y merma',
      '--dry-run'
    ]);

    const parsed = parse(output) as Record<string, unknown>;
    const filesAfter = await readdir(viewsDirectory);

    expect(parsed.intent).toBe('cosecha con guantes y merma');
    expect(Array.isArray(parsed.domainEntities)).toBe(true);
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(Array.isArray(parsed.componentSummaries)).toBe(true);
    expect(output).not.toContain('XState');
    expect(output).not.toContain('xstate');
    expect(filesAfter).toEqual(filesBefore);
  });

  it('buildPromptPacket keeps implementation paths inside compilerMetadata only', async () => {
    const workspace = await loadWorkspace(await createInitializedWorkspace());

    const packet = buildPromptPacket(workspace, 'Confirm harvest weight');
    const numericWeightInput = packet.componentSummaries.find(
      (component) => component.id === 'NumericWeightInput'
    );

    expect(numericWeightInput).toBeDefined();
    expect(
      Object.prototype.hasOwnProperty.call(numericWeightInput ?? {}, 'implementationPath')
    ).toBe(false);
    expect(numericWeightInput?.compilerMetadata?.implementationPath).toContain(
      'NumericWeightInput.tsx'
    );
  });
});

async function createInitializedWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'onto-context-'));
  temporaryDirectories.push(root);

  await initOntologyProject({
    cwd: root,
    projectName: 'workspace'
  });

  return join(root, 'workspace');
}
