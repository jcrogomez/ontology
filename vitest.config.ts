import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 30000, // CLI tests take a bit to run via tsx
    // File parallelism is disabled because several tests use process.chdir()
    // (notably tests/proposal-persist.test.ts, tests/run-persistence.test.ts,
    // and tests/node-observability.test.ts). Vitest reuses worker processes
    // across files; a chdir in one file can leak into a neighbor file's
    // module-load phase. CLI tests also spawn many tsx subprocesses, which
    // can starve each other under heavy parallelism. Serial files keep the
    // suite reliable at ~7-8 minutes total wall time.
    fileParallelism: false,
  }
});
