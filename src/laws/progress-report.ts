import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { tagFileFromDisk } from "../inverse/frontier-tagger.js";
import { barChart, histogram, sparkline } from "./render-ascii.js";
import type {
  SemanticRole,
  StructuralClassification,
  StructuralShape,
} from "../inverse/structural-classifier.js";

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
  /** Phase ε E1 telemetry: dispatch counts, retry flags, budget actually used, wall-clock. */
  telemetry?: IngestFileTelemetry;
  /** Phase ε E6 step 4: ensemble metadata when the file went through
   * the high-confidence ensemble path. Absent for default single-run. */
  ensemble?: IngestFileEnsembleMetadata;
  /** Structural classifier facts when --static-classifier was set
   * (report-only or enabled) on the ingest invocation. Absent for
   * default behaviour. */
  classification?: StructuralClassification;
  /** Phase ε prework C: the actual route taken in --static-classifier
   * enabled mode (semantic_parse via the LLM, or static_summary via
   * the deterministic builder). Absent when the classifier is off
   * or in report-only. */
  routing?: "semantic_parse" | "static_summary";
}

// Mirror of EnsembleMetadata from src/runtime/llm/ensemble.ts. Kept
// duplicated here so the progress-report module stays free of imports
// from the command layer.
export interface IngestFileEnsembleMetadata {
  mode: "high-confidence";
  model: string;
  repetitions: number;
  validCount: number;
  failedCount: number;
  selectedAttempt?: number;
}

// Mirror of ExtractTelemetry in commands/ingest/index.ts — kept
// duplicated here so the progress-report module stays free of cyclic
// imports with the command layer. If you change one, change the
// other.
export interface IngestFileTelemetry {
  dispatchAttempts: number;
  schemaRetried: boolean;
  contextWindowRequested: number | undefined;
  maxTokensRequested: number | undefined;
  firstFailureKind:
    | "kind_invalid_value"
    | "level_invalid_value"
    | "required_missing"
    | "out_of_range"
    | "invalid_json"
    | "dispatch_error"
    | "other"
    | undefined;
  wallClockMs: number;
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
  /** Phase ε prework C: classifier mode for this run. Drives the
   * label of the "Structural classification" section and gates the
   * "Classifier routing" section that only renders in enabled mode. */
  staticClassifierMode?: "off" | "report-only" | "enabled";
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

