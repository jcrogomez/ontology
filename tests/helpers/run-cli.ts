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
// Spawn the COMPILED CLI (built once by tests/helpers/global-setup.ts)
// instead of `npx tsx src/cli.ts`. `node dist/cli.js` starts in ~0.4s
// with no per-spawn TypeScript transpile, vs ~1s for `npx tsx` — the
// dominant cost across the suite's hundreds of CLI invocations.
const cliPath = path.join(repoRoot, 'dist', 'cli.js');

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
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env }, // Pass along environment variables
    // Fail-fast guard: spawnSync blocks until the child exits, and a
    // regressed interactive-command guard (e.g. `walk` mounting the TUI
    // instead of refusing a non-TTY stdin) would otherwise hang the whole
    // runner forever with no signal. Any single CLI invocation completes in
    // well under a second; 30s is orders of magnitude of slack. On timeout
    // the child is SIGKILLed and `status` comes back null → the test FAILS
    // loudly rather than stalling CI.
    timeout: 30_000,
    killSignal: 'SIGKILL',
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}
