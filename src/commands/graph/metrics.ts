import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  computeHierarchyMetrics,
  summariseFlatness,
  type HierarchyMetrics,
} from "../../runtime/graph/hierarchy-metrics.js";
import { loadEdges, loadNodes, loadState } from "../../core/project/load.js";
import {
  OntologyEdgeSchema,
  OntologyNodeSchema,
  OntologyStateSchema,
  type OntologyEdge,
  type OntologyNode,
} from "../../schemas/ontology.js";

export interface GraphMetricsOptions {
  json?: boolean;
  ontologyDir?: string;
}

// `onto graph metrics` — read-only baseline report over the typed graph.
// Surfaces the signals that tell you whether the network is structurally
// rich enough for the walker and assembler to do useful work, or whether
// it has collapsed into a flat bag of canon-children. Pure: no LLM, no
// mutation, no proposal writes. The metrics module does the work; this
// command is a loader + presenter.
export async function graphMetricsCommand(
  options: GraphMetricsOptions,
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

  const metrics = computeHierarchyMetrics({
    nodes,
    edges,
    rootNodeId,
  });

  if (options.json) {
    console.log(
      JSON.stringify({ source: sourceLabel, metrics }, null, 2),
    );
    return;
  }

  renderHuman(sourceLabel, metrics);
}

