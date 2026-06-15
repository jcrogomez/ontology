// Structural-readiness gate over the typed Ontology graph.
//
// Built so the project can no longer repeat the "127 nodes, 0 edges,
// we'll call it self-ingest complete" failure mode the 2026-05-22
// baseline surfaced. Three rules — each catches a distinct shape of
// broken-but-looks-fine that the metric report flagged:
//
//   1. nodes_without_edges          — a non-trivial node count and a
//                                      completely empty edge fabric.
//                                      Symptom of an ingest sweep that
//                                      stopped after `proposal apply`
//                                      without running `infer-edges
//                                      --create-proposals`.
//   2. global_satisfied_unreachable — every closed-world require has a
//                                      provider somewhere in the graph
//                                      (the extractor did its job) but
//                                      most of them cannot be reached
//                                      from the consumer by the
//                                      assembler's default walk. The
//                                      pure routing gap.
//   3. topologically_flat           — most non-root nodes hang directly
//                                      off the canon. Mirrors the
//                                      flatness verdict; the gate
//                                      surfaces it independently so the
//                                      operator sees the structural
//                                      problem even when other rules
//                                      stay quiet.
//
// The module is pure: it takes the same `{ nodes, edges }` data the
// metric module accepts and returns a deterministic report. No I/O, no
// LLM, no proposal writes. CLI consumers decide exit codes; this layer
// only labels findings.

import type {
  OntologyEdge,
  OntologyNode,
} from "../schemas/ontology.js";
import {
  computeHierarchyMetrics,
  type HierarchyMetrics,
} from "./hierarchy-metrics.js";

export const READINESS_REPORT_SCHEMA_VERSION = "1.0";

// Thresholds chosen to match the 2026-05-22 baseline's interpretation
// of "structurally ready". Exposed as constants so a future operator
// can tune without code surgery; the CLI does not currently surface
// flags to override them — once we have data from real runs that show
// they need adjustment, we'll add the flags.
export const READINESS_THRESHOLDS = Object.freeze({
  // Rule 1 — at what node count do we expect the graph to have started
  // forming an edge fabric? Below this we treat zero edges as benign.
  minNodesForEdgeFabric: 50,
  // Rule 2 — minimum acceptable closedWorldContextReachableSatisfaction.
  // The 2026-05-22 baseline established `> 0.7` as the working target
  // (gamma reached 0.519 baseline → 1.000 after edge materialization;
  // see §9 / §10 of HIERARCHY_BASELINE_2026-05-22.md).
  minClosedWorldReachableRatio: 0.7,
  // Rule 3 — minimum directChildrenOfRoot ratio at which the network
  // is "almost entirely flat". Same number the flatness verdict uses,
  // so the two signals agree.
  flatDirectRatio: 0.8,
  // Rule 3 — small graphs are not penalised. Mirrors the verdict's
  // `nodeCount > 5` guard.
  flatMinNodeCount: 5,
} as const);

export type ReadinessRuleId =
  | "nodes_without_edges"
  | "global_satisfied_unreachable"
  | "topologically_flat";

export interface ReadinessFinding {
  ruleId: ReadinessRuleId;
  // All three rules currently surface as `fail`. The severity field is
  // kept on the wire so a future warn-only mode (e.g. for
  // pre-production snapshots) can downgrade without changing the JSON
  // schema.
  severity: "fail";
  // One-sentence human-readable explanation. Stable across versions
  // for grep'ing in CI logs.
  message: string;
  // The metric values that fired the rule. Keys vary by rule; consumers
  // either render them generically or branch on `ruleId`.
  signals: Record<string, number>;
  // The concrete next step the operator should take. Phrased as an
  // imperative so CI annotations can show it verbatim.
  remedy: string;
}

export interface ReadinessSnapshot {
  nodeCount: number;
  edgeCount: number;
  closedWorldRequireCount: number;
  closedWorldGlobalSatisfactionRatio: number;
  closedWorldContextReachableSatisfactionRatio: number;
  nonRootDirectChildrenOfRootRatio: number;
  verdict: HierarchyMetrics["flatness"]["verdict"];
}

export interface ReadinessReport {
  schemaVersion: string;
  ok: boolean;
  findings: ReadinessFinding[];
  snapshot: ReadinessSnapshot;
}

export interface ReadinessInput {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  rootNodeId?: string | null;
  // Override the bundled thresholds. The CLI doesn't surface this yet;
  // tests use it to exercise threshold behaviour without coupling to
  // the production defaults.
  thresholds?: Partial<typeof READINESS_THRESHOLDS>;
}

