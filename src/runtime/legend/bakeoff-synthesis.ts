import * as fs from "node:fs";
import { z } from "zod";
import type {
  AggregateReport,
  HomeomorphismVerdict,
} from "./verify-homeomorphism.js";
import type { FailureMode } from "./failure-mode-tagger.js";

// Bake-off synthesis generator — Phase ε Move 3α backlog item (1).
//
// The 3α experiment runs the same 125-node verify perimeter under
// several model "arms" (A control, B structured-output, C coding-
// specialised / substitute). Each arm produces one `AggregateReport`
// JSON. Comparing them by hand is the failure mode this module exists
// to prevent: a 125-node × 3-arm matrix is 375 cells, and a manual
// synthesis risks (a) cherry-picking a flattering subset, (b)
// arithmetic errors in per-mode deltas, and (c) being impossible to
// regenerate when a raw report is re-run.
//
// This module is the deterministic, no-LLM cross-arm reducer. Given N
// already-parsed `AggregateReport`s (one per arm, the first treated as
// the baseline), it emits a structured `BakeoffSynthesis`:
//
//   - per-arm summary (verdicts, export-recovery micro/macro, failure
//     modes, mean structural Jaccard + LoC distance, Pareto frontier)
//   - export-recovery comparison with micro/macro deltas vs baseline
//   - failure-mode comparison with per-mode deltas vs baseline
//   - Pareto-frontier roll-up across arms (which model wins each task)
//   - per-file rebuild status: verdict + Jaccard for every source file
//     across every arm, with an improved/regressed/stable/mixed trend
//   - an H1 read: does each arm clear the pre-registered mean-Jaccard
//     floor? (the decision-tree gate the synthesis must answer)
//
// Pure (except `loadAggregateReport`, the thin IO seam) so the post-3α
// synthesis document writes itself from `renderBakeoffSynthesisMarkdown`
// and so this is exhaustively unit-testable without paying for a single
// dispatch. Mirrors the pure/Zod/markdown shape of its sibling modules
// (export-recovery.ts, failure-mode-tagger.ts, pareto.ts).

// ── Verdict quality ordinal ─────────────────────────────────────────

/**
 * Quality ordering of the homeomorphism verdicts, worst (0) → best (4).
 * Used to compute per-file trends across arms. `unrecoverable` is the
 * floor (compile-back never produced an artifact); `epsilon_equivalent`
 * is the ceiling (both LoC and structural checks pass).
 */
export const VERDICT_ORDINAL: Record<HomeomorphismVerdict, number> = {
  unrecoverable: 0,
  divergent_both: 1,
  divergent_structural: 2,
  divergent_loc: 3,
  epsilon_equivalent: 4,
};

/** Stable failure-mode column order (matches the FailureMode union). */
export const FAILURE_MODE_ORDER: readonly FailureMode[] = [
  "missing_exports",
  "hallucinated_exports",
  "empty_regen",
  "compile_back_failed",
  "gluing_rejected",
  "schema_invalid",
] as const;

/**
 * Pre-registered H1 floor: an arm "confirms H1" when its mean
 * structural Jaccard over nodes with measurable metrics is at or above
 * this threshold. The 3α hypothesis doc's decision tree fires on this
 * read (≥ floor on both local arms → synthesise → router skeleton;
 * both arms below → Opus ceiling probe is mandatory).
 */
export const DEFAULT_H1_JACCARD_FLOOR = 0.1;

// ── Inputs ──────────────────────────────────────────────────────────

export interface BakeoffArm {
  /** Arm label, e.g. "A", "B", "C", or a free-form tag. */
  label: string;
  /** Provider that produced this report, when known out-of-band. */
  provider?: string;
  /** Model that produced this report, when known out-of-band. */
  model?: string;
  /** The parsed verify-homeomorphism aggregate report for this arm. */
  report: AggregateReport;
}

export interface BakeoffSynthesisOptions {
  /** Mean-Jaccard floor for the H1 read. Defaults to {@link DEFAULT_H1_JACCARD_FLOOR}. */
  h1JaccardFloor?: number;
}

// ── Output shapes ───────────────────────────────────────────────────

