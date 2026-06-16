// Pure, read-only metrics over the typed Ontology graph.
//
// Built before any structural change to the network (hierarchizer, edge
// materialization, A→B typed maps) so subsequent work has a deterministic
// baseline to measure against. Takes plain data `{ nodes, edges }` so the
// same library can score the active project AND archived `.ontology.*`
// snapshots — the CLI is responsible for loading; this module never reads
// the filesystem.
//
// The signals fall into six families:
//   1. Topology — node/edge counts, depth-from-root distribution
//   2. Abstraction — counts per `coordinates.abstraction`
//   3. Parents — top-N parents by child count + histogram
//   4. Edges — average per node, isolated nodes, by-type counts
//   5. Contracts — requires/provides totals and two satisfaction definitions:
//        globalSatisfaction:           provider exists anywhere in same branch
//        contextReachableSatisfaction: provider is in parent path OR connected
//                                       via the assembler's default edge types
//      We report both deliberately. The first answers "does the information
//      exist?", the second answers "does it reach the prompt?". When the two
//      diverge, that gap is the hierarchizer's target.
//   6. Path fibers — buckets by `outputs.files[0]` dirname (mirrors
//      `pathProjection` from src/laws/fibration/branch-fiber.ts).
//
// A final `flatness` block summarises the verdict — `healthy | flat |
// edge_starved | hierarchy_starved` — so a single line tells you whether the
// network has the structural depth the walker and assembler assume.

import * as path from "node:path";
import type {
  AbstractionLevelSchema,
  EdgeTypeSchema,
  OntologyEdge,
  OntologyNode,
} from "../schemas/ontology.js";
import type { z } from "zod";
import { pathProjection } from "../../laws/fibration/branch-fiber.js";

// Schema version is bumped when the report shape changes. Historical
// baselines diff cleanly within a major version; consumers reading the
// JSON output should branch on this when integrating new fields.
//   1.0 — initial release (six metric families + flatness verdict)
//   1.1 — require classification (closed-world / open-world / path-mismatch
//         / unknown) and the closed-world satisfaction subscores
export const HIERARCHY_METRICS_SCHEMA_VERSION = "1.1";

// Categories the require classifier assigns to each (consumer, source)
// pair. The hierarchizer's score should optimise only the closed-world
// subset; the others are noise (no ontology provider will ever satisfy an
// `fs` import) or evidence of a separate pipeline bug (project paths
// extracted verbatim instead of being collapsed into their target
// node's symbol vocabulary).
export type RequireClassification =
  | "internal_symbol"
  | "internal_path_vocab_mismatch"
  | "open_world"
  | "unknown";

// Node stdlib modules — the open-world detector flags any of these
// (with or without the `node:` prefix) without needing to inspect
// providers. The list is conservative: anything missing falls through to
// the lowercase-bare-name heuristic, so a forgotten stdlib still gets
// classified correctly.
const NODE_STDLIB_MODULES: ReadonlySet<string> = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "timers",
  "timers/promises",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

// Edge types the strict context assembler walks by default. Kept in lockstep
// with `assembleContext` in src/forward/context/assembler.ts so
// "context-reachable" here means the same thing as "would be glued into the
// prompt" there.
export const DEFAULT_CONTEXT_EDGE_TYPES: ReadonlyArray<OntologyEdge["type"]> = [
  "depends_on",
  "validates_against",
  "uses_token",
  "documents",
  "tests",
];

export type AbstractionLevel = z.infer<typeof AbstractionLevelSchema>;
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

export interface HierarchyMetricsInput {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  // Override root detection. When omitted the function picks the unique
  // `parentId === null` node; if zero or multiple candidates exist the
  // root-dependent fields collapse to safe defaults (maxDepth = 0,
  // depth distribution empty, every non-root node counted as parentless).
  rootNodeId?: string | null;
  // Override the context-relevant edge types used by
  // `contextReachableSatisfaction`. Defaults to DEFAULT_CONTEXT_EDGE_TYPES.
  contextEdgeTypes?: ReadonlyArray<OntologyEdge["type"]>;
  // How many top-N items to return for ranked lists. Default 10.
  topN?: number;
}

export interface SatisfactionSummary {
  // (consumer, source) pairs where the source resolves to at least one
  // provider under the relevant definition.
  satisfied: number;
  // (consumer, source) pairs that did not resolve.
  unsatisfied: number;
  // satisfied / (satisfied + unsatisfied). 0 when there are no requires.
  ratio: number;
  // Per-source rollup of unsatisfied pairs (`consumers` = number of distinct
  // consumer nodes still missing this source). Sorted by consumer count desc,
  // then source asc, capped at topN.
  topUnsatisfied: Array<{ source: string; consumers: number }>;
}

export type FlatnessVerdict =
  | "healthy"
  | "flat"
  | "edge_starved"
  | "hierarchy_starved";

