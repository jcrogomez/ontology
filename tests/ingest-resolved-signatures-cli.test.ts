import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// O-gate #1 wiring — `onto ingest <dir> --resolved-signatures` attaches
// resolved-type signatures (a whole-program TypeChecker pass) to ingested
// `provides`, tier-tagged. The compelling case: a BARREL re-export, whose
// SYNTACTIC signature is undefined (cross-file, the syntactic extractor can't
// follow it), gets a real resolved signature by following the alias to the
// origin function. Opt-in: without the flag the syntactic tier (no signature
// for a re-export) is used.

describe("onto ingest --resolved-signatures (O-gate #1)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    // A source module + a barrel re-exporting one of its functions.
    const src = path.join(tempDir, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, "util.ts"),
      `export function double(a: number) { return a * 2; }\n`,
    );
    fs.writeFileSync(
      path.join(src, "index.ts"),
      `export { double } from "./util.js";\n`,
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  const barrelResult = (stdout: string) => {
    const parsed = JSON.parse(stdout);
    return parsed.results.find(
      (r: { filePath: string }) => r.filePath.endsWith("index.ts"),
    );
  };

  it("attaches a RESOLVED signature to a barrel re-export the syntactic tier leaves blank", () => {
    const r = runCli(tempDir, [
      "ingest", "src",
      "--provider", "mock",
      "--static-classifier", "enabled",
      "--resolved-signatures",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const barrel = barrelResult(r.stdout);
    expect(barrel?.ok).toBe(true);
    expect(barrel.extracted.provides).toContain("double");
    // Resolved tier: the TypeChecker followed the re-export to the function
    // and materialised its type — tier-tagged, so it never glues with a
    // syntactic signature.
    const sig = barrel.extracted.provideSignatures?.double;
    expect(sig).toBeDefined();
    expect(sig.startsWith("resolved:")).toBe(true);
    expect(sig).toContain("=> number");
  });

  it("without the flag, the barrel re-export carries no signature (syntactic tier, default unchanged)", () => {
    const r = runCli(tempDir, [
      "ingest", "src",
      "--provider", "mock",
      "--static-classifier", "enabled",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const barrel = barrelResult(r.stdout);
    expect(barrel?.ok).toBe(true);
    expect(barrel.extracted.provides).toContain("double");
    // No resolved pass → a cross-file re-export has no syntactic signature.
    expect(barrel.extracted.provideSignatures?.double).toBeUndefined();
  });
});