export interface ArmParetoEntry {
  task: string;
  provider: string;
  model: string;
  meanHonestyStructural: number | null;
  meanUsdPerNode: number;
}

export interface ArmSummary {
  label: string;
  provider: string | null;
  model: string | null;
  total: number;
  byVerdict: Record<HomeomorphismVerdict, number>;
  /** Micro-averaged export recovery (totalRecovered / totalMandatory). Null when the report carried no exportRecovery aggregate (legacy verdict-only run). */
  microRecoveryRate: number | null;
  macroRecoveryRate: number | null;
  exactMatchCount: number | null;
  nodesWithMandatory: number | null;
  /** Per-mode failure counts. Null when the report carried no failureModes aggregate. */
  failureModeCounts: Record<FailureMode, number> | null;
  affectedNodes: number | null;
  /** Mean structural Jaccard over nodes that produced metrics (ok + metrics present). */
  meanStructuralJaccard: number | null;
  /** Mean LoC distance over nodes that produced metrics. */
  meanLocDistance: number | null;
  /** Count of nodes that contributed to the two means above. */
  nodesWithMetrics: number;
  /** Pareto-frontier (task, provider, model) entries from this arm's report. Empty when no matrix/pareto data. */
  paretoFrontier: ArmParetoEntry[];
}

export interface ExportRecoveryComparisonRow {
  label: string;
  microRecoveryRate: number | null;
  macroRecoveryRate: number | null;
  /** arm − baseline. Null when either side is missing. Positive = better recovery than baseline. */
  microDeltaVsBaseline: number | null;
  macroDeltaVsBaseline: number | null;
  exactMatchCount: number | null;
}

export interface ExportRecoveryComparison {
  baselineLabel: string;
  rows: ExportRecoveryComparisonRow[];
}

export interface FailureModeComparisonRow {
  label: string;
  counts: Record<FailureMode, number> | null;
  /** Per-mode (arm − baseline). Null when either side is missing. Negative = fewer failures than baseline (an improvement). */
  deltaVsBaseline: Record<FailureMode, number> | null;
}

export interface FailureModeComparison {
  baselineLabel: string;
  modes: FailureMode[];
  rows: FailureModeComparisonRow[];
}

export type PerFileTrend =
  | "improved"
  | "regressed"
  | "stable"
  | "mixed"
  | "incomparable";

export interface PerFileArmCell {
  label: string;
  verdict: HomeomorphismVerdict | null;
  structuralJaccard: number | null;
}

export interface PerFileRow {
  sourceFile: string;
  /** First node id seen for this source file (a file maps 1:1 to a node in the verify perimeter). */
  nodeId: string;
  perArm: PerFileArmCell[];
  /** Trend of the non-baseline arms relative to the baseline arm's verdict ordinal. */
  trend: PerFileTrend;
}

export interface H1ArmRead {
  label: string;
  meanStructuralJaccard: number | null;
  /** True when meanStructuralJaccard !== null and ≥ floor. */
  passes: boolean;
}

export interface H1Read {
  jaccardFloor: number;
  perArm: H1ArmRead[];
  /** Every arm with a measurable mean clears the floor (and at least one arm was measurable). */
  allPass: boolean;
  /** At least one arm clears the floor. */
  anyPass: boolean;
}

export interface BakeoffSynthesis {
  baselineLabel: string;
  armCount: number;
  arms: ArmSummary[];
  exportRecovery: ExportRecoveryComparison;
  failureModes: FailureModeComparison;
  perFile: PerFileRow[];
  h1: H1Read;
}

// ── Core compute ────────────────────────────────────────────────────

function meanOrNull(sum: number, n: number): number | null {
  return n > 0 ? sum / n : null;
}

