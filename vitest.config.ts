import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Build the CLI to dist/ ONCE before the suite (incremental tsc,
    // ~2.7s cold / ~0.9s warm) so CLI-spawning tests invoke the compiled
    // `node dist/cli.js` (~0.4s) instead of re-transpiling src/cli.ts via
    // tsx (~1s) on every spawn. See tests/helpers/global-setup.ts.
    globalSetup: ['./tests/helpers/global-setup.ts'],
    testTimeout: 30000, // CLI subprocess tests take a bit to run
    // beforeEach hooks routinely run several CLI commands (init + a handful
    // of node creates / links) to set up fixtures. Each spawned
    // `node dist/cli.js` cold-start is ~0.4s, and on a contended runner the
    // whole setup occasionally crosses the default 10s hook budget. Bumping
    // to 30s aligns with testTimeout; it's a max, not a minimum, so
    // fast-setup files are unaffected.
    hookTimeout: 30000,
    // File parallelism is disabled because several tests use process.chdir()
    // (notably tests/proposal-persist.test.ts, tests/run-persistence.test.ts,
    // and tests/node-observability.test.ts). Vitest reuses worker processes
    // across files; a chdir in one file can leak into a neighbor file's
    // module-load phase. CLI tests also spawn many subprocesses, which can
    // starve each other under heavy parallelism. Serial files keep the
    // suite reliable.
    fileParallelism: false,
  }
});
