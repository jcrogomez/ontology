import { spawnSync, SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';

// Get the absolute path to the repo root's cli.ts file.
const repoRoot = path.resolve(process.cwd());
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