function summariseArm(arm: BakeoffArm): ArmSummary {
  const r = arm.report;

  // Means over nodes that actually produced metrics.
  let jaccardSum = 0;
  let locSum = 0;
  let nodesWithMetrics = 0;
  for (const res of r.results) {
    if (res.ok && res.metrics) {
      jaccardSum += res.metrics.structuralJaccard;
      locSum += res.metrics.locDistance;
      nodesWithMetrics += 1;
    }
  }

  // Provider/model: prefer the explicit arm label, else introspect the
  // most common dispatchModel across results (the actually-resolved
  // model, not the node-level schema default).
  let provider = arm.provider ?? null;
  let model = arm.model ?? null;
  if (provider === null || model === null) {
    const dm = mostCommonDispatchModel(r);
    if (dm) {
      provider = provider ?? dm.provider;
      model = model ?? dm.model;
    }
  }

  const er = r.exportRecovery ?? null;
  const fm = r.failureModes ?? null;

  const paretoFrontier: ArmParetoEntry[] = (r.paretoByTaskModel ?? [])
    .filter((p) => p.paretoFrontier)
    .map((p) => ({
      task: p.task,
      provider: p.provider,
      model: p.model,
      meanHonestyStructural: p.meanHonestyStructural,
      meanUsdPerNode: p.meanUsdPerNode,
    }))
    .sort(
      (a, b) =>
        a.task.localeCompare(b.task) ||
        a.provider.localeCompare(b.provider) ||
        a.model.localeCompare(b.model),
    );

  return {
    label: arm.label,
    provider,
    model,
    total: r.total,
    byVerdict: { ...r.byVerdict },
    microRecoveryRate: er ? er.microRecoveryRate : null,
    macroRecoveryRate: er ? er.macroRecoveryRate : null,
    exactMatchCount: er ? er.exactMatchCount : null,
    nodesWithMandatory: er ? er.nodesWithMandatory : null,
    failureModeCounts: fm ? { ...fm.counts } : null,
    affectedNodes: fm ? fm.affectedNodes : null,
    meanStructuralJaccard: meanOrNull(jaccardSum, nodesWithMetrics),
    meanLocDistance: meanOrNull(locSum, nodesWithMetrics),
    nodesWithMetrics,
    paretoFrontier,
  };
}

function mostCommonDispatchModel(
  report: AggregateReport,
): { provider: string; model: string } | null {
  const counts = new Map<string, { provider: string; model: string; n: number }>();
  for (const res of report.results) {
    if (!res.dispatchModel) continue;
    const key = `${res.dispatchModel.provider} ${res.dispatchModel.model}`;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { ...res.dispatchModel, n: 1 });
  }
  let best: { provider: string; model: string; n: number } | null = null;
  for (const c of counts.values()) {
    if (!best || c.n > best.n) best = c;
  }
  return best ? { provider: best.provider, model: best.model } : null;
}

function buildExportRecoveryComparison(
  arms: ArmSummary[],
): ExportRecoveryComparison {
  const baseline = arms[0];
  const rows: ExportRecoveryComparisonRow[] = arms.map((a) => {
    const microDelta =
      a.microRecoveryRate !== null && baseline.microRecoveryRate !== null
        ? a.microRecoveryRate - baseline.microRecoveryRate
        : null;
    const macroDelta =
      a.macroRecoveryRate !== null && baseline.macroRecoveryRate !== null
        ? a.macroRecoveryRate - baseline.macroRecoveryRate
        : null;
    return {
      label: a.label,
      microRecoveryRate: a.microRecoveryRate,
      macroRecoveryRate: a.macroRecoveryRate,
      microDeltaVsBaseline: microDelta,
      macroDeltaVsBaseline: macroDelta,
      exactMatchCount: a.exactMatchCount,
    };
  });
  return { baselineLabel: baseline.label, rows };
}

function buildFailureModeComparison(
  arms: ArmSummary[],
): FailureModeComparison {
  const baseline = arms[0];
  const rows: FailureModeComparisonRow[] = arms.map((a) => {
    let delta: Record<FailureMode, number> | null = null;
    if (a.failureModeCounts !== null && baseline.failureModeCounts !== null) {
      const ac = a.failureModeCounts;
      const bc = baseline.failureModeCounts;
      delta = {
        missing_exports: ac.missing_exports - bc.missing_exports,
        hallucinated_exports: ac.hallucinated_exports - bc.hallucinated_exports,
        empty_regen: ac.empty_regen - bc.empty_regen,
        compile_back_failed: ac.compile_back_failed - bc.compile_back_failed,
        gluing_rejected: ac.gluing_rejected - bc.gluing_rejected,
        schema_invalid: ac.schema_invalid - bc.schema_invalid,
      };
    }
    return {
      label: a.label,
      counts: a.failureModeCounts ? { ...a.failureModeCounts } : null,
      deltaVsBaseline: delta,
    };
  });
  return {
    baselineLabel: baseline.label,
    modes: [...FAILURE_MODE_ORDER],
    rows,
  };
}

