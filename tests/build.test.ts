import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCliProgram } from '../src/cli/program.js';
import { pathExists, readUtf8File } from '../src/utils/fs.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe('onto build', () => {
  it('builds a TSX file from an AST generated via mock planning', async () => {
    const workspaceRoot = await createInitializedWorkspace();

    // 1. Plan in mock mode
    let program = createCliProgram({
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

    // 2. Build the view
    program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => workspaceRoot,
      write: () => undefined
    });

    await program.parseAsync([
      'node',
      'onto',
      'build',
      'IdeMainView'
    ]);

    const generatedPath = join(workspaceRoot, 'src/generated/views/IdeMainView.tsx');

    // Assert file exists
    expect(await pathExists(generatedPath)).toBe(true);

    const generatedTsx = await readUtf8File(generatedPath);

    // Assert components are imported and used
    expect(generatedTsx).toContain('import { Screen }');
    expect(generatedTsx).toContain('import { SplitPane }');
    expect(generatedTsx).toContain('import { TopologicalMinimap }');
    expect(generatedTsx).toContain('import { NodeCard }');

    expect(generatedTsx).toContain('<Screen');
    expect(generatedTsx).toContain('<SplitPane');
    expect(generatedTsx).toContain('<TopologicalMinimap');
    expect(generatedTsx).toContain('<NodeCard');
  });
});

async function createInitializedWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'onto-build-'));
  temporaryDirectories.push(root);
  const program = createCliProgram({
    version: '0.1.0-test',
    getCwd: () => root,
    write: () => undefined
  });

  await program.parseAsync(['node', 'onto', 'init', 'workspace']);

  return join(root, 'workspace');
}
