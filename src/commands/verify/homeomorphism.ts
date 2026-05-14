import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { loadNodes, loadNodeById } from "../../core/project/load.js";
import { runCompilePlan } from "../../runtime/compile/compile-plan-runner.js";
import { loadPersistedRun } from "../../core/runs/persist.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import { errorMessage } from "../../core/errors.js";
import { OntologyEventSchema } from "../../schemas/ontology.js";
import type { OntologyNode } from "../../schemas/ontology.js";
import { readState, writeState } from "../../core/state/state-store.js";
import { getOntologyPaths } from "../../core/project/paths.js";
import { appendJsonl } from "../../core/fs/json.js";
import { withLock, LockAcquireError } from "../../core/fs/lock.js";
import {
  compareFiles,
  classifyVerdict,
  computeDistanceMetrics,
  DEFAULT_THRESHOLDS,
  emptyVerdictCounts,
  inferLanguageHint,
  type AggregateReport,
  type DistanceMetrics,
  type HomeomorphismVerdict,
  type VerificationResult,
  type VerificationUsage,
  type VerdictThresholds,
} from "../../runtime/legend/verify-homeomorphism.js";
import {
  computeCostEstimate,
  formatCostEstimateHuman,
  readFileSizeInfos,
  resolveProviderRate,
} from "../ingest/cost-estimate.js";
import {
  aggregateByAxis,
  buildMatrixCost,
  buildPerNodeMatrix,
  meanHonesty,
  HONESTY_AXES,
  type ByAxis,
  type PerNodeMatrix,
} from "../../runtime/legend/matrix.js";
import {
  aggregateByIntersection,
  REQUIRED_INTERSECTIONS,
} from "../../runtime/legend/matrix-intersections.js";
import { tagFileFromDisk } from "../../runtime/legend/frontier-tagger.js";
import { aggregateByTaskModel } from "../../runtime/legend/pareto.js";
import {
  barChart,
  histogram,
} from "../../runtime/legend/render-ascii.js";

// `onto verify-homeomorphism` — Project Legend δ-2.
//
// The publishable measurement for §3.10. Walks a set of nodes (a
// single focal, an explicit list, or every artifact in the project),
// compile-back each one with the same provider that produced it,
// reads the regenerated artifact, and computes two distances against
// the original source file:
//   - LoC distance — line-count delta normalized
//   - Structural Jaccard — overlap of top-level declaration names
// The pair folds into a verdict label (ε-equivalent /
// divergent_loc / divergent_structural / divergent_both /
// unrecoverable) per the γ-2 + Vibe-Reasoning calibration lesson:
// LoC and behavior disagree, report both.
//
// Cost: one LLM dispatch per node. Pre-flight with --cost-estimate
// to see the bill before paying; --dry-run skips the dispatch and
// lets the diff math run on whatever artifact already exists under
// the staging path (useful when iterating thresholds).
//
// Output: a structured report with per-node verdicts and aggregate
// counts. --json yields the same shape machine-readable.

export interface VerifyHomeomorphismOptions {
  // Mutually-exclusive selectors. Exactly one is required UNLESS a
  // positional <focal> argument is given to the action.
  allArtifacts?: boolean;
  nodes?: string;
  // LLM provider override (defaults to per-node model.ref via registry).
  provider?: string;
  model?: string;
  ollamaHost?: string;
  // Bumps the compile-back dispatch max_tokens (anthropic default
  // 8192 — see adapter). Use for large artifacts.
  maxTokens?: number;
  // Suppress adaptive thinking on providers that support it
  // (anthropic Opus 4.7). Use for large prompts where thinking
  // exhausts the output budget — visualize_adaptive_strategy.py
  // from the γ-7 calibration was the canonical case.
  thinking?: "adaptive" | "disabled";
  // When set, write a markdown report of the verdict + per-node
  // usage to the given path in addition to (or instead of) the
  // stdout / --json output. The markdown shape mirrors
  // `docs/legend/calibrations/*` reports.
  report?: string;
  // Bypass the .ontology/.lock advisory lock. See compileRun for
  // semantics. Verify reads + writes .ontology/verify/<nodeId>.<ext>
  // and emits a homeomorphism_verified event, so it must hold the
  // lock by default; --no-lock is the explicit opt-out.
  noLock?: boolean;
  // Open-world: degrades unsatisfied requires to warnings. Set by
  // default for verify because ingest-derived contracts routinely
  // reference external deps; explicit override available.
  openWorld?: boolean;
  // ε-thresholds — see VerdictThresholds. Defaults from
  // DEFAULT_THRESHOLDS.
  locThreshold?: number;
  jaccardThreshold?: number;
  // Pre-flight: walks the input set, computes the *ingest-style*
  // cost estimate against each original source file (since
  // compile-back cost is approximately the same magnitude), prints
  // the breakdown, exits without dispatching.
  costEstimate?: boolean;
  // Skip the compile-back dispatch entirely. Reads any existing
  // regen under the staging path (.ontology/verify/<nodeId>.<ext>);
  // if none, marks the node as unrecoverable with
  // reason="no_existing_regen". Useful for re-classifying with
  // tuned thresholds without paying for new dispatches.
  dryRun?: boolean;
  // Phase ε prework C: emit the six-axis matrix per node and the
  // per-axis aggregate counts alongside the legacy verdict report.
  // The axes are: contract, structural, behavior, intent,
  // literalRequired, and cost. The pilot fills structural + cost +
  // literalRequired with real data and reports the rest as
  // not-measured / untested / not-reviewed. Off by default so legacy
  // callers see the unchanged report shape.
  matrix?: boolean;
  json?: boolean;
}