// Main entry point. Computes metrics internally so the report stays a
// one-call surface; callers that already have metrics can use
// `evaluateReadinessFromMetrics` directly.
export function evaluateReadiness(input: ReadinessInput): ReadinessReport {
  const metrics = computeHierarchyMetrics({
    nodes: input.nodes,
    edges: input.edges,
    rootNodeId: input.rootNodeId,
  });
  return evaluateReadinessFromMetrics(metrics, input.thresholds);
}

export function evaluateReadinessFromMetrics(
  metrics: HierarchyMetrics,
  thresholds?: Partial<typeof READINESS_THRESHOLDS>,
): ReadinessReport {
  const t = { ...READINESS_THRESHOLDS, ...thresholds };
  const findings: ReadinessFinding[] = [];

  const nodeCount = metrics.topology.nodeCount;
  const edgeCount = metrics.topology.edgeCount;
  const closedReqCount = metrics.contracts.closedWorldRequireCount;
  const closedGlobalRatio =
    metrics.contracts.closedWorldGlobalSatisfaction.ratio;
  const closedReachRatio =
    metrics.contracts.closedWorldContextReachableSatisfaction.ratio;
  const directRatio = metrics.flatness.nonRootDirectChildrenOfRootRatio;

  // Rule 1 — non-trivial node count, zero edges. We bound on
  // `minNodesForEdgeFabric` so a fresh 6-node bootstrap network does
  // not fail readiness simply for not having gotten to edges yet.
  if (nodeCount > t.minNodesForEdgeFabric && edgeCount === 0) {
    findings.push({
      ruleId: "nodes_without_edges",
      severity: "fail",
      message: `Graph has ${nodeCount} nodes but zero edges. The ingest sweep ran but the static-import edge pass never landed.`,
      signals: { nodeCount, edgeCount },
      remedy: `Run \`onto graph infer-edges <src-dir> --create-proposals\` then apply the resulting edge_create proposals.`,
    });
  }

  // Rule 2 — global satisfied but not context-reachable. Guard on
  // `closedReqCount > 0` so an empty-contract graph does not trip the
  // rule on a 0/0 ratio.
  if (
    closedReqCount > 0 &&
    closedGlobalRatio >= 1.0 &&
    closedReachRatio < t.minClosedWorldReachableRatio
  ) {
    findings.push({
      ruleId: "global_satisfied_unreachable",
      severity: "fail",
      message: `${closedReqCount} closed-world requires have providers in the graph (global=${formatRatio(closedGlobalRatio)}) but only ${formatRatio(closedReachRatio)} are reachable by the assembler. The information is there; the routing is not.`,
      signals: {
        closedWorldRequireCount: closedReqCount,
        closedWorldGlobalSatisfactionRatio: closedGlobalRatio,
        closedWorldContextReachableSatisfactionRatio: closedReachRatio,
        target: t.minClosedWorldReachableRatio,
      },
      remedy: `Run \`onto graph infer-edges <src-dir> --metrics-preview --ontology-dir <this-dir>\` to confirm the inferred edges would close the gap, then \`--create-proposals\` to materialise them.`,
    });
  }

  // Rule 3 — topologically flat. Mirrors the flatness verdict's
  // condition exactly so the two surfaces never disagree.
  if (nodeCount > t.flatMinNodeCount && directRatio >= t.flatDirectRatio) {
    findings.push({
      ruleId: "topologically_flat",
      severity: "fail",
      message: `${formatRatio(directRatio)} of non-root nodes hang directly off the canon. The graph is structurally flat — there is no intermediate hierarchy for the walker or for layered intent.`,
      signals: {
        nodeCount,
        nonRootDirectChildrenOfRootRatio: directRatio,
        threshold: t.flatDirectRatio,
      },
      remedy: `Run \`onto graph hierarchize --ontology-dir <this-dir>\` to preview the directory-bucket hierarchy the file structure already implies. (Applying it currently requires a node_update_parent proposal kind — see HIERARCHY_BASELINE §10.)`,
    });
  }

  // Sort by ruleId so output is stable regardless of detection order.
  findings.sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  return {
    schemaVersion: READINESS_REPORT_SCHEMA_VERSION,
    ok: findings.length === 0,
    findings,
    snapshot: {
      nodeCount,
      edgeCount,
      closedWorldRequireCount: closedReqCount,
      closedWorldGlobalSatisfactionRatio: closedGlobalRatio,
      closedWorldContextReachableSatisfactionRatio: closedReachRatio,
      nonRootDirectChildrenOfRootRatio: directRatio,
      verdict: metrics.flatness.verdict,
    },
  };
}

function formatRatio(r: number): string {
  return r.toFixed(3);
}
