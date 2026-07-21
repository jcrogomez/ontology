import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodes, loadEdges } from "../../kernel/core/project/load.js";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { auditFichas } from "../../inverse/ficha-quality.js";
import { checkRules } from "../../inverse/rule-checker.js";
import { computeSyncReadiness, type SyncReadiness } from "../../kernel/graph/sync-readiness.js";
import { readGrayZoneRecords, compareGrayZoneRepairPriority, type GrayZoneRecord } from "../../laws/gray-zone.js";
import { readDriftState } from "./drift.js";
import { errorMessage } from "../../kernel/core/errors.js";

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
// docs/design/runtime/SYNC_LOOP_SPEC.md §4.

export interface StatusCommandOptions {
  json?: boolean;
  /** List the node ids in each tier (human output only). */
  list?: boolean;
  /** Show the dependency-order readiness view: the syncable ideal + the
   *  fix-first blocker antichain (human output only; always in JSON). */
  blockers?: boolean;
  /** Show the gray-zone ranking: nodes whose multi-draw regenerations
   *  disagree with each other — repair-the-ficha-first candidates (human
   *  output only; always in JSON). */
  grayZone?: boolean;
}

export type Tier = "core" | "lower" | "blocked" | "no-shadow";

export interface NodeStatus {
  nodeId: string;
  srcFile: string | null;
  hasShadow: boolean;
  hasFixture: boolean;
  ruleViolations: number;
  drifted: boolean;
  tier: Tier;
}

export interface StatusReport {
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
  /** Dependency-order readiness: the syncable ideal + the blocker antichain. */
  readiness: SyncReadiness;
  /** Gray-zone index: latest per-node draw-disagreement measurements (from
   *  multi-draw sync/regenerate runs), ranked most-ambiguous first. Empty
   *  until a multi-draw run has recorded — status never draws by itself. */
  grayZone: {
    measured: number;
    /** Nodes in the "gray" zone (no majority cluster OR a semantic split) — Gap-A suspects. */
    gray: number;
    /** Nodes where draws split pass/fail on the SAME fixture. */
    behaviorSplits: number;
    /** Nodes where draws all fail but on DIFFERENT cases (bespoke extraction-gap). */
    semanticSplits: number;
    ranking: GrayZoneRecord[];
  };
  nodes: NodeStatus[];
}

export function fixturePathFor(nodeId: string, cwd: string): string {
  return path.join(cwd, "tests/behavior-fixtures", `${nodeId}.fixture.ts`);
}

export function classify(hasShadow: boolean, hasFixture: boolean, ruleViolations: number): Tier {
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

  // Dependency-order readiness: the syncable ideal + blocker antichain. The
  // readiness predicate is the `core` tier (shadow + fixture + rules clean).
  const readiness = computeSyncReadiness({
    shadowed: new Set(trackable.map((n) => n.nodeId)),
    ready: new Set(nodeStatuses.filter((n) => n.tier === "core").map((n) => n.nodeId)),
    edges: loadEdges(cwd),
  });

  // Gray-zone ranking: latest disagreement record per LIVE node (records for
  // deleted nodes are ignored, not pruned — the next multi-draw run on a live
  // node upserts its own entry). Most-disagreeing first; entropy breaks ties.
  // Repair-first ordering (compareGrayZoneRepairPriority): Gap-A suspects first,
  // then intensity. Without it a semantic-split node ranks LAST (its structural
  // disagreementRate is 0), defeating the queue for the bespoke class. nodeId
  // breaks ties for stable output.
  const liveIds = new Set(nodes.map((n) => n.id));
  const grayRecords = Object.values(readGrayZoneRecords(cwd))
    .filter((rec) => liveIds.has(rec.nodeId))
    .sort(
      (a, b) =>
        compareGrayZoneRepairPriority(a, b) || a.nodeId.localeCompare(b.nodeId),
    );

  return {
    totalNodes: nodes.length,
    trackable: trackable.length,
    core: nodeStatuses.filter((n) => n.tier === "core").length,
    lowerConfidence: nodeStatuses.filter((n) => n.tier === "lower").length,
    blocked: nodeStatuses.filter((n) => n.tier === "blocked").length,
    withFixture: trackable.filter((n) => n.hasFixture).length,
    readiness,
    drift: {
      hasAnchor,
      drifted: trackable.filter((n) => n.drifted).length,
    },
    ficha: {
      underDeclared: audit.nodesWithMissingExports,
      missingExports: audit.totalMissingExports,
      proseRules: audit.totalProseRulesOnCodeNodes,
    },
    grayZone: {
      measured: grayRecords.length,
      gray: grayRecords.filter((rec) => rec.zone === "gray").length,
      behaviorSplits: grayRecords.filter((rec) => rec.behaviorSplit).length,
      semanticSplits: grayRecords.filter((rec) => rec.semanticSplit).length,
      ranking: grayRecords,
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

  if (options.blockers) {
    const rd = r.readiness;
    console.log("");
    console.log(`  ── dependency-order readiness ──`);
    console.log(`  syncable ideal:    ${rd.ideal.length}\tcore nodes whose whole dependency closure is also core (batch-syncable)`);
    console.log(`  blocked-from-below:${rd.blockedReady.length}\tcore nodes held back only by an unready dependency`);
    if (rd.frontier.length > 0) {
      console.log(`  fix-first (antichain of ${rd.frontier.length}): close these to unblock a down-set —`);
      // Show the frontier blockers with their leverage (blockedDescendants) AND
      // their trust-tier, so the triage answers both "how much does this block"
      // and "why is it not ready" (blocked = rule violation, lower = no fixture)
      // in one line instead of cross-referencing `--list`.
      const byId = new Map(rd.blockers.map((b) => [b.nodeId, b.blockedDescendants]));
      const tierById = new Map(r.nodes.map((n) => [n.nodeId, n.tier]));
      for (const id of rd.frontier.slice(0, 12)) {
        console.log(`    ${id}\t[${tierById.get(id) ?? "?"}]\tblocks ${byId.get(id) ?? 0} node(s)`);
      }
      if (rd.frontier.length > 12) console.log(`    ...and ${rd.frontier.length - 12} more`);
    } else {
      console.log(`  ✓ no blockers — every core node is batch-syncable`);
    }
  }

  if (options.grayZone) {
    const gz = r.grayZone;
    console.log("");
    console.log(`  ── gray-zone index (draw disagreement → repair-the-ficha-first) ──`);
    if (gz.measured === 0) {
      console.log(`  (no measurements yet — a multi-draw \`onto sync\`/\`onto regenerate --draws N\` records one per node)`);
    } else {
      console.log(`  measured: ${gz.measured} node(s)\tgray: ${gz.gray}\tsemantic splits: ${gz.semanticSplits}\tbehaviour splits: ${gz.behaviorSplits}`);
      for (const rec of gz.ranking.slice(0, 12)) {
        const flags =
          (rec.semanticSplit ? "  ⚠ semantic split (draws fail different cases)" : "") +
          (rec.behaviorSplit ? "  ⚠ behaviour split" : "");
        console.log(
          `    ${rec.nodeId}\t[${rec.zone}]\tdisagreement ${rec.disagreementRate.toFixed(2)} (${rec.clusterCount} cluster(s)/${rec.compiledDraws} draws)\t${rec.measuredAt.slice(0, 10)}${flags}`,
        );
      }
      if (gz.ranking.length > 12) console.log(`    ...and ${gz.ranking.length - 12} more`);
    }
  }

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