interface NodeRecord {
  nodeId: string;
  verdict: HomeomorphismVerdict;
  structuralJaccard: number | null;
}

function indexBySourceFile(report: AggregateReport): Map<string, NodeRecord> {
  const m = new Map<string, NodeRecord>();
  for (const res of report.results) {
    // First occurrence wins (a source file maps 1:1 to a node; defensive
    // against any accidental duplicate by keeping the first).
    if (m.has(res.sourceFile)) continue;
    m.set(res.sourceFile, {
      nodeId: res.nodeId,
      verdict: res.verdict,
      structuralJaccard:
        res.ok && res.metrics ? res.metrics.structuralJaccard : null,
    });
  }
  return m;
}

function classifyTrend(
  baselineOrdinal: number | null,
  otherOrdinals: Array<number | null>,
): PerFileTrend {
  if (baselineOrdinal === null) return "incomparable";
  const deltas: number[] = [];
  for (const o of otherOrdinals) {
    if (o === null) continue;
    deltas.push(o - baselineOrdinal);
  }
  if (deltas.length === 0) return "incomparable";
  const anyUp = deltas.some((d) => d > 0);
  const anyDown = deltas.some((d) => d < 0);
  if (anyUp && anyDown) return "mixed";
  if (anyUp) return "improved";
  if (anyDown) return "regressed";
  return "stable";
}

function buildPerFile(arms: readonly BakeoffArm[]): PerFileRow[] {
  const indexed = arms.map((a) => indexBySourceFile(a.report));

  // Union of all source files across arms, sorted for determinism.
  const allFiles = new Set<string>();
  for (const idx of indexed) {
    for (const f of idx.keys()) allFiles.add(f);
  }
  const sortedFiles = [...allFiles].sort((a, b) => a.localeCompare(b));

  const rows: PerFileRow[] = [];
  for (const file of sortedFiles) {
    const perArm: PerFileArmCell[] = [];
    let nodeId = "";
    const ordinals: Array<number | null> = [];
    for (let i = 0; i < arms.length; i++) {
      const rec = indexed[i].get(file);
      if (rec && nodeId === "") nodeId = rec.nodeId;
      perArm.push({
        label: arms[i].label,
        verdict: rec ? rec.verdict : null,
        structuralJaccard: rec ? rec.structuralJaccard : null,
      });
      ordinals.push(rec ? VERDICT_ORDINAL[rec.verdict] : null);
    }
    const trend = classifyTrend(ordinals[0], ordinals.slice(1));
    rows.push({ sourceFile: file, nodeId, perArm, trend });
  }
  return rows;
}

function buildH1Read(arms: ArmSummary[], floor: number): H1Read {
  const perArm: H1ArmRead[] = arms.map((a) => ({
    label: a.label,
    meanStructuralJaccard: a.meanStructuralJaccard,
    passes:
      a.meanStructuralJaccard !== null && a.meanStructuralJaccard >= floor,
  }));
  const measurable = perArm.filter((p) => p.meanStructuralJaccard !== null);
  const allPass =
    measurable.length > 0 && measurable.every((p) => p.passes);
  const anyPass = perArm.some((p) => p.passes);
  return { jaccardFloor: floor, perArm, allPass, anyPass };
}

/**
 * Reduce N arm reports into a single cross-arm synthesis. The first
 * arm is the baseline; all deltas are computed as (arm − baseline).
 * Pure — no IO, no mutation of inputs. Throws on an empty arm list
 * (a synthesis with no baseline is undefined).
 */
export function synthesizeBakeoff(
  arms: readonly BakeoffArm[],
  options: BakeoffSynthesisOptions = {},
): BakeoffSynthesis {
  if (arms.length === 0) {
    throw new Error(
      "synthesizeBakeoff: at least one arm is required (the first is the baseline)",
    );
  }
  const floor = options.h1JaccardFloor ?? DEFAULT_H1_JACCARD_FLOOR;
  const summaries = arms.map(summariseArm);
  return {
    baselineLabel: summaries[0].label,
    armCount: arms.length,
    arms: summaries,
    exportRecovery: buildExportRecoveryComparison(summaries),
    failureModes: buildFailureModeComparison(summaries),
    perFile: buildPerFile(arms),
    h1: buildH1Read(summaries, floor),
  };
}