  // Extraction telemetry (Phase ε E1+E2). Aggregates dispatch counts,
  // retry flags, budget-actually-requested, and wall-clock so the
  // operator sees the cost topology of the run — not just the
  // headline "X% ok". Only renders when at least one file carries
  // telemetry; older runs without the field skip this block.
  const filesWithTel = data.files.filter((f) => f.telemetry !== undefined);
  if (filesWithTel.length > 0) {
    lines.push(`## Extraction telemetry`);
    lines.push(``);
    // Aggregate counters across the whole run.
    const totalDispatches = filesWithTel.reduce(
      (a, f) => a + (f.telemetry?.dispatchAttempts ?? 0),
      0,
    );
    const schemaRetries = filesWithTel.filter(
      (f) => f.telemetry?.schemaRetried,
    ).length;
    const multiAttemptFiles = filesWithTel.filter(
      (f) => (f.telemetry?.dispatchAttempts ?? 0) > 1,
    ).length;
    const wallClocks = filesWithTel.map((f) => f.telemetry!.wallClockMs);
    const sumWall = wallClocks.reduce((a, b) => a + b, 0);
    const meanWall = sumWall / wallClocks.length;
    // Warmup heuristic: first file vs mean-of-rest.
    const firstWall = wallClocks[0] ?? 0;
    const restWalls = wallClocks.slice(1);
    const meanRest =
      restWalls.length > 0
        ? restWalls.reduce((a, b) => a + b, 0) / restWalls.length
        : firstWall;
    const warmupOverhead = firstWall > meanRest ? firstWall - meanRest : 0;

    lines.push(`| Metric | Value |`);
    lines.push(`|---|---:|`);
    lines.push(`| Total LLM dispatches | ${totalDispatches} |`);
    lines.push(`| Files with >1 attempt | ${multiAttemptFiles} |`);
    lines.push(`| Files with H1 schema retry | ${schemaRetries} |`);
    lines.push(`| Mean wall-clock per file | ${(meanWall / 1000).toFixed(2)}s |`);
    lines.push(`| First-file wall-clock | ${(firstWall / 1000).toFixed(2)}s |`);
    lines.push(`| Mean wall-clock after first | ${(meanRest / 1000).toFixed(2)}s |`);
    lines.push(`| Warmup overhead (heuristic) | ${(warmupOverhead / 1000).toFixed(2)}s |`);
    lines.push(``);

    // Wall-clock sparkline — visual peaks expose slow outliers.
    lines.push("```");
    lines.push(`wall-clock per file:  ${sparkline(wallClocks)}`);
    const totalLabel = `total: ${(sumWall / 1000).toFixed(1)}s`.padStart(
      22 + wallClocks.length,
    );
    lines.push(totalLabel);
    lines.push("```");
    lines.push(``);

    // First-failure-kind breakdown — categorises retries by what the
    // model got wrong first. Useful for "is the prompt the bottleneck
    // or is the model truncating?".
    const failureKindCounts = new Map<string, number>();
    for (const f of filesWithTel) {
      const k = f.telemetry?.firstFailureKind;
      if (k) failureKindCounts.set(k, (failureKindCounts.get(k) ?? 0) + 1);
    }
    if (failureKindCounts.size > 0) {
      lines.push(`**First-failure kinds (across files that needed any retry):**`);
      lines.push(``);
      lines.push(`| Kind | Count |`);
      lines.push(`|---|---:|`);
      const sorted = Array.from(failureKindCounts.entries()).sort(
        (a, b) => b[1] - a[1],
      );
      for (const [k, n] of sorted) {
        lines.push(`| \`${k}\` | ${n} |`);
      }
      lines.push(``);
    }

    // Top-3 slowest files — outliers worth investigating before the
    // next sweep (likely large files or those that retried).
    const slowest = [...filesWithTel]
      .sort((a, b) => (b.telemetry?.wallClockMs ?? 0) - (a.telemetry?.wallClockMs ?? 0))
      .slice(0, 3);
    if (slowest.length > 0) {
      lines.push(`**Top-3 slowest files:**`);
      lines.push(``);
      lines.push(`| File | Wall-clock | Dispatches | Schema retry |`);
      lines.push(`|---|---:|---:|:---:|`);
      for (const f of slowest) {
        const rel = relativiseOrAbsolute(f.filePath, data.rootDir);
        const t = f.telemetry!;
        const ms = (t.wallClockMs / 1000).toFixed(2) + "s";
        const sr = t.schemaRetried ? "✓" : "";
        lines.push(`| \`${rel}\` | ${ms} | ${t.dispatchAttempts} | ${sr} |`);
      }
      lines.push(``);
    }
  }

