// Per-run report. The summary counts are keyed by Terminal — the same enum the
// policy decides over — so "what closed / what's a G-gap / what's a capacity
// ceiling" is read directly off the records with no remapping.

import type { NodeRecord, Terminal } from "./types.js";

export interface ExecReport {
  total: number;
  closed: number;
  extractionGap: number;
  capacityCeiling: number;
  blockedUpstream: number;
  unverified: number;
  infraError: number;
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
    return `  ${n.nodeId}  ${mark}  [rung ${n.finalRung}, ${n.attempts} attempt(s)]` +
      (n.lastDetail ? `  — ${n.lastDetail}` : "");
  });
  return [head, ...lines].join("\n");
}
