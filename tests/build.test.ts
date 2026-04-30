import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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

    // Assert that the seeded components exist in the workspace
    expect(await pathExists(join(workspaceRoot, 'src/components/ontology/Screen.tsx'))).toBe(true);
    expect(await pathExists(join(workspaceRoot, 'src/components/ontology/classNames.ts'))).toBe(true);
    expect(await pathExists(join(workspaceRoot, 'src/components/ide/SplitPane.tsx'))).toBe(true);
    expect(await pathExists(join(workspaceRoot, 'src/components/ide/TopologicalMinimap.tsx'))).toBe(true);
    expect(await pathExists(join(workspaceRoot, 'src/components/ide/NodeCard.tsx'))).toBe(true);

    // Verify that all relative imports correctly resolve to real files
    const importLines = generatedTsx.split('\n').filter(line => line.startsWith('import '));
    for (const line of importLines) {
      const match = line.match(/from\s+['"](.+)['"]/);
      if (match) {
        const importPath = match[1];
        if (importPath && importPath.startsWith('.')) {
          // Resolve relative path
          const absoluteImportPath = resolve(dirname(generatedPath), importPath);
          let exists = await pathExists(absoluteImportPath);
          if (!exists) {
            exists = await pathExists(absoluteImportPath + '.tsx');
          }
          if (!exists) {
            exists = await pathExists(absoluteImportPath + '.ts');
          }
          expect(exists).toBe(true);
        }
      }
    }

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
