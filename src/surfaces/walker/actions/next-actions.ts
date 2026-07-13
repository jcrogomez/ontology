import { buildStatusReport, type StatusReport } from "../../commands/status.js";

// "Next safe action" — the human triage the Walker's cockpit is for. It reuses
// the SAME data `onto status` and `onto dod` already compute (no new analysis):
//   - the syncable IDEAL: nodes whose whole dependency closure is core, safe to
//     `onto sync` right now;
//   - the fix-first FRONTIER: the minimal blockers, ranked by how many nodes
//     each unblocks (blast radius), each carrying WHY it is not ready (the tier)
//     and the concrete command that closes it.
// Pure and deterministic; the panel just renders it.

export interface NextAction {
  nodeId: string;
  /** Why the node is not ready. Frontier blockers are shadowed-but-not-core, so
   *  this is "lower" (no behaviour fixture) or "blocked" (a rule violation). */
  tier: "lower" | "blocked";
  /** One-word reason, e.g. "no fixture" or "1 rule-viol". */
  reason: string;
  /** Downstream shadowed nodes this one blocks (the leverage of fixing it). */
  unblocks: number;
  /** The concrete command that closes this action. */
  suggestion: string;
}

export interface NextActionsResult {
  ok: boolean;
  message?: string;
  /** Nodes batch-syncable right now (the down-closed ideal). */
  syncableNow: number;
  /** The prioritised fix-first list, highest leverage first. */
  actions: NextAction[];
  /** Total shadowed-but-not-ready nodes (frontier is the minimal subset). */
  blockedTotal: number;
}

function actionFor(
  nodeId: string,
  report: StatusReport,
  blastById: Map<string, number>,
): NextAction {
  const node = report.nodes.find((n) => n.nodeId === nodeId);
  const tier = node?.tier === "blocked" ? "blocked" : "lower";
  const unblocks = blastById.get(nodeId) ?? 0;
  if (tier === "blocked") {
    const v = node?.ruleViolations ?? 1;
    return {
      nodeId,
      tier,
      reason: `${v} rule-viol`,
      unblocks,
      suggestion: `onto rules check ${nodeId}`,
    };
  }
  return {
    nodeId,
    tier,
    reason: "no fixture",
    unblocks,
    suggestion: `onto probe ${nodeId}`,
  };
}

export function nextActions(cwd: string): NextActionsResult {
  let report: StatusReport;
  try {
    report = buildStatusReport(cwd);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      syncableNow: 0,
      actions: [],
      blockedTotal: 0,
    };
  }

  const rd = report.readiness;
  const blastById = new Map(rd.blockers.map((b) => [b.nodeId, b.blockedDescendants]));

  // Frontier is already the fix-first antichain; rank it by leverage so the
  // top row is the single highest-impact thing to do next.
  const actions = rd.frontier
    .map((id) => actionFor(id, report, blastById))
    .sort((a, b) => b.unblocks - a.unblocks || a.nodeId.localeCompare(b.nodeId));

  return {
    ok: true,
    syncableNow: rd.ideal.length,
    actions,
    blockedTotal: rd.blockers.length,
  };
}
