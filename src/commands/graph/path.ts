import { loadEdges, loadNodeById } from "../../core/project/load.js";
import { findShortestPath } from "../../runtime/graph/traversal.js";
import type { OntologyEdge } from "../../schemas/ontology.js";
import { parseEdgeTypes } from "./neighbors.js";

export interface GraphPathOptions {
  type?: string;          // comma-separated edge types
  maxDepth?: string;      // string from CLI; parsed below
  json?: boolean;
}

// Finds the shortest directed path between two nodes using BFS over outgoing
// edges. Read-only.
export async function graphPathCommand(fromId: string, toId: string, options: GraphPathOptions): Promise<void> {
  if (fromId === toId) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, from: fromId, to: toId, path: [], hops: 0 }, null, 2));
    } else {
      console.log(`=== ONTOLOGY GRAPH PATH ===`);
      console.log(`From: ${fromId}`);
      console.log(`To:   ${toId}`);
      console.log(`Hops: 0 (same node)`);
    }
    return;
  }

  if (!loadNodeById(fromId)) {
    failWith(`Source node not found: ${fromId}`, options.json);
    return;
  }
  if (!loadNodeById(toId)) {
    failWith(`Target node not found: ${toId}`, options.json);
    return;
  }

  let edgeTypes: OntologyEdge["type"][] | undefined;
  if (options.type) {
    const parsed = parseEdgeTypes(options.type, options.json);
    if (!parsed) return;
    edgeTypes = parsed;
  }

  let maxDepth = 10;
  if (options.maxDepth !== undefined) {
    const n = parseInt(options.maxDepth, 10);
    if (Number.isNaN(n) || n < 0) {
      failWith(`Invalid --max-depth: ${options.maxDepth}. Expected a non-negative integer.`, options.json);
      return;
    }
    maxDepth = n;
  }

  const edges = loadEdges();
  const path = findShortestPath(fromId, toId, edges, { edgeTypes, maxDepth });

  if (path === null) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, from: fromId, to: toId, path: null, hops: null }, null, 2));
    } else {
      console.log(`=== ONTOLOGY GRAPH PATH ===`);
      console.log(`From: ${fromId}`);
      console.log(`To:   ${toId}`);
      console.log(`(no path found within ${maxDepth} hops)`);
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      from: fromId,
      to: toId,
      hops: path.length,
      path: path.map(e => ({ edgeId: e.edgeId, type: e.type, from: e.from, to: e.to })),
    }, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY GRAPH PATH ===`);
  console.log(`From: ${fromId}`);
  console.log(`To:   ${toId}`);
  console.log(`Hops: ${path.length}`);
  console.log("");
  // Render the path as a chain so the human reader can trace each hop.
  let cursor = fromId;
  for (const e of path) {
    console.log(`  ${cursor}  --[${e.type}]-->  ${e.to}`);
    cursor = e.to;
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
