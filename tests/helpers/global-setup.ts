import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Vitest global setup — runs ONCE before the whole suite.
//
// Build the CLI to `dist/` so the CLI-spawning integration tests can
// invoke the compiled `node dist/cli.js` (~0.4s startup) instead of
// `npx tsx src/cli.ts` (~1s + a full TypeScript transpile of the CLI
// graph on EVERY spawn). With hundreds of CLI invocations across the
// suite, that per-spawn transpile was the dominant cost (the suite ran
// ~16 min; see docs/ROADMAP.md). Tests now exercise the shipped
// artifact, and the build is paid once.
//
// The build is incremental (`.tsbuildinfo`): ~2.7s cold, ~0.9s warm,
// so single-file dev runs stay snappy. `tsc` is invoked directly (no
// `npx`) via the running Node binary for speed + portability.
export default function setup(): void {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  );
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "-p",
      "tsconfig.build.json",
      "--incremental",
      "--tsBuildInfoFile",
      "dist/.tsbuildinfo",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
}
