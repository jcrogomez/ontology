import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Phase ε E6 step 4 — integration coverage for the high-confidence
// ensemble mode via `onto ingest --ensemble high-confidence`.
//
// The mock provider's identity-functor path for semantic_parse
// returns the first JSON object embedded in the user prompt verbatim.
// That gives us two clean shapes per test:
//   - File contains a valid extraction JSON → mock returns it, all
//     reps validate, ensemble succeeds with selectedAttempt=1.
//   - File contains no embedded JSON → mock falls back to a stub
//     {ok, task, echo} response that fails ExtractionResultSchema,
//     all reps fail, ensemble returns ensemble_failed.

const VALID_EXTRACTION_JSON = JSON.stringify({
  label: "X",
  level: "artifact",
  kind: "artifact",
  manifestation: "code",
  language: "typescript",
  prompt: "Some functions.",
  requires: ["foo"],
  provides: ["bar"],
  forbids: [],
  rules: [],
});

describe("onto ingest --ensemble — option parsing + defaults", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const srcFile = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(srcFile, VALID_EXTRACTION_JSON);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("rejects unknown --ensemble values with a clear error", () => {
    const srcFile = path.join(tempDir, "src", "fixture.ts");
    const r = runCli(tempDir, [
      "ingest",
      srcFile,
      "--provider",
      "mock",
      "--ensemble",
      "absurd",
      "--dry-run",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Unsupported --ensemble value/);
  });

  it("accepts --ensemble none explicitly (same as default)", () => {
    const srcFile = path.join(tempDir, "src", "fixture.ts");
    const r = runCli(tempDir, [
      "ingest",
      srcFile,
      "--provider",
      "mock",
      "--ensemble",
      "none",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    // Default single-run path: stdout has no ensemble marker.
    expect(r.stdout).not.toMatch(/ensemble/i);
  });

  it("default ingest (no --ensemble flag) preserves the existing single-run shape", () => {
    const srcFile = path.join(tempDir, "src", "fixture.ts");
    const r = runCli(tempDir, [
      "ingest",
      srcFile,
      "--provider",
      "mock",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/ensemble/i);
  });
});

describe("onto ingest --ensemble high-confidence — happy path", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const srcFile = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(srcFile, VALID_EXTRACTION_JSON);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("file with embedded valid JSON: ensemble succeeds, all 3 reps validate, report carries ensemble section", () => {
    // Use the directory flow rather than single-file because the
    // single-file flow only writes the auto-report on the
    // committed path (post-proposal); dry-run single-file exits
    // early. Directory dry-run still writes the report.
    const srcDir = path.join(tempDir, "src");
    const r = runCli(tempDir, [
      "ingest",
      srcDir,
      "--provider",
      "mock",
      "--ensemble",
      "high-confidence",
      "--include",
      "ts",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const reportsDir = path.join(tempDir, ".ontology", "reports");
    const reports = fs.readdirSync(reportsDir).filter((f) => f.startsWith("INGEST_"));
    expect(reports.length).toBeGreaterThan(0);
    const reportBody = fs.readFileSync(
      path.join(reportsDir, reports[0]),
      "utf-8",
    );
    expect(reportBody).toContain("## High-confidence ensemble");
    expect(reportBody).toContain("`llama3.2:3b`");
    expect(reportBody).toContain("Files via ensemble | 1");
    expect(reportBody).toContain("Total repetitions executed | 3");
    // All three mock reps return the same valid JSON.
    expect(reportBody).toContain("Repetitions that produced valid extractions | 3");
    expect(reportBody).toContain("Files where every rep validated | 1");
  });
});

describe("onto ingest --ensemble high-confidence — all-fail path", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const srcFile = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    // Content with NO embedded JSON → mock falls back to {ok, task,
    // echo} which is missing required fields. All 3 reps fail Zod.
    fs.writeFileSync(srcFile, "export const greeting = 'hello';");
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("returns ensemble_failed when none of the 3 reps validate", () => {
    const srcFile = path.join(tempDir, "src", "fixture.ts");
    const r = runCli(tempDir, [
      "ingest",
      srcFile,
      "--provider",
      "mock",
      "--ensemble",
      "high-confidence",
      "--dry-run",
    ]);
    expect(r.status).toBe(1);
    // Single-file flow surfaces the failure via stderr.
    expect(r.stderr).toMatch(/ensemble.*failed|ensemble_failed/i);
    // Error message should include per-run summaries.
    expect(r.stderr).toMatch(/#1/);
    expect(r.stderr).toMatch(/#3/);
    // All-fail file should also be reflected in the report when one
    // exists; for single-file failure we don't write the report
    // (the flow exits early via failWith), so we don't assert it.
  });
});

describe("onto ingest --ensemble high-confidence — directory mode", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "src", "a.ts"),
      VALID_EXTRACTION_JSON,
    );
    fs.writeFileSync(
      path.join(tempDir, "src", "b.ts"),
      // No embedded JSON — this file will fail all 3 reps.
      "export const x = 42;",
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("processes each file through 3 reps; mixed-results show up in report aggregates", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--ensemble",
      "high-confidence",
      "--include",
      "ts",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const reportsDir = path.join(tempDir, ".ontology", "reports");
    const reports = fs.readdirSync(reportsDir).filter((f) => f.startsWith("INGEST_"));
    expect(reports.length).toBeGreaterThan(0);
    const reportBody = fs.readFileSync(
      path.join(reportsDir, reports[0]),
      "utf-8",
    );
    expect(reportBody).toContain("## High-confidence ensemble");
    expect(reportBody).toContain("Files via ensemble | 2");
    expect(reportBody).toContain("Total repetitions executed | 6");
    // a.ts contributes 3 valid reps; b.ts contributes 3 failed reps.
    expect(reportBody).toContain("Repetitions that produced valid extractions | 3");
    expect(reportBody).toContain("Repetitions that failed | 3");
    expect(reportBody).toContain("Files where every rep validated | 1");
    expect(reportBody).toContain("Files where every rep failed (ensemble_failed) | 1");
  });
});
