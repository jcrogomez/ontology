import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  evaluateReadiness,
  type ReadinessReport,
} from "../../kernel/graph/readiness.js";
import { loadEdges, loadNodes, loadState } from "../../kernel/core/project/load.js";
import {
  OntologyEdgeSchema,
  OntologyNodeSchema,
  OntologyStateSchema,
  type OntologyEdge,
  type OntologyNode,
} from "../../kernel/schemas/ontology.js";

export interface GraphReadinessOptions {
  json?: boolean;
  ontologyDir?: string;
}

// `onto graph readiness` — structural-readiness gate.
//
// Read-only. Evaluates three rules on top of `computeHierarchyMetrics`
// (see src/runtime/graph/readiness.ts for the rule list and rationale).
// Exit code is 0 when every rule passes, 1 when any rule fails. The
// gate is meant to be used in CI / pre-merge checks and as a self-
// validation step after an ingest sweep.
export async function graphReadinessCommand(
  options: GraphReadinessOptions,
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
    fail(
      `Failed to load ontology: ${err instanceof Error ? err.message : String(err)}`,
      options.json,
    );
    return;
  }

  const report = evaluateReadiness({ nodes, edges, rootNodeId });

  if (options.json) {
    console.log(
      JSON.stringify({ source: sourceLabel, report }, null, 2),
    );
    if (!report.ok) process.exit(1);
    return;
  }

  renderHuman(sourceLabel, report);
  if (!report.ok) process.exit(1);
}

// Direct ontology-dir loader. Same shape as the helpers in
// commands/graph/metrics.ts and commands/graph/infer-edges.ts; not
// extracted to a shared loader yet because the fourth consumer would
// clarify the right contract.
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
  const nodeFiles = fs
    .readdirSync(nodesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of nodeFiles) {
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

function renderHuman(sourceLabel: string, report: ReadinessReport): void {
  console.log(`=== ONTOLOGY GRAPH READINESS ===`);
  console.log(`Source:    ${sourceLabel}`);
  console.log(``);

  const s = report.snapshot;
  console.log(`Snapshot`);
  console.log(`  nodeCount:                                       ${s.nodeCount}`);
  console.log(`  edgeCount:                                       ${s.edgeCount}`);
  console.log(
    `  closedWorldRequireCount:                         ${s.closedWorldRequireCount}`,
  );
  console.log(
    `  closedWorldGlobalSatisfaction:                   ${formatNum(s.closedWorldGlobalSatisfactionRatio)}`,
  );
  console.log(
    `  closedWorldContextReachableSatisfaction:         ${formatNum(s.closedWorldContextReachableSatisfactionRatio)}`,
  );
  console.log(
    `  nonRootDirectChildrenOfRootRatio:                ${formatNum(s.nonRootDirectChildrenOfRootRatio)}`,
  );
  console.log(`  flatness verdict:                                ${s.verdict}`);
  console.log(``);

  if (report.ok) {
    console.log(`✓ Structural readiness: PASS — every rule clear.`);
    return;
  }

  console.log(`✖ Structural readiness: FAIL — ${report.findings.length} rule(s) tripped.`);
  for (const f of report.findings) {
    console.log(``);
    console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}`);
    console.log(`    ${f.message}`);
    console.log(`    signals:`);
    for (const [k, v] of Object.entries(f.signals)) {
      console.log(`      ${k.padEnd(48)} ${typeof v === "number" ? formatNum(v) : v}`);
    }
    console.log(`    remedy: ${f.remedy}`);
  }
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(3);
}

function fail(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
