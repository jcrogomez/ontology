import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  computeCostEstimate,
  estimateInputTokens,
  estimateOutputTokens,
  formatCostEstimateHuman,
  readFileSizeInfos,
  resolveProviderRate,
} from "../src/commands/ingest/cost-estimate.js";

// Coverage for `onto ingest <path> --cost-estimate` — the pre-flight
// cost guard that runs entirely locally with no API call. This test
// file pins two contracts:
//   1. The pure math: token-count heuristics, provider→rate mapping,
//      aggregate cost calculation.
//   2. The CLI surface: --cost-estimate runs to completion WITHOUT
//      an ANTHROPIC_API_KEY in the environment, never calls the
//      adapter, never writes proposals, and emits the expected
//      structured output under --json.
//
// The "no API key needed" assertion is the most important one — if
// it ever regresses, the cost guard has stopped guarding.

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helperDir, "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");

// runCliScrubbed runs the CLI with ANTHROPIC_API_KEY explicitly
// removed from the environment. Critical for the cost-estimate
// path — we MUST prove the flow doesn't reach the adapter.
function runCliScrubbed(
  cwd: string,
  args: string[],
): { stdout: string; stderr: string; status: number | null } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
    env,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status,
  };
}

describe("cost-estimate (pure math)", () => {
  it("estimateInputTokens scales with file size + wrapper overhead", () => {
    // Empty file: just the wrapper.
    expect(estimateInputTokens(0)).toBe(50);
    // 350 chars at 3.5 chars/token = 100 tokens + 50 wrapper.
    expect(estimateInputTokens(350)).toBe(150);
    // 3500 chars = 1000 + 50.
    expect(estimateInputTokens(3500)).toBe(1050);
  });

  it("estimateOutputTokens is a fixed per-file constant", () => {
    expect(estimateOutputTokens(0)).toBe(400);
    expect(estimateOutputTokens(100_000)).toBe(400);
  });

  it("resolveProviderRate returns zero cost for mock and ollama", () => {
    const mock = resolveProviderRate("mock");
    expect(mock.inputUsdPerMillion).toBe(0);
    expect(mock.outputUsdPerMillion).toBe(0);

    const ollama = resolveProviderRate("ollama");
    expect(ollama.inputUsdPerMillion).toBe(0);
    expect(ollama.outputUsdPerMillion).toBe(0);
  });

  it("resolveProviderRate returns Opus 4.7 published rates by default for anthropic", () => {
    const r = resolveProviderRate("anthropic");
    expect(r.inputUsdPerMillion).toBe(5.0);
    expect(r.outputUsdPerMillion).toBe(25.0);
    expect(r.modelLabel).toBe("claude-opus-4-7");
  });

  it("resolveProviderRate honors --model for anthropic sonnet/haiku", () => {
    const sonnet = resolveProviderRate("anthropic", "claude-sonnet-4-6");
    expect(sonnet.inputUsdPerMillion).toBe(3.0);
    expect(sonnet.outputUsdPerMillion).toBe(15.0);

    const haiku = resolveProviderRate("anthropic", "claude-haiku-4-5");
    expect(haiku.inputUsdPerMillion).toBe(1.0);
    expect(haiku.outputUsdPerMillion).toBe(5.0);
  });

  it("resolveProviderRate falls back to Opus tier for unknown anthropic models", () => {
    const unknown = resolveProviderRate("anthropic", "claude-future-99-1");
    expect(unknown.inputUsdPerMillion).toBe(5.0);
    expect(unknown.outputUsdPerMillion).toBe(25.0);
    expect(unknown.modelLabel).toContain("rate unknown");
  });

  it("computeCostEstimate aggregates per-file costs + system overhead", () => {
    const files = [
      { path: "/abs/a.ts", cwdRelative: "a.ts", sizeChars: 3500 },
      { path: "/abs/b.ts", cwdRelative: "b.ts", sizeChars: 7000 },
    ];
    const e = computeCostEstimate(files, "anthropic");
    expect(e.fileCount).toBe(2);
    // per-file input: 1050 + 2050 = 3100; +1100 system = 4200.
    expect(e.totalInputTokens).toBe(4200);
    // 2 × 400 = 800 output.
    expect(e.totalOutputTokens).toBe(800);
    // Input cost: 4200 / 1e6 × 5 = 0.021. Output: 800 / 1e6 × 25 = 0.02.
    expect(e.inputCostUsd).toBeCloseTo(0.021, 5);
    expect(e.outputCostUsd).toBeCloseTo(0.02, 5);
    expect(e.totalCostUsd).toBeCloseTo(0.041, 5);
  });

  it("computeCostEstimate reports $0 total for free providers", () => {
    const files = [{ path: "/abs/a.ts", cwdRelative: "a.ts", sizeChars: 3500 }];
    const ollama = computeCostEstimate(files, "ollama");
    expect(ollama.totalCostUsd).toBe(0);
    expect(ollama.totalInputTokens).toBeGreaterThan(0); // tokens still counted
    const mock = computeCostEstimate(files, "mock");
    expect(mock.totalCostUsd).toBe(0);
  });

  it("formatCostEstimateHuman renders the breakdown", () => {
    const files = [{ path: "/abs/a.ts", cwdRelative: "a.ts", sizeChars: 350 }];
    const e = computeCostEstimate(files, "anthropic");
    const text = formatCostEstimateHuman(e);
    expect(text).toContain("COST ESTIMATE");
    expect(text).toContain("Provider:        anthropic");
    expect(text).toContain("Model:           claude-opus-4-7");
    expect(text).toContain("Files:           1");
    expect(text).toContain("$");
  });
});