export interface HierarchyMetrics {
  schemaVersion: string;
  rootNodeId: string | null;
  // Set when the caller did not provide a rootNodeId and exactly zero or
  // more-than-one parentless nodes were found. Depth and parent-related
  // fields use neutral defaults in that case.
  rootDetection: "explicit" | "auto" | "missing" | "ambiguous";
  topology: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
    averageDepth: number;
    // Sparse map keyed by depth (0 = root). Only depths with at least one
    // node appear; the values sum to the number of root-reachable nodes.
    depthDistribution: Record<number, number>;
    // parentId points to a node id not present in `nodes`.
    danglingParentCount: number;
    // parentId === null, id !== rootNodeId.
    parentlessNonRootCount: number;
    // Nodes that are not reachable from root by walking parent → child
    // (sum of danglingParent + parentlessNonRoot + cycle-trapped nodes).
    unreachableFromRootCount: number;
  };
  abstractionDistribution: Record<string, number>;
  parents: {
    // {nodeId, childCount} sorted by childCount desc, then nodeId asc.
    topByChildCount: Array<{ nodeId: string; childCount: number }>;
    // childCount → number of parent nodes with exactly that many children.
    histogram: Record<number, number>;
    // Number of non-root nodes whose direct parent is the root. The single
    // strongest signal of network flatness.
    directChildrenOfRoot: number;
  };
  edges: {
    // edgeCount * 2 / nodeCount (each edge touches two endpoints). 0 when
    // there are no nodes.
    averagePerNode: number;
    // Nodes with zero incident edges (in or out).
    isolatedNodeCount: number;
    nodesWithOutgoing: number;
    nodesWithIncoming: number;
    // Sparse: only edge types that appear show up.
    byType: Record<string, number>;
  };
  contracts: {
    totalRequires: number;
    totalProvides: number;
    totalForbids: number;
    nodesWithRequires: number;
    nodesWithProvides: number;
    distinctRequireSources: number;
    distinctProvideKeys: number;
    globalSatisfaction: SatisfactionSummary;
    contextReachableSatisfaction: SatisfactionSummary;
    // ── Classification (schema 1.1) ───────────────────────────────────────
    // Per-category counts over (consumer, source) pairs. The sum equals
    // the total number of deduped pairs (= sum over consumers of their
    // distinct source set).
    closedWorldRequireCount: number;
    openWorldRequireCount: number;
    internalPathMismatchRequireCount: number;
    unknownRequireCount: number;
    // Satisfaction restricted to the closed-world subset (only requires
    // with a provider somewhere in the same branch). The global score is
    // ~1.0 by construction — by definition every closed-world require has
    // a global provider — and we still emit it so the report can sanity-
    // check the classification. The reachable score is the hierarchizer's
    // brújula: it should rise as parents and edges close the routing gap.
    closedWorldGlobalSatisfaction: SatisfactionSummary;
    closedWorldContextReachableSatisfaction: SatisfactionSummary;
    // Top closed-world sources that exist globally but cannot be reached
    // by the assembler. Drawn from
    // closedWorldContextReachableSatisfaction.topUnsatisfied; exposed as a
    // top-level field so the hierarchizer plan can target it directly.
    topClosedWorldUnreachableRequires: Array<{
      source: string;
      consumers: number;
    }>;
    // Top open-world sources by consumer count. Diagnostic only — these
    // will never be satisfied by an ontology node and should not weigh on
    // the hierarchizer's target metric. Useful to confirm the
    // classifier's noise is going where it should.
    topOpenWorldRequires: Array<{
      source: string;
      consumers: number;
    }>;
    // Top sources that look like project paths rather than symbols.
    // `resolvedNodeId` is set when the path resolves to a node's
    // outputs.files[0] under the consumer's directory (with .js → .ts /
    // .tsx aliases for TS-style imports). Surfaces vocabulary-extraction
    // bugs that leaked through into archived snapshots.
    topInternalPathVocabMismatches: Array<{
      source: string;
      consumers: number;
      resolvedNodeId: string | null;
    }>;
  };
  pathFibers: {
    bucketCount: number;
    // {bucket, nodeCount, averageDepth} sorted by nodeCount desc, then
    // bucket asc, capped at topN.
    topBuckets: Array<{
      bucket: string;
      nodeCount: number;
      averageDepth: number;
    }>;
    // Nodes with no `outputs.files[0]` (the projection returns undefined).
    nodesWithoutFile: number;
  };
  flatness: {
    // Count of non-root nodes whose parent is the root.
    nonRootDirectChildrenOfRoot: number;
    // nonRootDirectChildrenOfRoot / max(1, nodeCount - 1).
    nonRootDirectChildrenOfRootRatio: number;
    maxDepth: number;
    edgeCount: number;
    // isolatedNodeCount / max(1, nodeCount). 0 when there are no nodes.
    isolatedNodeRatio: number;
    // totalRequires + totalProvides — used by the edge_starved heuristic.
    contractTokenCount: number;
    verdict: FlatnessVerdict;
  };
}

// Pre-formatted single-line summary suitable for `--json | jq` consumers
// who want the punchline without parsing the full report. Not stored on the
// metrics object — callers compute it via `summariseFlatness` when needed.
export function summariseFlatness(metrics: HierarchyMetrics): string {
  const f = metrics.flatness;
  return [
    `verdict=${f.verdict}`,
    `nodes=${metrics.topology.nodeCount}`,
    `edges=${f.edgeCount}`,
    `maxDepth=${f.maxDepth}`,
    `directChildrenRatio=${f.nonRootDirectChildrenOfRootRatio.toFixed(2)}`,
    `isolatedRatio=${f.isolatedNodeRatio.toFixed(2)}`,
  ].join(" ");
}

