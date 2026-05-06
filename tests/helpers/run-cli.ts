import { spawnSync, SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the absolute path to the repo root's cli.ts file.
//
// IMPORTANT: do not derive this from `process.cwd()`. Some tests use
// `process.chdir()` to relocate the working directory; if vitest reuses a
// worker for two such test files, a downstream import would see the changed
// CWD and resolve the cli to a stale temp directory. Anchoring to the
// helper file's own location via `import.meta.url` keeps the path stable
// across the whole worker lifetime.
const helperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helperDir, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

export interface RunCliResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

/**
 * Runs the Ontology CLI within a specified working directory.
 * @param cwd - The current working directory to run the CLI in (usually a temp dir).
 * @param args - The arguments to pass to the CLI.
 * @returns The stdout, stderr, and exit code.
 */
export function runCli(cwd: string, args: string[]): RunCliResult {
  const result = spawnSync('npx', ['tsx', cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env }, // Pass along environment variables
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}