// Where compile-back writes for verify-homeomorphism. Distinct from
// the default `.ontology/artifacts/generated/` so a verify sweep
// doesn't clobber the audit-chain artifacts.
const STAGING_DIR = ".ontology/verify";

export async function verifyHomeomorphismCommand(
  focalArg: string | undefined,
  options: VerifyHomeomorphismOptions,
): Promise<void> {
  const cwd = process.cwd();
  const provider = resolveProvider(options.provider, options.json);
  if (options.provider !== undefined && provider === undefined) return;

  // 1. Decide which nodes to process.
  const candidates = resolveCandidates(focalArg, options, cwd);
  if (candidates === null) return; // resolveCandidates already reported.

  const thresholds: VerdictThresholds = {
    loc: options.locThreshold ?? DEFAULT_THRESHOLDS.loc,
    jaccard: options.jaccardThreshold ?? DEFAULT_THRESHOLDS.jaccard,
  };

  // 2. Pre-flight cost estimate path — no dispatch.
  if (options.costEstimate) {
    const targets = candidates
      .map((c) => c.sourcePath)
      .filter((p): p is string => p !== undefined);
    const sizeInfos = readFileSizeInfos(targets);
    const estimate = computeCostEstimate(
      sizeInfos,
      provider ?? "anthropic",
      options.model,
      "code_sketch",
    );
    if (options.json) {
      console.log(JSON.stringify({ ok: true, estimate }, null, 2));
    } else {
      console.log(formatCostEstimateHuman(estimate));
      console.log("");
      console.log("Note: compile-back regenerates artifacts of roughly the same");
      console.log("size as the originals; this estimate uses input size as a");
      console.log("proxy. Real cost typically ±30%.");
    }
    return;
  }

  // 3. Compile-back loop (skipped under --dry-run).
  const stagingDir = path.join(cwd, STAGING_DIR);
  if (!options.dryRun) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  const results: VerificationResult[] = [];
  try {
    await withLock(
      cwd,
      async () => {
        for (const c of candidates) {
          const r = await verifyOne(c, {
            stagingDir,
            provider,
            model: options.model,
            ollamaHost: options.ollamaHost,
            maxTokens: options.maxTokens,
            thinking: options.thinking,
            openWorld: options.openWorld ?? true, // verify defaults to open-world
            thresholds,
            dryRun: !!options.dryRun,
            cwd,
          });
          results.push(r);
        }
      },
      {
        skipLock: options.noLock,
        command: `verify-homeomorphism (${candidates.length} candidates)`,
      },
    );
  } catch (err: unknown) {
    if (err instanceof LockAcquireError) {
      fail(err.message, options.json);
      return;
    }
    throw err;
  }

  // 4. Aggregate + emit report.
  const counts = emptyVerdictCounts();
  for (const r of results) counts[r.verdict] += 1;
  const totalUsage = aggregateUsage(results);

  // Phase ε prework C: optional six-axis matrix. Walks results, tags
  // each source file via the path/content tagger, loads the node to
  // read `node.literal`, builds the cell, and aggregates by axis. All
  // pure modulo the node.literal lookup and the tagFileFromDisk read;
  // both touch only files we already have on disk.
  let matrix: PerNodeMatrix[] | undefined;
  let byAxis: ByAxis | undefined;
  if (options.matrix) {
    matrix = [];
    for (const r of results) {
      const tagResult = tagFileFromDisk(r.sourceFile);
      // Best-effort node lookup. Verify never operates on a node it
      // can't find (resolveCandidates filtered the set), so this
      // should always succeed; treat undefined as `literal=false`
      // rather than failing the whole matrix build. `node.literal`
      // is the literal-content string when β-2's escape hatch is in
      // use; "is literal" is `node.literal !== undefined`.
      const node = loadNodeById(r.nodeId, cwd);
      const literal: boolean | undefined =
        node?.literal !== undefined ? true : false;
      // The cost record's provider/model fall back to the resolved
      // verify provider when the per-result usage is sparse (cache
      // hits, mock dispatches). Task is "code_sketch" since this is
      // the compile-back direction.
      const cost = buildMatrixCost({
        provider: provider ?? "unknown",
        model: options.model ?? node?.model?.ref ?? "unknown",
        task: "code_sketch",
        usage: r.usage,
      });
      matrix.push(
        buildPerNodeMatrix({
          nodeId: r.nodeId,
          sourceFile: r.sourceFile,
          taggerTags: tagResult.attrs,
          verdict: r.verdict,
          literal,
          cost,
          metrics: r.metrics,
        }),
      );
    }
    byAxis = aggregateByAxis(matrix.map((m) => m.cell));
  }
  // Phase ε prework D: intersection counts. Always present when the
  // matrix is, with the seven required keys initialised to zero.
  const byIntersection = matrix ? aggregateByIntersection(matrix) : undefined;
  // Phase ε prework G: Pareto pivot by (task, provider, model).
  const paretoByTaskModel = matrix ? aggregateByTaskModel(matrix) : undefined;

  const report: AggregateReport = {
    rootDir: cwd,
    thresholds,
    total: results.length,
    byVerdict: counts,
    results,
    ...(totalUsage ? { totalUsage } : {}),
    ...(matrix ? { matrix } : {}),
    ...(byAxis ? { byAxis } : {}),
    ...(byIntersection ? { byIntersection } : {}),
    ...(paretoByTaskModel ? { paretoByTaskModel } : {}),
  };

  // 5. Append a `homeomorphism_verified` event so the temporal log
  // carries the canonical timeline of "what we measured, when". One
  // event per CLI invocation — the payload aggregates verdict counts
  // and the node ids that participated. POST_GAMMA_PLAN.md §2.4
  // requested this so Phase ε's report can be reconstructed from
  // events.jsonl alone. Non-fatal: a failed append is logged but the
  // user still gets stdout / --json / --report output.
  if (!options.dryRun && !options.costEstimate && results.length > 0) {
    try {
      const paths = getOntologyPaths(cwd);
      const state = readState(cwd);
      const eventId = "evt_" + randomBytes(4).toString("hex");
      const event = OntologyEventSchema.parse({
        eventId,
        sequence: state.eventCount,
        timestamp: new Date().toISOString(),
        eventType: "homeomorphism_verified",
        branch: state.activeBranch,
        previousEventId: state.lastEventId,
        payload: {
          nodeIds: results.map((r) => r.nodeId),
          total: results.length,
          byVerdict: counts,
          thresholds,
          ...(totalUsage ? { totalUsage } : {}),
        },
      });
      appendJsonl(paths.eventsPath, event);
      state.eventCount += 1;
      state.lastEventId = eventId;
      state.updatedAt = new Date().toISOString();
      writeState(state, cwd);
    } catch (err: unknown) {
      console.error(`⚠ Failed to append homeomorphism_verified event: ${errorMessage(err)}`);
    }
  }

  // 6. Optional markdown report (Tooling gap #2 from γ-7 calibration).
  if (options.report) {
    const md = renderReportMarkdown(report, {
      providerOverride: provider,
      modelOverride: options.model,
      thinking: options.thinking,
      maxTokens: options.maxTokens,
    });
    const absReport = path.isAbsolute(options.report)
      ? options.report
      : path.resolve(cwd, options.report);
    fs.mkdirSync(path.dirname(absReport), { recursive: true });
    fs.writeFileSync(absReport, md, "utf-8");
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
    return;
  }
  printReportHuman(report);
  if (options.report) {
    console.log(``);
    console.log(`Markdown report written to: ${options.report}`);
  }
}

