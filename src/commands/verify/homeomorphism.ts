import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodes, loadNodeById } from "../../core/project/load.js";
import { runCompilePlan } from "../../runtime/compile/compile-plan-runner.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import { errorMessage } from "../../core/errors.js";
import type { OntologyNode } from "../../schemas/ontology.js";
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
  type VerdictThresholds,
} from "../../runtime/legend/verify-homeomorphism.js";
import {
  computeCostEstimate,
  formatCostEstimateHuman,
  readFileSizeInfos,
} from "../ingest/cost-estimate.js";

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
  for (const c of candidates) {
    const r = await verifyOne(c, {
      stagingDir,
      provider,
      model: options.model,
      ollamaHost: options.ollamaHost,
      maxTokens: options.maxTokens,
      openWorld: options.openWorld ?? true, // verify defaults to open-world
      thresholds,
      dryRun: !!options.dryRun,
    });
    results.push(r);
  }

  // 4. Aggregate + emit report.
  const counts = emptyVerdictCounts();
  for (const r of results) counts[r.verdict] += 1;
  const report: AggregateReport = {
    rootDir: cwd,
    thresholds,
    total: results.length,
    byVerdict: counts,
    results,
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
    return;
  }
  printReportHuman(report);
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
  openWorld: boolean;
  thresholds: VerdictThresholds;
  dryRun: boolean;
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

// Re-export the pure-comparison surface so test files and downstream
// callers can import either the library or the command without
// crossing module boundaries unnecessarily.
export {
  computeDistanceMetrics,
  classifyVerdict,
  inferLanguageHint,
  DEFAULT_THRESHOLDS,
};