// Main entry point. Deterministic: identical inputs produce identical
// output (objects are built with stable iteration order, all sorts break
// ties on a stable secondary key — usually the id or source string).
export function computeHierarchyMetrics(
  input: HierarchyMetricsInput,
): HierarchyMetrics {
  const nodes = input.nodes;
  const edges = input.edges;
  const topN = input.topN ?? 10;
  const contextEdgeTypes = new Set<OntologyEdge["type"]>(
    input.contextEdgeTypes ?? DEFAULT_CONTEXT_EDGE_TYPES,
  );

  const { rootNodeId, detection } = resolveRoot(input.rootNodeId, nodes);

  const nodeById = new Map<string, OntologyNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // ── Topology + parent structure ─────────────────────────────────────────
  const childrenByParent = new Map<string, string[]>();
  let danglingParentCount = 0;
  let parentlessNonRootCount = 0;

  for (const n of nodes) {
    const pid = n.graph.parentId;
    if (pid === null) {
      if (n.id !== rootNodeId) parentlessNonRootCount++;
      continue;
    }
    if (!nodeById.has(pid)) {
      danglingParentCount++;
      continue;
    }
    let bucket = childrenByParent.get(pid);
    if (!bucket) {
      bucket = [];
      childrenByParent.set(pid, bucket);
    }
    bucket.push(n.id);
  }
  for (const bucket of childrenByParent.values()) bucket.sort();

  // BFS from root to assign depths to every reachable node.
  const depthById = new Map<string, number>();
  if (rootNodeId !== null && nodeById.has(rootNodeId)) {
    depthById.set(rootNodeId, 0);
    const queue: string[] = [rootNodeId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curDepth = depthById.get(cur)!;
      const children = childrenByParent.get(cur) ?? [];
      for (const child of children) {
        if (depthById.has(child)) continue;
        depthById.set(child, curDepth + 1);
        queue.push(child);
      }
    }
  }

  const depthDistribution: Record<number, number> = {};
  let depthSum = 0;
  let maxDepth = 0;
  for (const depth of depthById.values()) {
    depthDistribution[depth] = (depthDistribution[depth] ?? 0) + 1;
    depthSum += depth;
    if (depth > maxDepth) maxDepth = depth;
  }
  const averageDepth = depthById.size > 0 ? depthSum / depthById.size : 0;
  const unreachableFromRootCount = nodes.length - depthById.size;

  // ── Abstraction distribution ────────────────────────────────────────────
  const abstractionCounts = new Map<string, number>();
  for (const n of nodes) {
    const level = n.coordinates.abstraction;
    abstractionCounts.set(level, (abstractionCounts.get(level) ?? 0) + 1);
  }
  const abstractionDistribution = sortRecord(abstractionCounts);

  // ── Parents ─────────────────────────────────────────────────────────────
  const parentEntries: Array<{ nodeId: string; childCount: number }> = [];
  const histogram: Record<number, number> = {};
  for (const [parentId, children] of childrenByParent) {
    parentEntries.push({ nodeId: parentId, childCount: children.length });
  }
  parentEntries.sort((a, b) => {
    if (a.childCount !== b.childCount) return b.childCount - a.childCount;
    return a.nodeId.localeCompare(b.nodeId);
  });
  for (const entry of parentEntries) {
    histogram[entry.childCount] = (histogram[entry.childCount] ?? 0) + 1;
  }
  const directChildrenOfRoot =
    rootNodeId !== null ? (childrenByParent.get(rootNodeId)?.length ?? 0) : 0;

  // ── Edges ───────────────────────────────────────────────────────────────
  const edgesByTypeCounts = new Map<string, number>();
  const nodesWithOut = new Set<string>();
  const nodesWithIn = new Set<string>();
  for (const e of edges) {
    edgesByTypeCounts.set(e.type, (edgesByTypeCounts.get(e.type) ?? 0) + 1);
    nodesWithOut.add(e.from);
    nodesWithIn.add(e.to);
  }
  const edgesByType = sortRecord(edgesByTypeCounts);
  let isolatedNodeCount = 0;
  for (const n of nodes) {
    if (!nodesWithOut.has(n.id) && !nodesWithIn.has(n.id)) isolatedNodeCount++;
  }
  const averagePerNode =
    nodes.length > 0 ? (edges.length * 2) / nodes.length : 0;

  // ── Contracts: requires / provides / forbids ────────────────────────────
  let totalRequires = 0;
  let totalProvides = 0;
  let totalForbids = 0;
  let nodesWithRequires = 0;
  let nodesWithProvides = 0;
  const distinctRequireSources = new Set<string>();
  const distinctProvideKeys = new Set<string>();
  // Provider index per branch: branch → key → Set<nodeId>.
  const providersByBranch = new Map<string, Map<string, Set<string>>>();
  // For each consumer node id, the deduped set of (source) it requires.
  const requiresByConsumer = new Map<string, Set<string>>();

  for (const n of nodes) {
    const reqs = n.context?.requires ?? [];
    const provs = n.context?.provides ?? [];
    const forbs = n.context?.forbids ?? [];

    totalRequires += reqs.length;
    totalProvides += provs.length;
    totalForbids += forbs.length;
    if (reqs.length > 0) nodesWithRequires++;
    if (provs.length > 0) nodesWithProvides++;

    if (reqs.length > 0) {
      const set = new Set<string>();
      for (const r of reqs) {
        set.add(r.source);
        distinctRequireSources.add(r.source);
      }
      requiresByConsumer.set(n.id, set);
    }

    if (provs.length > 0) {
      const branch = n.coordinates.branch;
      let perBranch = providersByBranch.get(branch);
      if (!perBranch) {
        perBranch = new Map();
        providersByBranch.set(branch, perBranch);
      }
      for (const p of provs) {
        distinctProvideKeys.add(p.key);
        let providerSet = perBranch.get(p.key);
        if (!providerSet) {
          providerSet = new Set();
          perBranch.set(p.key, providerSet);
        }
        providerSet.add(n.id);
      }
    }
  }

  // Precompute ancestor chains and edge-neighbour sets for each consumer.
  // The reachability set R for consumer C is:
  //   ancestors(C) ∪ {C} ∪ {n : ∃ context-typed edge between n and some m ∈ ancestors(C) ∪ {C}}
  // This mirrors `assembleContext` exactly: ancestor walk + one-hop edge
  // neighbours along the default context edge types.
  const adjByNode = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!contextEdgeTypes.has(e.type)) continue;
    let fromBucket = adjByNode.get(e.from);
    if (!fromBucket) {
      fromBucket = new Set();
      adjByNode.set(e.from, fromBucket);
    }
    fromBucket.add(e.to);
    let toBucket = adjByNode.get(e.to);
    if (!toBucket) {
      toBucket = new Set();
      adjByNode.set(e.to, toBucket);
    }
    toBucket.add(e.from);
  }

  // Index: outputs.files[0] → node ids that claim it. Used by the path-
  // vocab-mismatch classifier to resolve relative-path requires (e.g.
  // `../../core/errors.js`) back to the providing node. Multiple nodes
  // can share a file; we sort the bucket so resolution is deterministic.
  const fileToNodeIds = new Map<string, string[]>();
  for (const n of nodes) {
    const file = n.outputs?.files?.[0];
    if (typeof file !== "string" || file.length === 0) continue;
    const normalised = path.posix.normalize(file);
    let bucket = fileToNodeIds.get(normalised);
    if (!bucket) {
      bucket = [];
      fileToNodeIds.set(normalised, bucket);
    }
    bucket.push(n.id);
  }
  for (const bucket of fileToNodeIds.values()) bucket.sort();

  // Tally satisfaction and classification together. Each (consumer,
  // source) pair contributes to:
  //   • global / reach satisfaction (legacy, schema 1.0)
  //   • a classification bucket (schema 1.1)
  //   • the closed-world satisfaction subscores when classification is
  //     `internal_symbol`
  const globalSatisfied: Array<{ source: string; consumer: string }> = [];
  const globalUnsatisfied: Array<{ source: string; consumer: string }> = [];
  const reachSatisfied: Array<{ source: string; consumer: string }> = [];
  const reachUnsatisfied: Array<{ source: string; consumer: string }> = [];
  const closedGlobalSatisfied: Array<{ source: string; consumer: string }> = [];
  const closedGlobalUnsatisfied: Array<{ source: string; consumer: string }> =
    [];
  const closedReachSatisfied: Array<{ source: string; consumer: string }> = [];
  const closedReachUnsatisfied: Array<{ source: string; consumer: string }> =
    [];
  const openWorldPairs: Array<{ source: string; consumer: string }> = [];
  const pathMismatchPairs: Array<{
    source: string;
    consumer: string;
    resolvedNodeId: string | null;
  }> = [];
  const unknownPairs: Array<{ source: string; consumer: string }> = [];

  for (const [consumerId, sources] of requiresByConsumer) {
    const consumer = nodeById.get(consumerId);
    if (!consumer) continue; // consumer must exist by construction; defensive.
    const branch = consumer.coordinates.branch;
    const branchProviders = providersByBranch.get(branch);

    // Reachability set R, scoped to the consumer's branch (the assembler
    // refuses cross-branch nodes, so we mirror that constraint).
    const reach = buildReachabilitySet(consumer, nodeById, adjByNode, branch);

    for (const source of sources) {
      const globalProviderIds = branchProviders?.get(source);
      const globalHit = !!globalProviderIds && globalProviderIds.size > 0;
      if (globalHit) globalSatisfied.push({ source, consumer: consumerId });
      else globalUnsatisfied.push({ source, consumer: consumerId });

      let reachHit = false;
      if (globalProviderIds) {
        for (const providerId of globalProviderIds) {
          if (reach.has(providerId)) {
            reachHit = true;
            break;
          }
        }
      }
      if (reachHit) reachSatisfied.push({ source, consumer: consumerId });
      else reachUnsatisfied.push({ source, consumer: consumerId });

      // Classification + closed-world tallies.
      const classification = classifyRequire(
        source,
        globalHit,
        consumer,
        fileToNodeIds,
      );
      if (classification.class === "internal_symbol") {
        if (globalHit) {
          closedGlobalSatisfied.push({ source, consumer: consumerId });
        } else {
          // Defensive: by construction internal_symbol implies globalHit,
          // but we guard the invariant in case the classifier changes.
          closedGlobalUnsatisfied.push({ source, consumer: consumerId });
        }
        if (reachHit) {
          closedReachSatisfied.push({ source, consumer: consumerId });
        } else {
          closedReachUnsatisfied.push({ source, consumer: consumerId });
        }
      } else if (classification.class === "open_world") {
        openWorldPairs.push({ source, consumer: consumerId });
      } else if (classification.class === "internal_path_vocab_mismatch") {
        pathMismatchPairs.push({
          source,
          consumer: consumerId,
          resolvedNodeId: classification.resolvedNodeId,
        });
      } else {
        unknownPairs.push({ source, consumer: consumerId });
      }
    }
  }

  const globalSatisfaction = summariseSatisfaction(
    globalSatisfied,
    globalUnsatisfied,
    topN,
  );
  const contextReachableSatisfaction = summariseSatisfaction(
    reachSatisfied,
    reachUnsatisfied,
    topN,
  );
  const closedWorldGlobalSatisfaction = summariseSatisfaction(
    closedGlobalSatisfied,
    closedGlobalUnsatisfied,
    topN,
  );
  const closedWorldContextReachableSatisfaction = summariseSatisfaction(
    closedReachSatisfied,
    closedReachUnsatisfied,
    topN,
  );

  const topOpenWorldRequires = topByConsumerCount(openWorldPairs, topN);
  const topInternalPathVocabMismatches = rollUpPathMismatches(
    pathMismatchPairs,
    topN,
  );

  // ── Path fibers ─────────────────────────────────────────────────────────
  const nodesByBucket = new Map<string, OntologyNode[]>();
  let nodesWithoutFile = 0;
  for (const n of nodes) {
    const dir = pathProjection(n);
    if (dir === undefined) {
      nodesWithoutFile++;
      continue;
    }
    // `pathProjection` already normalises via path.posix.dirname; trim a
    // trailing "/" defensively so two equivalent labels collapse.
    const bucket = dir === "." ? "." : dir.replace(/\/+$/u, "");
    let bucketNodes = nodesByBucket.get(bucket);
    if (!bucketNodes) {
      bucketNodes = [];
      nodesByBucket.set(bucket, bucketNodes);
    }
    bucketNodes.push(n);
  }
  const bucketEntries: Array<{
    bucket: string;
    nodeCount: number;
    averageDepth: number;
  }> = [];
  for (const [bucket, bucketNodes] of nodesByBucket) {
    let knownDepthSum = 0;
    let knownDepthCount = 0;
    for (const n of bucketNodes) {
      const d = depthById.get(n.id);
      if (d !== undefined) {
        knownDepthSum += d;
        knownDepthCount++;
      }
    }
    bucketEntries.push({
      bucket,
      nodeCount: bucketNodes.length,
      averageDepth: knownDepthCount > 0 ? knownDepthSum / knownDepthCount : 0,
    });
  }
  bucketEntries.sort((a, b) => {
    if (a.nodeCount !== b.nodeCount) return b.nodeCount - a.nodeCount;
    return a.bucket.localeCompare(b.bucket);
  });

  // ── Flatness ────────────────────────────────────────────────────────────
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const nonRootCount = Math.max(0, nodeCount - 1);
  const nonRootDirectChildrenOfRoot = directChildrenOfRoot;
  const nonRootDirectChildrenOfRootRatio =
    nonRootCount > 0 ? nonRootDirectChildrenOfRoot / nonRootCount : 0;
  const isolatedNodeRatio =
    nodeCount > 0 ? isolatedNodeCount / nodeCount : 0;
  const contractTokenCount = totalRequires + totalProvides;
  const edgePerNode = nodeCount > 0 ? edgeCount / nodeCount : 0;

  const verdict = computeVerdict({
    nodeCount,
    edgeCount,
    edgePerNode,
    maxDepth,
    nonRootDirectChildrenOfRootRatio,
    contractTokenCount,
  });

  return {
    schemaVersion: HIERARCHY_METRICS_SCHEMA_VERSION,
    rootNodeId,
    rootDetection: detection,
    topology: {
      nodeCount,
      edgeCount,
      maxDepth,
      averageDepth,
      depthDistribution,
      danglingParentCount,
      parentlessNonRootCount,
      unreachableFromRootCount,
    },
    abstractionDistribution,
    parents: {
      topByChildCount: parentEntries.slice(0, topN),
      histogram,
      directChildrenOfRoot,
    },
    edges: {
      averagePerNode,
      isolatedNodeCount,
      nodesWithOutgoing: nodesWithOut.size,
      nodesWithIncoming: nodesWithIn.size,
      byType: edgesByType,
    },
    contracts: {
      totalRequires,
      totalProvides,
      totalForbids,
      nodesWithRequires,
      nodesWithProvides,
      distinctRequireSources: distinctRequireSources.size,
      distinctProvideKeys: distinctProvideKeys.size,
      globalSatisfaction,
      contextReachableSatisfaction,
      closedWorldRequireCount: closedGlobalSatisfied.length + closedGlobalUnsatisfied.length,
      openWorldRequireCount: openWorldPairs.length,
      internalPathMismatchRequireCount: pathMismatchPairs.length,
      unknownRequireCount: unknownPairs.length,
      closedWorldGlobalSatisfaction,
      closedWorldContextReachableSatisfaction,
      topClosedWorldUnreachableRequires:
        closedWorldContextReachableSatisfaction.topUnsatisfied,
      topOpenWorldRequires,
      topInternalPathVocabMismatches,
    },
    pathFibers: {
      bucketCount: nodesByBucket.size,
      topBuckets: bucketEntries.slice(0, topN),
      nodesWithoutFile,
    },
    flatness: {
      nonRootDirectChildrenOfRoot,
      nonRootDirectChildrenOfRootRatio,
      maxDepth,
      edgeCount,
      isolatedNodeRatio,
      contractTokenCount,
      verdict,
    },
  };
}

