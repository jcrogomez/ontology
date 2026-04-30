import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCliProgram } from '../src/cli/program.js';
import { OSLViewSchema } from '../src/schemas/index.js';
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

describe('onto plan', () => {
  it('creates an OSL file in mock mode', async () => {
    const workspaceRoot = await createInitializedWorkspace();
    const program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => workspaceRoot,
      write: () => undefined
    });

    await program.parseAsync([
      'node',
      'onto',
      'plan',
      'Design the IDE view to trigger compilation.',
      '--mock'
    ]);

    expect(
      await pathExists(
        join(workspaceRoot, 'ontology/views/IdeMainView.osl.yaml')
      )
    ).toBe(true);
  });

  it('writes a valid OSL view in mock mode', async () => {
    const workspaceRoot = await createInitializedWorkspace();
    const program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => workspaceRoot,
      write: () => undefined
    });

    await program.parseAsync([
      'node',
      'onto',
      'plan',
      'Design the IDE view and show nodes.',
      '--mock'
    ]);

    const osl = validateOrThrow(
      OSLViewSchema,
      await readYamlFile<unknown>(
        join(workspaceRoot, 'ontology/views/IdeMainView.osl.yaml')
      ),
      'planned OSL'
    );

    expect(osl.id).toBe('IdeMainView');
    expect(osl.task).toBe('trigger_compilation');
    expect(osl.components.map((component) => component.id)).toContain(
      'TopologicalMinimap'
    );
  });

  it('creates an AST file in mock mode', async () => {
    const workspaceRoot = await createInitializedWorkspace();
    const program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => workspaceRoot,
      write: () => undefined
    });

    await program.parseAsync([
      'node',
      'onto',
      'plan',
      'Design the IDE workspace layout.',
      '--mock'
    ]);

    expect(
      await pathExists(
        join(workspaceRoot, 'ontology/views/IdeMainView.ast.yaml')
      )
    ).toBe(true);
    expect(
      await readdir(join(workspaceRoot, 'src/generated/views'))
    ).toEqual([]);
  });
});

async function createInitializedWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'onto-plan-'));
  temporaryDirectories.push(root);
  const program = createCliProgram({
    version: '0.1.0-test',
    getCwd: () => root,
    write: () => undefined
  });

  await program.parseAsync(['node', 'onto', 'init', 'workspace']);

  return join(root, 'workspace');
}