// ── IO seam ─────────────────────────────────────────────────────────

/**
 * Read an `AggregateReport` from a JSON file produced by
 * `verify-homeomorphism --json` (which wraps the report as
 * `{ ok, report }`) or a bare report JSON. The thin IO boundary kept
 * separate from the pure reducer so the reducer stays unit-testable.
 */
export function loadAggregateReport(filePath: string): AggregateReport {
  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `loadAggregateReport: ${filePath} is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (parsed && typeof parsed === "object" && "report" in parsed) {
    return (parsed as { report: AggregateReport }).report;
  }
  return parsed as AggregateReport;
}

// ── Markdown renderer ───────────────────────────────────────────────

function fmtRate(x: number | null): string {
  return x === null ? "—" : x.toFixed(3);
}

function fmtPct(x: number | null): string {
  return x === null ? "—" : `${(x * 100).toFixed(1)}%`;
}

function fmtDelta(x: number | null): string {
  if (x === null) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(3)}`;
}

function fmtSignedInt(x: number): string {
  return x > 0 ? `+${x}` : `${x}`;
}

const VERDICT_ORDER: readonly HomeomorphismVerdict[] = [
  "epsilon_equivalent",
  "divergent_loc",
  "divergent_structural",
  "divergent_both",
  "unrecoverable",
];

/**
 * Render a `BakeoffSynthesis` as a markdown document. Deterministic —
 * the same synthesis always renders byte-identical (modulo the
 * generated-at timestamp, which is intentionally omitted to keep the
 * output reproducible for diffing and tests).
 */