// Resolve which node id is the root for the depth calculation:
//   • explicit  — caller passed a rootNodeId and it exists in `nodes`
//   • auto      — exactly one `parentId === null` candidate
//   • missing   — zero candidates
//   • ambiguous — more than one candidate, no explicit override
function resolveRoot(
  override: string | null | undefined,
  nodes: OntologyNode[],
): { rootNodeId: string | null; detection: HierarchyMetrics["rootDetection"] } {
  if (override) {
    const exists = nodes.some((n) => n.id === override);
    if (exists) return { rootNodeId: override, detection: "explicit" };
    // Explicit but stale → fall through to auto-detect.
  }
  const candidates = nodes.filter((n) => n.graph.parentId === null);
  if (candidates.length === 1) {
    return { rootNodeId: candidates[0]!.id, detection: "auto" };
  }
  if (candidates.length === 0) {
    return { rootNodeId: null, detection: "missing" };
  }
  return { rootNodeId: null, detection: "ambiguous" };
}

function buildReachabilitySet(
  consumer: OntologyNode,
  nodeById: Map<string, OntologyNode>,
  adjByNode: Map<string, Set<string>>,
  branch: string,
): Set<string> {
  // Walk up the parent chain, collecting same-branch ancestors. Guard
  // against cycles with a visited set — a parent cycle is itself a graph
  // bug, but this helper must terminate either way.
  const seedSet = new Set<string>();
  seedSet.add(consumer.id);
  let cur: OntologyNode | undefined = consumer;
  const seen = new Set<string>([consumer.id]);
  while (cur && cur.graph.parentId !== null) {
    const parentId: string = cur.graph.parentId;
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) break;
    if (parent.coordinates.branch !== branch) break;
    seedSet.add(parent.id);
    cur = parent;
  }
  // Add one-hop edge neighbours of every seed. Edges have already been
  // filtered down to context-relevant types in adjByNode.
  const reach = new Set<string>(seedSet);
  for (const seedId of seedSet) {
    const neighbours = adjByNode.get(seedId);
    if (!neighbours) continue;
    for (const nbId of neighbours) {
      const nb = nodeById.get(nbId);
      if (!nb) continue;
      if (nb.coordinates.branch !== branch) continue;
      reach.add(nbId);
    }
  }
  return reach;
}

