import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  newRunId,
  renderCompileReport,
  renderIngestReport,
  writeProgressReport,
  type CompileReportData,
  type IngestReportData,
} from "../src/laws/progress-report.js";

describe("progress-report — newRunId", () => {
  it("returns a string with the run_ prefix and hex suffix", () => {
    const id = newRunId();
    expect(id).toMatch(/^run_[0-9a-f]{8}$/);
  });

  it("does not collide across consecutive calls (within 100)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(newRunId());
    expect(seen.size).toBe(100);
  });
});

describe("progress-report — writeProgressReport", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-progress-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes to .ontology/reports/<KIND>_<runId>.md and returns the absolute path", () => {
    const p = writeProgressReport(tmpDir, "INGEST", "run_deadbeef", "# hi");
    expect(p.endsWith("/.ontology/reports/INGEST_run_deadbeef.md")).toBe(true);
    expect(fs.readFileSync(p, "utf-8")).toBe("# hi");
  });

  it("creates the parent directory if missing", () => {
    const p = writeProgressReport(tmpDir, "COMPILE", "run_cafe1234", "x");
    expect(fs.existsSync(path.dirname(p))).toBe(true);
  });
});

describe("progress-report — renderIngestReport", () => {
  function baseData(overrides: Partial<IngestReportData> = {}): IngestReportData {
    return {
      runId: "run_abc12345",
      timestamp: "2026-05-14T15:00:00.000Z",
      rootDir: "/tmp/test-project",
      branch: "main",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      dryRun: false,
      files: [
        {
          filePath: "/tmp/test-project/src/foo.ts",
          ok: true,
          tokensUsed: 1200,
        },
        {
          filePath: "/tmp/test-project/src/bar.ts",
          ok: true,
          tokensUsed: 800,
        },
      ],
      proposalsCreated: 2,
      totalTokens: 2000,
      totalUsd: 0.04,
      ...overrides,
    };
  }

  it("includes header, aggregate, per-file table", () => {
    const md = renderIngestReport(baseData());
    expect(md).toContain("# ingest report — run_abc12345");
    expect(md).toContain("## Aggregate");
    expect(md).toContain("| Files scanned | 2 |");
    expect(md).toContain("| Proposals created | 2 |");
    expect(md).toContain("## Per-file");
    expect(md).toContain("`src/foo.ts`");
  });

  it("renders dry-run prominently when dryRun=true", () => {
    const md = renderIngestReport(baseData({ dryRun: true }));
    expect(md).toContain("**Dry run:** yes");
  });

  it("emits a token sparkline when any file used tokens", () => {
    const md = renderIngestReport(baseData());
    expect(md).toContain("## Token usage per file");
    // The sparkline glyph appears somewhere inside the fenced block.
    expect(md).toMatch(/```[\s\S]*tokens[\s\S]*[▁▂▃▄▅▆▇█][\s\S]*```/);
  });

  it("omits the token sparkline when no file used tokens", () => {
    const md = renderIngestReport(
      baseData({
        files: [
          { filePath: "/tmp/test-project/src/foo.ts", ok: true, tokensUsed: 0 },
        ],
        totalTokens: 0,
      }),
    );
    expect(md).not.toContain("## Token usage per file");
  });

  it("renders the Extraction telemetry section when files carry telemetry", () => {
    const md = renderIngestReport(
      baseData({
        files: [
          {
            filePath: "/tmp/test-project/src/foo.ts",
            ok: true,
            tokensUsed: 1200,
            telemetry: {
              dispatchAttempts: 2,
              schemaRetried: true,
              contextWindowRequested: 8192,
              maxTokensRequested: 2048,
              firstFailureKind: "kind_invalid_value",
              wallClockMs: 45000,
            },
          },
          {
            filePath: "/tmp/test-project/src/bar.ts",
            ok: true,
            tokensUsed: 800,
            telemetry: {
              dispatchAttempts: 1,
              schemaRetried: false,
              contextWindowRequested: 4096,
              maxTokensRequested: 1024,
              firstFailureKind: undefined,
              wallClockMs: 12000,
            },
          },
        ],
      }),
    );
    expect(md).toContain("## Extraction telemetry");
    expect(md).toContain("| Total LLM dispatches | 3 |");
    expect(md).toContain("| Files with H1 schema retry | 1 |");
    expect(md).toContain("| Files with >1 attempt | 1 |");
    expect(md).toContain("First-failure kinds");
    expect(md).toContain("`kind_invalid_value`");
    expect(md).toContain("Top-3 slowest files");
    // Per-file table now has extra columns when telemetry exists.
    expect(md).toMatch(
      /\| File \| Status \| Tokens \| Cost \| Attempts \| Wall \|/,
    );
  });

  it("omits Extraction telemetry section when no file carries telemetry", () => {
    const md = renderIngestReport(baseData());
    expect(md).not.toContain("## Extraction telemetry");
  });

  it("surfaces failed files with their reason in the per-file table", () => {
    const md = renderIngestReport(
      baseData({
        files: [
          {
            filePath: "/tmp/test-project/src/bad.ts",
            ok: false,
            reason: "parse_failed",
          },
        ],
        proposalsCreated: 0,
        totalTokens: 0,
      }),
    );
    expect(md).toContain("failed (parse_failed)");
  });
});

describe("progress-report — renderCompileReport", () => {
  function baseData(overrides: Partial<CompileReportData> = {}): CompileReportData {
    return {
      runId: "run_compile1",
      timestamp: "2026-05-14T15:00:00.000Z",
      rootDir: "/tmp/test-project",
      focalId: "node_abc",
      branch: undefined,
      provider: "ollama",
      steps: [
        { nodeId: "node_a", status: "ok", cached: false, bytesWritten: 120 },
        { nodeId: "node_b", status: "ok", cached: true, bytesWritten: 240 },
        { nodeId: "node_c", status: "ok", cached: false, bytesWritten: 80 },
      ],
      totalTokens: 0,
      totalUsd: 0,
      ...overrides,
    };
  }

  it("renders header + aggregate + per-step table", () => {
    const md = renderCompileReport(baseData());
    expect(md).toContain("# compile report — run_compile1");
    expect(md).toContain("| Steps | 3 |");
    expect(md).toContain("| Cached (no dispatch) | 1 |");
    expect(md).toContain("## Per-step");
    expect(md).toContain("`node_a`");
    expect(md).toContain("`node_b`");
  });

  it("emits an artifact-size sparkline", () => {
    const md = renderCompileReport(baseData());
    expect(md).toContain("## Artifact size per step");
    expect(md).toMatch(/```[\s\S]*bytes[\s\S]*[▁▂▃▄▅▆▇█][\s\S]*```/);
  });

  it("omits the token histogram when no step used tokens", () => {
    const md = renderCompileReport(baseData());
    expect(md).not.toContain("## Token usage distribution");
  });

  it("includes the token histogram when at least one step used tokens", () => {
    const md = renderCompileReport(
      baseData({
        steps: [
          {
            nodeId: "node_a",
            status: "ok",
            cached: false,
            bytesWritten: 120,
            tokensUsed: 1500,
          },
        ],
        totalTokens: 1500,
      }),
    );
    expect(md).toContain("## Token usage distribution");
  });
});
