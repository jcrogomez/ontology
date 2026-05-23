// Deterministic, read-only hierarchizer planner.
//
// Reads a flat `{ nodes, edges }` graph and produces a `HierarchizerPlan`
// that, if applied, would promote the directory structure already
// captured in `outputs.files[0]` into first-class intermediate nodes —
// turning the canonical flat-bag-of-children topology into a real tree
// rooted at the architectural top-level dirs (`src`, `tests`, …).
//
// Why preview-only:
//   `ProposalMutationSchema` (src/schemas/ontology.ts:504) supports
//   `node_create` and `edge_create` only. There is no `node_update_parent`
//   variant, so reparenting an existing file node is not expressible as a
//   proposal today. Creating the directory nodes in isolation would leave
//   them dangling and make the flatness verdict worse, so this module
//   refuses to emit half-plans. The plan output declares the schema
//   extension required to lift the block.
//
// What the simulation does:
//   The plan includes `before` and `after` snapshots produced by running
//   `computeHierarchyMetrics` on the original graph and on a virtually-
//   applied version (new directory nodes added, file nodes reparented
//   in memory). The simulation is honest: directory nodes provide only
//   `path:<dir>` tokens, so the closed-world reachable satisfaction
//   *does not move* — the gain is structural (deeper tree, smaller
//   `directChildrenRatio`). Pairing the hierarchizer with edge
//   materialization is what closes the routing gap; see
//   docs/legend/calibrations/HIERARCHY_BASELINE_2026-05-22.md §8.

import * as path from "node:path";
import type {
  OntologyEdge,
  OntologyNode,
} from "../../schemas/ontology.js";
import {
  computeHierarchyMetrics,
  type AbstractionLevel,
  type HierarchyMetrics,
} from "./hierarchy-metrics.js";

export const HIERARCHIZER_PLAN_SCHEMA_VERSION = "1.0";

// Prefix used for synthetic node ids in the preview. Distinct from the
// `node_NNNN_<slug>` format the generator produces so a preview id can
// never collide with a real id even when sorting is the only tiebreaker.
const SYNTHETIC_ID_PREFIX = "node_dir_";

// Convention: a directory-representing node declares one provides entry
// of the form `path:<posix-dir>`. New directory nodes the hierarchizer
// would create follow this convention; the reuse-detection logic uses
// the same shape to decide "this existing node already represents that
// directory". Hand-authored callers can opt in by adding the same
// provides entry to their own component nodes.
const PATH_PROVIDES_PREFIX = "path:";

// Recommended kind for directory nodes. `component` is the closest
// existing `NodeKindSchema` value to "a grouping of related code units"
// — `definition` reads as a single named declaration; `view` is a
// rendering concept; `entity` is an instance/object. The justification
// is documented inline so the choice is reviewable when the kind set
// changes.
const DIRECTORY_NODE_KIND = "component" as const;

export interface HierarchizerInput {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  // Override root detection (passed through to `computeHierarchyMetrics`).
  rootNodeId?: string | null;
  // Branch the plan should target. Defaults to the root's branch (or
  // "main" if the graph has no resolvable root).
  branch?: string;
  // Cap on per-list output sizes inside the plan (top buckets etc.).
  topN?: number;
}

export interface ProposedDirectoryNode {
  // Synthetic preview id. Not a real node id — never written.
  proposedNodeId: string;
  path: string;                       // canonical posix directory path
  label: string;                      // same as `path`
  parentPath: string | null;          // null when the directory's parent is the root
  parentNodeId: string;               // synthetic or real id of the parent dir / root
  abstraction: AbstractionLevel;
  kind: typeof DIRECTORY_NODE_KIND;
  provides: string[];                 // e.g. ["path:src/runtime/context"]
}

export interface ReusedDirectoryNode {
  path: string;
  nodeId: string;                     // the existing node already representing this directory
}

export interface ReparentingAction {
  nodeId: string;                     // existing file node being reparented
  file: string;                       // outputs.files[0] that drove the assignment
  currentParentId: string | null;
  newParentPath: string;              // directory path the file lands under
  newParentNodeId: string;            // synthetic (new) or real (reused) id
}