// Lexicographically-sorted projection of a Map into a Record, so that
// JSON.stringify emits keys in a stable order regardless of input
// iteration. Numeric-keyed records do not need this — V8 auto-sorts those
// in object property order — but string-keyed records are insertion-order
// and would otherwise leak the caller's node array order into the output.
function sortRecord(counts: Map<string, number>): Record<string, number> {
  const sortedKeys = Array.from(counts.keys()).sort();
  const out: Record<string, number> = {};
  for (const k of sortedKeys) out[k] = counts.get(k)!;
  return out;
}

function summariseSatisfaction(
  satisfied: Array<{ source: string; consumer: string }>,
  unsatisfied: Array<{ source: string; consumer: string }>,
  topN: number,
): SatisfactionSummary {
  const total = satisfied.length + unsatisfied.length;
  const ratio = total > 0 ? satisfied.length / total : 0;
  const consumersBySource = new Map<string, Set<string>>();
  for (const { source, consumer } of unsatisfied) {
    let bucket = consumersBySource.get(source);
    if (!bucket) {
      bucket = new Set();
      consumersBySource.set(source, bucket);
    }
    bucket.add(consumer);
  }
  const topUnsatisfied = Array.from(consumersBySource.entries())
    .map(([source, consumers]) => ({ source, consumers: consumers.size }))
    .sort((a, b) => {
      if (a.consumers !== b.consumers) return b.consumers - a.consumers;
      return a.source.localeCompare(b.source);
    })
    .slice(0, topN);
  return {
    satisfied: satisfied.length,
    unsatisfied: unsatisfied.length,
    ratio,
    topUnsatisfied,
  };
}

