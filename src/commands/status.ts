import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodes } from "../core/project/load.js";
import { getOntologyPaths } from "../core/project/paths.js";
import { auditFichas } from "../runtime/legend/ficha-quality.js";
import { checkRules } from "../runtime/legend/rule-checker.js";
import { readDriftState } from "./drift.js";
import { errorMessage } from "../core/errors.js";

// `onto status` — graph health at a glance, read-only. The "can I sync, and
// what's in the way" view that the governed loop (`onto sync`) needs.
//
// It is a pure COMPOSITION of primitives that already exist: shadow presence
// (regenerate's precondition) + behaviour-fixture presence + static rule
// cleanliness (the rule gate) + drift vs the anchor (`onto drift`) + ficha
// quality (`onto ficha audit`). It writes nothing and runs no fixtures.
//
// "Core" here is a PRESENCE-based estimate of syncable-with-confidence: a node
// with a code shadow, a behaviour fixture, and no statically-decidable rule
// violation. The fixture's actual green-against-source is confirmed at sync
// time (the behaviour gate) — status does not execute fixture code, by design
// (a read-only health check must not run arbitrary source). See
// docs/SYNC_LOOP_SPEC.md §4.

export interface StatusCommandOptions {
  json?: boolean;
  /** List the node ids in each tier (human output only). */
  list?: boolean;
}

type Tier = "core" | "lower" | "blocked" | "no-shadow";

interface NodeStatus {
  nodeId: string;
  srcFile: string | null;
  hasShadow: boolean;
  hasFixture: boolean;
  ruleViolations: number;
  drifted: boolean;
  tier: Tier;
}

interface StatusReport {
  totalNodes: number;
  /** Nodes with a code shadow present on disk — the syncable universe. */
  trackable: number;
  core: number;
  lowerConfidence: number;
  blocked: number;
  withFixture: number;
  drift: {
    hasAnchor: boolean;
    /** Count of trackable shadows that drifted from the anchor. */
    drifted: number;
  };
  ficha: {
    underDeclared: number;
    missingExports: number;
    proseRules: number;
  };
  nodes: NodeStatus[];
}

function fixturePathFor(nodeId: string, cwd: string): string {
  return path.join(cwd, "tests/behavior-fixtures", `${nodeId}.fixture.ts`);
}

function classify(hasShadow: boolean, hasFixture: boolean, ruleViolations: number): Tier {
  if (!hasShadow) return "no-shadow";
  if (ruleViolations > 0) return "blocked";
  return hasFixture ? "core" : "lower";
}

export function buildStatusReport(cwd: string): StatusReport {
  const nodes = loadNodes(cwd);

  // Drift is best-effort: a missing/unreadable anchor must not sink status.
  let driftedIds = new Set<string>();
  let hasAnchor = false;
  try {
    const drift = readDriftState(cwd);
    hasAnchor = drift.snapshot !== null;
    driftedIds = new Set(drift.changedNodeIds);
  } catch {
    // leave hasAnchor=false, driftedIds empty
  }

  const audit = auditFichas(nodes, cwd);

  const nodeStatuses: NodeStatus[] = [];
  for (const node of nodes) {
    const srcRel = node.outputs?.files?.[0] ?? null;
    const srcAbs = srcRel
      ? (path.isAbsolute(srcRel) ? srcRel : path.join(cwd, srcRel))
      : null;
    const hasShadow = !!srcAbs && fs.existsSync(srcAbs);

    let ruleViolations = 0;
    let hasFixture = false;
    let drifted = false;
    if (hasShadow) {
      hasFixture = fs.existsSync(fixturePathFor(node.id, cwd));
      drifted = driftedIds.has(node.id);
      const rules = node.rules ?? [];
      if (rules.length > 0) {
        try {
          const artifactText = fs.readFileSync(srcAbs!, "utf-8");
          ruleViolations = checkRules({ nodeId: node.id, rules, artifactText }).violations;
        } catch {
          // unreadable source on a node that claimed a shadow — leave at 0;
          // hasShadow already gated on existsSync, so this is a rare race.
        }
      }
    }

    nodeStatuses.push({
      nodeId: node.id,
      srcFile: srcRel,
      hasShadow,
      hasFixture,
      ruleViolations,
      drifted,
      tier: classify(hasShadow, hasFixture, ruleViolations),
    });
  }

  const trackable = nodeStatuses.filter((n) => n.hasShadow);
  return {
    totalNodes: nodes.length,
    trackable: trackable.length,
    core: nodeStatuses.filter((n) => n.tier === "core").length,
    lowerConfidence: nodeStatuses.filter((n) => n.tier === "lower").length,
    blocked: nodeStatuses.filter((n) => n.tier === "blocked").length,
    withFixture: trackable.filter((n) => n.hasFixture).length,
    drift: {
      hasAnchor,
      drifted: trackable.filter((n) => n.drifted).length,
    },
    ficha: {
      underDeclared: audit.nodesWithMissingExports,
      missingExports: audit.totalMissingExports,
      proseRules: audit.totalProseRulesOnCodeNodes,
    },
    nodes: nodeStatuses,
  };
}

export async function statusCommand(options: StatusCommandOptions): Promise<void> {
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

  let report: StatusReport;
  try {
    report = buildStatusReport(cwd);
  } catch (err: unknown) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
    } else {
      console.error(`✖ status failed: ${errorMessage(err)}`);
    }
    process.exitCode = 1;
    return;
  }

  emit(report, options);
}

function emit(report: StatusReport, options: StatusCommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
    return;
  }

  const r = report;
  console.log(`◆ onto status — graph health (${r.totalNodes} nodes, ${r.trackable} with a code shadow)`);
  console.log("");
  console.log(`  syncable core:     ${r.core}\tshadow + behaviour fixture + rules clean`);
  console.log(`  syncable (lower):  ${r.lowerConfidence}\tno behaviour fixture — lower confidence`);
  console.log(`  blocked:           ${r.blocked}\tstatic rule violation to resolve first`);
  console.log("");
  console.log(`  fixtures:  ${r.withFixture}/${r.trackable} trackable shadows have a behaviour fixture`);
  if (r.drift.hasAnchor) {
    const d = r.drift.drifted;
    console.log(`  drift:     ${d === 0 ? "✓ none" : `✖ ${d} shadow(s) drifted from the anchor`}`);
  } else {
    console.log(`  drift:     (no baseline — run \`onto drift --update\` to anchor)`);
  }
  console.log(`  ficha:     ${r.ficha.underDeclared} node(s) under-declare exports (+${r.ficha.missingExports} total), ${r.ficha.proseRules} prose-rule(s) to prune`);

  if (options.list) {
    console.log("");
    printTier("core (sync with confidence)", r.nodes.filter((n) => n.tier === "core"));
    printTier("lower confidence (no fixture)", r.nodes.filter((n) => n.tier === "lower"));
    printTier("blocked (rule violation)", r.nodes.filter((n) => n.tier === "blocked"));
  }
}

function printTier(label: string, nodes: NodeStatus[]): void {
  if (nodes.length === 0) return;
  console.log(`  ── ${label} (${nodes.length}) ──`);
  for (const n of nodes) {
    const flags = [n.drifted ? "drifted" : "", n.ruleViolations > 0 ? `${n.ruleViolations} rule-viol` : ""].filter(Boolean).join(", ");
    console.log(`    ${n.nodeId}\t${n.srcFile ?? ""}${flags ? `  (${flags})` : ""}`);
  }
}