  // Ensemble usage section (Phase ε E6 step 4). Only renders when at
  // least one file went through an ensemble path — the default
  // single-run shape stays unchanged.
  const filesWithEnsemble = data.files.filter((f) => f.ensemble !== undefined);
  if (filesWithEnsemble.length > 0) {
    lines.push(`## High-confidence ensemble`);
    lines.push(``);
    const totalReps = filesWithEnsemble.reduce(
      (s, f) => s + (f.ensemble?.repetitions ?? 0),
      0,
    );
    const totalValid = filesWithEnsemble.reduce(
      (s, f) => s + (f.ensemble?.validCount ?? 0),
      0,
    );
    const totalFailed = filesWithEnsemble.reduce(
      (s, f) => s + (f.ensemble?.failedCount ?? 0),
      0,
    );
    const filesAllValid = filesWithEnsemble.filter(
      (f) => f.ensemble && f.ensemble.validCount === f.ensemble.repetitions,
    ).length;
    const filesNoneValid = filesWithEnsemble.filter(
      (f) => f.ensemble && f.ensemble.validCount === 0,
    ).length;
    // Model and mode are uniform across reps by construction —
    // sample from the first file.
    const sample = filesWithEnsemble[0].ensemble!;
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---:|`);
    lines.push(`| Mode | \`${sample.mode}\` |`);
    lines.push(`| Model | \`${sample.model}\` |`);
    lines.push(`| Files via ensemble | ${filesWithEnsemble.length} |`);
    lines.push(`| Total repetitions executed | ${totalReps} |`);
    lines.push(`| Repetitions that produced valid extractions | ${totalValid} |`);
    lines.push(`| Repetitions that failed | ${totalFailed} |`);
    lines.push(`| Files where every rep validated | ${filesAllValid} |`);
    lines.push(`| Files where every rep failed (ensemble_failed) | ${filesNoneValid} |`);
    lines.push(``);
  }

  // Structural classification section (consumer of the Structural
  // Semantic Classifier). Only renders when at least one file
  // carries classification facts. In report-only mode this is pure
  // observation; in enabled mode the classifier additionally
  // informs routing (see the Classifier routing section below).
  const filesWithClass = data.files.filter(
    (f) => f.classification !== undefined,
  );
  if (filesWithClass.length > 0) {
    const mode = data.staticClassifierMode ?? "report-only";
    lines.push(`## Structural classification`);
    lines.push(``);
    lines.push(`Static classifier mode: \`${mode}\``);
    lines.push(``);

    // Shape counts.
    const shapeOrder: StructuralShape[] = [
      "barrel",
      "declaration_only",
      "executable_module",
      "component_module",
      "test_module",
      "configuration_module",
      "schema_module",
      "adapter_module",
      "cli_module",
      "mixed_module",
      "unknown",
    ];
    const shapeCounts = new Map<StructuralShape, number>();
    for (const s of shapeOrder) shapeCounts.set(s, 0);
    for (const f of filesWithClass) {
      const k = f.classification!.structuralShape;
      shapeCounts.set(k, (shapeCounts.get(k) ?? 0) + 1);
    }
    lines.push(`### Structural shapes`);
    lines.push(``);
    lines.push(`| Structural shape | Count |`);
    lines.push(`|---|---:|`);
    for (const s of shapeOrder) {
      lines.push(`| ${s} | ${shapeCounts.get(s) ?? 0} |`);
    }
    lines.push(``);

    // Role counts.
    const roleOrder: SemanticRole[] = [
      "domain_model",
      "runtime_policy",
      "llm_adapter",
      "command_surface",
      "validation_schema",
      "ui_surface",
      "test_specification",
      "configuration",
      "module_boundary",
      "utility",
      "unknown",
    ];
    const roleCounts = new Map<SemanticRole, number>();
    for (const r of roleOrder) roleCounts.set(r, 0);
    for (const f of filesWithClass) {
      const k = f.classification!.semanticRole;
      roleCounts.set(k, (roleCounts.get(k) ?? 0) + 1);
    }
    lines.push(`### Semantic roles`);
    lines.push(``);
    lines.push(`| Semantic role | Count |`);
    lines.push(`|---|---:|`);
    for (const r of roleOrder) {
      lines.push(`| ${r} | ${roleCounts.get(r) ?? 0} |`);
    }
    lines.push(``);

    // Notable classifications: include files whose structuralShape
    // is NOT the common run-of-the-mill (executable_module /
    // test_module / configuration_module fill the bulk and would
    // drown the signal). Cap at 15 rows. Within the selection,
    // order by confidence desc, then path asc — keeps the table
    // deterministic across runs.
    const COMMON_SHAPES = new Set<StructuralShape>([
      "executable_module",
      "test_module",
      "configuration_module",
    ]);
    const notable = filesWithClass
      .filter((f) => !COMMON_SHAPES.has(f.classification!.structuralShape))
      .sort((a, b) => {
        const dc = b.classification!.confidence - a.classification!.confidence;
        if (dc !== 0) return dc;
        return a.filePath.localeCompare(b.filePath);
      })
      .slice(0, 15);
    if (notable.length > 0) {
      lines.push(`### Notable classifications`);
      lines.push(``);
      lines.push(`| Path | Shape | Role | Confidence | Reason |`);
      lines.push(`|---|---|---|---:|---|`);
      for (const f of notable) {
        const c = f.classification!;
        const rel = relativiseOrAbsolute(f.filePath, data.rootDir);
        const reason = c.reasons[0] ?? "—";
        lines.push(
          `| \`${rel}\` | ${c.structuralShape} | ${c.semanticRole} | ${c.confidence.toFixed(2)} | ${reason} |`,
        );
      }
      lines.push(``);
    }

    if (mode === "enabled") {
      lines.push(
        "*The classifier is informing routing on this run — see the " +
          "Classifier routing section below for the actual savings shape.*",
      );
    } else {
      lines.push(
        "*This section observes the forest. It does not prune it. " +
          "`report-only` does not change which files are dispatched to the LLM, " +
          "the routed model, or the ensemble strategy. Re-run with " +
          "`--static-classifier enabled` to deflect barrels and declaration-only " +
          "modules to a deterministic static summary.*",
      );
    }
    lines.push(``);

    // Classifier routing section (enabled mode only). Surfaces the
    // count of files that bypassed the LLM via static_summary, the
    // count that still went through semantic_parse, and a per-shape
    // breakdown so the operator can see exactly which shapes got
    // deflected. Conservative v0: only `barrel` and `declaration_only`
    // ever appear in the static_summary column.
    if (mode === "enabled") {
      const filesWithRouting = data.files.filter(
        (f) => f.routing !== undefined,
      );
      if (filesWithRouting.length > 0) {
        const staticCount = filesWithRouting.filter(
          (f) => f.routing === "static_summary",
        ).length;
        const llmCount = filesWithRouting.filter(
          (f) => f.routing === "semantic_parse",
        ).length;
        lines.push(`## Classifier routing`);
        lines.push(``);
        lines.push(`| Route | Count |`);
        lines.push(`|---|---:|`);
        lines.push(`| \`static_summary\` (LLM bypassed) | ${staticCount} |`);
        lines.push(`| \`semantic_parse\` (LLM dispatched) | ${llmCount} |`);
        lines.push(``);
        lines.push(`**LLM dispatches avoided: ${staticCount}**`);
        lines.push(``);

        // Per-shape routing breakdown. A shape can appear in BOTH
        // columns when --static-classifier is enabled but the shape
        // is not in the static_summary-eligible set (then everything
        // stays on semantic_parse — surfaced explicitly so the
        // operator can see why a deflection didn't happen).
        const routedByShape = new Map<
          StructuralShape,
          { static_summary: number; semantic_parse: number }
        >();
        for (const f of filesWithRouting) {
          const shape = f.classification?.structuralShape;
          if (shape === undefined) continue;
          const entry =
            routedByShape.get(shape) ??
            { static_summary: 0, semantic_parse: 0 };
          if (f.routing === "static_summary") entry.static_summary += 1;
          else entry.semantic_parse += 1;
          routedByShape.set(shape, entry);
        }
        if (routedByShape.size > 0) {
          lines.push(`### Routing by shape`);
          lines.push(``);
          lines.push(`| Shape | static_summary | semantic_parse |`);
          lines.push(`|---|---:|---:|`);
          // Render in the canonical shapeOrder for stable diffs
          // across runs (matches Structural shapes section above).
          for (const s of shapeOrder) {
            const entry = routedByShape.get(s);
            if (entry === undefined) continue;
            if (entry.static_summary === 0 && entry.semantic_parse === 0) {
              continue;
            }
            lines.push(`| ${s} | ${entry.static_summary} | ${entry.semantic_parse} |`);
          }
          lines.push(``);
        }

        // Notable static summaries — show every file that bypassed
        // the LLM, capped at 15 rows (matches the cap on the
        // Notable classifications table above). Sorted by path for
        // deterministic output.
        const staticSummaries = filesWithRouting
          .filter((f) => f.routing === "static_summary")
          .sort((a, b) => a.filePath.localeCompare(b.filePath))
          .slice(0, 15);
        if (staticSummaries.length > 0) {
          lines.push(`### Notable static summaries`);
          lines.push(``);
          lines.push(`| Path | Shape | Role | Reason |`);
          lines.push(`|---|---|---|---|`);
          for (const f of staticSummaries) {
            const c = f.classification!;
            const rel = relativiseOrAbsolute(f.filePath, data.rootDir);
            const reason = c.reasons[0] ?? "—";
            lines.push(
              `| \`${rel}\` | ${c.structuralShape} | ${c.semanticRole} | ${reason} |`,
            );
          }
          lines.push(``);
        }
      }
    }
  }

  // Per-file table (concise). Source file path relative to rootDir
  // when possible — keeps the table narrow. Adds attempts + wall-clock
  // columns when telemetry is present.
  lines.push(`## Per-file`);
  lines.push(``);
  const hasAnyTelemetry = data.files.some((f) => f.telemetry !== undefined);
  if (hasAnyTelemetry) {
    lines.push(`| File | Status | Tokens | Cost | Attempts | Wall |`);
    lines.push(`|---|---|---:|---:|---:|---:|`);
  } else {
    lines.push(`| File | Status | Tokens | Cost |`);
    lines.push(`|---|---|---:|---:|`);
  }
  for (const f of data.files) {
    const rel = relativiseOrAbsolute(f.filePath, data.rootDir);
    const status = f.ok ? "ok" : `failed (${f.reason ?? "—"})`;
    const tokStr = f.tokensUsed ? f.tokensUsed.toLocaleString() : "—";
    const costStr = f.usd !== undefined && f.usd > 0 ? `$${f.usd.toFixed(4)}` : "—";
    if (hasAnyTelemetry) {
      const attempts = f.telemetry?.dispatchAttempts ?? "—";
      const wall =
        f.telemetry !== undefined
          ? `${(f.telemetry.wallClockMs / 1000).toFixed(2)}s`
          : "—";
      lines.push(
        `| \`${rel}\` | ${status} | ${tokStr} | ${costStr} | ${attempts} | ${wall} |`,
      );
    } else {
      lines.push(`| \`${rel}\` | ${status} | ${tokStr} | ${costStr} |`);
    }
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
//
// Handles the macOS /var ↔ /private/var symlink quirk: ingest's file
// walker calls fs.realpathSync on each input (so the file paths
// arrive canonicalised under /private/var/...), while rootDir is
// process.cwd() which sometimes is the non-canonical form
// (/var/...). Falling back through realpath on rootDir gets both
// sides into the same canonical form before comparing.
function relativiseOrAbsolute(p: string, rootDir: string): string {
  const abs = path.resolve(p);
  const directRoot = path.resolve(rootDir);

  // Canonicalise both sides if reachable; macOS adds /private/var
  // for /var/folders/... and Node may return either form depending on
  // chdir timing. Without normalising both we lose relativisation on
  // realistic tmp-dir paths.
  const safeReal = (s: string): string => {
    try {
      return fs.realpathSync(s);
    } catch {
      return s;
    }
  };
  const absCanon = safeReal(abs);
  const rootCanon = safeReal(directRoot);

  const tryRel = (a: string, r: string): string | undefined => {
    if (a === r) return "";
    if (a.startsWith(r + path.sep)) return path.relative(r, a);
    return undefined;
  };

  // Try every combination (direct/direct, direct/canon, canon/direct,
  // canon/canon) — whichever matches first wins.
  const candidates: Array<[string, string]> = [
    [abs, directRoot],
    [abs, rootCanon],
    [absCanon, directRoot],
    [absCanon, rootCanon],
  ];
  for (const [a, r] of candidates) {
    const rel = tryRel(a, r);
    if (rel !== undefined) return rel;
  }
  return abs;
}
