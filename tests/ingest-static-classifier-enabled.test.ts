import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Integration: `onto ingest --static-classifier enabled`.
//
// Contract (load-bearing):
//   - Conservative deflection: barrel + declaration_only deflect to
//     static_summary; every other shape stays on semantic_parse.
//   - schema_module STAYS on semantic_parse. The classifier's zod
//     predicate overfits; deflecting schema_module would import that
//     false positive into intent extraction.
//   - test_module is NOT skipped; it stays on semantic_parse (when a
//     test file leaks past the upstream walker exclusions).
//   - The INGEST report adds a "Classifier routing" section with
//     per-route counts, per-shape breakdown, and a notable static
//     summaries table.
//   - LLM dispatches avoided count == number of files deflected.
//   - Mode composes with --ensemble high-confidence: deflected files
//     bypass the ensemble too; the rest still go through it.

// The VALID_EXTRACTION_JSON is what the mock provider's
// semantic_parse identity-functor path returns. Files whose contents
// embed this JSON and go through the LLM (default / report-only /
// non-deflected shapes in enabled mode) get a proposal whose label
// is "X". Files that go through static_summary instead get a label
// like "barrel: index.ts" or "types: foo.ts" — that label divergence
// is the contract under test below.
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

// Build a fixture tree with one file per relevant shape. The mock
// provider's identity-functor path lets us tell which files reached
// the LLM (label "X") vs went through static_summary (label "barrel:
// …" / "types: …").
function setupShapeFixtures(tempDir: string): void {
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "src", "schemas"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "src", "commands"), { recursive: true });

  // Barrel — only re-exports. Static_summary-eligible.
  fs.writeFileSync(
    path.join(tempDir, "src", "index.ts"),
    `export * from "./other.js";\nexport { foo } from "./foo.js";\n/* ${VALID_EXTRACTION_JSON} */\n`,
  );
  // Declaration-only — only types. Static_summary-eligible.
  fs.writeFileSync(
    path.join(tempDir, "src", "types.ts"),
    `export interface Foo { id: string }\nexport type Bar = string;\n/* ${VALID_EXTRACTION_JSON} */\n`,
  );
  // Schema module — uses zod. Must stay on semantic_parse.
  fs.writeFileSync(
    path.join(tempDir, "src", "schemas", "user.ts"),
    `import { z } from "zod";\nexport const UserSchema = z.object({ id: z.string() });\n/* ${VALID_EXTRACTION_JSON} */\n`,
  );
  // Executable module — has runtime const. Must stay on semantic_parse.
  fs.writeFileSync(
    path.join(tempDir, "src", "compute.ts"),
    `export function compute() { const x = 1; return x; }\n/* ${VALID_EXTRACTION_JSON} */\n`,
  );
  // CLI module — under src/commands/. Must stay on semantic_parse.
  fs.writeFileSync(
    path.join(tempDir, "src", "commands", "init.ts"),
    `export function initCommand() { const x = 1; return x; }\n/* ${VALID_EXTRACTION_JSON} */\n`,
  );
}

describe("onto ingest --static-classifier enabled — routes barrel + declaration_only via static_summary", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    setupShapeFixtures(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("barrel file gets a static_summary label, not the mock's identity JSON label", () => {
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
    // The barrel's label should be the static-summary builder's label,
    // not the embedded JSON's "X" label that the mock LLM would echo.
    expect(r.stdout).toMatch(/index\.ts.*barrel: index\.ts/s);
  });

  it("declaration_only file gets a static_summary label", () => {
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
    expect(r.stdout).toMatch(/types\.ts.*types: types\.ts/s);
  });

  it("schema_module stays on semantic_parse (mock LLM label 'X')", () => {
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
    // user.ts is a schema_module; in conservative mode it must reach
    // the mock LLM, which returns label "X" from the embedded JSON.
    expect(r.stdout).toMatch(/user\.ts\s+X/);
    // It must NOT receive a static_summary label.
    expect(r.stdout).not.toMatch(/user\.ts.*barrel:/);
    expect(r.stdout).not.toMatch(/user\.ts.*types:/);
  });

  it("executable_module stays on semantic_parse", () => {
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
    expect(r.stdout).toMatch(/compute\.ts\s+X/);
  });

  it("cli_module stays on semantic_parse", () => {
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
    expect(r.stdout).toMatch(/init\.ts\s+X/);
  });
});

describe("onto ingest --static-classifier enabled — report surfaces routing distribution", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    setupShapeFixtures(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("report includes 'Classifier routing' section with route counts", () => {
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
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("## Classifier routing");
    expect(report).toContain("`static_summary` (LLM bypassed)");
    expect(report).toContain("`semantic_parse` (LLM dispatched)");
  });

  it("report shows LLM dispatches avoided = 2 (barrel + declaration_only)", () => {
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
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("**LLM dispatches avoided: 2**");
  });

  it("report shows per-shape routing breakdown with barrel and declaration_only deflected", () => {
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
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("### Routing by shape");
    // barrel: 1 deflected, 0 not deflected.
    expect(report).toMatch(/\| barrel \| 1 \| 0 \|/);
    // declaration_only: 1 deflected, 0 not deflected.
    expect(report).toMatch(/\| declaration_only \| 1 \| 0 \|/);
    // schema_module: 0 deflected, 1 not deflected (load-bearing).
    expect(report).toMatch(/\| schema_module \| 0 \| 1 \|/);
  });

  it("report shows Notable static summaries with the deflected paths", () => {
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
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("### Notable static summaries");
    expect(report).toMatch(/\| `src\/index\.ts` \| barrel \|/);
    expect(report).toMatch(/\| `src\/types\.ts` \| declaration_only \|/);
  });

  it("report classification section says 'mode: enabled'", () => {
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
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("Static classifier mode: `enabled`");
  });
});

describe("onto ingest — report-only mode keeps execution unchanged (no routing section)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    setupShapeFixtures(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("report-only does NOT include the Classifier routing section", () => {
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
    expect(report).not.toContain("## Classifier routing");
  });

  it("report-only label for a barrel still comes from the LLM (mock JSON 'X')", () => {
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
    // In report-only mode, the barrel still goes through the mock LLM,
    // which returns the embedded JSON's label "X". The barrel: prefix
    // from static_summary should be absent.
    expect(r.stdout).toMatch(/index\.ts\s+X/);
    expect(r.stdout).not.toMatch(/index\.ts.*barrel:/);
  });
});

describe("onto ingest --static-classifier enabled — composes with --ensemble high-confidence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    setupShapeFixtures(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("barrel still bypasses the LLM (and the ensemble) when both flags are set", () => {
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
      "enabled",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/index\.ts.*barrel: index\.ts/s);
  });

  it("both report sections appear, neither overrides the other", () => {
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
      "enabled",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const report = readLatestIngestReport(tempDir);
    expect(report).toContain("## High-confidence ensemble");
    expect(report).toContain("## Structural classification");
    expect(report).toContain("## Classifier routing");
  });
});