// ── Usage telemetry ─────────────────────────────────────────────────────────

// Load the persisted run for a focal step and translate its
// output.usage into the VerificationUsage shape, adding an approximate
// USD cost from the resolved provider rate. Returns undefined when the
// run record is missing, has no usage payload (e.g. mock provider), or
// the rate is unknown — callers treat the field as best-effort.
function collectUsage(
  runId: string | undefined,
  cached: boolean | undefined,
  cwd: string,
): VerificationUsage | undefined {
  if (!runId) return undefined;
  const run = loadPersistedRun(runId, cwd);
  if (!run) return undefined;
  const u = run.output.usage;
  if (!u) {
    return cached !== undefined ? { cached } : undefined;
  }
  const out: VerificationUsage = {};
  if (u.promptTokens !== undefined) out.promptTokens = u.promptTokens;
  if (u.completionTokens !== undefined) out.completionTokens = u.completionTokens;
  if (u.totalTokens !== undefined) out.totalTokens = u.totalTokens;
  if (cached !== undefined) out.cached = cached;

  // Approximate per-node cost from the published provider rate. We
  // never charge for cached calls (no new API spend).
  if (!cached && (u.promptTokens !== undefined || u.completionTokens !== undefined)) {
    const rate = resolveProviderRate(run.model.provider, run.model.model);
    if (rate.inputUsdPerMillion > 0 || rate.outputUsdPerMillion > 0) {
      const inUsd = ((u.promptTokens ?? 0) / 1_000_000) * rate.inputUsdPerMillion;
      const outUsd = ((u.completionTokens ?? 0) / 1_000_000) * rate.outputUsdPerMillion;
      out.costUSD = inUsd + outUsd;
    }
  }
  return out;
}