export interface SkippedBuckets {
  // File nodes with no `outputs.files[0]` to anchor them to a directory.
  // Cannot be reparented; documented in case the operator wants to backfill.
  noOutputFile: string[];
  // Files whose first output dirname is "." — root-level configs and
  // similar. We keep them under their current parent rather than invent
  // a synthetic "root" directory node.
  rootLevelFiles: string[];
  // Files whose current parent is neither the root nor a directory node
  // we would create. The hierarchizer refuses to override a deliberate
  // existing parent; the operator should reconcile by hand.
  alreadyDeepNested: Array<{ nodeId: string; currentParentId: string }>;
  // Two or more nodes claim the same `outputs.files[0]`. We keep the
  // node with the lexicographically smallest id and skip the rest.
  ambiguousFile: Array<{ file: string; nodeIds: string[] }>;
}

export interface ProposalCapability {
  // The directory nodes can be expressed today (node_create with
  // parentNodeId = canon or another new directory) but applying them
  // without the reparent step would make flatness worse — see comment
  // at top of file. Reported here so the CLI can render a clear note.
  canCreateDirectories: boolean;
  canReparentExistingNodes: boolean;
  // Concrete schema extension required to make the plan applicable
  // end-to-end. Human-readable so the report can copy verbatim.
  blockedBy: string[];
}

export interface HierarchyMetricsSnapshot {
  nodeCount: number;
  edgeCount: number;
  maxDepth: number;
  averageDepth: number;
  directChildrenOfRoot: number;
  nonRootDirectChildrenOfRootRatio: number;
  isolatedNodeRatio: number;
  verdict: HierarchyMetrics["flatness"]["verdict"];
  closedWorldGlobalSatisfactionRatio: number;
  closedWorldContextReachableSatisfactionRatio: number;
  pathBucketCount: number;
}

export interface HierarchizerPlan {
  schemaVersion: string;
  branch: string;
  rootNodeId: string | null;
  // Apply directoriesToCreate top-down (smallest path first) so each
  // directory's parent already exists when it lands.
  directoriesToCreate: ProposedDirectoryNode[];
  directoriesReused: ReusedDirectoryNode[];
  reparentings: ReparentingAction[];
  skipped: SkippedBuckets;
  before: HierarchyMetricsSnapshot;
  after: HierarchyMetricsSnapshot;
  proposalCapability: ProposalCapability;
}

