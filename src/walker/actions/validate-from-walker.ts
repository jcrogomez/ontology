// Lightweight validation from inside the walker.
//
// The CLI's `onto validate` is a comprehensive audit: file existence, schema
// shape, hash integrity, event chain, registry contents. That belongs in a
// shell. From the walker we want fast feedback on the *graph-shaped*
// invariants — the ones a node author cares about while editing. We
// re-use the production primitives (loadNodes, loadEdges, hashObject,
// removeIntegrityHash, validateEdgeDirection) so the walker check agrees
// with the CLI on the cases it covers; full coverage stays at the CLI.

import { loadNodes, loadEdges } from "../../core/project/load.js";
import { hashObject, removeIntegrityHash } from "../../core/integrity/hash.js";
import { validateEdgeDirection } from "../../runtime/graph/poset.js";

export interface ValidationViolation {
  // What kind of invariant failed. Useful for grouping in the UI.
  kind: "node_hash" | "edge_hash" | "poset" | "endpoint";
  // Short, human-readable. The walker renders these in a list.
  message: string;
}

export interface ValidateFromWalkerResult {
  ok: boolean;
  scanned: { nodes: number; edges: number };
  violations: ValidationViolation[];
  // True when the scan ran end-to-end (vs. crashed at IO before producing a
  // verdict). The walker treats `ok=false, scanned=true` as "graph is
  // unhealthy" and `ok=false, scanned=false` as "could not check".
  scanCompleted: boolean;
}

export function validateFromWalker(cwd?: string): ValidateFromWalkerResult {
  const violations: ValidationViolation[] = [];
  let nodesScanned = 0;
  let edgesScanned = 0;

  let nodes;
  try {
    nodes = loadNodes(cwd);
  } catch (err: unknown) {
    return {
      ok: false,
      scanned: { nodes: 0, edges: 0 },
      violations: [{ kind: "node_hash", message: `Could not load nodes: ${errStr(err)}` }],
      scanCompleted: false,
    };
  }

  const nodeIds = new Set<string>();
  const abstractionById = new Map<string, string>();
  for (const node of nodes) {
    nodesScanned += 1;
    nodeIds.add(node.id);
    abstractionById.set(node.id, node.coordinates.abstraction);
    const expected = hashObject(removeIntegrityHash(node));
    if (expected !== node.integrity.hash) {
      violations.push({
        kind: "node_hash",
        message: `${node.id}: integrity hash mismatch (file edited outside the CLI mutation path?)`,
      });
    }
  }

  let edges;
  try {
    edges = loadEdges(cwd);
  } catch (err: unknown) {
    return {
      ok: false,
      scanned: { nodes: nodesScanned, edges: 0 },
      violations: [
        ...violations,
        { kind: "edge_hash", message: `Could not load edges: ${errStr(err)}` },
      ],
      scanCompleted: false,
    };
  }

  for (const edge of edges) {
    edgesScanned += 1;
    if (!nodeIds.has(edge.from)) {
      violations.push({
        kind: "endpoint",
        message: `${edge.edgeId}: 'from' references missing node ${edge.from}`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      violations.push({
        kind: "endpoint",
        message: `${edge.edgeId}: 'to' references missing node ${edge.to}`,
      });
    }
    const expected = hashObject(removeIntegrityHash(edge));
    if (expected !== edge.integrity.hash) {
      violations.push({
        kind: "edge_hash",
        message: `${edge.edgeId}: integrity hash mismatch`,
      });
    }
    const sourceLevel = abstractionById.get(edge.from);
    const targetLevel = abstractionById.get(edge.to);
    if (sourceLevel && targetLevel) {
      const direction = validateEdgeDirection({
        sourceLevel: sourceLevel as Parameters<typeof validateEdgeDirection>[0]["sourceLevel"],
        targetLevel: targetLevel as Parameters<typeof validateEdgeDirection>[0]["targetLevel"],
        edgeType: edge.type,
      });
      if (!direction.ok) {
        violations.push({
          kind: "poset",
          message: `${edge.edgeId} (${edge.from} -[${edge.type}]→ ${edge.to}): ${direction.reason}`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    scanned: { nodes: nodesScanned, edges: edgesScanned },
    violations,
    scanCompleted: true,
  };
}

function errStr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
