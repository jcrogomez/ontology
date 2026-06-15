// Edge materialization — read-only preview.
//
// Given an existing graph `{ nodes, edges }` and a list of statically-
// inferred file-to-file edges (produced by `inferEdgesAutoFromDirectory`
// in src/runtime/static/edges.ts), this module reports what the metrics
// would look like if those edges were applied — without writing anything.
//
// Why preview-only: edge proposals already exist (`onto graph
// infer-edges --create-proposals`). This module is the measurement gate
// that sits *before* you choose to apply them: it tells you whether the
// proposed edges will actually move the brújula
// (`closedWorldContextReachableSatisfaction`) — the only signal the
// hierarchizer baseline established as actionable for the routing gap.
//
// Composition:
//   1. Resolve each `InferredEdge` to (fromNode, toNode) by matching on
//      `outputs.files[0]`, using a caller-provided `relativize` function
//      so the same logic works for the active project (cwd-relative) and
//      for archived snapshots (`--ontology-dir`).
//   2. Skip edges that cannot be applied — missing endpoint, cross-branch,
//      or duplicate of an existing edge — with explicit reasons.
//   3. Build a virtual edge list and run `computeHierarchyMetrics` twice
//      (before / after) to produce the delta. Special attention to the
//      closedWorld* fields.

import type {
  OntologyEdge,
  OntologyNode,
} from "../schemas/ontology.js";
import type { InferredEdge } from "../../inverse/static/edges.js";
import {
  computeHierarchyMetrics,
  type HierarchyMetrics,
} from "./hierarchy-metrics.js";

export const EDGE_MATERIALIZATION_SCHEMA_VERSION = "1.0";

// Synthetic edge id prefix. Distinguishable from real edge ids so the
// virtual graph never collides with persisted state if a caller saves
// the preview to disk. We do not write to disk — this is only used so
// `computeHierarchyMetrics` has stable handles during simulation.
const SYNTHETIC_EDGE_PREFIX = "edge_preview_";

export interface EdgeMaterializationPreviewInput {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  inferredEdges: InferredEdge[];
  // Convert an inferred edge file path (absolute, from the static
  // walker) into the key used by `outputs.files[0]`. The CLI provides
  // this — usually `path.relative(cwd, realpath(p))` to match what
  // ingest stored. Returned as posix forward slashes regardless of host
  // OS so it lines up with the storage convention.
  relativize: (filePath: string) => string;
  // Override root detection for downstream metric calls.
  rootNodeId?: string | null;
  // Cap on top-N rollups inside the metric snapshots.
  topN?: number;
}

export type SkippedEdgeReason =
  | "from_node_missing"
  | "to_node_missing"
  | "edge_already_exists"
  | "cross_branch"
  | "self_loop";

export interface ResolvedEdgeRecord {
  fromFile: string;
  toFile: string;
  type: OntologyEdge["type"];
  tokens: string[];
  fromNodeId: string;
  toNodeId: string;
}

export interface SkippedEdgeRecord {
  fromFile: string;
  toFile: string;
  type: OntologyEdge["type"];
  reason: SkippedEdgeReason;
  detail?: string;
}

export interface MetricsSnapshot {
  nodeCount: number;
  edgeCount: number;
  maxDepth: number;
  averageDepth: number;
  nonRootDirectChildrenOfRootRatio: number;
  isolatedNodeRatio: number;
  verdict: HierarchyMetrics["flatness"]["verdict"];
  closedWorldGlobalSatisfactionRatio: number;
  closedWorldContextReachableSatisfactionRatio: number;
  // Top closed-world unreachable rolled up by source. Same shape as the
  // metric module exposes; copied here so the report is self-contained.
  topClosedWorldUnreachableRequires: Array<{
    source: string;
    consumers: number;
  }>;
}

