import { loadEdges, loadNodeById } from "../../kernel/core/project/load.js";
import { extractSubgraph } from "../../kernel/graph/traversal.js";
import type { OntologyEdge } from "../../kernel/schemas/ontology.js";
import { parseEdgeTypes } from "./neighbors.js";

export interface GraphSubgraphOptions {
  depth?: string;
  type?: string;
  json?: boolean;
}

// Extracts an undirected k-hop neighborhood around the focal node.
// Useful for "what's the local universe of this node?" queries and as the
// data source for Walker v1's expand views. Read-only.
export async function graphSubgraphCommand(focalId: string, options: GraphSubgraphOptions): Promise<void> {
  const focal = loadNodeById(focalId);
  if (!focal) {
    failWith(`Node not found: ${focalId}`, options.json);
    return;
  }

  let depth = 2;
  if (options.depth !== undefined) {
    const n = parseInt(options.depth, 10);
    if (Number.isNaN(n) || n < 0) {
      failWith(`Invalid --depth: ${options.depth}. Expected a non-negative integer.`, options.json);
      return;
    }
    depth = n;
  }

  let edgeTypes: OntologyEdge["type"][] | undefined;
  if (options.type) {
    const parsed = parseEdgeTypes(options.type, options.json);
    if (!parsed) return;
    edgeTypes = parsed;
  }

  const edges = loadEdges();
  const slice = extractSubgraph(focalId, edges, { depth, edgeTypes });

  if (options.json) {
    console.log(JSON.stringify({
      focal: focalId,
      depth,
      nodeIds: slice.nodeIds,
      edges: slice.edges.map(e => ({ edgeId: e.edgeId, type: e.type, from: e.from, to: e.to })),
    }, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY GRAPH SUBGRAPH ===`);
  console.log(`Focal:    ${focalId}`);
  console.log(`Depth:    ${depth}`);
  console.log(`Nodes:    ${slice.nodeIds.length}`);
  console.log(`Edges:    ${slice.edges.length}`);
  console.log("");
  console.log("Nodes:");
  for (const id of slice.nodeIds) {
    const marker = id === focalId ? "*" : " ";
    console.log(` ${marker} ${id}`);
  }
  if (slice.edges.length > 0) {
    console.log("");
    console.log("Edges:");
    for (const e of slice.edges) {
      console.log(`  ${e.from}  --[${e.type}]-->  ${e.to}`);
    }
  }
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
