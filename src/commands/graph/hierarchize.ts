import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  planHierarchization,
  type HierarchizerPlan,
} from "../../kernel/graph/hierarchizer.js";
import { loadEdges, loadNodes, loadState } from "../../kernel/core/project/load.js";
import {
  OntologyEdgeSchema,
  OntologyNodeSchema,
  OntologyStateSchema,
  type OntologyEdge,
  type OntologyNode,
} from "../../kernel/schemas/ontology.js";

export interface GraphHierarchizeOptions {
  json?: boolean;
  ontologyDir?: string;
}

// `onto graph hierarchize` — preview-only deterministic planner.
//
// Reads the active ontology (or a directory passed via --ontology-dir) and
// produces the hierarchization plan that would promote `outputs.files[0]`
// directory structure into first-class intermediate nodes. The CLI never
// mutates the graph; the planner is read-only and the proposal system
// currently lacks a reparent mutation kind (see the plan's
// `proposalCapability.blockedBy`). When that schema extension lands, a
// future revision of this command can add `--create-proposals`.
export async function graphHierarchizeCommand(
  options: GraphHierarchizeOptions,
): Promise<void> {
  let nodes: OntologyNode[];
  let edges: OntologyEdge[];
  let rootNodeId: string | null = null;
  let sourceLabel: string;

  try {
    if (options.ontologyDir) {
      const dir = path.resolve(options.ontologyDir);
      const loaded = loadFromOntologyDir(dir);
      nodes = loaded.nodes;
      edges = loaded.edges;
      rootNodeId = loaded.rootNodeId;
      sourceLabel = dir;
    } else {
      const state = loadState();
      nodes = loadNodes();
      edges = loadEdges();
      rootNodeId = state.rootNodeId;
      sourceLabel = path.join(process.cwd(), ".ontology");
    }
  } catch (err: unknown) {
    failWith(
      `Failed to load ontology: ${err instanceof Error ? err.message : String(err)}`,
      options.json,
    );
    return;
  }

  const plan = planHierarchization({ nodes, edges, rootNodeId });

  if (options.json) {
    console.log(JSON.stringify({ source: sourceLabel, plan }, null, 2));
    return;
  }

  renderHuman(sourceLabel, plan);
}

