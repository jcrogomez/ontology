import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodeById, loadNodes, loadEdges } from "../../kernel/core/project/load.js";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { checkRules } from "../../inverse/rule-checker.js";
import {
  compareFiles,
  classifyVerdict,
  type HomeomorphismVerdict,
} from "../../laws/verify-homeomorphism.js";
import { runBehaviorCheckIsolated } from "../../laws/behavior-checker-isolated.js";
import { downstreamDependents } from "../../kernel/graph/sync-readiness.js";
import { readDriftState } from "./drift.js";
import { classify, fixturePathFor, type Tier } from "./status.js";
import { errorMessage } from "../../kernel/core/errors.js";

// `onto dod <nodeId>` — the per-node DEFINITION OF DONE report, read-only.
//
// It consolidates in ONE view what today is scattered across three commands
// (`onto verify-homeomorphism`, `onto probe`, `onto rules check`) plus the tier
// and blast-radius that live in `onto status`: is this node syncable-with-
// confidence, what blocks it, and how much sits downstream of it.
//
// Honesty is the whole point. The three gates are NOT equal in cost:
//   - RULES is pure/static — computed live against the current shadow ($0).
//   - STRUCTURAL and BEHAVIOUR measure F∘G≈id and so need a REGEN artifact to
//     compare against. When a prior regen is cached on disk
//     (`.ontology/verify/<id><ext>`, left by `onto sync`/`onto regenerate`) we
//     measure them purely against it (structural is a pure file compare;
//     behaviour re-runs the fixture in an isolated child) and label the result
//     with the artifact's age. With no cached regen we report `unmeasured` and
//     point at `onto sync` — never a fabricated green.
// This command writes nothing and dispatches no LLM.

// Structure-preserving verdicts — the same set `regenerate.ts` gates --write on
// (WRITE_SAFE_VERDICTS). A node whose regen is ε-equivalent or diverges only in
// LoC is structurally "done"; structural divergence is not.
const STRUCTURE_PRESERVING: ReadonlySet<HomeomorphismVerdict> = new Set([
  "epsilon_equivalent",
  "divergent_loc",
]);

export interface DodCommandOptions {
  json?: boolean;
  /** Skip the behaviour gate's fixture EXECUTION (the isolated child run).
   *  Structural stays — it is a pure file compare — but behaviour is reported
   *  as `unmeasured` even when a cached regen + fixture exist. For a strictly
   *  no-code-execution snapshot. */
  noRun?: boolean;
}

export type RulesGateState = "pass" | "fail" | "not-applicable";
export type StructuralGateState = "pass" | "fail" | "unmeasured";
export type BehaviourGateState = "pass" | "fail" | "unmeasured" | "no-fixture";

export interface RulesGate {
  state: RulesGateState;
  violations: number;
  /** Statically-decidable (FORBID/REQUIRE symbol) rules actually checked. */
  staticChecked: number;
}
export interface StructuralGate {
  state: StructuralGateState;
  verdict?: HomeomorphismVerdict;
  locDistance?: number;
  structuralJaccard?: number;
  /** Regen artifact the measurement came from, and its mtime (ISO). */
  measuredFrom?: string;
  measuredAt?: string;
}
export interface BehaviourGate {
  state: BehaviourGateState;
  verdict?: "pass" | "fail" | "untested";
  casesPassed?: number;
  casesTotal?: number;
  measuredFrom?: string;
  measuredAt?: string;
}

export interface DodReport {
  nodeId: string;
  srcFile: string | null;
  hasShadow: boolean;
  tier: Tier;
  /** Shadowed nodes transitively downstream of this one (blast radius). */
  blastRadius: number;
  drift: "clean" | "drifted" | "no-anchor";
  hasCachedRegen: boolean;
  gates: {
    rules: RulesGate;
    structural: StructuralGate;
    behaviour: BehaviourGate;
  };
}

/** The canonical single-draw regen artifact `onto sync`/`onto regenerate`
 *  leave at `.ontology/verify/<id><ext>` (ext from the shadow's extension). */
function cachedRegenPath(nodeId: string, srcRel: string, cwd: string): string {
  const ext = path.extname(srcRel) || ".txt";
  return path.join(cwd, ".ontology/verify", `${nodeId}${ext}`);
}

