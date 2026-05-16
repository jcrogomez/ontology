import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Integration: `onto ingest --static-classifier report-only`.
//
// Contract (load-bearing):
//   - Default ingest (no flag) is byte-identical to pre-PR — no
//     classification section in the report.
//   - report-only adds a "Structural classification" section with
//     shape + role aggregates and a "Notable classifications" table.
//   - report-only does NOT change WHICH files reach the LLM. The
//     dispatch count under mock + report-only equals dispatch under
//     mock alone.
//   - report-only composes with --ensemble high-confidence; both
//     sections appear, neither overrides the other.
//   - Unknown --static-classifier values fail fast.

const VALID_EXTRACTION_JSON = JSON.stringify({
  label: "X",
  level: "artifact",
  kind: "artifact",
  manifestation: "code",
  language: "typescript",
  prompt: "Some functions.",
  requires: [],
  provides: ["foo"],
  forbids: [],
  rules: [],
});

function readLatestIngestReport(tempDir: string): string {
  const reportsDir = path.join(tempDir, ".ontology", "reports");
  const reports = fs
    .readdirSync(reportsDir)
    .filter((f) => f.startsWith("INGEST_"));
  if (reports.length === 0) {
    throw new Error("no INGEST report written");
  }
  return fs.readFileSync(path.join(reportsDir, reports[0]), "utf-8");
}

describe("onto ingest --static-classifier — option parsing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "src", "fixture.ts"),
      VALID_EXTRACTION_JSON,
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("accepts --static-classifier report-only", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
  });

  it("accepts --static-classifier enabled", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "enabled",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
  });

  it("rejects an unknown --static-classifier value", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "absurd-mode",
      "--dry-run",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Invalid --static-classifier mode/);
    expect(r.stderr).toMatch(/report-only/);
    expect(r.stderr).toMatch(/enabled/);
  });
});

describe("onto ingest — default ingest preserves pre-PR shape (no classifier section)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "src", "fixture.ts"),
      VALID_EXTRACTION_JSON,
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("no --static-classifier flag → report has no Structural classification section", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    expect(report).not.toContain("## Structural classification");
  });
});

describe("onto ingest --static-classifier report-only — report section + aggregates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "src", "schemas"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "src", "commands"), { recursive: true });
    // Barrel: only re-exports. The classifier sees this content
    // directly (real fs read), so the JSON shim other tests use for
    // the extractor doesn't apply here — we need real TS source.
    fs.writeFileSync(
      path.join(tempDir, "src", "index.ts"),
      `export * from "./other.js";\nexport { foo } from "./foo.js";\n` +
        // The mock extractor still needs an embedded JSON to satisfy
        // the schema gate (so ingest doesn't error out on the
        // execution path); we tuck it in a comment after the
        // re-exports so the classifier still sees a pure barrel.
        `/* ${VALID_EXTRACTION_JSON} */\n`,
    );
    // Schema module.
    fs.writeFileSync(
      path.join(tempDir, "src", "schemas", "user.ts"),
      `import { z } from "zod";\nexport const UserSchema = z.object({ id: z.string() });\n/* ${VALID_EXTRACTION_JSON} */\n`,
    );
    // CLI module (path-based — under src/commands/).
    fs.writeFileSync(
      path.join(tempDir, "src", "commands", "init.ts"),
      `export function initCommand() { const x = 1; return x; }\n/* ${VALID_EXTRACTION_JSON} */\n`,
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("adds Structural classification section with all required tables", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("## Structural classification");
    expect(report).toContain("Static classifier mode: `report-only`");
    expect(report).toContain("### Structural shapes");
    expect(report).toContain("### Semantic roles");
  });

  it("aggregates shape counts correctly across fixture files", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    // index.ts → barrel, user.ts → schema_module, init.ts → cli_module.
    expect(report).toMatch(/\| barrel \| 1 \|/);
    expect(report).toMatch(/\| schema_module \| 1 \|/);
    expect(report).toMatch(/\| cli_module \| 1 \|/);
  });

  it("aggregates role counts correctly across fixture files", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    expect(report).toMatch(/\| module_boundary \| 1 \|/);
    expect(report).toMatch(/\| validation_schema \| 1 \|/);
    expect(report).toMatch(/\| command_surface \| 1 \|/);
  });

  it("Notable classifications surfaces barrel + schema + CLI with their paths and reasons", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("### Notable classifications");
    expect(report).toMatch(/\| `src\/index\.ts` \| barrel \|/);
    expect(report).toMatch(/\| `src\/schemas\/user\.ts` \| schema_module \|/);
    expect(report).toMatch(/\| `src\/commands\/init\.ts` \| cli_module \|/);
  });

  it("includes the 'observes the forest' candado phrase as a closing footnote", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("observes the forest");
    expect(report).toContain("does not prune");
  });
});

describe("onto ingest --static-classifier report-only — does not alter execution", () => {
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
      VALID_EXTRACTION_JSON,
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("dispatch / proposal counts match between default and report-only modes", () => {
    // Run 1 — default.
    const baseline = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--dry-run",
    ]);
    expect(baseline.status).toBe(0);
    const baselineOk = (baseline.stdout.match(/^ ✓/gm) ?? []).length;
    expect(baselineOk).toBe(2);

    // Reset reports/state for a clean second run.
    fs.rmSync(path.join(tempDir, ".ontology", "reports"), {
      recursive: true,
      force: true,
    });

    // Run 2 — report-only.
    const observed = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(observed.status).toBe(0);
    const observedOk = (observed.stdout.match(/^ ✓/gm) ?? []).length;
    expect(observedOk).toBe(baselineOk);
  });
});

describe("onto ingest --static-classifier report-only — composes with --ensemble", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "src", "fixture.ts"),
      VALID_EXTRACTION_JSON,
    );
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("both report sections appear when both flags are set", () => {
    const r = runCli(tempDir, [
      "ingest",
      path.join(tempDir, "src"),
      "--provider",
      "mock",
      "--include",
      "ts",
      "--ensemble",
      "high-confidence",
      "--static-classifier",
      "report-only",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    // Ensemble section (from step 4).
    expect(report).toContain("## High-confidence ensemble");
    // Classification section (this PR).
    expect(report).toContain("## Structural classification");
  });
});
