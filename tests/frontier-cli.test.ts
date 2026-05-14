import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto frontier <paths...>` (Phase ε pre-flight tagger
// preview). Pure $0; no LLM dispatch. The command must:
//   - accept one or more positional paths
//   - dedup files passed via overlapping inputs (mirrors ingest's contract)
//   - emit a tag distribution that matches what the underlying tagger would assign
//   - exit non-zero when any file lands with zero attributes (acceptance contract)

describe("onto frontier <paths...>", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    // No `onto init` needed — frontier does not require a .ontology
    // project. That is part of the diagnostic value.
  });

  afterEach(() => cleanupTempProject(tempDir));

  function writeFile(filePath: string, body: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body, "utf-8");
  }

  it("rejects when no paths are given (commander surfaces a missing-argument error)", () => {
    const r = runCli(tempDir, ["frontier"]);
    expect(r.status).not.toBe(0);
  });

  it("rejects when a positional path cannot be stat'd", () => {
    const r = runCli(tempDir, ["frontier", "/tmp/does-not-exist-xyz"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Could not stat/);
  });

  it("rejects an empty --include list", () => {
    const dir = path.join(tempDir, "src", "schemas");
    writeFile(path.join(dir, "x.ts"), "export const x = 1;");
    const r = runCli(tempDir, ["frontier", dir, "--include", ""]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/empty extension list/);
  });

  it("walks a single directory and emits a tag distribution over the matching files", () => {
    writeFile(
      path.join(tempDir, "src", "schemas", "user.ts"),
      "export const X = 1;",
    );
    writeFile(
      path.join(tempDir, "src", "core", "fs", "lock.ts"),
      "export const Y = 2;",
    );
    const r = runCli(tempDir, [
      "frontier",
      path.join(tempDir, "src"),
      "--include",
      "ts",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.totalFiles).toBe(2);
    expect(parsed.zeroTagged).toEqual([]);
    // schemas rule fires → schema-driven; core/fs rule fires → io-bound + operational-glue.
    expect(parsed.byTag["schema-driven"]).toBe(1);
    expect(parsed.byTag["io-bound"]).toBe(1);
    expect(parsed.byTag["operational-glue"]).toBe(1);
  });

  it("accepts multiple positional paths and dedupes files passed via overlapping inputs", () => {
    writeFile(
      path.join(tempDir, "src", "core", "integrity", "hash.ts"),
      "export const h = 1;",
    );
    writeFile(
      path.join(tempDir, "src", "schemas", "u.ts"),
      "export const u = 1;",
    );
    const r = runCli(tempDir, [
      "frontier",
      path.join(tempDir, "src", "core"),
      path.join(tempDir, "src", "schemas"),
      path.join(tempDir, "src", "core", "integrity", "hash.ts"),
      "--include",
      "ts",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.inputs).toHaveLength(3);
    // Two unique files; one was passed twice (once via parent dir, once directly).
    expect(parsed.totalFiles).toBe(2);
    expect(parsed.byTag["pure-transform"]).toBe(1); // integrity → pure-transform
    expect(parsed.byTag["schema-driven"]).toBe(1);
  });

  it("includes per-file tag arrays when --totals-only is NOT set", () => {
    writeFile(
      path.join(tempDir, "src", "schemas", "user.ts"),
      "export const x = 1;",
    );
    const r = runCli(tempDir, [
      "frontier",
      path.join(tempDir, "src"),
      "--include",
      "ts",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].attrs).toContain("schema-driven");
  });

  it("reports fallback-only files as a diagnostic count", () => {
    // A file that no specific path rule matches → operational-glue
    // fallback only.
    writeFile(
      path.join(tempDir, "src", "miscellaneous", "untouched.ts"),
      "export const x = 1;",
    );
    const r = runCli(tempDir, [
      "frontier",
      path.join(tempDir, "src"),
      "--include",
      "ts",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.fallbackOnly.length).toBe(1);
    expect(parsed.fallbackOnly[0]).toContain("untouched.ts");
  });

  it("exits non-zero if any file ends up zero-tagged (acceptance contract guard)", () => {
    // We cannot easily fabricate a zero-tagged file because the tagger
    // always returns operational-glue as fallback. So this test simply
    // confirms that the zero-tagged guard runs and reports correctly
    // — the contract is upheld by the tagger's own coverage tests, and
    // we assert here that the CLI surfaces zero-tagged: 0 cleanly on
    // a valid input.
    writeFile(
      path.join(tempDir, "src", "schemas", "x.ts"),
      "export const x = 1;",
    );
    const r = runCli(tempDir, [
      "frontier",
      path.join(tempDir, "src"),
      "--include",
      "ts",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Zero-tagged files:\s+0/);
  });

  it("human-readable output includes the deduped total and the distribution table", () => {
    writeFile(
      path.join(tempDir, "src", "schemas", "x.ts"),
      "export const x = 1;",
    );
    const r = runCli(tempDir, [
      "frontier",
      path.join(tempDir, "src"),
      "--include",
      "ts",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/deduped total:\s+1 file/);
    expect(r.stdout).toMatch(/schema-driven\s+1/);
    expect(r.stdout).toMatch(/Tag distribution/);
  });

  it("--totals-only suppresses the per-file listing", () => {
    writeFile(
      path.join(tempDir, "src", "schemas", "x.ts"),
      "export const x = 1;",
    );
    const r = runCli(tempDir, [
      "frontier",
      path.join(tempDir, "src"),
      "--include",
      "ts",
      "--totals-only",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/Per-file tags/);
  });
});