function aggregateUsage(results: VerificationResult[]): VerificationUsage | undefined {
  let p = 0, c = 0, t = 0, cost = 0;
  let any = false;
  let hadCost = false;
  for (const r of results) {
    const u = r.usage;
    if (!u) continue;
    any = true;
    if (u.promptTokens !== undefined) p += u.promptTokens;
    if (u.completionTokens !== undefined) c += u.completionTokens;
    if (u.totalTokens !== undefined) t += u.totalTokens;
    if (u.costUSD !== undefined) {
      cost += u.costUSD;
      hadCost = true;
    }
  }
  if (!any) return undefined;
  const agg: VerificationUsage = {};
  if (p > 0) agg.promptTokens = p;
  if (c > 0) agg.completionTokens = c;
  if (t > 0) agg.totalTokens = t;
  if (hadCost) agg.costUSD = cost;
  return agg;
}

// ── Per-node verify pipeline ────────────────────────────────────────────────

interface Candidate {
  node: OntologyNode;
  sourcePath?: string;
}

interface VerifyOneCtx {
  stagingDir: string;
  provider: LlmProvider | undefined;
  model?: string;
  ollamaHost?: string;
  maxTokens?: number;
  thinking?: "adaptive" | "disabled";
  openWorld: boolean;
  thresholds: VerdictThresholds;
  dryRun: boolean;
  cwd: string;
}

async function verifyOne(
  c: Candidate,
  ctx: VerifyOneCtx,
): Promise<VerificationResult> {
  const nodeId = c.node.id;
  if (c.sourcePath === undefined) {
    return {
      nodeId,
      sourceFile: "(missing — node has no outputs.files[0])",
      ok: false,
      failure: "node has no outputs.files[0] — cannot locate the source to diff against",
      verdict: "unrecoverable",
      thresholds: ctx.thresholds,
    };
  }
  const sourcePath = c.sourcePath;
  if (!fs.existsSync(sourcePath)) {
    return {
      nodeId,
      sourceFile: sourcePath,
      ok: false,
      failure: `source file not found at "${sourcePath}"`,
      verdict: "unrecoverable",
      thresholds: ctx.thresholds,
    };
  }

  // Target the staging file with the same extension as the source.
  const ext = path.extname(sourcePath) || "";
  const regenPath = path.join(ctx.stagingDir, `${nodeId}${ext}`);

  // Compile-back (skipped under --dry-run; we still try to read any
  // existing regen below).
  let usage: VerificationUsage | undefined;
  if (!ctx.dryRun) {
    const compileResult = await runCompilePlan({
      focalId: nodeId,
      provider: ctx.provider,
      model: ctx.model,
      ollamaHost: ctx.ollamaHost,
      targetPath: regenPath,
      force: true,
      openWorld: ctx.openWorld,
      maxTokens: ctx.maxTokens,
      thinking: ctx.thinking,
    });
    if (!compileResult.ok) {
      return {
        nodeId,
        sourceFile: sourcePath,
        ok: false,
        failure: `compile-back failed: ${compileResult.message}`,
        verdict: "unrecoverable",
        thresholds: ctx.thresholds,
      };
    }
    const focalStep = compileResult.steps.find((s) => s.nodeId === nodeId);
    usage = collectUsage(focalStep?.runId, focalStep?.cached, ctx.cwd);
  } else if (!fs.existsSync(regenPath)) {
    return {
      nodeId,
      sourceFile: sourcePath,
      ok: false,
      failure: `--dry-run set and no existing regen at "${regenPath}"; run without --dry-run first`,
      verdict: "unrecoverable",
      thresholds: ctx.thresholds,
    };
  }

  // Diff.
  const metrics = compareFiles(sourcePath, regenPath);
  if (metrics === null) {
    return {
      nodeId,
      sourceFile: sourcePath,
      regenPath,
      ok: false,
      failure: "could not read source or regenerated file for comparison",
      verdict: "unrecoverable",
      thresholds: ctx.thresholds,
    };
  }

  const verdict = classifyVerdict(metrics, ctx.thresholds);
  return {
    nodeId,
    sourceFile: sourcePath,
    regenPath,
    ok: true,
    metrics,
    verdict,
    thresholds: ctx.thresholds,
    ...(usage ? { usage } : {}),
  };
}