function mtimeIso(p: string): string | undefined {
  try {
    return fs.statSync(p).mtime.toISOString();
  } catch {
    return undefined;
  }
}

export function buildDodReport(
  nodeId: string,
  cwd: string,
  opts: { runBehaviour?: boolean } = {},
): DodReport | { error: string } {
  const runBehaviour = opts.runBehaviour ?? true;

  const node = loadNodeById(nodeId, cwd);
  if (!node) return { error: `node not found: ${nodeId}` };

  const srcRel = node.outputs?.files?.[0] ?? null;
  const srcAbs = srcRel
    ? path.isAbsolute(srcRel)
      ? srcRel
      : path.join(cwd, srcRel)
    : null;
  const hasShadow = !!srcAbs && fs.existsSync(srcAbs);
  const hasFixture = fs.existsSync(fixturePathFor(nodeId, cwd));

  // ── Rules gate (pure, live) ──────────────────────────────────────────────
  const rules = node.rules ?? [];
  let violations = 0;
  let staticChecked = 0;
  if (hasShadow && rules.length > 0) {
    try {
      const artifactText = fs.readFileSync(srcAbs!, "utf-8");
      const res = checkRules({ nodeId, rules, artifactText });
      violations = res.violations;
      staticChecked = res.staticChecked;
    } catch {
      // unreadable shadow on a node that claimed one — leave clean.
    }
  }
  const rulesGate: RulesGate = {
    state: staticChecked === 0 ? "not-applicable" : violations > 0 ? "fail" : "pass",
    violations,
    staticChecked,
  };

  const tier = classify(hasShadow, hasFixture, violations);

  // ── Blast radius (universal downstream dependents) ───────────────────────
  const allNodes = loadNodes(cwd);
  const shadowed = new Set(
    allNodes
      .filter((n) => {
        const rel = n.outputs?.files?.[0];
        if (!rel) return false;
        const abs = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
        return fs.existsSync(abs);
      })
      .map((n) => n.id),
  );
  const blastRadius = downstreamDependents(loadEdges(cwd), shadowed).get(nodeId) ?? 0;

  // ── Drift ────────────────────────────────────────────────────────────────
  let drift: DodReport["drift"] = "no-anchor";
  try {
    const d = readDriftState(cwd);
    if (d.snapshot !== null) {
      drift = new Set(d.changedNodeIds).has(nodeId) ? "drifted" : "clean";
    }
  } catch {
    // no anchor / unreadable — leave "no-anchor"
  }

  // ── Measured gates from a cached regen (no dispatch) ─────────────────────
  const regenPath = srcRel ? cachedRegenPath(nodeId, srcRel, cwd) : null;
  const hasCachedRegen = !!regenPath && fs.existsSync(regenPath);

  let structural: StructuralGate = { state: "unmeasured" };
  let behaviour: BehaviourGate = { state: hasFixture ? "unmeasured" : "no-fixture" };

  if (hasShadow && hasCachedRegen && regenPath) {
    const measuredAt = mtimeIso(regenPath);
    const metrics = compareFiles(srcAbs!, regenPath);
    if (metrics) {
      const verdict = classifyVerdict(metrics);
      structural = {
        state: STRUCTURE_PRESERVING.has(verdict) ? "pass" : "fail",
        verdict,
        locDistance: metrics.locDistance,
        structuralJaccard: metrics.structuralJaccard,
        measuredFrom: regenPath,
        measuredAt,
      };
    }

    if (hasFixture && runBehaviour) {
      const bc = runBehaviorCheckIsolated({
        nodeId,
        sourcePath: srcAbs!,
        regenPath,
        fixturePath: fixturePathFor(nodeId, cwd),
        cwd,
      });
      const cases = bc.cases ?? [];
      behaviour = {
        state:
          bc.verdict === "pass" ? "pass" : bc.verdict === "fail" ? "fail" : "unmeasured",
        verdict: bc.verdict,
        casesPassed: cases.filter((c) => c.outcome === "match").length,
        casesTotal: cases.length,
        measuredFrom: regenPath,
        measuredAt,
      };
    }
  }

  return {
    nodeId,
    srcFile: srcRel,
    hasShadow,
    tier,
    blastRadius,
    drift,
    hasCachedRegen,
    gates: { rules: rulesGate, structural, behaviour },
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

const TICK = "✓";
const CROSS = "✖";
const DASH = "—";
const WARN = "⚠";

function tierReason(r: DodReport): string {
  const shadow = r.hasShadow ? "shadow ✓" : "shadow ✗";
  const fixture = r.gates.behaviour.state === "no-fixture" ? "fixture ✗" : "fixture ✓";
  const rules =
    r.gates.rules.state === "fail"
      ? `${r.gates.rules.violations} rule-viol`
      : "rules clean";
  return `${shadow} · ${fixture} · ${rules}`;
}

function age(iso?: string): string {
  if (!iso) return "cached";
  return `cached ${iso.slice(5, 10)}`; // MM-DD
}

function renderStructural(g: StructuralGate): string {
  if (g.state === "unmeasured") return `${DASH} unmeasured`;
  const mark = g.state === "pass" ? TICK : CROSS;
  const detail =
    g.locDistance !== undefined && g.structuralJaccard !== undefined
      ? `loc ${g.locDistance.toFixed(2)} · jaccard ${g.structuralJaccard.toFixed(2)}`
      : "";
  return `${mark} ${g.verdict}   ${detail}   [${age(g.measuredAt)}]`;
}

function renderBehaviour(g: BehaviourGate): string {
  if (g.state === "no-fixture") return `${WARN} no fixture`;
  if (g.state === "unmeasured") return `${DASH} unmeasured`;
  const mark = g.state === "pass" ? TICK : CROSS;
  const cases =
    g.casesTotal !== undefined ? `${g.casesPassed}/${g.casesTotal} fixture cases` : "";
  return `${mark} ${g.verdict}   ${cases}   [${age(g.measuredAt)}]`;
}

function renderRules(g: RulesGate): string {
  if (g.state === "not-applicable") return `${DASH} no static rules`;
  const mark = g.state === "pass" ? TICK : CROSS;
  return `${mark} ${g.state}   ${g.violations} violation(s) · ${g.staticChecked} static rule(s)   [live]`;
}

function emit(report: DodReport, options: DodCommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
    return;
  }

  const r = report;
  console.log("");
  console.log(`◆ onto dod ${r.nodeId} — definition of done`);
  console.log(`  ${r.srcFile ?? "(no code shadow)"}`);
  console.log("");
  console.log(`  trust-tier    ${r.tier.padEnd(12)}${tierReason(r)}`);
  console.log(`  blast-radius  blocks ${r.blastRadius} downstream node(s)`);
  console.log(`  drift         ${r.drift}`);
  console.log("");
  console.log(`  gates`);
  console.log(`    rules       ${renderRules(r.gates.rules)}`);
  console.log(`    structural  ${renderStructural(r.gates.structural)}`);
  console.log(`    behaviour   ${renderBehaviour(r.gates.behaviour)}`);
  console.log("");
  if (r.hasCachedRegen) {
    console.log(`  → measured gates from a cached regen — run \`onto sync ${r.nodeId}\` to re-measure`);
  } else {
    console.log(`  → no cached regen on disk — run \`onto sync ${r.nodeId}\` to measure structural + behaviour`);
  }
}

export async function dodCommand(nodeId: string, options: DodCommandOptions): Promise<void> {
  const cwd = process.cwd();
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.ontologyDir)) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: "no .ontology/ found — run `onto init` first" }));
    } else {
      console.error("✖ no .ontology/ found — run `onto init` first");
    }
    process.exitCode = 1;
    return;
  }

  let result: DodReport | { error: string };
  try {
    result = buildDodReport(nodeId, cwd, { runBehaviour: !options.noRun });
  } catch (err: unknown) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
    } else {
      console.error(`✖ dod failed: ${errorMessage(err)}`);
    }
    process.exitCode = 1;
    return;
  }

  if ("error" in result) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: result.error }));
    } else {
      console.error(`✖ ${result.error}`);
    }
    process.exitCode = 1;
    return;
  }

  emit(result, options);
}