export function renderBakeoffSynthesisMarkdown(
  s: BakeoffSynthesis,
): string {
  const lines: string[] = [];
  lines.push(`# Move 3α bake-off synthesis`);
  lines.push(``);
  lines.push(
    `Cross-arm comparison of ${s.armCount} arm${s.armCount === 1 ? "" : "s"}. Baseline: \`${s.baselineLabel}\`. All deltas are (arm − baseline).`,
  );
  lines.push(``);

  // ── Arms overview ──
  lines.push(`## Arms`);
  lines.push(``);
  lines.push(`| Arm | Provider | Model | Nodes | Mean Jaccard | Mean LoC dist |`);
  lines.push(`|---|---|---|---:|---:|---:|`);
  for (const a of s.arms) {
    lines.push(
      `| ${a.label} | ${a.provider ?? "—"} | ${a.model ? `\`${a.model}\`` : "—"} | ${a.total} | ${fmtRate(a.meanStructuralJaccard)} | ${fmtRate(a.meanLocDistance)} |`,
    );
  }
  lines.push(``);

  // ── Verdicts ──
  lines.push(`## Verdict distribution`);
  lines.push(``);
  lines.push(
    `| Arm | ${VERDICT_ORDER.join(" | ")} |`,
  );
  lines.push(`|---|${VERDICT_ORDER.map(() => "---:").join("|")}|`);
  for (const a of s.arms) {
    lines.push(
      `| ${a.label} | ${VERDICT_ORDER.map((v) => a.byVerdict[v]).join(" | ")} |`,
    );
  }
  lines.push(``);

  // ── Export recovery ──
  lines.push(`## Export recovery (Move 3α candado #2)`);
  lines.push(``);
  lines.push(
    `| Arm | Micro | Δ micro | Macro | Δ macro | Exact-match files |`,
  );
  lines.push(`|---|---:|---:|---:|---:|---:|`);
  for (const r of s.exportRecovery.rows) {
    lines.push(
      `| ${r.label} | ${fmtPct(r.microRecoveryRate)} | ${fmtDelta(r.microDeltaVsBaseline)} | ${fmtPct(r.macroRecoveryRate)} | ${fmtDelta(r.macroDeltaVsBaseline)} | ${r.exactMatchCount ?? "—"} |`,
    );
  }
  lines.push(``);

  // ── Failure modes ──
  lines.push(`## Failure modes (counts; Δ vs baseline)`);
  lines.push(``);
  lines.push(`| Arm | ${s.failureModes.modes.join(" | ")} |`);
  lines.push(`|---|${s.failureModes.modes.map(() => "---:").join("|")}|`);
  for (const r of s.failureModes.rows) {
    const cells = s.failureModes.modes.map((m) => {
      if (r.counts === null) return "—";
      const c = r.counts[m];
      const d = r.deltaVsBaseline ? ` (${fmtSignedInt(r.deltaVsBaseline[m])})` : "";
      return `${c}${d}`;
    });
    lines.push(`| ${r.label} | ${cells.join(" | ")} |`);
  }
  lines.push(``);

  // ── Pareto frontier ──
  lines.push(`## Pareto frontier (per arm, by task)`);
  lines.push(``);
  let anyPareto = false;
  for (const a of s.arms) {
    if (a.paretoFrontier.length === 0) continue;
    anyPareto = true;
    lines.push(`**Arm ${a.label}:**`);
    lines.push(``);
    lines.push(`| Task | Provider | Model | Mean honesty | Mean $/node |`);
    lines.push(`|---|---|---|---:|---:|`);
    for (const p of a.paretoFrontier) {
      lines.push(
        `| ${p.task} | ${p.provider} | \`${p.model}\` | ${fmtRate(p.meanHonestyStructural)} | $${p.meanUsdPerNode.toFixed(4)} |`,
      );
    }
    lines.push(``);
  }
  if (!anyPareto) {
    lines.push(`_No Pareto-frontier data (reports run without \`--matrix\`)._`);
    lines.push(``);
  }

  // ── H1 read ──
  lines.push(`## H1 read — mean structural Jaccard ≥ ${s.h1.jaccardFloor}`);
  lines.push(``);
  lines.push(`| Arm | Mean Jaccard | Clears floor? |`);
  lines.push(`|---|---:|---|`);
  for (const p of s.h1.perArm) {
    lines.push(
      `| ${p.label} | ${fmtRate(p.meanStructuralJaccard)} | ${p.passes ? "✅ yes" : "❌ no"} |`,
    );
  }
  lines.push(``);
  lines.push(
    `**Decision-tree gate:** ${
      s.h1.allPass
        ? "every measurable arm clears the floor → synthesise → TARGET_ARCHITECTURE router skeleton."
        : s.h1.anyPass
          ? "at least one arm clears the floor but not all → inspect per-mode deltas before routing; partial signal."
          : "no arm clears the floor → local tier is at the floor; the Opus 4.7 ceiling probe is mandatory."
    }`,
  );
  lines.push(``);

  // ── Per-file rebuild status ──
  lines.push(`## Per-file rebuild status`);
  lines.push(``);
  const trendCounts: Record<PerFileTrend, number> = {
    improved: 0,
    regressed: 0,
    stable: 0,
    mixed: 0,
    incomparable: 0,
  };
  for (const row of s.perFile) trendCounts[row.trend] += 1;
  lines.push(
    `Trend summary (non-baseline arms vs baseline \`${s.baselineLabel}\`): ` +
      `improved ${trendCounts.improved}, regressed ${trendCounts.regressed}, ` +
      `stable ${trendCounts.stable}, mixed ${trendCounts.mixed}, ` +
      `incomparable ${trendCounts.incomparable}.`,
  );
  lines.push(``);
  lines.push(
    `| Source file | ${s.arms.map((a) => a.label).join(" | ")} | Trend |`,
  );
  lines.push(`|---|${s.arms.map(() => "---").join("|")}|---|`);
  for (const row of s.perFile) {
    const cells = row.perArm.map((c) =>
      c.verdict === null ? "—" : `${c.verdict} (${fmtRate(c.structuralJaccard)})`,
    );
    lines.push(`| \`${row.sourceFile}\` | ${cells.join(" | ")} | ${row.trend} |`);
  }
  lines.push(``);

  return lines.join("\n");
}

// ── Zod schema (output validation) ──────────────────────────────────

const VerdictCountsSchema = z.object({
  epsilon_equivalent: z.number().int().nonnegative(),
  divergent_loc: z.number().int().nonnegative(),
  divergent_structural: z.number().int().nonnegative(),
  divergent_both: z.number().int().nonnegative(),
  unrecoverable: z.number().int().nonnegative(),
});

const FailureModeCountsSchema = z.object({
  missing_exports: z.number().int().nonnegative(),
  hallucinated_exports: z.number().int().nonnegative(),
  empty_regen: z.number().int().nonnegative(),
  compile_back_failed: z.number().int().nonnegative(),
  gluing_rejected: z.number().int().nonnegative(),
  schema_invalid: z.number().int().nonnegative(),
});

// Per-mode deltas (arm − baseline) are signed: a negative value is an
// improvement (fewer failures than baseline). Distinct from the counts
// schema, which is non-negative.
const FailureModeDeltaSchema = z.object({
  missing_exports: z.number().int(),
  hallucinated_exports: z.number().int(),
  empty_regen: z.number().int(),
  compile_back_failed: z.number().int(),
  gluing_rejected: z.number().int(),
  schema_invalid: z.number().int(),
});

const ArmParetoEntrySchema = z.object({
  task: z.string(),
  provider: z.string(),
  model: z.string(),
  meanHonestyStructural: z.number().nullable(),
  meanUsdPerNode: z.number(),
});

export const BakeoffSynthesisSchema = z.object({
  baselineLabel: z.string(),
  armCount: z.number().int().positive(),
  arms: z.array(
    z.object({
      label: z.string(),
      provider: z.string().nullable(),
      model: z.string().nullable(),
      total: z.number().int().nonnegative(),
      byVerdict: VerdictCountsSchema,
      microRecoveryRate: z.number().nullable(),
      macroRecoveryRate: z.number().nullable(),
      exactMatchCount: z.number().int().nonnegative().nullable(),
      nodesWithMandatory: z.number().int().nonnegative().nullable(),
      failureModeCounts: FailureModeCountsSchema.nullable(),
      affectedNodes: z.number().int().nonnegative().nullable(),
      meanStructuralJaccard: z.number().nullable(),
      meanLocDistance: z.number().nullable(),
      nodesWithMetrics: z.number().int().nonnegative(),
      paretoFrontier: z.array(ArmParetoEntrySchema),
    }),
  ),
  exportRecovery: z.object({
    baselineLabel: z.string(),
    rows: z.array(
      z.object({
        label: z.string(),
        microRecoveryRate: z.number().nullable(),
        macroRecoveryRate: z.number().nullable(),
        microDeltaVsBaseline: z.number().nullable(),
        macroDeltaVsBaseline: z.number().nullable(),
        exactMatchCount: z.number().int().nonnegative().nullable(),
      }),
    ),
  }),
  failureModes: z.object({
    baselineLabel: z.string(),
    modes: z.array(FailureModeSchemaEnum()),
    rows: z.array(
      z.object({
        label: z.string(),
        counts: FailureModeCountsSchema.nullable(),
        deltaVsBaseline: FailureModeDeltaSchema.nullable(),
      }),
    ),
  }),
  perFile: z.array(
    z.object({
      sourceFile: z.string(),
      nodeId: z.string(),
      perArm: z.array(
        z.object({
          label: z.string(),
          verdict: z
            .enum([
              "epsilon_equivalent",
              "divergent_loc",
              "divergent_structural",
              "divergent_both",
              "unrecoverable",
            ])
            .nullable(),
          structuralJaccard: z.number().nullable(),
        }),
      ),
      trend: z.enum(["improved", "regressed", "stable", "mixed", "incomparable"]),
    }),
  ),
  h1: z.object({
    jaccardFloor: z.number(),
    perArm: z.array(
      z.object({
        label: z.string(),
        meanStructuralJaccard: z.number().nullable(),
        passes: z.boolean(),
      }),
    ),
    allPass: z.boolean(),
    anyPass: z.boolean(),
  }),
});

function FailureModeSchemaEnum() {
  return z.enum([
    "missing_exports",
    "hallucinated_exports",
    "empty_regen",
    "compile_back_failed",
    "gluing_rejected",
    "schema_invalid",
  ]);
}