export interface EdgeMaterializationPreview {
  schemaVersion: string;
  resolved: ResolvedEdgeRecord[];
  skipped: SkippedEdgeRecord[];
  before: MetricsSnapshot;
  after: MetricsSnapshot;
  deltas: {
    // after.edgeCount - before.edgeCount.
    edgeCount: number;
    // after - before for the brújula. Positive = hierarchizer-good.
    closedWorldContextReachableSatisfactionRatio: number;
    // after - before for the global score. Should be ~0 (existing edges
    // don't add new providers); surfaced so a regression is visible.
    closedWorldGlobalSatisfactionRatio: number;
  };
}

// Main entry point. Deterministic across input permutations: every
// list is sorted on a stable secondary key before it lands in the
// output.
export function planEdgeMaterialization(
  input: EdgeMaterializationPreviewInput,
): EdgeMaterializationPreview {
  const nodes = input.nodes;
  const existingEdges = input.edges;
  const inferredEdges = input.inferredEdges;
  const topN = input.topN ?? 10;

  // Index 1: outputs.files[0] → node. First-writer-wins so two nodes
  // pointing at the same file resolve to the lexicographically smallest
  // id (matches the ambiguous-file handling in the hierarchizer).
  const nodeByFile = new Map<string, OntologyNode>();
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  for (const n of sortedNodes) {
    const file = n.outputs?.files?.[0];
    if (typeof file !== "string" || file.length === 0) continue;
    if (!nodeByFile.has(file)) nodeByFile.set(file, n);
  }

  // Index 2: existing (from, to, type) triples for dedup. Matches the
  // production resolver in commands/graph/infer-edges.ts so duplicate
  // skip reasons stay consistent between preview and apply.
  const existingTriples = new Set<string>();
  for (const e of existingEdges) {
    existingTriples.add(tripleKey(e.from, e.to, e.type));
  }

  // ── Resolution loop ───────────────────────────────────────────────────
  const resolved: ResolvedEdgeRecord[] = [];
  const skipped: SkippedEdgeRecord[] = [];
  // Track triples we've already promoted to `resolved` so two inferred
  // edges with the same (from, to, type) — possible when the analyser
  // emits both a `depends_on` and a `uses_token` for the same import —
  // do not stack twice in the simulation.
  const proposedTriples = new Set<string>();

  for (const edge of inferredEdges) {
    const fromKey = input.relativize(edge.fromFile);
    const toKey = input.relativize(edge.toFile);
    const fromNode = nodeByFile.get(fromKey);
    const toNode = nodeByFile.get(toKey);
    if (!fromNode) {
      skipped.push({
        fromFile: fromKey,
        toFile: toKey,
        type: edge.type,
        reason: "from_node_missing",
        detail: `No node whose outputs.files[0] === "${fromKey}"`,
      });
      continue;
    }
    if (!toNode) {
      skipped.push({
        fromFile: fromKey,
        toFile: toKey,
        type: edge.type,
        reason: "to_node_missing",
        detail: `No node whose outputs.files[0] === "${toKey}"`,
      });
      continue;
    }
    if (fromNode.id === toNode.id) {
      skipped.push({
        fromFile: fromKey,
        toFile: toKey,
        type: edge.type,
        reason: "self_loop",
        detail: `Both endpoints resolve to ${fromNode.id}`,
      });
      continue;
    }
    if (fromNode.coordinates.branch !== toNode.coordinates.branch) {
      skipped.push({
        fromFile: fromKey,
        toFile: toKey,
        type: edge.type,
        reason: "cross_branch",
        detail: `from on branch "${fromNode.coordinates.branch}", to on branch "${toNode.coordinates.branch}"`,
      });
      continue;
    }
    const key = tripleKey(fromNode.id, toNode.id, edge.type);
    if (existingTriples.has(key) || proposedTriples.has(key)) {
      skipped.push({
        fromFile: fromKey,
        toFile: toKey,
        type: edge.type,
        reason: "edge_already_exists",
        detail: existingTriples.has(key)
          ? `Edge ${fromNode.id} →(${edge.type})→ ${toNode.id} already in the graph`
          : `Duplicate inferred entry — same (from, to, type) triple was already planned`,
      });
      continue;
    }
    proposedTriples.add(key);
    resolved.push({
      fromFile: fromKey,
      toFile: toKey,
      type: edge.type,
      tokens: [...edge.tokens],
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
    });
  }

  // Determinism: sort resolved/skipped on stable keys after the loop.
  resolved.sort((a, b) => {
    if (a.fromNodeId !== b.fromNodeId)
      return a.fromNodeId.localeCompare(b.fromNodeId);
    if (a.toNodeId !== b.toNodeId)
      return a.toNodeId.localeCompare(b.toNodeId);
    return a.type.localeCompare(b.type);
  });
  skipped.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason.localeCompare(b.reason);
    if (a.fromFile !== b.fromFile)
      return a.fromFile.localeCompare(b.fromFile);
    if (a.toFile !== b.toFile) return a.toFile.localeCompare(b.toFile);
    return a.type.localeCompare(b.type);
  });

  // ── Before / after metric snapshots ──────────────────────────────────
  const beforeMetrics = computeHierarchyMetrics({
    nodes,
    edges: existingEdges,
    rootNodeId: input.rootNodeId,
    topN,
  });
  const virtualEdges = buildVirtualEdges(existingEdges, resolved);
  const afterMetrics = computeHierarchyMetrics({
    nodes,
    edges: virtualEdges,
    rootNodeId: input.rootNodeId,
    topN,
  });

  return {
    schemaVersion: EDGE_MATERIALIZATION_SCHEMA_VERSION,
    resolved,
    skipped,
    before: snapshot(beforeMetrics),
    after: snapshot(afterMetrics),
    deltas: {
      edgeCount:
        afterMetrics.topology.edgeCount - beforeMetrics.topology.edgeCount,
      closedWorldContextReachableSatisfactionRatio:
        afterMetrics.contracts.closedWorldContextReachableSatisfaction.ratio -
        beforeMetrics.contracts.closedWorldContextReachableSatisfaction.ratio,
      closedWorldGlobalSatisfactionRatio:
        afterMetrics.contracts.closedWorldGlobalSatisfaction.ratio -
        beforeMetrics.contracts.closedWorldGlobalSatisfaction.ratio,
    },
  };
}

