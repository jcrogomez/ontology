import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { tagFileFromDisk } from "./frontier-tagger.js";
import { barChart, histogram, sparkline } from "./render-ascii.js";

// Per-ingest / per-compile progress reports — Phase ε prework I.
//
// Each invocation of `onto ingest` or `onto compile run` produces a
// markdown report at `.ontology/reports/<KIND>_<runId>.md`. The report
// captures what the operation did, what it cost, and an intuitive
// chart of the relevant scores at that moment in time.
//
// Why disk: `.ontology/` is gitignored, so the report file does not
// contaminate the working tree. The audit chain already records the
// underlying mutations as events (`node_created`, `compilation_run`);
// these reports are operator-facing summaries, not part of the audit
// trail. Operators can `cat` the latest one or wire a watcher.
//
// Scores at ingest time: the frontier-tagger preview (path/content
// rules, no LLM) tells us which intent-faithful / intent-resistant
// bucket each file is expected to land in. Per-file tokens / cost
// (when not a dry run) round out the picture.
//
// Scores at compile time: per-step status (ok / cached / failed),
// bytes per artifact, tokens consumed per step. The Pareto pivot
// itself requires the round-trip (verify-homeomorphism); compile
// alone surfaces the cost side of it.

// ── Common helpers ──────────────────────────────────────────────────────────

export function newRunId(): string {
  return "run_" + randomBytes(4).toString("hex");
}

const REPORTS_SUBDIR = path.join(".ontology", "reports");

/**
 * Write a fenced-markdown report to `.ontology/reports/<KIND>_<runId>.md`.
 * Returns the absolute path written. Creates the parent directory on
 * demand. Throws if the write fails — the caller decides whether to
 * downgrade to a warning (the existing ingest / compile commands
 * already log to stderr and continue when ancillary writes fail).
 */