// Loads an ontology snapshot from an explicit directory (the one that
// holds `nodes/`, `edges.jsonl`, `state.json` directly). This is the
// `--ontology-dir` escape hatch used to score archived self-ingest results
// like `.ontology.self-ingest-gamma-result` without renaming them or
// touching the active `.ontology` for the cwd.
function loadFromOntologyDir(dir: string): {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  rootNodeId: string | null;
} {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

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
          .map((i) => `${i.path.join(".")}: ${i.message}`)
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

  // state.json is optional under --ontology-dir. When absent (or
  // malformed) we fall back to auto-detect from `parentId === null`.
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

function renderHuman(sourceLabel: string, metrics: HierarchyMetrics): void {
  const t = metrics.topology;
  const c = metrics.contracts;
  const f = metrics.flatness;

  console.log(`=== ONTOLOGY GRAPH METRICS ===`);
  console.log(`Source:    ${sourceLabel}`);
  console.log(
    `Root:      ${metrics.rootNodeId ?? "(none)"}  [${metrics.rootDetection}]`,
  );
  console.log(``);

  console.log(`Topology`);
  console.log(`  nodes:          ${t.nodeCount}`);
  console.log(`  edges:          ${t.edgeCount}`);
  console.log(`  maxDepth:       ${t.maxDepth}`);
  console.log(`  averageDepth:   ${formatNumber(t.averageDepth)}`);
  console.log(
    `  dangling parents: ${t.danglingParentCount}    parentless non-root: ${t.parentlessNonRootCount}    unreachable: ${t.unreachableFromRootCount}`,
  );
  const depthEntries = Object.entries(t.depthDistribution)
    .map(([d, n]) => [Number(d), n] as const)
    .sort((a, b) => a[0] - b[0]);
  if (depthEntries.length > 0) {
    console.log(`  depth distribution:`);
    for (const [d, n] of depthEntries) {
      console.log(`    depth ${d}: ${n}`);
    }
  }
  console.log(``);

  console.log(`Abstraction`);
  const abstractionEntries = Object.entries(metrics.abstractionDistribution)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [level, count] of abstractionEntries) {
    console.log(`  ${level.padEnd(14)} ${count}`);
  }
  console.log(``);

  console.log(`Parents`);
  console.log(`  direct children of root: ${metrics.parents.directChildrenOfRoot}`);
  if (metrics.parents.topByChildCount.length > 0) {
    console.log(`  top parents by child count:`);
    for (const entry of metrics.parents.topByChildCount) {
      console.log(`    ${entry.nodeId}  (${entry.childCount} children)`);
    }
  }
  const histEntries = Object.entries(metrics.parents.histogram)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  if (histEntries.length > 0) {
    console.log(`  histogram (childCount → #parents):`);
    for (const [k, v] of histEntries) {
      console.log(`    ${k}: ${v}`);
    }
  }
  console.log(``);

  console.log(`Edges`);
  console.log(`  averagePerNode:  ${formatNumber(metrics.edges.averagePerNode)}`);
  console.log(`  isolated nodes:  ${metrics.edges.isolatedNodeCount}`);
  console.log(
    `  nodes with outgoing: ${metrics.edges.nodesWithOutgoing}    nodes with incoming: ${metrics.edges.nodesWithIncoming}`,
  );
  const edgeTypeEntries = Object.entries(metrics.edges.byType).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (edgeTypeEntries.length > 0) {
    console.log(`  by type:`);
    for (const [type, n] of edgeTypeEntries) {
      console.log(`    ${type.padEnd(20)} ${n}`);
    }
  } else {
    console.log(`  by type: (no edges)`);
  }
  console.log(``);

  console.log(`Contracts`);
  console.log(
    `  requires:  ${c.totalRequires} (${c.nodesWithRequires} nodes, ${c.distinctRequireSources} distinct sources)`,
  );
  console.log(
    `  provides:  ${c.totalProvides} (${c.nodesWithProvides} nodes, ${c.distinctProvideKeys} distinct keys)`,
  );
  console.log(`  forbids:   ${c.totalForbids}`);
  renderSatisfaction(`globalSatisfaction`, c.globalSatisfaction);
  renderSatisfaction(`contextReachableSatisfaction`, c.contextReachableSatisfaction);
  console.log(``);

  console.log(`Require classification`);
  console.log(
    `  internal_symbol:                ${c.closedWorldRequireCount}`,
  );
  console.log(
    `  internal_path_vocab_mismatch:   ${c.internalPathMismatchRequireCount}`,
  );
  console.log(
    `  open_world:                     ${c.openWorldRequireCount}`,
  );
  console.log(
    `  unknown:                        ${c.unknownRequireCount}`,
  );
  renderSatisfaction(
    `closedWorldGlobalSatisfaction`,
    c.closedWorldGlobalSatisfaction,
  );
  renderSatisfaction(
    `closedWorldContextReachableSatisfaction`,
    c.closedWorldContextReachableSatisfaction,
  );
  if (c.topClosedWorldUnreachableRequires.length > 0) {
    console.log(`  top closed-world unreachable:`);
    for (const entry of c.topClosedWorldUnreachableRequires) {
      console.log(
        `    ${entry.source.padEnd(40)} consumers=${entry.consumers}`,
      );
    }
  }
  if (c.topOpenWorldRequires.length > 0) {
    console.log(`  top open-world requires:`);
    for (const entry of c.topOpenWorldRequires) {
      console.log(
        `    ${entry.source.padEnd(40)} consumers=${entry.consumers}`,
      );
    }
  }
  if (c.topInternalPathVocabMismatches.length > 0) {
    console.log(`  top internal path vocab mismatches:`);
    for (const entry of c.topInternalPathVocabMismatches) {
      const resolved = entry.resolvedNodeId ?? "(unresolved)";
      console.log(
        `    ${entry.source.padEnd(40)} consumers=${entry.consumers}  → ${resolved}`,
      );
    }
  }
  console.log(``);

  console.log(`Path fibers`);
  console.log(`  buckets:          ${metrics.pathFibers.bucketCount}`);
  console.log(`  nodes w/o file:   ${metrics.pathFibers.nodesWithoutFile}`);
  if (metrics.pathFibers.topBuckets.length > 0) {
    console.log(`  top buckets:`);
    for (const entry of metrics.pathFibers.topBuckets) {
      console.log(
        `    ${entry.bucket.padEnd(40)} nodes=${entry.nodeCount}  avgDepth=${formatNumber(entry.averageDepth)}`,
      );
    }
  }
  console.log(``);

  console.log(`Flatness`);
  console.log(`  verdict:                            ${f.verdict.toUpperCase()}`);
  console.log(
    `  nonRootDirectChildrenOfRoot:        ${f.nonRootDirectChildrenOfRoot}`,
  );
  console.log(
    `  nonRootDirectChildrenOfRootRatio:   ${formatNumber(f.nonRootDirectChildrenOfRootRatio)}`,
  );
  console.log(`  maxDepth:                           ${f.maxDepth}`);
  console.log(`  edgeCount:                          ${f.edgeCount}`);
  console.log(
    `  isolatedNodeRatio:                  ${formatNumber(f.isolatedNodeRatio)}`,
  );
  console.log(`  contractTokenCount:                 ${f.contractTokenCount}`);
  console.log(``);
  console.log(`Summary: ${summariseFlatness(metrics)}`);
}

function renderSatisfaction(
  label: string,
  s: { satisfied: number; unsatisfied: number; ratio: number; topUnsatisfied: Array<{ source: string; consumers: number }> },
): void {
  const total = s.satisfied + s.unsatisfied;
  console.log(
    `  ${label}: ${s.satisfied}/${total} (${formatNumber(s.ratio)})`,
  );
  if (s.topUnsatisfied.length > 0) {
    console.log(`    top unsatisfied:`);
    for (const entry of s.topUnsatisfied) {
      console.log(
        `      ${entry.source.padEnd(40)} consumers=${entry.consumers}`,
      );
    }
  }
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(3);
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
