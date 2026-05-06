import { loadEdges, loadNodeById } from "../../core/project/load.js";
import { EdgeTypeSchema, type OntologyEdge } from "../../schemas/ontology.js";
import { getNeighbors, type EdgeDirection } from "../../runtime/graph/traversal.js";

export interface GraphNeighborsOptions {
  type?: string;          // comma-separated edge types
  direction?: string;     // "in" | "out" | "both"
  json?: boolean;
}

// Lists direct neighbors of a focal node, with the edge type and direction
// surfaced for each. Read-only: no graph mutation, no LLM dispatch.
export async function graphNeighborsCommand(focalId: string, options: GraphNeighborsOptions): Promise<void> {
  const focal = loadNodeById(focalId);
  if (!focal) {
    failWith(`Node not found: ${focalId}`, options.json);
    return;
  }

  let edgeTypes: OntologyEdge["type"][] | undefined;
  if (options.type) {
    const parsed = parseEdgeTypes(options.type, options.json);
    if (!parsed) return;
    edgeTypes = parsed;
  }

  const direction = (options.direction ?? "both") as EdgeDirection;
  if (direction !== "in" && direction !== "out" && direction !== "both") {
    failWith(`Invalid --direction: ${options.direction}. Expected one of: in, out, both`, options.json);
    return;
  }

  const edges = loadEdges();
  const neighbors = getNeighbors(focalId, edges, { direction, edgeTypes });

  if (options.json) {
    console.log(JSON.stringify({
      focal: focalId,
      direction,
      neighbors: neighbors.map(n => ({
        nodeId: n.neighborId,
        edgeId: n.edge.edgeId,
        type: n.edge.type,
        direction: n.direction,
      })),
    }, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY GRAPH NEIGHBORS ===`);
  console.log(`Focal:     ${focalId}`);
  console.log(`Direction: ${direction}`);
  console.log(`Count:     ${neighbors.length}`);
  console.log("");
  if (neighbors.length === 0) {
    console.log("(no neighbors match the filter)");
    return;
  }
  for (const n of neighbors) {
    const arrow = n.direction === "out" ? "→" : "←";
    console.log(`  ${arrow} ${n.edge.type.padEnd(20)} ${n.neighborId}`);
  }
}

export function parseEdgeTypes(raw: string, json?: boolean): OntologyEdge["type"][] | null {
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  for (const t of list) {
    const parsed = EdgeTypeSchema.safeParse(t);
    if (!parsed.success) {
      failWith(`Invalid edge type: ${t}`, json);
      return null;
    }
  }
  return list as OntologyEdge["type"][];
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