// Direct loader for arbitrary ontology directories. Mirrors the helper in
// `metrics.ts`; not extracted to a shared loader yet because the two
// commands are the only consumers and a third use-case would clarify the
// right shape of a refactor.
function loadFromOntologyDir(dir: string): {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  rootNodeId: string | null;
} {
  if (!fs.existsSync(dir)) throw new Error(`Directory not found: ${dir}`);
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${dir}`);

  const nodesDir = path.join(dir, "nodes");
  if (!fs.existsSync(nodesDir)) {
    throw new Error(`Missing nodes/ inside ${dir}`);
  }

  const nodes: OntologyNode[] = [];
  const files = fs
    .readdirSync(nodesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of files) {
    const fullPath = path.join(nodesDir, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      nodes.push(OntologyNodeSchema.parse(parsed));
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const summary = err.issues
          .slice(0, 3)
          .map((it) => `${it.path.join(".")}: ${it.message}`)
          .join(", ");
        throw new Error(`Failed to parse node ${file}: ${summary}`);
      }
      throw new Error(
        `Failed to parse node ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const edges: OntologyEdge[] = [];
  const edgesPath = path.join(dir, "edges.jsonl");
  if (fs.existsSync(edgesPath)) {
    const content = fs.readFileSync(edgesPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (!trimmed) continue;
      try {
        edges.push(OntologyEdgeSchema.parse(JSON.parse(trimmed)));
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          const summary = err.issues
            .slice(0, 3)
            .map((it) => `${it.path.join(".")}: ${it.message}`)
            .join(", ");
          throw new Error(
            `Failed to parse edge on line ${i + 1} of edges.jsonl: ${summary}`,
          );
        }
        throw new Error(
          `Failed to parse edge on line ${i + 1} of edges.jsonl: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  let rootNodeId: string | null = null;
  const statePath = path.join(dir, "state.json");
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      const state = OntologyStateSchema.parse(parsed);
      rootNodeId = state.rootNodeId;
    } catch {
      rootNodeId = null;
    }
  }

  return { nodes, edges, rootNodeId };
}

function renderHuman(sourceLabel: string, plan: HierarchizerPlan): void {
  console.log(`=== ONTOLOGY GRAPH HIERARCHIZE (preview) ===`);
  console.log(`Source:    ${sourceLabel}`);
  console.log(`Branch:    ${plan.branch}`);
  console.log(`Root:      ${plan.rootNodeId ?? "(none)"}`);
  console.log(``);

  console.log(`Before / after metric snapshots`);
  renderSnapshotRow("nodes", plan.before.nodeCount, plan.after.nodeCount);
  renderSnapshotRow("edges", plan.before.edgeCount, plan.after.edgeCount);
  renderSnapshotRow("maxDepth", plan.before.maxDepth, plan.after.maxDepth);
  renderSnapshotRow(
    "averageDepth",
    formatNumber(plan.before.averageDepth),
    formatNumber(plan.after.averageDepth),
  );
  renderSnapshotRow(
    "directChildrenOfRoot",
    plan.before.directChildrenOfRoot,
    plan.after.directChildrenOfRoot,
  );
  renderSnapshotRow(
    "directChildrenRatio",
    formatNumber(plan.before.nonRootDirectChildrenOfRootRatio),
    formatNumber(plan.after.nonRootDirectChildrenOfRootRatio),
  );
  renderSnapshotRow(
    "isolatedNodeRatio",
    formatNumber(plan.before.isolatedNodeRatio),
    formatNumber(plan.after.isolatedNodeRatio),
  );
  renderSnapshotRow("verdict", plan.before.verdict, plan.after.verdict);
  renderSnapshotRow(
    "closedWorldGlobalSatisfaction",
    formatNumber(plan.before.closedWorldGlobalSatisfactionRatio),
    formatNumber(plan.after.closedWorldGlobalSatisfactionRatio),
  );
  renderSnapshotRow(
    "closedWorldContextReachableSatisfaction (brújula)",
    formatNumber(plan.before.closedWorldContextReachableSatisfactionRatio),
    formatNumber(plan.after.closedWorldContextReachableSatisfactionRatio),
  );
  renderSnapshotRow(
    "pathBucketCount",
    plan.before.pathBucketCount,
    plan.after.pathBucketCount,
  );
  console.log(``);

  console.log(
    `Directories to create: ${plan.directoriesToCreate.length}  (top-down apply order)`,
  );
  for (const dir of plan.directoriesToCreate) {
    console.log(
      `  + ${dir.path.padEnd(40)} kind=${dir.kind}  abstraction=${dir.abstraction}  parent=${shortenId(dir.parentNodeId)}`,
    );
  }
  console.log(``);

  console.log(`Directories reused: ${plan.directoriesReused.length}`);
  for (const dir of plan.directoriesReused) {
    console.log(`  = ${dir.path.padEnd(40)} → ${dir.nodeId}`);
  }
  console.log(``);

  console.log(`Reparenting actions: ${plan.reparentings.length}`);
  for (const r of plan.reparentings.slice(0, 20)) {
    console.log(
      `  ${r.nodeId.padEnd(24)} ${shortenId(r.currentParentId ?? "-").padEnd(24)} → ${shortenId(r.newParentNodeId)} (${r.newParentPath})`,
    );
  }
  if (plan.reparentings.length > 20) {
    console.log(`  … ${plan.reparentings.length - 20} more`);
  }
  console.log(``);

  console.log(`Skipped`);
  console.log(`  noOutputFile:      ${plan.skipped.noOutputFile.length}`);
  console.log(`  rootLevelFiles:    ${plan.skipped.rootLevelFiles.length}`);
  console.log(`  alreadyDeepNested: ${plan.skipped.alreadyDeepNested.length}`);
  console.log(`  ambiguousFile:     ${plan.skipped.ambiguousFile.length}`);
  console.log(``);

  console.log(`Proposal capability`);
  console.log(
    `  canCreateDirectories:     ${plan.proposalCapability.canCreateDirectories}`,
  );
  console.log(
    `  canReparentExistingNodes: ${plan.proposalCapability.canReparentExistingNodes}`,
  );
  if (plan.proposalCapability.blockedBy.length > 0) {
    console.log(`  blockedBy:`);
    for (const reason of plan.proposalCapability.blockedBy) {
      console.log(`    - ${reason}`);
    }
  }
}

function renderSnapshotRow(
  label: string,
  before: number | string,
  after: number | string,
): void {
  console.log(
    `  ${label.padEnd(52)} ${String(before).padStart(8)}  →  ${after}`,
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(3);
}

// Long node ids dominate the column width; we trim to the first 24
// characters for readability. The JSON output (which is the canonical
// machine-readable surface) keeps the full ids.
function shortenId(id: string): string {
  if (id.length <= 24) return id;
  return id.slice(0, 21) + "…";
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