describe("readFileSizeInfos", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("returns sizeChars from statSync for real files", () => {
    const f = path.join(tempDir, "fixture.ts");
    fs.writeFileSync(f, "x".repeat(1234));
    const [info] = readFileSizeInfos([f]);
    expect(info.sizeChars).toBe(1234);
    expect(info.path).toBe(path.resolve(f));
  });

  it("returns sizeChars=0 for unreadable paths instead of throwing", () => {
    const [info] = readFileSizeInfos(["/tmp/does-not-exist-xyz-abc.ts"]);
    expect(info.sizeChars).toBe(0);
  });
});

describe("onto ingest --cost-estimate (CLI)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("prints an estimate for a single file WITHOUT an ANTHROPIC_API_KEY", () => {
    // This is the load-bearing test. If --cost-estimate ever started
    // reaching the Anthropic adapter, the missing-key branch would
    // fire and we'd see an auth error. Survives scrubbed env → proves
    // the cost guard never touched the adapter.
    const src = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(src, "export const x = 1;\nexport const y = 2;\n");

    const r = runCliScrubbed(tempDir, [
      "ingest",
      src,
      "--cost-estimate",
      "--provider",
      "anthropic",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("COST ESTIMATE");
    expect(r.stdout).toContain("anthropic");
    // Cross-provider task-aware routing (commit e43b2cc): ingest is
    // a `semantic_parse` task, which DefaultAnthropicRouting maps to
    // Sonnet 4.6 (not Opus). The cost-estimate now reflects that.
    expect(r.stdout).toContain("claude-sonnet-4-6");
    expect(r.stdout).toContain("Files:           1");
  });

  it("walks a directory and reports per-file breakdown", () => {
    const src = path.join(tempDir, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "a.ts"), "x".repeat(700));
    fs.writeFileSync(path.join(src, "b.ts"), "y".repeat(1400));

    const r = runCliScrubbed(tempDir, [
      "ingest",
      src,
      "--cost-estimate",
      "--provider",
      "anthropic",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Files:           2");
    expect(r.stdout).toContain("a.ts");
    expect(r.stdout).toContain("b.ts");
  });

  it("--json emits a parseable estimate object", () => {
    const src = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(src, "export const x = 1;\n");

    const r = runCliScrubbed(tempDir, [
      "ingest",
      src,
      "--cost-estimate",
      "--provider",
      "anthropic",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.estimate.fileCount).toBe(1);
    expect(parsed.estimate.totalCostUsd).toBeGreaterThan(0);
    // semantic_parse routes to Sonnet 4.6 by default — see e43b2cc.
    expect(parsed.estimate.rate.modelLabel).toBe("claude-sonnet-4-6");
  });

  it("reports $0 cost for the mock provider", () => {
    const src = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(src, "export const x = 1;\n");

    const r = runCliScrubbed(tempDir, [
      "ingest",
      src,
      "--cost-estimate",
      "--provider",
      "mock",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.estimate.totalCostUsd).toBe(0);
  });

  it("does NOT create any proposals", () => {
    const src = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(src, "export const x = 1;\n");

    runCliScrubbed(tempDir, [
      "ingest",
      src,
      "--cost-estimate",
      "--provider",
      "anthropic",
    ]);
    const proposalsListing = runCli(tempDir, ["proposal", "list", "--json"]);
    const parsed = JSON.parse(proposalsListing.stdout) as {
      proposals: unknown[];
    };
    // proposal list returns `{ proposals: [...] }`; the cost-estimate
    // run must not have added anything.
    expect(Array.isArray(parsed.proposals)).toBe(true);
    expect(parsed.proposals).toHaveLength(0);
  });

  it("honors --include when estimating a directory of Python files", () => {
    const src = path.join(tempDir, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "a.py"), "def f():\n    return 1\n");
    fs.writeFileSync(path.join(src, "b.py"), "def g():\n    return 2\n");
    fs.writeFileSync(path.join(src, "ignored.ts"), "export const x = 1;\n");

    const r = runCliScrubbed(tempDir, [
      "ingest",
      src,
      "--cost-estimate",
      "--include",
      "py",
      "--provider",
      "anthropic",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.estimate.fileCount).toBe(2);
    // Both files should be present; the .ts file must be filtered.
    const paths = parsed.estimate.perFile.map((f: { cwdRelative: string }) =>
      f.cwdRelative,
    );
    expect(paths.some((p: string) => p.endsWith("a.py"))).toBe(true);
    expect(paths.some((p: string) => p.endsWith("b.py"))).toBe(true);
    expect(paths.every((p: string) => !p.endsWith("ignored.ts"))).toBe(true);
  });
});