export function writeProgressReport(
  cwd: string,
  kind: "INGEST" | "COMPILE",
  runId: string,
  body: string,
): string {
  const dir = path.resolve(cwd, REPORTS_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${kind}_${runId}.md`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, body, "utf-8");
  return filepath;
}

// ── INGEST report ───────────────────────────────────────────────────────────

export interface IngestFileSummary {
  /** Absolute or cwd-relative path of the source file. */
  filePath: string;
  /** Whether extraction succeeded for this file. */
  ok: boolean;
  /** Bytes on disk — used for the size sparkline. Optional when unknown. */
  sizeBytes?: number;
  /** Tokens consumed by the extraction dispatch (0 / undefined when dryRun). */
  tokensUsed?: number;
  /** Per-file cost in USD (zero or undefined for Ollama / mock / dryRun). */
  usd?: number;
  /** Failure reason key when ok=false. */
  reason?: string;
}

export interface IngestReportData {
  runId: string;
  timestamp: string;
  rootDir: string;
  /** Active branch at run start. Undefined when the project is pre-init. */
  branch: string | undefined;
  /** Provider that handled the dispatches. */
  provider: string;
  /** Resolved model. */
  model: string;
  dryRun: boolean;
  files: IngestFileSummary[];
  proposalsCreated: number;
  totalTokens: number;
  totalUsd: number;
}

/**
 * Render an ingest report — markdown body. The body intentionally
 * mirrors the verify-homeomorphism shape (Aggregate, charts in
 * fenced blocks, Per-file table) so a developer reading the two side
 * by side recognises the conventions.
 *
 * Frontier preview is run inline against `files[i].filePath` — pure
 * IO, no LLM. The result drives the bar chart at the top of the
 * report.
 */
export function renderIngestReport(data: IngestReportData): string {
  const lines: string[] = [];
  lines.push(`# ingest report — ${data.runId}`);
  lines.push(``);
  lines.push(`**Generated:** ${data.timestamp}`);
  lines.push(`**Root:** \`${data.rootDir}\``);
  lines.push(`**Branch:** ${data.branch ?? "—"}`);
  lines.push(`**Provider:** ${data.provider} · **Model:** \`${data.model}\``);
  if (data.dryRun) lines.push(`**Dry run:** yes (no proposals written, no API spend)`);
  lines.push(``);

  // Aggregate.
  const okCount = data.files.filter((f) => f.ok).length;
  const failCount = data.files.length - okCount;
  lines.push(`## Aggregate`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---:|`);
  lines.push(`| Files scanned | ${data.files.length} |`);
  lines.push(`| Extracted ok | ${okCount} |`);
  lines.push(`| Failed | ${failCount} |`);
  lines.push(`| Proposals created | ${data.proposalsCreated} |`);
  lines.push(`| Total tokens | ${data.totalTokens.toLocaleString()} |`);
  lines.push(`| Total cost | $${data.totalUsd.toFixed(4)} |`);
  lines.push(``);

  // Frontier preview (Phase ε prework B/I): run the tagger and
  // surface the distribution as a bar chart. Cheap, no LLM.
  const tagCounts = new Map<string, number>();
  for (const f of data.files) {
    if (!f.ok) continue;
    try {
      const tagged = tagFileFromDisk(f.filePath);
      for (const t of tagged.attrs) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    } catch {
      // Tagger failures are non-fatal — the file may have been
      // moved / deleted between ingest and report render.
    }
  }
  if (tagCounts.size > 0) {
    lines.push(`## Frontier preview (pre-compile)`);
    lines.push(``);
    const sorted = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
    lines.push(`| Tag | Count |`);
    lines.push(`|---|---:|`);
    for (const [tag, n] of sorted) {
      lines.push(`| \`${tag}\` | ${n} |`);
    }
    lines.push(``);
    const peak = Math.max(...Array.from(tagCounts.values()));
    const chart = barChart(
      sorted.map(([tag, n]) => ({ label: tag, count: n })),
      peak,
      20,
    );
    if (chart.length > 0) {
      lines.push("```");
      lines.push(chart);
      lines.push("```");
      lines.push(``);
    }
  }

  // Sparkline of per-file token usage. Useful at-a-glance: a flat
  // line means uniform cost; a spike points at an outlier worth
  // checking before paying for the full sweep.
  const tokens = data.files.map((f) => f.tokensUsed ?? 0);
  if (tokens.some((v) => v > 0)) {
    lines.push(`## Token usage per file (in order)`);
    lines.push(``);
    lines.push("```");
    lines.push(`tokens  ${sparkline(tokens)}`);
    const totalLabel = `total: ${data.totalTokens.toLocaleString()}`.padStart(
      8 + tokens.length,
    );
    lines.push(totalLabel);
    lines.push("```");
    lines.push(``);
  }

  // Per-file table (concise). Source file path relative to rootDir
  // when possible — keeps the table narrow.
  lines.push(`## Per-file`);
  lines.push(``);
  lines.push(`| File | Status | Tokens | Cost |`);
  lines.push(`|---|---|---:|---:|`);
  for (const f of data.files) {
    const rel = relativiseOrAbsolute(f.filePath, data.rootDir);
    const status = f.ok ? "ok" : `failed (${f.reason ?? "—"})`;
    const tokStr = f.tokensUsed ? f.tokensUsed.toLocaleString() : "—";
    const costStr = f.usd !== undefined && f.usd > 0 ? `$${f.usd.toFixed(4)}` : "—";
    lines.push(`| \`${rel}\` | ${status} | ${tokStr} | ${costStr} |`);
  }
  lines.push(``);

  return lines.join("\n");
}

// ── COMPILE report ──────────────────────────────────────────────────────────

export interface CompileStepSummary {
  nodeId: string;
  /** "ok" | "failed" | "skipped" — the underlying step.status. */
  status: string;
  cached: boolean;
  /** Bytes written to the artifact (zero when failed / skipped). */
  bytesWritten: number;
  /** Tokens consumed by this step's dispatch (undefined when cached / mock). */
  tokensUsed?: number;
  /** Per-step USD cost (Ollama / mock → 0 or undefined). */
  usd?: number;
}

export interface CompileReportData {
  runId: string;
  timestamp: string;
  rootDir: string;
  focalId: string;
  branch: string | undefined;
  provider: string;
  /** Per-step roll-up. */
  steps: CompileStepSummary[];
  totalTokens: number;
  totalUsd: number;
}

export function renderCompileReport(data: CompileReportData): string {
  const lines: string[] = [];
  lines.push(`# compile report — ${data.runId}`);
  lines.push(``);
  lines.push(`**Generated:** ${data.timestamp}`);
  lines.push(`**Root:** \`${data.rootDir}\``);
  lines.push(`**Branch:** ${data.branch ?? "—"}`);
  lines.push(`**Focal:** \`${data.focalId}\``);
  lines.push(`**Provider:** ${data.provider}`);
  lines.push(``);

  // Aggregate.
  const okCount = data.steps.filter((s) => s.status === "ok").length;
  const cachedCount = data.steps.filter((s) => s.cached).length;
  const failed = data.steps.filter((s) => s.status !== "ok");
  lines.push(`## Aggregate`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---:|`);
  lines.push(`| Steps | ${data.steps.length} |`);
  lines.push(`| Ok | ${okCount} |`);
  lines.push(`| Cached (no dispatch) | ${cachedCount} |`);
  lines.push(`| Failed / skipped | ${failed.length} |`);
  lines.push(`| Total tokens | ${data.totalTokens.toLocaleString()} |`);
  lines.push(`| Total cost | $${data.totalUsd.toFixed(4)} |`);
  lines.push(``);

  // Sparkline of bytes per artifact — a flat line means uniform
  // output, a spike points at an outlier (a very large file).
  const bytes = data.steps.map((s) => s.bytesWritten);
  if (bytes.some((v) => v > 0)) {
    lines.push(`## Artifact size per step (in order)`);
    lines.push(``);
    lines.push("```");
    lines.push(`bytes  ${sparkline(bytes)}`);
    const sum = bytes.reduce((a, b) => a + b, 0);
    const totalLabel = `total: ${sum.toLocaleString()} B`.padStart(7 + bytes.length);
    lines.push(totalLabel);
    lines.push("```");
    lines.push(``);
  }

  // Token-usage distribution: when this is a paid run, a histogram
  // of per-step tokens surfaces whether the spend is concentrated in
  // a few heavy steps or spread evenly.
  const tokens = data.steps
    .map((s) => s.tokensUsed ?? 0)
    .filter((v) => v > 0);
  if (tokens.length > 0) {
    const h = histogram(tokens, Math.min(20, tokens.length));
    lines.push(`## Token usage distribution (paid steps)`);
    lines.push(``);
    lines.push("```");
    lines.push(`tokens (n=${h.total})`);
    lines.push(h.bars);
    lines.push(`${h.axis.padStart(h.bars.length)}`);
    lines.push("```");
    lines.push(``);
  }

  // Per-step table.
  lines.push(`## Per-step`);
  lines.push(``);
  lines.push(`| # | Node | Status | Cached | Bytes | Tokens | Cost |`);
  lines.push(`|---:|---|---|:---:|---:|---:|---:|`);
  for (let i = 0; i < data.steps.length; i++) {
    const s = data.steps[i];
    const cacheStr = s.cached ? "✓" : "";
    const tokStr = s.tokensUsed ? s.tokensUsed.toLocaleString() : "—";
    const costStr = s.usd !== undefined && s.usd > 0 ? `$${s.usd.toFixed(4)}` : "—";
    lines.push(
      `| ${i + 1} | \`${s.nodeId}\` | ${s.status} | ${cacheStr} | ${s.bytesWritten.toLocaleString()} | ${tokStr} | ${costStr} |`,
    );
  }
  lines.push(``);

  return lines.join("\n");
}

// Compute a path relative to `rootDir` when `p` is under it; otherwise
// fall back to the absolute path. Keeps the report tables narrow when
// every file is under the same root.
function relativiseOrAbsolute(p: string, rootDir: string): string {
  const abs = path.resolve(p);
  const root = path.resolve(rootDir);
  if (abs.startsWith(root + path.sep) || abs === root) {
    return path.relative(root, abs);
  }
  return abs;
}