// ── Candidate resolution ────────────────────────────────────────────────────

function resolveCandidates(
  focalArg: string | undefined,
  options: VerifyHomeomorphismOptions,
  cwd: string,
): Candidate[] | null {
  const cwdReal = safeRealpath(cwd);
  const selectorsUsed =
    Number(focalArg !== undefined) +
    Number(options.allArtifacts === true) +
    Number(options.nodes !== undefined && options.nodes.length > 0);
  if (selectorsUsed === 0) {
    fail(
      `Specify one of: <focal>, --all-artifacts, or --nodes id1,id2,...`,
      options.json,
    );
    return null;
  }
  if (selectorsUsed > 1) {
    fail(
      `<focal>, --all-artifacts, and --nodes are mutually exclusive`,
      options.json,
    );
    return null;
  }

  // Single focal positional arg.
  if (focalArg !== undefined) {
    const node = loadNodeById(focalArg, cwd);
    if (!node) {
      fail(`Node not found: ${focalArg}`, options.json);
      return null;
    }
    return [makeCandidate(node, cwdReal)];
  }

  // --nodes id1,id2,...
  if (options.nodes !== undefined) {
    const ids = options.nodes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const out: Candidate[] = [];
    for (const id of ids) {
      const node = loadNodeById(id, cwd);
      if (!node) {
        fail(`Node not found: ${id}`, options.json);
        return null;
      }
      out.push(makeCandidate(node, cwdReal));
    }
    return out;
  }

  // --all-artifacts
  const nodes = loadNodes(cwd);
  const artifacts = nodes.filter(
    (n) => n.coordinates.manifestation === "code",
  );
  return artifacts.map((n) => makeCandidate(n, cwdReal));
}