// ── Require classification ────────────────────────────────────────────────
//
// `internal_symbol` wins whenever the require resolves to a provides.key in
// the consumer's branch — even when the string also *looks* like a path.
// `internal_path_vocab_mismatch` catches the failure mode where the ingest
// pipeline extracted an import path verbatim instead of pulling the
// identifier out of the brackets; we try to resolve the path back to the
// providing node so the report can point at "this require really meant
// node_X". `open_world` is the stdlib/npm tail that no ontology node will
// ever satisfy. `unknown` is everything else — bare identifiers that look
// like project symbols but have no provider; without more information we
// refuse to guess.
//
// Rule order is load-bearing for determinism; do not reorder without
// updating tests.
export type RequireClassificationResult = {
  class: RequireClassification;
  // Only set when the require classifies as `internal_path_vocab_mismatch`
  // *and* one of the path variants resolves to a node's outputs.files[0].
  // Null for every other classification.
  resolvedNodeId: string | null;
};

export function classifyRequire(
  source: string,
  hasGlobalProvider: boolean,
  consumer: OntologyNode,
  fileToNodeIds: Map<string, string[]>,
): RequireClassificationResult {
  // 1. Direct symbol match wins, regardless of whether the string also
  //    happens to look like a path. If someone literally provides
  //    "../../core/errors.js" as a key, the require is `internal_symbol`.
  if (hasGlobalProvider) {
    return { class: "internal_symbol", resolvedNodeId: null };
  }

  // 2. Path-shaped? Try to resolve to a known file. Even when resolution
  //    fails we keep the `internal_path_vocab_mismatch` label because the
  //    *shape* of the source is the failure mode the report is surfacing.
  if (isPathLike(source)) {
    const resolvedNodeId = resolvePathToNode(source, consumer, fileToNodeIds);
    return { class: "internal_path_vocab_mismatch", resolvedNodeId };
  }

  // 3. Open-world heuristic. Bare lowercase identifiers and scoped npm
  //    patterns are treated as external. Project symbols are typically
  //    camel- or PascalCase, so the lowercase-only constraint filters most
  //    project symbols out.
  if (isOpenWorldName(source)) {
    return { class: "open_world", resolvedNodeId: null };
  }

  return { class: "unknown", resolvedNodeId: null };
}