// Main entry point. Pure: no I/O, no LLM, no mutation. Output is
// deterministic across input permutations (every list is sorted on a
// stable secondary key).
export function planHierarchization(
  input: HierarchizerInput,
): HierarchizerPlan {
  const nodes = input.nodes;
  const edges = input.edges;
  const topN = input.topN ?? 10;
  const { rootNodeId } = resolveRoot(input.rootNodeId, nodes);
  const branch = input.branch ?? deriveDefaultBranch(rootNodeId, nodes);

  // Helper indices.
  const nodeById = new Map<string, OntologyNode>();
  for (const n of nodes) nodeById.set(n.id, n);
  const existingDirNodes = indexExistingDirectoryNodes(nodes, branch);

  // ── 1. Classify file nodes ─────────────────────────────────────────────
  const fileNodeAssignments: Array<{
    nodeId: string;
    file: string;
    dir: string;
  }> = [];
  const skipped: SkippedBuckets = {
    noOutputFile: [],
    rootLevelFiles: [],
    alreadyDeepNested: [],
    ambiguousFile: [],
  };
  const fileToNodeIds = new Map<string, string[]>();

  for (const n of nodes) {
    if (n.id === rootNodeId) continue;
    if (n.coordinates.branch !== branch) continue;
    // Skip nodes that we would treat as directory nodes themselves —
    // they're already part of the hierarchy under construction.
    if (existingDirNodes.byNodeId.has(n.id)) continue;

    const file = n.outputs?.files?.[0];
    if (typeof file !== "string" || file.length === 0) {
      skipped.noOutputFile.push(n.id);
      continue;
    }
    const normalised = path.posix.normalize(file);
    const dir = path.posix.dirname(normalised);
    if (dir === "." || dir === "/") {
      skipped.rootLevelFiles.push(n.id);
      continue;
    }
    let bucket = fileToNodeIds.get(normalised);
    if (!bucket) {
      bucket = [];
      fileToNodeIds.set(normalised, bucket);
    }
    bucket.push(n.id);
    fileNodeAssignments.push({ nodeId: n.id, file: normalised, dir });
  }

  // Detect ambiguous files (multiple nodes claim the same path). Keep
  // the lexicographically smallest id, skip the rest.
  const ambiguousFileIds = new Set<string>();
  for (const [file, ids] of fileToNodeIds) {
    if (ids.length <= 1) continue;
    ids.sort();
    skipped.ambiguousFile.push({ file, nodeIds: [...ids] });
    for (let i = 1; i < ids.length; i++) ambiguousFileIds.add(ids[i]!);
  }
  skipped.ambiguousFile.sort((a, b) => a.file.localeCompare(b.file));

  // Filter out the duplicates we just decided to skip.
  const filteredAssignments = fileNodeAssignments.filter(
    (a) => !ambiguousFileIds.has(a.nodeId),
  );

  // Detect deeply-parented files (parented under a non-root, non-directory
  // node). The hierarchizer refuses to override these.
  const validAssignments: typeof filteredAssignments = [];
  for (const a of filteredAssignments) {
    const fileNode = nodeById.get(a.nodeId)!;
    const currentParentId = fileNode.graph.parentId;
    if (
      currentParentId !== null &&
      currentParentId !== rootNodeId &&
      !existingDirNodes.byNodeId.has(currentParentId)
    ) {
      skipped.alreadyDeepNested.push({
        nodeId: a.nodeId,
        currentParentId,
      });
      continue;
    }
    validAssignments.push(a);
  }

  // ── 2. Collect the set of directory paths needed ───────────────────────
  // For each valid file assignment, add every prefix of its dir to the set.
  const neededPaths = new Set<string>();
  for (const a of validAssignments) {
    for (const ancestor of enumeratePathAncestors(a.dir)) {
      neededPaths.add(ancestor);
    }
  }

  // ── 3. Decide create vs reuse per path ─────────────────────────────────
  const directoriesToCreate: ProposedDirectoryNode[] = [];
  const directoriesReused: ReusedDirectoryNode[] = [];
  // Path → node id (real or synthetic) of the directory node that will
  // represent it after the plan applies. Used to fill `newParentNodeId`
  // on reparenting actions and to wire up parent links between new
  // directories.
  const pathToNodeId = new Map<string, string>();

  const sortedPaths = Array.from(neededPaths).sort();
  // First pass: register reused nodes so subsequent create steps can
  // point to them as parents when applicable.
  for (const p of sortedPaths) {
    const existing = existingDirNodes.byPath.get(p);
    if (existing) {
      directoriesReused.push({ path: p, nodeId: existing });
      pathToNodeId.set(p, existing);
    }
  }
  // Second pass: build creation proposals for paths without a reuse.
  // Iterate in shallow-first order so each new directory's parent already
  // has an id registered.
  const shallowFirst = [...sortedPaths].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
  for (const p of shallowFirst) {
    if (pathToNodeId.has(p)) continue; // reused
    const parentPath = parentDirOf(p);
    const parentNodeId =
      parentPath === null
        ? (rootNodeId ?? "")
        : (pathToNodeId.get(parentPath) ?? (rootNodeId ?? ""));
    const proposed: ProposedDirectoryNode = {
      proposedNodeId: syntheticIdForPath(p),
      path: p,
      label: p,
      parentPath,
      parentNodeId,
      abstraction: pickAbstraction(p),
      kind: DIRECTORY_NODE_KIND,
      provides: [`${PATH_PROVIDES_PREFIX}${p}`],
    };
    directoriesToCreate.push(proposed);
    pathToNodeId.set(p, proposed.proposedNodeId);
  }
  directoriesToCreate.sort(byPathDepthThenPath);
  directoriesReused.sort((a, b) => a.path.localeCompare(b.path));

  // ── 4. Compute reparenting actions ─────────────────────────────────────
  const reparentings: ReparentingAction[] = [];
  for (const a of validAssignments) {
    const parentNodeId = pathToNodeId.get(a.dir);
    if (parentNodeId === undefined) continue; // defensive
    const node = nodeById.get(a.nodeId)!;
    reparentings.push({
      nodeId: a.nodeId,
      file: a.file,
      currentParentId: node.graph.parentId,
      newParentPath: a.dir,
      newParentNodeId: parentNodeId,
    });
  }
  reparentings.sort((x, y) => x.nodeId.localeCompare(y.nodeId));

  skipped.noOutputFile.sort();
  skipped.rootLevelFiles.sort();
  skipped.alreadyDeepNested.sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  // ── 5. Before / after metric snapshots ─────────────────────────────────
  const beforeMetrics = computeHierarchyMetrics({
    nodes,
    edges,
    rootNodeId,
    topN,
  });
  const afterNodes = applyPlanVirtually({
    nodes,
    rootNodeId,
    branch,
    directoriesToCreate,
    reparentings,
  });
  const afterMetrics = computeHierarchyMetrics({
    nodes: afterNodes,
    edges,
    rootNodeId,
    topN,
  });

  // ── 6. Proposal capability declaration ─────────────────────────────────
  // Both kinds are now expressible: `node_create` for directoriesToCreate
  // and the schema-1.2 `node_update_parent` for reparentings. The
  // `--create-proposals` wiring is the remaining piece — proposals must
  // be emitted in topological order so each directory's parentHash is
  // captured against its already-existing parent, and reparentings only
  // emit after all directories they target have been applied.
  const proposalCapability: ProposalCapability = {
    canCreateDirectories: true,
    canReparentExistingNodes: true,
    blockedBy: [],
  };

  return {
    schemaVersion: HIERARCHIZER_PLAN_SCHEMA_VERSION,
    branch,
    rootNodeId,
    directoriesToCreate,
    directoriesReused,
    reparentings,
    skipped,
    before: snapshot(beforeMetrics),
    after: snapshot(afterMetrics),
    proposalCapability,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function resolveRoot(
  override: string | null | undefined,
  nodes: OntologyNode[],
): { rootNodeId: string | null } {
  if (override !== undefined && override !== null) {
    if (nodes.some((n) => n.id === override)) return { rootNodeId: override };
  }
  const parentless = nodes.filter((n) => n.graph.parentId === null);
  if (parentless.length === 1) return { rootNodeId: parentless[0]!.id };
  return { rootNodeId: null };
}

function deriveDefaultBranch(
  rootNodeId: string | null,
  nodes: OntologyNode[],
): string {
  if (rootNodeId !== null) {
    const root = nodes.find((n) => n.id === rootNodeId);
    if (root) return root.coordinates.branch;
  }
  return "main";
}

interface ExistingDirIndex {
  byPath: Map<string, string>;
  byNodeId: Map<string, string>;
}

function indexExistingDirectoryNodes(
  nodes: OntologyNode[],
  branch: string,
): ExistingDirIndex {
  // A node represents a directory if it carries a provides entry
  // `path:<dir>` (the convention this hierarchizer would create) OR if
  // it has no `outputs.files[0]` AND its label is a slash-bearing posix
  // path (a softer fallback covering hand-authored directory nodes from
  // before the convention existed).
  const byPath = new Map<string, string>();
  const byNodeId = new Map<string, string>();
  for (const n of nodes) {
    if (n.coordinates.branch !== branch) continue;
    const provides = n.context?.provides ?? [];
    let dirPath: string | null = null;
    for (const p of provides) {
      if (p.key.startsWith(PATH_PROVIDES_PREFIX)) {
        dirPath = p.key.slice(PATH_PROVIDES_PREFIX.length);
        break;
      }
    }
    if (dirPath === null) {
      const file = n.outputs?.files?.[0];
      const hasFile = typeof file === "string" && file.length > 0;
      // Fallback: only treat label-as-path when the node has no file —
      // a file node coincidentally labelled `src/foo` is still a file.
      if (!hasFile && /\//.test(n.label) && !/\s/.test(n.label)) {
        dirPath = path.posix.normalize(n.label);
      }
    }
    if (dirPath === null) continue;
    const normalised = path.posix.normalize(dirPath);
    if (!byPath.has(normalised)) byPath.set(normalised, n.id);
    byNodeId.set(n.id, normalised);
  }
  return { byPath, byNodeId };
}

function enumeratePathAncestors(dir: string): string[] {
  const segments = dir.split("/").filter((s) => s.length > 0);
  const out: string[] = [];
  for (let i = 1; i <= segments.length; i++) {
    out.push(segments.slice(0, i).join("/"));
  }
  return out;
}

function parentDirOf(p: string): string | null {
  if (!p.includes("/")) return null;
  const cut = p.lastIndexOf("/");
  return p.slice(0, cut);
}

function syntheticIdForPath(p: string): string {
  // Replace any non-[A-Za-z0-9_] with `_` so the id stays valid for any
  // consumer that pattern-matches on the suffix. Collapses adjacent
  // separators to a single underscore for readability.
  return `${SYNTHETIC_ID_PREFIX}${p.replace(/[^A-Za-z0-9]+/g, "_")}`;
}

// Abstraction level mapping. The depth-from-top mirrors the natural
// architecture → domain → workflow → unit progression in
// AbstractionLevelSchema. We deliberately do not descend to `interface`
// or `unit` — those are reserved for the file/symbol leaves the file
// nodes themselves represent.
function pickAbstraction(p: string): AbstractionLevel {
  const depth = p.split("/").length;
  if (depth <= 1) return "architecture";
  if (depth === 2) return "domain";
  return "workflow";
}

function byPathDepthThenPath(
  a: ProposedDirectoryNode,
  b: ProposedDirectoryNode,
): number {
  const da = a.path.split("/").length;
  const db = b.path.split("/").length;
  if (da !== db) return da - db;
  return a.path.localeCompare(b.path);
}

// Virtually apply the plan: produce a node list where the proposed
// directory nodes are appended and the reparenting actions have been
// honoured. The result is fed back into `computeHierarchyMetrics` to
// build the `after` snapshot. We never mutate input nodes — every
// changed node is cloned.
function applyPlanVirtually(args: {
  nodes: OntologyNode[];
  rootNodeId: string | null;
  branch: string;
  directoriesToCreate: ProposedDirectoryNode[];
  reparentings: ReparentingAction[];
}): OntologyNode[] {
  const { nodes, rootNodeId, branch, directoriesToCreate, reparentings } = args;
  const reparentMap = new Map<string, string>();
  for (const r of reparentings) reparentMap.set(r.nodeId, r.newParentNodeId);

  // Pick a starting time for new nodes that does not collide with
  // existing ones; ordering is otherwise arbitrary.
  let nextTime = 0;
  for (const n of nodes) {
    if (n.coordinates.time >= nextTime) nextTime = n.coordinates.time + 1;
  }

  const out: OntologyNode[] = nodes.map((n) => {
    const reparentTo = reparentMap.get(n.id);
    if (reparentTo === undefined) return n;
    return {
      ...n,
      graph: { ...n.graph, parentId: reparentTo },
    };
  });

  for (const dir of directoriesToCreate) {
    out.push(buildPreviewDirectoryNode(dir, branch, rootNodeId, nextTime++));
  }
  return out;
}

function buildPreviewDirectoryNode(
  dir: ProposedDirectoryNode,
  branch: string,
  rootNodeId: string | null,
  time: number,
): OntologyNode {
  return {
    id: dir.proposedNodeId,
    label: dir.label,
    kind: dir.kind,
    status: "draft",
    coordinates: {
      abstraction: dir.abstraction,
      time,
      branch,
      plane: "semantic",
      manifestation: "intent",
    },
    inputs: [],
    prompt: {
      raw: "",
      variables: {},
      language: "es",
    },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: {
      requires: [],
      provides: dir.provides.map((key) => ({
        key,
        nodeType: dir.kind,
      })),
      forbids: [],
      optional: [],
    },
    graph: {
      parentId: dir.parentNodeId === "" ? rootNodeId : dir.parentNodeId,
      orbitOf: null,
    },
    rules: [],
    technical: {},
    outputs: { files: [] },
    validation: { errors: [], warnings: [] },
    integrity: {
      frozen: false,
      hash: `preview:${dir.proposedNodeId}`,
      schemaVersion: "0.1.0",
    },
  } as OntologyNode;
}

function snapshot(m: HierarchyMetrics): HierarchyMetricsSnapshot {
  return {
    nodeCount: m.topology.nodeCount,
    edgeCount: m.topology.edgeCount,
    maxDepth: m.topology.maxDepth,
    averageDepth: m.topology.averageDepth,
    directChildrenOfRoot: m.parents.directChildrenOfRoot,
    nonRootDirectChildrenOfRootRatio:
      m.flatness.nonRootDirectChildrenOfRootRatio,
    isolatedNodeRatio: m.flatness.isolatedNodeRatio,
    verdict: m.flatness.verdict,
    closedWorldGlobalSatisfactionRatio:
      m.contracts.closedWorldGlobalSatisfaction.ratio,
    closedWorldContextReachableSatisfactionRatio:
      m.contracts.closedWorldContextReachableSatisfaction.ratio,
    pathBucketCount: m.pathFibers.bucketCount,
  };
}
