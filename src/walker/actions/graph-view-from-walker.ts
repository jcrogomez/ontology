// Walker action: `:graph view [depth]` — render the focal node's local
// k-hop subgraph as a structured panel inside the walker.
//
// Why this exists. The walker today shows the focal cell plus a flat list
// of incident edges via `EdgesSection`. That is good for a single focal
// but loses the *shape* of the local universe — which neighbors are
// reached via which path, who's upstream of whom, what cluster the focal
// sits in. `:graph view` answers those questions inside the same surface
// (Ink, terminal-only) without forking the project into a web Studio.
//
// What it is NOT. We do not draw boxes-and-lines ASCII art. Force-directed
// layouts in a panel of bounded height degrade into hairballs at >50 nodes,
// and any 2D layout algorithm we'd ship is opinionated enough to be its
// own design decision. The render shape here is structural:
//
//   - a `focal` row (marked with ★),
//   - an `upstream` group (incoming edges, ordered by depth from the focal),
//   - a `downstream` group (outgoing edges, ordered by depth from the focal),
//   - a `lateral` bucket (nodes within the slice that are reachable from
//     neither in nor out of the focal — can happen when the slice closes
//     over a triangle whose third edge is sibling-of-sibling).
//
// All four buckets are derived from `extractSubgraph`'s undirected slice;
// the directional split is computed here so the renderer can show
// upstream-above / downstream-below without having to re-traverse.

import type { OntologyEdge, OntologyNode } from "../../schemas/ontology.js";
import { loadEdges, loadNodeById, loadNodes } from "../../core/project/load.js";
import { extractSubgraph } from "../../runtime/graph/traversal.js";

export interface GraphViewNodeRow {
  id: string;
  label: string;
  abstraction: OntologyNode["coordinates"]["abstraction"];
  kind: OntologyNode["kind"];
  // Hop distance from the focal in the undirected slice. Focal itself is 0.
  depth: number;
  // The edge that brought this node into the bucket (the one connecting it
  // to the previous-depth frontier). Null for the focal and for nodes that
  // were reached via more than one edge — in that case `connectingEdges`
  // carries them all.
  connectingEdges: Array<{
    type: OntologyEdge["type"];
    direction: "in" | "out";
    otherEnd: string;
  }>;
}

export interface GraphViewResult {
  ok: boolean;
  // Populated when ok=false.
  message?: string;
  // Populated when ok=true.
  focalId?: string;
  depth?: number;
  // Total node count in the slice (including focal). Reflects the BFS
  // slice size from extractSubgraph, not the renderable count — a node
  // that appears in the slice but fails to load shows up in totalNodes
  // and again in skippedNodeIds so the renderer can be honest about
  // both numbers.
  totalNodes?: number;
  totalEdges?: number;
  focal?: GraphViewNodeRow;
  upstream?: GraphViewNodeRow[];
  downstream?: GraphViewNodeRow[];
  lateral?: GraphViewNodeRow[];
  // Slice members whose JSON file failed to load. Sorted, deterministic.
  // The renderer surfaces these as a dim trailer line so the user knows
  // the panel reflects a partial view and which `onto validate` would
  // flag. Empty array on a healthy project.
  skippedNodeIds?: string[];
}

// Hard cap on rows the renderer is asked to draw. Beyond this the panel
// stops being inspectable; the helper returns the first N rows with the
// total count so the renderer can append "…and M more". 30 is roughly
// the height a brutalist info panel can show without scrolling.
const RENDER_CAP_PER_BUCKET = 15;

export interface GraphViewOptions {
  depth?: number;
  cwd?: string;
}