function isPathLike(source: string): boolean {
  if (source.length === 0) return false;
  if (source.startsWith("./") || source === "." || source === "..") return true;
  if (source.startsWith("../")) return true;
  if (source.startsWith("/")) return true;
  // Explicit module extensions — anything ending in a JS/TS/JSON source
  // extension is a file path even if it doesn't carry a leading dot.
  if (/\.(?:tsx|ts|jsx|js|mjs|cjs|json)$/i.test(source)) return true;
  // Project-rooted shape: contains `/` and starts with a known top-level
  // directory. We do not infer this from any `/` to avoid colliding with
  // scoped npm packages (`@org/pkg`) or stdlib subpaths (`fs/promises`).
  if (
    source.includes("/") &&
    /^(?:src|tests|examples|docs|scripts|packages|apps|services)\//.test(source)
  ) {
    return true;
  }
  return false;
}

function isOpenWorldName(source: string): boolean {
  if (source.length === 0) return false;
  // node: prefix is always open-world.
  if (source.startsWith("node:")) return true;
  // Bare or sub-pathed stdlib module.
  const head = source.split("/")[0]!;
  if (NODE_STDLIB_MODULES.has(source)) return true;
  if (NODE_STDLIB_MODULES.has(head) && /^[a-z]/.test(head)) {
    // `fs/promises`, `stream/web` — covered by the explicit list above
    // when present, but also caught here for any stdlib sub-path we
    // forgot to enumerate.
    return true;
  }
  // Scoped npm: @scope/pkg or @scope/pkg/sub
  if (/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._\-/]*$/.test(source)) {
    return true;
  }
  // Bare npm: lowercase-led identifier with optional subpath, no source
  // file extension. Project symbols start lowercase too (camelCase) but
  // they almost always contain an uppercase letter — adding `!hasUpper`
  // keeps the rule from swallowing `loadEdges` / `errorMessage`.
  const hasUpper = /[A-Z]/.test(source);
  if (!hasUpper && /^[a-z][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(source)) {
    return true;
  }
  return false;
}

function resolvePathToNode(
  source: string,
  consumer: OntologyNode,
  fileToNodeIds: Map<string, string[]>,
): string | null {
  // Strip leading `./` so normalisation stays clean.
  const consumerFile = consumer.outputs?.files?.[0];

  // Base: the dir of the consumer's first output file when the require
  // is relative; otherwise we treat the source as project-rooted.
  let candidates: string[];
  if (source.startsWith("./") || source.startsWith("../")) {
    if (typeof consumerFile !== "string" || consumerFile.length === 0) {
      // Relative require but no consumer file — cannot resolve.
      candidates = [];
    } else {
      const baseDir = path.posix.dirname(path.posix.normalize(consumerFile));
      const joined = path.posix.normalize(path.posix.join(baseDir, source));
      candidates = generateExtensionVariants(joined);
    }
  } else if (source.startsWith("/")) {
    candidates = generateExtensionVariants(source.slice(1));
  } else {
    candidates = generateExtensionVariants(path.posix.normalize(source));
  }

  for (const c of candidates) {
    const matches = fileToNodeIds.get(c);
    if (matches && matches.length > 0) {
      return matches[0]!; // bucket sorted at index time
    }
  }
  return null;
}

