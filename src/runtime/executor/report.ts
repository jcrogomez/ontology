// Per-run report. The summary counts are keyed by Terminal — the same enum the
// policy decides over — so "what closed / what's a G-gap / what's a capacity
// ceiling" is read directly off the records with no remapping.

import type { NodeRecord, Terminal } from "./types.js";
import { kappaDistribution, type KappaDistribution } from "./kappa-star.js";

/** Ladder economics — the run's oracle-routing measurement (measured facts
 *  only: wall-clock + rung locality; no fabricated dollars/watts). The
 *  interpretation frame is docs/design/proposals/LADDER_ECONOMICS.md: the
 *  share of nodes the local rungs close IS the project's analogue of the
 *  Stanford intelligence-per-watt "local coverage" number — with deterministic
 *  gates instead of a probabilistic router. */
export interface ExecEconomics {
  /** Sum of every attempt's wall-clock across the run. */
  totalDurationMs: number;
  attemptsLocal: number;
  attemptsCloud: number;
  /** Closed nodes whose κ* rung was local / cloud. */
  closedLocal: number;
  closedCloud: number;
  /** closedLocal / closed — the local-coverage share. null when nothing closed. */
  localCloseShare: number | null;
}

export interface ExecReport {
  total: number;
  closed: number;
  extractionGap: number;
  capacityCeiling: number;
  blockedUpstream: number;
  unverified: number;
  infraError: number;
  /** κ* distribution over the run — how much ladder capacity the closed nodes
   *  needed (rung → count) + how many never closed. The capability barometer. */
  kappa: KappaDistribution;
  /** Wall-clock + locality accounting — the ladder-economics barometer. */
  economics: ExecEconomics;
  nodes: NodeRecord[];
}

function buildEconomics(nodes: NodeRecord[]): ExecEconomics {
  const closedLocal = nodes.filter((n) => n.terminal === "closed" && n.closedLocality === "local").length;
  const closedCloud = nodes.filter((n) => n.terminal === "closed" && n.closedLocality === "cloud").length;
  const closed = nodes.filter((n) => n.terminal === "closed").length;
  return {
    totalDurationMs: nodes.reduce((s, n) => s + n.totalDurationMs, 0),
    attemptsLocal: nodes.reduce((s, n) => s + n.attemptsLocal, 0),
    attemptsCloud: nodes.reduce((s, n) => s + n.attemptsCloud, 0),
    closedLocal,
    closedCloud,
    localCloseShare: closed > 0 ? closedLocal / closed : null,
  };
}

export function buildReport(nodes: NodeRecord[]): ExecReport {
  const count = (t: Terminal): number => nodes.filter((n) => n.terminal === t).length;
  return {
    total: nodes.length,
    closed: count("closed"),
    extractionGap: count("extraction-gap"),
    capacityCeiling: count("capacity-ceiling"),
    blockedUpstream: count("blocked-upstream"),
    unverified: count("unverified-no-fixture"),
    infraError: count("infra-error"),
    kappa: kappaDistribution(nodes.map((n) => n.kappa)),
    economics: buildEconomics(nodes),
    nodes,
  };
}

// One-line-per-node human summary for the CLI / Walker.
export function formatReport(report: ExecReport): string {
  const head =
    `executor: ${report.closed}/${report.total} closed` +
    ` · ${report.extractionGap} G-gap` +
    ` · ${report.capacityCeiling} capacity-ceiling` +
    (report.blockedUpstream ? ` · ${report.blockedUpstream} blocked` : "") +
    (report.unverified ? ` · ${report.unverified} unverified` : "") +
    (report.infraError ? ` · ${report.infraError} infra-error` : "");
  const lines = report.nodes.map((n) => {
    const mark =
      n.terminal === "closed" ? (n.written ? "✓ closed" : "✓ closed (not written)") : `· ${n.terminal}`;
    const k = n.kappa === null ? "" : `, κ*=${n.kappa}`;
    return `  ${n.nodeId}  ${mark}  [rung ${n.finalRung}, ${n.attempts} attempt(s)${k}]` +
      (n.lastDetail ? `  — ${n.lastDetail}` : "");
  });
  // κ* barometer: how much capability the closed nodes needed.
  const kd = report.kappa;
  const hist = Object.keys(kd.byRung)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => `rung ${r}: ${kd.byRung[r]}`)
    .join(" · ");
  const kappaLine =
    kd.closed > 0
      ? `κ* barometer: ${hist}${kd.neverClosed ? ` · never-closed: ${kd.neverClosed}` : ""}`
      : "";
  // Ladder economics: local-coverage share + attempt split + wall-clock.
  const eco = report.economics;
  const secs = (eco.totalDurationMs / 1000).toFixed(1);
  const share =
    eco.localCloseShare === null ? "" : ` (${Math.round(eco.localCloseShare * 100)}% local)`;
  const ecoLine =
    report.total > 0
      ? `economics: closed local ${eco.closedLocal} / cloud ${eco.closedCloud}${share}` +
        ` · attempts local ${eco.attemptsLocal} / cloud ${eco.attemptsCloud}` +
        ` · ${secs}s wall-clock`
      : "";
  return [head, ...lines, ...(kappaLine ? ["", kappaLine] : []), ...(ecoLine ? [ecoLine] : [])].join("\n");
}