export function graphViewFromWalker(
  focalId: string,
  options: GraphViewOptions = {},
): GraphViewResult {
  const cwd = options.cwd;
  const depth = options.depth ?? 2;

  const focalNode = loadNodeById(focalId, cwd);
  if (!focalNode) {
    return { ok: false, message: `node not found: ${focalId}` };
  }

  const edges = loadEdges(cwd);
  const slice = extractSubgraph(focalId, edges, { depth });

  // Bucket every non-focal node into upstream / downstream / lateral by
  // looking at the path the BFS would take from the focal.
  // Strategy: do two directed BFS passes (in-only and out-only) to find
  // each node's first-touch direction; nodes that show up in neither are
  // lateral. We restrict edges to the slice so we never leak boundary
  // hops into the directional layout.
  const sliceNodeIds = new Set(slice.nodeIds);
  const sliceEdges = slice.edges;

  const upstreamDistance = directedBfsDistance(focalId, sliceEdges, "in", sliceNodeIds);
  const downstreamDistance = directedBfsDistance(focalId, sliceEdges, "out", sliceNodeIds);

  // Pre-load the project's nodes once and resolve slice members from the
  // resulting map. The previous shape did one loadNodeById per slice
  // member, which was O(slice) disk reads per :graph view; loadNodes does
  // a single directory scan and we trade those reads for hash-map lookups.
  // A slice member that does not appear in the map (file deleted, race
  // with `node remove`) is tracked in skippedNodeIds so the renderer can
  // distinguish "hidden by depth cap" from "could not be loaded".
  const allNodes = loadNodes(cwd);
  const allNodesById = new Map<string, OntologyNode>(
    allNodes.map((n) => [n.id, n]),
  );
  const nodeById = new Map<string, OntologyNode>();
  const skippedNodeIds: string[] = [];
  for (const id of slice.nodeIds) {
    const n = id === focalId ? focalNode : allNodesById.get(id);
    if (n) nodeById.set(id, n);
    else skippedNodeIds.push(id);
  }
  skippedNodeIds.sort();

  const focalRow: GraphViewNodeRow = {
    id: focalId,
    label: focalNode.label,
    abstraction: focalNode.coordinates.abstraction,
    kind: focalNode.kind,
    depth: 0,
    connectingEdges: [],
  };

  const upstream: GraphViewNodeRow[] = [];
  const downstream: GraphViewNodeRow[] = [];
  const lateral: GraphViewNodeRow[] = [];

  for (const id of slice.nodeIds) {
    if (id === focalId) continue;
    const node = nodeById.get(id);
    if (!node) continue;
    const upDepth = upstreamDistance.get(id);
    const downDepth = downstreamDistance.get(id);

    // Pick the bucket by the *closer* directed reach. Ties go to upstream
    // because the typical mental model places dependencies above derived
    // work (canon at the top, artifacts at the bottom) — surfacing
    // ancestors first matches that orientation.
    let bucket: "upstream" | "downstream" | "lateral";
    let chosenDepth: number;
    if (upDepth !== undefined && downDepth !== undefined) {
      bucket = upDepth <= downDepth ? "upstream" : "downstream";
      chosenDepth = Math.min(upDepth, downDepth);
    } else if (upDepth !== undefined) {
      bucket = "upstream";
      chosenDepth = upDepth;
    } else if (downDepth !== undefined) {
      bucket = "downstream";
      chosenDepth = downDepth;
    } else {
      bucket = "lateral";
      chosenDepth = -1; // unknown directed depth; sort lateral last
    }

    const row: GraphViewNodeRow = {
      id,
      label: node.label,
      abstraction: node.coordinates.abstraction,
      kind: node.kind,
      depth: chosenDepth,
      connectingEdges: connectingEdgesFor(id, sliceEdges, focalId, bucket),
    };

    if (bucket === "upstream") upstream.push(row);
    else if (bucket === "downstream") downstream.push(row);
    else lateral.push(row);
  }

  // Sort each bucket by (depth ascending, id ascending) so two runs over
  // the same graph yield byte-equal output and the renderer sees the
  // shallowest hops first.
  const byDepthThenId = (a: GraphViewNodeRow, b: GraphViewNodeRow) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  upstream.sort(byDepthThenId);
  downstream.sort(byDepthThenId);
  lateral.sort(byDepthThenId);

  return {
    ok: true,
    focalId,
    depth,
    totalNodes: slice.nodeIds.length,
    totalEdges: slice.edges.length,
    focal: focalRow,
    upstream: upstream.slice(0, RENDER_CAP_PER_BUCKET),
    downstream: downstream.slice(0, RENDER_CAP_PER_BUCKET),
    lateral: lateral.slice(0, RENDER_CAP_PER_BUCKET),
    skippedNodeIds,
  };
}

// Directed BFS from `focalId` returning the hop distance to every node
// reached along edges in the requested direction. Restricts traversal to
// the slice membership so boundary hops cannot leak in.
function directedBfsDistance(
  focalId: string,
  sliceEdges: OntologyEdge[],
  direction: "in" | "out",
  sliceNodeIds: ReadonlySet<string>,
): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const e of sliceEdges) {
    if (direction === "out") {
      // Walk from → to.
      if (!sliceNodeIds.has(e.from) || !sliceNodeIds.has(e.to)) continue;
      const list = adj.get(e.from);
      if (list) list.push(e.to);
      else adj.set(e.from, [e.to]);
    } else {
      // Walk to → from (incoming reach).
      if (!sliceNodeIds.has(e.from) || !sliceNodeIds.has(e.to)) continue;
      const list = adj.get(e.to);
      if (list) list.push(e.from);
      else adj.set(e.to, [e.from]);
    }
  }
  const distance = new Map<string, number>();
  // Focal is excluded from the result set — distance is for *other* nodes.
  const queue: Array<{ id: string; d: number }> = [{ id: focalId, d: 0 }];
  const visited = new Set<string>([focalId]);
  while (queue.length > 0) {
    const head = queue.shift()!;
    for (const next of adj.get(head.id) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      distance.set(next, head.d + 1);
      queue.push({ id: next, d: head.d + 1 });
    }
  }
  return distance;
}

// Find the edges in the slice that touch `nodeId`. The `direction` field
// is from THIS NODE's perspective (`out` = `e.from === nodeId`,
// `in` = `e.to === nodeId`); the bucket the row belongs to (upstream /
// downstream / lateral) provides the focal-relative orientation. Capped
// at 4 edges per row so the renderer width stays bounded — in practice
// most nodes connect via 1-2 edges.
//
// Edges whose other endpoint is the focal are surfaced first because
// they carry the strongest signal ("this is what links the row to the
// focal directly"); other edges are sorted by type for stability.
function connectingEdgesFor(
  nodeId: string,
  sliceEdges: OntologyEdge[],
  focalId: string,
  // Reserved for future ranking heuristics. Today the bucket does not
  // affect edge selection — kept in the signature so callers still pass
  // it and we can lean on it later without churning every call site.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _bucket: "upstream" | "downstream" | "lateral",
): GraphViewNodeRow["connectingEdges"] {
  const out: GraphViewNodeRow["connectingEdges"] = [];
  for (const e of sliceEdges) {
    if (e.from === nodeId) {
      out.push({ type: e.type, direction: "out", otherEnd: e.to });
    } else if (e.to === nodeId) {
      out.push({ type: e.type, direction: "in", otherEnd: e.from });
    }
    if (out.length >= 4) break;
  }
  out.sort((a, b) => {
    const aFocal = a.otherEnd === focalId ? 0 : 1;
    const bFocal = b.otherEnd === focalId ? 0 : 1;
    if (aFocal !== bFocal) return aFocal - bFocal;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });
  return out;
}