// Produce the file variants to probe in fileToNodeIds. The `.js → .ts /
// .tsx` aliases handle the TS convention where imports use the runtime
// extension. Extension-less requires get a `.ts / .tsx / .js / .jsx /
// index.{ts,tsx,js,jsx}` fan-out, matching the TS module resolver's
// candidate list (in the same order TS would try them).
function generateExtensionVariants(p: string): string[] {
  const out: string[] = [p];
  if (p.endsWith(".js")) {
    const stem = p.slice(0, -3);
    out.push(`${stem}.ts`, `${stem}.tsx`);
  } else if (p.endsWith(".jsx")) {
    const stem = p.slice(0, -4);
    out.push(`${stem}.tsx`);
  } else if (p.endsWith(".mjs")) {
    const stem = p.slice(0, -4);
    out.push(`${stem}.mts`, `${stem}.ts`);
  } else if (p.endsWith(".cjs")) {
    const stem = p.slice(0, -4);
    out.push(`${stem}.cts`, `${stem}.ts`);
  } else if (!/\.[A-Za-z0-9]+$/.test(p)) {
    out.push(
      `${p}.ts`,
      `${p}.tsx`,
      `${p}.js`,
      `${p}.jsx`,
      `${p}/index.ts`,
      `${p}/index.tsx`,
      `${p}/index.js`,
      `${p}/index.jsx`,
    );
  }
  return out;
}

function topByConsumerCount(
  pairs: Array<{ source: string; consumer: string }>,
  topN: number,
): Array<{ source: string; consumers: number }> {
  const consumersBySource = new Map<string, Set<string>>();
  for (const { source, consumer } of pairs) {
    let bucket = consumersBySource.get(source);
    if (!bucket) {
      bucket = new Set();
      consumersBySource.set(source, bucket);
    }
    bucket.add(consumer);
  }
  return Array.from(consumersBySource.entries())
    .map(([source, consumers]) => ({ source, consumers: consumers.size }))
    .sort((a, b) => {
      if (a.consumers !== b.consumers) return b.consumers - a.consumers;
      return a.source.localeCompare(b.source);
    })
    .slice(0, topN);
}

// Roll path mismatches up by source. When every consumer of the same
// source resolves to the same node id, that id surfaces in the report;
// when consumers disagree (different relative paths landing on different
// nodes — common when `../../foo.js` is named from two different dirs),
// we report `null` rather than picking one arbitrarily.
function rollUpPathMismatches(
  pairs: Array<{
    source: string;
    consumer: string;
    resolvedNodeId: string | null;
  }>,
  topN: number,
): Array<{ source: string; consumers: number; resolvedNodeId: string | null }> {
  const bySource = new Map<
    string,
    { consumers: Set<string>; resolved: Set<string | null> }
  >();
  for (const { source, consumer, resolvedNodeId } of pairs) {
    let bucket = bySource.get(source);
    if (!bucket) {
      bucket = { consumers: new Set(), resolved: new Set() };
      bySource.set(source, bucket);
    }
    bucket.consumers.add(consumer);
    bucket.resolved.add(resolvedNodeId);
  }
  const out: Array<{
    source: string;
    consumers: number;
    resolvedNodeId: string | null;
  }> = [];
  for (const [source, bucket] of bySource) {
    const resolvedIds = Array.from(bucket.resolved).filter(
      (id): id is string => id !== null,
    );
    const uniqueResolved = new Set(resolvedIds);
    const resolvedNodeId =
      uniqueResolved.size === 1 ? Array.from(uniqueResolved)[0]! : null;
    out.push({
      source,
      consumers: bucket.consumers.size,
      resolvedNodeId,
    });
  }
  out.sort((a, b) => {
    if (a.consumers !== b.consumers) return b.consumers - a.consumers;
    return a.source.localeCompare(b.source);
  });
  return out.slice(0, topN);
}

// Verdict heuristics. Order is intentional: the more specific failure mode
// wins so the verdict points at the most-actionable symptom.
//   1. flat                — most non-root nodes hang directly off the root
//   2. edge_starved        — lots of contracts but barely any edges
//   3. hierarchy_starved   — shallow tree without enough depth for layered intent
//   4. healthy             — otherwise
function computeVerdict(args: {
  nodeCount: number;
  edgeCount: number;
  edgePerNode: number;
  maxDepth: number;
  nonRootDirectChildrenOfRootRatio: number;
  contractTokenCount: number;
}): FlatnessVerdict {
  const {
    nodeCount,
    edgeCount,
    edgePerNode,
    maxDepth,
    nonRootDirectChildrenOfRootRatio,
    contractTokenCount,
  } = args;

  // Tiny graphs cannot be diagnosed — give them the benefit of the doubt.
  if (nodeCount <= 1) return "healthy";

  // Flat: a clear majority of non-root nodes hang directly off the canon.
  // The threshold (0.8) intentionally mirrors the user-supplied rule of
  // thumb; with nodeCount > 5 we avoid flagging a deliberate 3-node graph.
  if (nodeCount > 5 && nonRootDirectChildrenOfRootRatio >= 0.8) {
    return "flat";
  }

  // Edge starved: contract tokens exist but the graph is sparsely linked.
  // 0.1 edges/node is the floor below which the assembler has almost
  // nothing extra to glue beyond the parent path.
  if (contractTokenCount > 20 && edgePerNode < 0.1) {
    return "edge_starved";
  }

  // Hierarchy starved: shallow tree despite a non-trivial node count. We
  // require nodeCount > 10 so a small but well-organised pilot graph is
  // not penalised.
  if (maxDepth <= 2 && nodeCount > 10) {
    return "hierarchy_starved";
  }

  // Defensive: catch the "many edges, many nodes, but still totally flat"
  // case the explicit ratio threshold above would have flagged when the
  // node count is small.
  if (edgeCount === 0 && nodeCount > 5) return "edge_starved";

  return "healthy";
}