function tripleKey(from: string, to: string, type: string): string {
  return `${from}|${to}|${type}`;
}

function buildVirtualEdges(
  existing: OntologyEdge[],
  resolved: ResolvedEdgeRecord[],
): OntologyEdge[] {
  const out: OntologyEdge[] = [...existing];
  let i = 0;
  for (const r of resolved) {
    out.push({
      edgeId: `${SYNTHETIC_EDGE_PREFIX}${i++}`,
      from: r.fromNodeId,
      to: r.toNodeId,
      type: r.type,
      branch: "main",
      createdAt: "1970-01-01T00:00:00.000Z",
      createdByEventId: "evt_preview",
      integrity: {
        hash: `preview:${r.fromNodeId}:${r.toNodeId}:${r.type}`,
        schemaVersion: "0.1.0",
      },
    } as OntologyEdge);
  }
  return out;
}

function snapshot(m: HierarchyMetrics): MetricsSnapshot {
  return {
    nodeCount: m.topology.nodeCount,
    edgeCount: m.topology.edgeCount,
    maxDepth: m.topology.maxDepth,
    averageDepth: m.topology.averageDepth,
    nonRootDirectChildrenOfRootRatio:
      m.flatness.nonRootDirectChildrenOfRootRatio,
    isolatedNodeRatio: m.flatness.isolatedNodeRatio,
    verdict: m.flatness.verdict,
    closedWorldGlobalSatisfactionRatio:
      m.contracts.closedWorldGlobalSatisfaction.ratio,
    closedWorldContextReachableSatisfactionRatio:
      m.contracts.closedWorldContextReachableSatisfaction.ratio,
    topClosedWorldUnreachableRequires: [
      ...m.contracts.topClosedWorldUnreachableRequires,
    ],
  };
}
