import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCliProgram } from '../src/cli/program.js';
import {
  CACHE_DIRECTORY_PATHS,
  GENERATED_DIRECTORY_PATHS,
  ONTOLOGY_DIRECTORY_PATHS,
  SEED_FILE_PATHS
} from '../src/core/init-seeds.js';
import {
  CanonSchema,
  ComponentRegistrySchema,
  DomainEntitySchema,
  OntologyConfigSchema,
  TaskSchema
} from '../src/schemas/index.js';
import { pathExists, readYamlFile } from '../src/utils/fs.js';
import { validateOrThrow } from '../src/utils/validation.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe('onto init', () => {
  it('initializes the current directory with ontology folders and validated seed files', async () => {
    const cwd = await createTemporaryDirectory();
    let output = '';
    const program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => cwd,
      write: (text: string) => {
        output += text;
      }
    });

    await program.parseAsync(['node', 'onto', 'init']);

    await expectProjectScaffold(cwd);

    const config = validateOrThrow(
      OntologyConfigSchema,
      await readYamlFile<unknown>(join(cwd, 'ontology/ontology.config.yaml')),
      'Ontology config'
    );
    const registry = validateOrThrow(
      ComponentRegistrySchema,
      await readYamlFile<unknown>(join(cwd, 'ontology/components/registry.yaml')),
      'component registry'
    );
    const harvestBatch = validateOrThrow(
      DomainEntitySchema,
      await readYamlFile<unknown>(join(cwd, 'ontology/domain/harvest_batch.yaml')),
      'HarvestBatch domain entity'
    );
    const inventoryLot = validateOrThrow(
      DomainEntitySchema,
      await readYamlFile<unknown>(join(cwd, 'ontology/domain/inventory_lot.yaml')),
      'InventoryLot domain entity'
    );
    const canon = validateOrThrow(
      CanonSchema,
      await readYamlFile<unknown>(join(cwd, 'ontology/canon/ops_canon.yaml')),
      'ops canon'
    );
    const task = validateOrThrow(
      TaskSchema,
      await readYamlFile<unknown>(
        join(cwd, 'ontology/tasks/confirm_harvest_batch.yaml')
      ),
      'confirm harvest batch task'
    );

    expect(config.projectName).toBe(basename(cwd));
    expect(config.packageManager).toBe('npm');
    expect(Object.keys(registry.components)).toEqual([
      'Screen',
      'HeaderSummary',
      'NumericWeightInput',
      'VarianceAlert',
      'StickyPrimaryButton',
      'OfflineSyncBadge'
    ]);
    expect(harvestBatch.name).toBe('HarvestBatch');
    expect(inventoryLot.name).toBe('InventoryLot');
    expect(canon.rules.map((rule) => rule.id)).toContain(
      'generated_code_is_not_source_of_truth'
    );
    expect(task.successConditions).toContain('confirmation_synced_or_queued');
    expect(output).toContain('Initialized Ontology project in');
    expect(output).toContain('1. `onto plan "..."`');
    expect(output).toContain('2. `onto build HarvestConfirmation`');
    expect(output).toContain('3. `onto inspect HarvestConfirmation`');
  });

  it('creates a named project directory and initializes inside it', async () => {
    const cwd = await createTemporaryDirectory();
    const projectName = 'harvest-console';
    const projectRoot = join(cwd, projectName);
    const program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => cwd,
      write: () => undefined
    });

    await program.parseAsync(['node', 'onto', 'init', projectName]);

    await expectProjectScaffold(projectRoot);

    const config = validateOrThrow(
      OntologyConfigSchema,
      await readYamlFile<unknown>(
        join(projectRoot, 'ontology/ontology.config.yaml')
      ),
      'Ontology config'
    );

    expect(config.projectName).toBe(projectName);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'onto-init-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function expectProjectScaffold(projectRoot: string): Promise<void> {
  for (const relativePath of [
    ...ONTOLOGY_DIRECTORY_PATHS,
    ...GENERATED_DIRECTORY_PATHS,
    ...CACHE_DIRECTORY_PATHS
  ]) {
    expect(await pathExists(join(projectRoot, relativePath))).toBe(true);
  }

  for (const relativePath of SEED_FILE_PATHS) {
    expect(await pathExists(join(projectRoot, relativePath))).toBe(true);
  }
}
