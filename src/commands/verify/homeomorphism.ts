import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes, createHash } from "node:crypto";
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
  type ContractState,
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
import {
  aggregateVocabGaps,
  detectVocabGaps,
  hasVocabGap,
  type VocabGapAggregate,
  type VocabGapReport,
} from "../../runtime/legend/vocab-gap.js";
import {
  computeExportRecovery,
  aggregateExportRecovery,
  type CompileBackExportIntegration,
  type ExportRecoveryAggregate,
} from "../../runtime/legend/export-recovery.js";
import { scanFileSymbols } from "../../runtime/legend/ast-symbol-scanner.js";
import { inferManifestationFromSourcePath } from "../../runtime/compile/manifestation-mapper.js";
import {
  tagFailureModes,
  aggregateFailureModes,
  type FailureMode,
  type FailureModeAggregate,
} from "../../runtime/legend/failure-mode-tagger.js";
import { aggregateRepResults } from "../../runtime/legend/reps-aggregator.js";
import {
  behaviorVerdictToMatrixState,
  loadFixture,
  runBehaviorCheck,
  type BehaviorCheckResult,
} from "../../runtime/legend/behavior-checker.js";
import {
  checkContract,
  type ContractCheckResult,
} from "../../runtime/legend/contract-checker.js";

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
  // Phase ε Move 3α — AST grounding for code_sketch. When set, each
  // compile-back dispatch receives a deterministic MANDATORY EXPORTS
  // section (built from the source AST) appended to the system
  // prompt, and the run-cache contextHash folds in the grounding
  // identity so grounded and un-grounded runs cache distinctly. Off
  // by default; pre-3α runs and Sonnet ceiling probes can opt in or
  // out independently to isolate the AST-grounding contribution.
  astGrounding?: boolean;
  // Phase ε design §4.2 — per-node multi-rep aggregation. When > 1,
  // each candidate is verified N times (N fresh dispatches), the per-
  // rep metrics are folded under the chosen aggregator (median by
  // default), and the verdict is re-classified from the aggregated
  // metrics. Defangs single-draw Jaccard variance (γ observed
  // 1.0 → 0.0 on the same node across two draws) before the Opus 4.7
  // ceiling probe spends money on a non-robust signal. Spend scales
  // linearly with reps; cache hits across reps still count as reps
  // (each rep is a fresh dispatch attempt, not a fresh cache write).
  reps?: number;
  aggregator?: "median" | "mean";
  // Phase ε behaviour-axis checker (v0). When set, loads per-node
  // fixtures from `behaviorFixturesDir` (default `tests/behavior-
  // fixtures/`), runs each fixture's cases against the source artefact
  // and the regen, and overrides the matrix cell's `behavior` axis
  // with the measured pass/fail/untested state. Requires --matrix;
  // off by default. See docs/design/inverse/BEHAVIOUR_AXIS_CHECKER_SPEC.md.
  behaviorCheck?: boolean;
  // Override the fixtures directory. Path is relative to cwd or
  // absolute. Useful for tests that want to point at an ad-hoc fixture
  // set without touching the canonical tests/behavior-fixtures/ tree.
  behaviorFixturesDir?: string;
  // Per-case wall-clock cap for the behaviour checker. Clamped to
  // [100ms, 60s] inside the runner. Default 5s.
  behaviorTimeoutMs?: number;
  // Contract-axis checker (v0, 2026-06-09). When set, statically
  // compares each node's declared `context.provides` (keys + O1
  // signatures) against the regen artifact's extracted exports and
  // overrides the matrix cell's `contract` axis with the measured
  // pass/fail/unknown state. $0 — no LLM, no execution. Requires
  // --matrix. See docs/design/inverse/CONTRACT_AXIS_CHECKER_SPEC.md.
  contractCheck?: boolean;
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

  // Phase ε design §4.2: per-node multi-rep aggregation. Clamp reps
  // to ≥ 1 so a negative or NaN CLI value behaves like the single-rep
  // path. The aggregator only matters when reps > 1.
  const reps = Math.max(1, Number.isFinite(options.reps) ? Number(options.reps) : 1);
  // Validate the aggregator at the CLI boundary (design §4.1). A typo
  // like `--aggregator banana` used to fall silently through to mean;
  // now it fails fast so the user notices instead of getting a
  // surprising aggregate.
  if (options.aggregator !== undefined &&
      options.aggregator !== "median" &&
      options.aggregator !== "mean") {
    fail(
      `--aggregator must be 'median' or 'mean', got '${String(options.aggregator)}'.`,
      options.json,
    );
    return;
  }
  const aggregator = options.aggregator ?? "median";
  // Even-N median warning (design §4.2): median over an even rep count
  // synthesises a midpoint that no real draw produced — e.g. for the γ
  // case median([0.0, 1.0]) = 0.5, which is the same as the mean and
  // doesn't reflect any actual measurement. Odd N ≥ 3 is the intended
  // use. Surface a single warning so the user can choose to bump reps
  // by 1 (cheap) instead of getting a misleading verdict.
  if (reps > 1 && reps % 2 === 0 && aggregator === "median" && !options.json) {
    console.warn(
      `⚠ --reps ${reps} with --aggregator median synthesises a midpoint ` +
        `that no draw produced; the median equals the mean. Use an odd ` +
        `rep count (e.g. --reps ${reps + 1}) for a real-draw aggregate.`,
    );
  }

  const results: VerificationResult[] = [];
  try {
    await withLock(
      cwd,
      async () => {
        for (const c of candidates) {
          if (reps === 1) {
            // Single-draw path — unchanged, no telemetry overhead.
            const r = await verifyOne(c, {
              stagingDir,
              provider,
              model: options.model,
              ollamaHost: options.ollamaHost,
              maxTokens: options.maxTokens,
              thinking: options.thinking,
              openWorld: options.openWorld ?? true,
              thresholds,
              dryRun: !!options.dryRun,
              cwd,
              astGrounding: options.astGrounding,
            });
            results.push(r);
          } else {
            // Multi-rep path: run verifyOne N times for this candidate.
            // Each rep passes a distinct `repCacheBypassToken` so the
            // deterministic run-cache (computeRunId hashes input+model)
            // produces a distinct runId per rep — without this token,
            // checkCacheE would return rep 1's persisted text for reps
            // 2..N and the aggregator would fold N identical values,
            // defeating the variance-defang purpose of --reps. The
            // staging file is overwritten between reps; per-rep metrics
            // are captured before the next rep runs.
            const perRep: VerificationResult[] = [];
            for (let i = 0; i < reps; i++) {
              const r = await verifyOne(c, {
                stagingDir,
                provider,
                model: options.model,
                ollamaHost: options.ollamaHost,
                maxTokens: options.maxTokens,
                thinking: options.thinking,
                openWorld: options.openWorld ?? true,
                thresholds,
                dryRun: !!options.dryRun,
                cwd,
                astGrounding: options.astGrounding,
                // Stable per-rep token (the index suffices — the focal
                // node id is already part of contextHash via the prompt
                // upstream chain, so the same index across nodes still
                // produces per-node-distinct runIds).
                repCacheBypassToken: `rep_${i}_of_${reps}`,
              });
              perRep.push(r);
            }
            results.push(
              aggregateRepResults(perRep, { aggregator, thresholds }),
            );
          }
        }
      },
      {
        skipLock: options.noLock,
        command: `verify-homeomorphism (${candidates.length} candidates${reps > 1 ? `, ${reps} reps each` : ""})`,
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
  let vocabGaps: VocabGapAggregate | undefined;
  let exportRecovery: ExportRecoveryAggregate | undefined;
  let failureModes: FailureModeAggregate | undefined;
  // Per-node gap reports — kept around for the aggregate roll-up
  // below the matrix-building loop.
  const perNodeGapReports: Array<{ nodeId: string; gap: VocabGapReport }> = [];
  // Per-node export-recovery reports — same pattern as gaps. Source
  // AST is scanned per node so the metric measures the OUTPUT (regen)
  // against the deterministic source ground truth, not the LLM-
  // extracted contract (Move 3α candado #2).
  const perNodeRecoveryReports: Array<{
    nodeId: string;
    recovery: CompileBackExportIntegration;
  }> = [];
  // Per-node failure-mode tags — populated from verdict + failure
  // message + recovery; aggregated for the structured table that 3γ
  // will mine (model × file_kind × failure_mode).
  const perNodeFailureModeReports: Array<{
    nodeId: string;
    modes: FailureMode[];
  }> = [];
  // Phase ε behaviour-axis checker (v0): when --behavior-check is set,
  // pre-run the per-node checker so the matrix-build loop below has
  // measured states ready to inject. Behaviour-check requires --matrix:
  // without it the override has nowhere to land. Tracked separately
  // so the per-node result can be surfaced in the JSON report.
  const behaviorResults: Map<string, BehaviorCheckResult> = new Map();
  // Contract-axis checker (CONTRACT_AXIS_CHECKER_SPEC.md): pure and
  // synchronous, so it runs inline in the matrix loop below; this map
  // only collects the per-node results for the JSON report.
  const contractResults: Map<string, ContractCheckResult> = new Map();
  if (options.contractCheck && !options.matrix) {
    fail(
      "--contract-check requires --matrix (the contract axis lives on the matrix cell).",
      options.json,
    );
    return;
  }
  if (options.behaviorCheck) {
    if (!options.matrix) {
      fail(
        "--behavior-check requires --matrix (the behaviour axis lives on the matrix cell).",
        options.json,
      );
      return;
    }
    const fixturesDir = path.resolve(
      cwd,
      options.behaviorFixturesDir ?? "tests/behavior-fixtures",
    );
    if (!fs.existsSync(fixturesDir)) {
      // Empty directory → every node will resolve to fixture-missing
      // → `untested`. That is a valid signal (the checker is wired but
      // nothing was registered yet) but a non-existent directory is
      // more likely a typo, so we surface it explicitly.
      fail(
        `--behavior-check: fixtures directory not found: ${fixturesDir}`,
        options.json,
      );
      return;
    }
    for (const r of results) {
      // Unrecoverable verdicts never get a regen artefact on disk, so
      // the checker has nothing to import. Skip — the cell builder
      // will keep the `not-applicable` state for these nodes.
      if (r.verdict === "unrecoverable" || !r.regenPath) continue;
      let fixtureLoad: Awaited<ReturnType<typeof loadFixture>>;
      try {
        fixtureLoad = await loadFixture(fixturesDir, r.nodeId);
      } catch (err) {
        behaviorResults.set(r.nodeId, {
          nodeId: r.nodeId,
          verdict: "untested",
          reason: `fixture_load_failed: ${errorMessage(err)}`,
          durationMs: 0,
        });
        continue;
      }
      if (!fixtureLoad) {
        behaviorResults.set(r.nodeId, {
          nodeId: r.nodeId,
          verdict: "untested",
          reason: "no_fixture",
          durationMs: 0,
        });
        continue;
      }
      const checkResult = await runBehaviorCheck({
        nodeId: r.nodeId,
        sourcePath: r.sourceFile,
        regenPath: r.regenPath,
        fixture: fixtureLoad.fixture,
        ...(options.behaviorTimeoutMs !== undefined
          ? { perCaseTimeoutMs: options.behaviorTimeoutMs }
          : {}),
      });
      behaviorResults.set(r.nodeId, checkResult);
    }
  }

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
      // The cost record's provider/model come from the persisted run
      // record when available (r.dispatchModel — the actually-resolved
      // identity, fix for milestone review 2026-05-19 §3.1) and fall
      // back through the caller's overrides only if no run was
      // persisted (cache hits, mock dispatches). Task is "code_sketch"
      // since this is the compile-back direction.
      const cost = buildMatrixCost({
        provider: r.dispatchModel?.provider ?? provider ?? "unknown",
        model:
          r.dispatchModel?.model ??
          options.model ??
          node?.model?.ref ??
          "unknown",
        task: "code_sketch",
        usage: r.usage,
      });
      // Phase ε prework J: vocab-gap detector. Compare what G said
      // the node provides against what F actually exported in the
      // regen. Heuristic v0 — see vocab-gap.ts. Only meaningful when
      // both sides have content; otherwise the gap is vacuously empty.
      const providedKeys = (node?.context.provides ?? []).map((p) => p.key);
      const regenExports = r.metrics?.regenDeclarations ?? [];
      const gap = detectVocabGaps(providedKeys, regenExports);
      perNodeGapReports.push({ nodeId: r.nodeId, gap });
      // Phase ε Move 3α: exact export-recovery against the source AST.
      // Complementary to vocab-gap (loose word-token overlap on
      // conceptual provides) — this measures whether the regen
      // preserved the source AST's actual identifier surface. Scans
      // the source file (already on disk per resolveCandidates).
      const astScan = scanFileSymbols(r.sourceFile);
      const recovery = computeExportRecovery(
        astScan.ok ? astScan.mandatoryExports : [],
        regenExports,
      );
      perNodeRecoveryReports.push({ nodeId: r.nodeId, recovery });
      // Phase ε Move 3α: failure-mode tagging. Pure labelling pass
      // over verdict + failure + recovery — no new measurement.
      const modes = tagFailureModes({
        ok: r.ok,
        failure: r.failure,
        recovery,
      });
      perNodeFailureModeReports.push({ nodeId: r.nodeId, modes });
      const extraDerivedTags = hasVocabGap(gap) ? (["vocab-gap"] as const) : [];
      // Phase ε behaviour-axis checker (v0): inject the measured state
      // when --behavior-check supplied one. Absent → the matrix
      // builder keeps the verdict-derived default (untested for
      // non-unrecoverable verdicts, not-applicable for unrecoverable).
      const behaviorResult = behaviorResults.get(r.nodeId);
      const behaviorOverride = behaviorResult
        ? behaviorVerdictToMatrixState(behaviorResult.verdict)
        : undefined;
      // Contract-axis checker: declared provides/signatures vs the
      // regen's extracted exports, static. Unrecoverable verdicts have
      // no regen artifact — the cell builder keeps `not-measured`.
      let contractOverride: ContractState | undefined;
      if (options.contractCheck && r.verdict !== "unrecoverable" && r.regenPath) {
        let regenText: string | undefined;
        try {
          regenText = fs.readFileSync(r.regenPath, "utf-8");
        } catch {
          regenText = undefined; // artifact vanished → not-measured
        }
        const declared = (node?.context.provides ?? []).map((p) => ({
          key: p.key,
          ...(p.signature !== undefined ? { signature: p.signature } : {}),
        }));
        const checkResult = checkContract({
          nodeId: r.nodeId,
          declared,
          regenText,
          regenFileName: r.regenPath,
        });
        contractResults.set(r.nodeId, checkResult);
        contractOverride = checkResult.state;
      }
      matrix.push(
        buildPerNodeMatrix({
          nodeId: r.nodeId,
          sourceFile: r.sourceFile,
          taggerTags: tagResult.attrs,
          verdict: r.verdict,
          literal,
          cost,
          metrics: r.metrics,
          extraDerivedTags,
          ...(behaviorOverride !== undefined ? { behaviorOverride } : {}),
          ...(contractOverride !== undefined ? { contractOverride } : {}),
        }),
      );
    }
    byAxis = aggregateByAxis(matrix.map((m) => m.cell));
    vocabGaps = aggregateVocabGaps(perNodeGapReports);
    exportRecovery = aggregateExportRecovery(perNodeRecoveryReports);
    failureModes = aggregateFailureModes(perNodeFailureModeReports);
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
    ...(vocabGaps ? { vocabGaps } : {}),
    ...(exportRecovery ? { exportRecovery } : {}),
    ...(failureModes ? { failureModes } : {}),
    ...(options.behaviorCheck
      ? { behaviorResults: Array.from(behaviorResults.values()) }
      : {}),
    ...(options.contractCheck
      ? { contractResults: Array.from(contractResults.values()) }
      : {}),
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
          // Milestone §3.2 + design §4.4: the actually-dispatched model
          // and a hash of the perimeter, so the audit chain is fully
          // replayable from events.jsonl alone.
          model: dominantDispatchModel(results, provider, options.model),
          perimeterHash: computePerimeterHash(results),
          // Design §4.2: reps + aggregator on the event so a replay
          // can tell whether the headline metrics are a single draw or
          // a folded N-draw aggregate. Omitted when reps=1 to keep the
          // single-draw event payload unchanged (audit-log diff
          // friendliness for legacy replay tooling).
          ...(reps > 1 ? { reps, aggregator } : {}),
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

/**
 * Resolve the dispatch identity to record on the `homeomorphism_verified`
 * event (milestone review §3.2 + design item §4.4). Reads the
 * actually-resolved provider/model from each persisted run record
 * (`r.dispatchModel`); when results disagree (a mixed-model run) the
 * most frequent identity wins. Falls back to the caller's overrides
 * when no run was persisted (cache hits, mock dispatches). The event
 * needs this so an audit-chain replay from `events.jsonl` alone can
 * name which model produced the results — previously the payload
 * carried only verdict counts and usage.
 */
export function dominantDispatchModel(
  results: VerificationResult[],
  fallbackProvider: string | undefined,
  fallbackModel: string | undefined,
): { provider: string; model: string } {
  const counts = new Map<string, { provider: string; model: string; n: number }>();
  for (const r of results) {
    if (!r.dispatchModel) continue;
    const key = `${r.dispatchModel.provider}|${r.dispatchModel.model}`;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { ...r.dispatchModel, n: 1 });
  }
  let dominant: { provider: string; model: string } | undefined;
  let best = 0;
  for (const c of counts.values()) {
    if (c.n > best) {
      best = c.n;
      dominant = { provider: c.provider, model: c.model };
    }
  }
  return (
    dominant ?? {
      provider: fallbackProvider ?? "unknown",
      model: fallbackModel ?? "unknown",
    }
  );
}

/**
 * Stable hash of the verify perimeter — sha256 over the sorted list of
 * source-file paths. Recorded on the `homeomorphism_verified` event
 * (design item §4.4) so a replay can confirm the exact perimeter the
 * run measured against, without reconstructing it from the node list.
 */
export function computePerimeterHash(results: VerificationResult[]): string {
  const perimeter = results
    .map((r) => r.sourceFile)
    .sort()
    .join("\n");
  return createHash("sha256").update(perimeter).digest("hex");
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
  /** Phase ε Move 3α — forward AST grounding flag to runCompilePlan. */
  astGrounding?: boolean;
  /**
   * Phase ε design §4.2 — per-rep cache-bypass token. Set by the
   * multi-rep loop so each rep gets a distinct deterministic runId
   * (and therefore a fresh dispatch + a separate persisted run record).
   * Undefined for the single-draw path so the legacy runId is
   * byte-identical. See compile-node.ts repCacheBypassToken.
   */
  repCacheBypassToken?: string;
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
  let dispatchModel: { provider: string; model: string } | undefined;
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
      astGrounding: ctx.astGrounding,
      repCacheBypassToken: ctx.repCacheBypassToken,
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
    // Read the actually-resolved provider+model from the persisted run
    // so the matrix Pareto pivot doesn't bucket every dispatch under
    // the node-level `mock_default` schema fallback. See VerificationResult.dispatchModel.
    const focalRun = focalStep?.runId
      ? loadPersistedRun(focalStep.runId, ctx.cwd)
      : null;
    if (focalRun) {
      dispatchModel = {
        provider: focalRun.model.provider,
        model: focalRun.model.model,
      };
    }
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
    ...(dispatchModel ? { dispatchModel } : {}),
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
  // Silent-exclusion guard: warn (don't reject) when a node carries
  // outputs.files pointing at a code-extension file but its
  // manifestation is something other than "code". Without this, the
  // verified perimeter shrinks invisibly — the node_0094 failure mode
  // caught post-Arm-A. We do not promote these into the candidate
  // list: an explicit manifestation override remains the source of
  // truth, and the operator decides how to fix.
  if (options.json !== true) {
    const excluded = nodes.filter(
      (n) =>
        n.coordinates.manifestation !== "code" &&
        (n.outputs?.files ?? []).some(
          (f) => inferManifestationFromSourcePath(f) === "code",
        ),
    );
    if (excluded.length > 0) {
      const sample = excluded
        .slice(0, 5)
        .map((n) => `${n.id} (${n.coordinates.manifestation} → ${n.outputs?.files?.[0] ?? "?"})`)
        .join(", ");
      const more = excluded.length > 5 ? `, +${excluded.length - 5} more` : "";
      console.warn(
        `[verify] warning: ${excluded.length} node(s) have outputs.files pointing at code-extension files but manifestation !== "code" — excluded from --all-artifacts. Sample: ${sample}${more}`,
      );
    }
  }
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

  // ── Phase ε prework J: vocab-gap aggregate ──
  if (report.vocabGaps && report.vocabGaps.nodesInspected > 0) {
    const v = report.vocabGaps;
    lines.push(`## Vocab gaps — provides ⊖ exports (Phase ε prework J)`);
    lines.push(``);
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---:|`);
    lines.push(`| Nodes inspected | ${v.nodesInspected} |`);
    lines.push(`| Nodes with any gap | ${v.nodesWithAnyGap} |`);
    lines.push(`| Missing exports (G said, F skipped) | ${v.totalMissingExports} |`);
    lines.push(`| Unexpected exports (F invented, G silent) | ${v.totalUnexpectedExports} |`);
    lines.push(``);
    if (v.topMissingKeys.length > 0) {
      lines.push(`**Top missing-export keys (declared in provides, no matching export):**`);
      lines.push(``);
      lines.push(`| Key | Nodes |`);
      lines.push(`|---|---:|`);
      for (const k of v.topMissingKeys.slice(0, 20)) {
        lines.push(`| \`${k.key}\` | ${k.nodes} |`);
      }
      lines.push(``);
    }
    if (v.topUnexpectedExports.length > 0) {
      lines.push(`**Top unexpected exports (regen surfaced, no matching provides key):**`);
      lines.push(``);
      lines.push(`| Export | Nodes |`);
      lines.push(`|---|---:|`);
      for (const e of v.topUnexpectedExports.slice(0, 20)) {
        lines.push(`| \`${e.name}\` | ${e.nodes} |`);
      }
      lines.push(``);
    }
    lines.push(
      "*Heuristic v0: loose word-token overlap after camelCase + non-alphanumeric splitting. A pair matches if their token sets share at least one element. False positives (unrelated overlap on a common word) and false negatives (semantically equivalent pairs with no surface overlap) are expected — read with the same skepticism as the per-axis means. This signal is the operational form of the G∘F asymmetry: a missing-export gap suggests the regen prompt could not surface a declared concept; an unexpected-export gap suggests F invented surface G did not ask for.*",
    );
    lines.push(``);
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
  lines.push(`Each node's compile-back artifact is diffed against its source on disk using two distances: \`locDistance\` (line-count delta normalized into [0,1]) and \`structuralJaccard\` over top-level declaration names. The (LoC, Jaccard) pair folds into a five-label verdict per the thresholds above. See \`docs/design/inverse/PROJECT_LEGEND.md\` §6 Layer 6 for the formal model.`);
  if (report.matrix) {
    lines.push(``);
    lines.push(
      `When \`--matrix\` is set, each node also carries the six-axis Phase ε matrix (contract / structural / behavior / intent / literalRequired / cost) defined in \`docs/meta/POSITIONING.md\` §2. The verdict above maps onto the \`structural\` axis; the other axes are explicit not-measured / untested / not-reviewed in the pilot — see \`docs/legend/PREWORK_2026-05-13.md\` §C for the mapping table.`,
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