function makeCandidate(node: OntologyNode, cwdReal: string): Candidate {
  const files = node.outputs?.files ?? [];
  if (files.length === 0) {
    return { node, sourcePath: undefined };
  }
  const rel = files[0];
  // sourceFiles[0] was written cwd-relative by γ-5 (via
  // computeCwdRelative in ingest/index.ts), so resolve it back
  // against the same cwd.
  const abs = path.isAbsolute(rel) ? rel : path.resolve(cwdReal, rel);
  return { node, sourcePath: abs };
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

// ── Provider gate ───────────────────────────────────────────────────────────

function resolveProvider(
  raw: string | undefined,
  json: boolean | undefined,
): LlmProvider | undefined {
  if (raw === undefined) return undefined; // per-node routing
  if (raw !== "mock" && raw !== "ollama" && raw !== "anthropic") {
    fail(
      `Unsupported provider: ${raw} (try mock, ollama, or anthropic)`,
      json,
    );
    return undefined;
  }
  return raw as LlmProvider;
}

// ── Output ──────────────────────────────────────────────────────────────────

function printReportHuman(report: AggregateReport): void {
  console.log(`=== ONTOLOGY VERIFY-HOMEOMORPHISM ===`);
  console.log(`Nodes:           ${report.total}`);
  console.log(``);
  console.log(`Thresholds:`);
  console.log(`  LoC < ${report.thresholds.loc}`);
  console.log(`  Jaccard ≥ ${report.thresholds.jaccard}`);
  console.log(``);
  console.log(`Verdict counts:`);
  console.log(`  ε-equivalent:           ${report.byVerdict.epsilon_equivalent}`);
  console.log(`  divergent (LoC only):   ${report.byVerdict.divergent_loc}`);
  console.log(`  divergent (struct):     ${report.byVerdict.divergent_structural}`);
  console.log(`  divergent (both):       ${report.byVerdict.divergent_both}`);
  console.log(`  unrecoverable:          ${report.byVerdict.unrecoverable}`);
  if (report.totalUsage) {
    const u = report.totalUsage;
    const tokens = u.totalTokens ?? ((u.promptTokens ?? 0) + (u.completionTokens ?? 0));
    const costStr = u.costUSD !== undefined ? ` (~$${u.costUSD.toFixed(4)})` : ``;
    console.log(``);
    console.log(`Aggregate dispatch: ${tokens.toLocaleString()} tokens${costStr}`);
  }
  console.log(``);
  console.log(`Per node:`);
  for (const r of report.results) {
    if (!r.ok) {
      console.log(`  ✖ ${r.nodeId}  ${r.sourceFile}`);
      console.log(`    unrecoverable: ${r.failure}`);
      continue;
    }
    const m = r.metrics!;
    const tag = verdictTag(r.verdict);
    const locPct = (m.locDistance * 100).toFixed(0);
    const jacPct = (m.structuralJaccard * 100).toFixed(0);
    const lineDelta = `${m.originalLineCount}→${m.regenLineCount}`;
    const declCount = `decl ${m.originalDeclarations.length}→${m.regenDeclarations.length}`;
    console.log(
      `  ${tag} ${r.nodeId}  loc=${locPct}% jac=${jacPct}%  ${lineDelta} lines  ${declCount}`,
    );
    if (
      m.originalDeclarations.length > 0 ||
      m.regenDeclarations.length > 0
    ) {
      const onlyA = m.originalDeclarations.filter(
        (d) => !m.regenDeclarations.includes(d),
      );
      const onlyB = m.regenDeclarations.filter(
        (d) => !m.originalDeclarations.includes(d),
      );
      if (onlyA.length > 0) {
        console.log(`    lost from regen:  ${onlyA.slice(0, 6).join(", ")}${onlyA.length > 6 ? ` (+${onlyA.length - 6} more)` : ""}`);
      }
      if (onlyB.length > 0) {
        console.log(`    added by regen:   ${onlyB.slice(0, 6).join(", ")}${onlyB.length > 6 ? ` (+${onlyB.length - 6} more)` : ""}`);
      }
    }
  }
}

function verdictTag(v: HomeomorphismVerdict): string {
  switch (v) {
    case "epsilon_equivalent": return "✅";
    case "divergent_loc":        return "⚠️ ";
    case "divergent_structural": return "⚠️ ";
    case "divergent_both":       return "❌";
    case "unrecoverable":        return "✖ ";
  }
}

function fail(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}

// ── Markdown report writer (Tooling gap #2) ─────────────────────────────────

interface MarkdownReportContext {
  providerOverride?: LlmProvider;
  modelOverride?: string;
  thinking?: "adaptive" | "disabled";
  maxTokens?: number;
}

export function renderReportMarkdown(
  report: AggregateReport,
  ctx: MarkdownReportContext = {},
): string {
  const lines: string[] = [];
  const now = new Date().toISOString();
  lines.push(`# verify-homeomorphism report`);
  lines.push(``);
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Root:** \`${report.rootDir}\``);
  lines.push(`**Provider override:** ${ctx.providerOverride ?? "—  (per-node model.ref)"}`);
  if (ctx.modelOverride) lines.push(`**Model override:** \`${ctx.modelOverride}\``);
  if (ctx.maxTokens !== undefined) lines.push(`**Max tokens:** ${ctx.maxTokens}`);
  if (ctx.thinking) lines.push(`**Thinking:** \`${ctx.thinking}\``);
  lines.push(`**Thresholds:** LoC < ${report.thresholds.loc}, Jaccard ≥ ${report.thresholds.jaccard}`);
  lines.push(``);

  lines.push(`## Aggregate`);
  lines.push(``);
  lines.push(`| Verdict | Count | % |`);
  lines.push(`|---|---:|---:|`);
  const order: HomeomorphismVerdict[] = [
    "epsilon_equivalent",
    "divergent_loc",
    "divergent_structural",
    "divergent_both",
    "unrecoverable",
  ];
  for (const v of order) {
    const n = report.byVerdict[v];
    const pct = report.total > 0 ? `${((n / report.total) * 100).toFixed(0)}%` : "—";
    lines.push(`| ${v} | ${n} | ${pct} |`);
  }
  lines.push(`| **Total** | **${report.total}** | |`);
  lines.push(``);

  // Inline bar chart of the verdict distribution (Phase ε prework H).
  if (report.total > 0) {
    const chart = barChart(
      order.map((v) => ({ label: v, count: report.byVerdict[v] })),
      report.total,
      20,
    );
    if (chart.length > 0) {
      lines.push("```");
      lines.push(chart);
      lines.push("```");
      lines.push(``);
    }
  }

  if (report.totalUsage) {
    const u = report.totalUsage;
    lines.push(`**Aggregate dispatch:**`);
    if (u.promptTokens !== undefined) lines.push(`- Input tokens: ${u.promptTokens.toLocaleString()}`);
    if (u.completionTokens !== undefined) lines.push(`- Output tokens: ${u.completionTokens.toLocaleString()}`);
    if (u.totalTokens !== undefined) lines.push(`- Total tokens: ${u.totalTokens.toLocaleString()}`);
    if (u.costUSD !== undefined) lines.push(`- Estimated cost: \`$${u.costUSD.toFixed(4)}\` (per-provider published rates)`);
    lines.push(``);
  }

  // ── Phase ε prework C: matrix-by-axis section ──
  if (report.byAxis) {
    lines.push(`## Matrix by axis (Phase ε prework C)`);
    lines.push(``);
    lines.push(`| Axis | Distribution |`);
    lines.push(`|---|---|`);
    const axisOrder: Array<keyof typeof report.byAxis> = [
      "contract",
      "structural",
      "behavior",
      "intent",
      "literalRequired",
    ];
    for (const axis of axisOrder) {
      const dist = report.byAxis[axis] as Record<string, number>;
      const nonZero = Object.entries(dist)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([state, n]) => `\`${state}\`=${n}`)
        .join(", ");
      lines.push(`| ${axis} | ${nonZero || "—"} |`);
    }
    lines.push(``);
    lines.push(
      '*Pilot fills `structural` + `literalRequired` + `cost` with measured data. `contract`, `behavior`, `intent` report explicit not-measured / untested / not-reviewed until their checkers ship — the honest "no data" signal required by `SELF_INGEST_HYPOTHESIS_<date>.md` §3.*',
    );
    lines.push(``);
  }

  // ── Phase ε prework F: honesty score per axis ──
  // Per-axis honesty (no global scalar — hypothesis §9 forbids it).
  // Reported with sample size so a low denominator can't masquerade as
  // a confident reading.
  if (report.matrix && report.matrix.length > 0) {
    const means = meanHonesty(report.matrix.map((m) => m.honesty));
    lines.push(`## Honesty by axis (Phase ε prework F)`);
    lines.push(``);
    lines.push(`| Axis | Mean | n | Coverage |`);
    lines.push(`|---|---:|---:|---:|`);
    const totalNodes = report.matrix.length;
    for (const axis of HONESTY_AXES) {
      const entry = means[axis];
      const meanStr = entry.mean === null ? "—" : entry.mean.toFixed(3);
      const cov =
        totalNodes > 0 ? `${((entry.n / totalNodes) * 100).toFixed(0)}%` : "—";
      lines.push(`| ${axis} | ${meanStr} | ${entry.n} | ${cov} |`);
    }
    lines.push(``);
    lines.push(
      "*Per-axis means computed over nodes with non-null scores. Formulas: `structural = 0.5·(1 − loc) + 0.5·jaccard`; `contract / behavior` = pass→1, fail→0; `intent` = accepted→1, rejected→0, needs-human→0.5. `not-reviewed` / `untested` / `not-measured` collapse to null and are excluded from the mean.*",
    );
    lines.push(``);

    // Histogram of per-node structural honesty (Phase ε prework H).
    // Pure visual aid for the matrix — the mean above is the same
    // number, the histogram shows the shape of the distribution.
    const structuralScores = report.matrix
      .map((m) => m.honesty.structural)
      .filter((v): v is number => v !== null);
    if (structuralScores.length > 0) {
      const h = histogram(structuralScores, 20);
      lines.push("```");
      lines.push(`structural honesty (n=${h.total})`);
      lines.push(h.bars);
      lines.push(`${h.axis.padStart(20)}`);
      lines.push("```");
      lines.push(``);
    }
  }

  // ── Phase ε prework G: Pareto pivot by (task, provider, model) ──
  if (report.paretoByTaskModel && report.paretoByTaskModel.length > 0) {
    lines.push(`## Pareto: cost vs fidelity by (task, provider, model) (Phase ε prework G)`);
    lines.push(``);
    lines.push(`| Task | Provider | Model | n | Honesty (struct) | Mean cost/node | In tok | Out tok | Pareto |`);
    lines.push(`|---|---|---|---:|---:|---:|---:|---:|:---:|`);
    for (const a of report.paretoByTaskModel) {
      const honestyStr =
        a.meanHonestyStructural === null
          ? "—"
          : `${a.meanHonestyStructural.toFixed(3)} (n=${a.honestyN})`;
      const costStr =
        a.meanUsdPerNode > 0 ? `$${a.meanUsdPerNode.toFixed(4)}` : "$0";
      const inTok = Math.round(a.meanInputTokensPerNode);
      const outTok = Math.round(a.meanOutputTokensPerNode);
      const flag = a.paretoFrontier ? "★" : "";
      lines.push(
        `| ${a.task} | ${a.provider} | \`${a.model}\` | ${a.n} | ${honestyStr} | ${costStr} | ${inTok} | ${outTok} | ${flag} |`,
      );
    }
    lines.push(``);
    lines.push(
      "*★ marks an entry on the cost-vs-fidelity Pareto frontier within its task. An entry is dominated when another (task, provider, model) bucket has strictly higher mean honesty at lower-or-equal cost (or strictly lower cost at greater-or-equal honesty). Entries with null honesty cannot be on the frontier — `SELF_INGEST_HYPOTHESIS_<date>.md` §7 calls cost-changes-recommendation a discovery outcome; this is where it surfaces.*",
    );
    lines.push(``);
  }

  // ── Phase ε prework C: frontier coverage section ──
  if (report.matrix && report.matrix.length > 0) {
    const tagCounts = new Map<string, number>();
    for (const m of report.matrix) {
      for (const t of m.frontier) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }
    if (tagCounts.size > 0) {
      lines.push(`## Frontier coverage`);
      lines.push(``);
      lines.push(`| Tag | Count |`);
      lines.push(`|---|---:|`);
      const sorted = Array.from(tagCounts.entries()).sort(
        (a, b) => b[1] - a[1],
      );
      for (const [tag, n] of sorted) {
        lines.push(`| \`${tag}\` | ${n} |`);
      }
      lines.push(``);

      // Bar chart of frontier-tag coverage (Phase ε prework H). Bars
      // scale to the most-frequent tag (within-series scale) so the
      // shape of the distribution is visible even when total nodes is
      // small.
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
  }

  // ── Phase ε prework D: required intersections section ──
  if (report.byIntersection) {
    lines.push(`## Frontier intersections (hypothesis §6 required + discovered)`);
    lines.push(``);
    lines.push(`| Intersection | Count |`);
    lines.push(`|---|---:|`);
    const requiredNames = new Set(REQUIRED_INTERSECTIONS.map((s) => s.name));
    // Required first, in their canonical order.
    for (const spec of REQUIRED_INTERSECTIONS) {
      const n = report.byIntersection[spec.name] ?? 0;
      lines.push(`| ${spec.name} | ${n} |`);
    }
    // Then any additional intersections discovered during the run.
    for (const [name, n] of Object.entries(report.byIntersection)) {
      if (!requiredNames.has(name)) {
        lines.push(`| ${name} *(discovered)* | ${n} |`);
      }
    }
    lines.push(``);
  }

  lines.push(`## Per-node`);
  lines.push(``);
  // Honesty column is the structural honesty score in [0, 1]. The
  // other axes are uniformly null today (no contract / behavior /
  // intent checker in the pilot), so we only surface the per-node
  // structural score; the full per-axis split is in the "Honesty by
  // axis" section above.
  lines.push(
    `| Node | Source | Verdict | LoC dist | Jaccard | Honesty | Tokens | Cost |`,
  );
  lines.push(`|---|---|---|---:|---:|---:|---:|---:|`);
  // Lookup table from nodeId to its matrix entry so we can read the
  // honesty score without recomputing it. Built only when --matrix
  // produced a matrix; otherwise honesty is "—" everywhere.
  const matrixById = new Map<string, PerNodeMatrix>();
  if (report.matrix) {
    for (const m of report.matrix) matrixById.set(m.nodeId, m);
  }
  for (const r of report.results) {
    const src = r.sourceFile.split("/").slice(-2).join("/");
    const verdict = r.verdict;
    const loc = r.metrics?.locDistance;
    const jac = r.metrics?.structuralJaccard;
    const tokens = r.usage?.totalTokens ?? r.usage?.completionTokens;
    const cost = r.usage?.costUSD;
    const cacheTag = r.usage?.cached ? " (cached)" : "";
    const locStr = typeof loc === "number" ? loc.toFixed(3) : "—";
    const jacStr = typeof jac === "number" ? jac.toFixed(3) : "—";
    const honestyVal = matrixById.get(r.nodeId)?.honesty.structural;
    const honestyStr =
      typeof honestyVal === "number" ? honestyVal.toFixed(3) : "—";
    const tokStr = tokens !== undefined ? `${tokens}${cacheTag}` : "—";
    const costStr = cost !== undefined ? `$${cost.toFixed(4)}` : "—";
    lines.push(
      `| \`${r.nodeId}\` | ${src} | ${verdict} | ${locStr} | ${jacStr} | ${honestyStr} | ${tokStr} | ${costStr} |`,
    );
    if (!r.ok && r.failure) {
      lines.push(`| | ↳ failure | ${truncate(r.failure, 80)} | | | | | |`);
    }
  }
  lines.push(``);

  lines.push(`## Methodology`);
  lines.push(``);
  lines.push(`Each node's compile-back artifact is diffed against its source on disk using two distances: \`locDistance\` (line-count delta normalized into [0,1]) and \`structuralJaccard\` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See \`docs/PROJECT_LEGEND.md\` §6 Layer 6 for the formal model.`);
  if (report.matrix) {
    lines.push(``);
    lines.push(
      `When \`--matrix\` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in \`docs/POSITIONING.md\` §2. The verdict above maps onto the \`structural\` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see \`docs/legend/PREWORK_2026-05-13.md\` §C for the mapping table.`,
    );
    lines.push(``);
    lines.push(
      `Frontier tags come from the path/content tagger (\`src/runtime/legend/frontier-tagger.ts\`) unioned with verdict-derived tags. Required intersections are pre-registered in \`SELF_INGEST_HYPOTHESIS_<date>.md\` §6.`,
    );
  }
  lines.push(``);

  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// Re-export the pure-comparison surface so test files and downstream
// callers can import either the library or the command without
// crossing module boundaries unnecessarily.
export {
  computeDistanceMetrics,
  classifyVerdict,
  inferLanguageHint,
  DEFAULT_THRESHOLDS,
};
