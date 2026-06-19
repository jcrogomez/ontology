// Per-run report. The summary counts are keyed by Terminal — the same enum the
// policy decides over — so "what closed / what's a G-gap / what's a capacity
// ceiling" is read directly off the records with no remapping.

import type { NodeRecord, Terminal } from "./types.js";
import { kappaDistribution, type KappaDistribution } from "./kappa-star.js";

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
  nodes: NodeRecord[];
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
  return [head, ...lines, ...(kappaLine ? ["", kappaLine] : [])].join("\n");
}
