import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../project/paths.js";
import { writeJson, readJson, appendJsonl } from "../fs/json.js";
import { readState, writeState } from "../state/state-store.js";
import { hashObject } from "../integrity/hash.js";
import { loadNodes } from "../project/load.js";
import {
  OntologyNodeSchema,
  OntologyEventSchema,
  type OntologyNode,
  type OntologyEvent,
} from "../../schemas/ontology.js";

// `updateNodeParent` — the reparenting plasticity primitive.
//
// Project Legend / hierarchizer §10 item 3 ("`node_update_parent` proposal
// kind"). Before this primitive the hierarchizer planner could compute the
// directoriesToCreate + reparentings deltas but had no way to apply the
// reparentings: `node_update` rewrites prompt/rules/contract, never the
// graph.parentId. The materialize-edges harness (2026-05-22) proved that
// edges close the brújula gap; the hierarchizer's value-add is depth +
// legibility, and depth requires reparenting the leaves under their new
// directory ancestors. This is the kernel primitive that unblocks both
// `onto graph hierarchize --create-proposals` and any future walker
// reparent action.
//
// Three validations refuse to mutate, in this order:
//   1. The node and the new parent both exist.
//   2. They share a branch (cross-branch reparenting is the branch
//      fibration's domain, not this primitive's).
//   3. The reparenting does not create a cycle (new parent is not a
//      descendant of the node being reparented).
//
// The abstraction poset (parent.abstraction ≤ node.abstraction, enforced
// by createNode on creation) is NOT re-checked here on purpose: the
// hierarchizer's directoriesToCreate places intermediate nodes at the
// node's own abstraction level (file leaves under directory parents at
// the same `unit` / `artifact` level), so a re-check would be redundant
// at best and could become wrong if a future hierarchizer chooses a
// different layering. The poset is the kernel's invariant on edge-typed
// refinement, not on parentId per se. If a caller is reparenting across
// abstraction levels they own that decision.
//
// Pure-ish: side effects are limited to (a) writing the node JSON, (b)
// appending one `node_parent_updated` event, (c) bumping the state.
// Throws on every validation failure; never silently mutates.

export interface UpdateNodeParentOptions {
  /** Node being reparented. Must exist. */
  id: string;
  /** New parent. Must exist, be in the same branch, and not be a descendant of `id`. */
  newParentNodeId: string;
  cwd?: string;
  /** Optional metadata folded into the event payload (e.g. `{ sourceProposalId }`). */
  eventMetadata?: Record<string, unknown>;
}

/**
 * Reparent an existing node by rewriting its `graph.parentId`. Re-hashes
 * the node and appends one `node_parent_updated` event carrying both
 * old and new parent ids and both old and new node hashes.
 *
 * Throws on:
 *   - missing node, missing new parent
 *   - cross-branch reparenting (different `coordinates.branch`)
 *   - cycle (new parent is reachable from `id` via parent-chain or
 *     already a descendant in the ancestry walk)
 *   - identity reparenting (new parent equals the current parent — no-op
 *     that would otherwise emit a misleading event)
 */
export function updateNodeParent(
  options: UpdateNodeParentOptions,
): { node: OntologyNode; event: OntologyEvent } {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  const nodePath = `${paths.nodesDir}/${options.id}.json`;
  if (!fs.existsSync(nodePath)) {
    throw new Error(`Node not found: ${options.id}`);
  }
  if (options.id === options.newParentNodeId) {
    throw new Error(
      `Cannot reparent node ${options.id} to itself.`,
    );
  }
  const existing = readJson<OntologyNode>(nodePath);
  const newParentPath = `${paths.nodesDir}/${options.newParentNodeId}.json`;
  if (!fs.existsSync(newParentPath)) {
    throw new Error(
      `New parent node not found: ${options.newParentNodeId}`,
    );
  }
  const newParent = readJson<OntologyNode>(newParentPath);

  // Branch invariant: cross-branch reparenting belongs to the branch
  // fibration's domain, not this primitive's.
  if (existing.coordinates.branch !== newParent.coordinates.branch) {
    throw new Error(
      `Cross-branch reparenting refused: node ${options.id} is on branch ` +
        `"${existing.coordinates.branch}" but new parent ${options.newParentNodeId} ` +
        `is on "${newParent.coordinates.branch}". This primitive only reparents within a branch.`,
    );
  }

  // No-op check: silently swallowing an identity reparent would emit a
  // misleading event ("parent changed from X to X"). Surface it as an
  // error so callers don't accidentally pollute the log.
  if (existing.graph.parentId === options.newParentNodeId) {
    throw new Error(
      `Node ${options.id} is already a child of ${options.newParentNodeId}; ` +
        `reparenting would be a no-op.`,
    );
  }

  // Cycle check: walk new parent's ancestry — if the node being
  // reparented appears anywhere on that chain, the new edge would close
  // a cycle. O(depth) in the worst case; safe even on flat snapshots
  // because depth is bounded by the node count.
  if (wouldCreateCycle(options.id, options.newParentNodeId, cwd)) {
    throw new Error(
      `Reparenting ${options.id} under ${options.newParentNodeId} would create a cycle ` +
        `(${options.newParentNodeId} is currently a descendant of ${options.id}).`,
    );
  }

  // Build the updated node. Only `graph.parentId` changes; every other
  // field is preserved byte-identical so the hash diff reflects exactly
  // the reparent.
  const oldHash = existing.integrity.hash;
  const oldParentId = existing.graph.parentId;
  const integrityWithoutHash = {
    frozen: existing.integrity.frozen,
    schemaVersion: existing.integrity.schemaVersion,
  };
  const { literal: _existingLiteral, ...withoutLiteral } = existing;
  const nodeBase: Record<string, unknown> = {
    ...withoutLiteral,
    graph: {
      ...existing.graph,
      parentId: options.newParentNodeId,
    },
    integrity: integrityWithoutHash,
  };
  if (existing.literal !== undefined) {
    nodeBase.literal = existing.literal;
  }
  const newHash = hashObject(nodeBase);
  const finalNode = OntologyNodeSchema.parse({
    ...nodeBase,
    integrity: { ...integrityWithoutHash, hash: newHash },
  });

  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "node_parent_updated",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      nodeId: options.id,
      oldParentId,
      newParentId: options.newParentNodeId,
      oldHash,
      newHash,
      ...(options.eventMetadata ?? {}),
    },
  });

  writeJson(nodePath, finalNode);
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { node: finalNode, event };
}

// ── Cycle detection ─────────────────────────────────────────────────

/**
 * Returns true iff making `newParentId` the parent of `nodeId` would
 * close a cycle — i.e. if `newParentId` is currently reachable from
 * `nodeId` by following parent-or-descendant relationships in the
 * current graph.
 *
 * Implemented as a descendant walk from `nodeId`: if `newParentId`
 * appears in the descendant set, reparenting would cycle. O(N) over
 * the node list in the worst case (every node is descendant of one
 * common root); cheap even on the largest snapshots in the calibration
 * corpus (~130 nodes).
 *
 * Exported so the hierarchizer's plan-time predicate can use the same
 * rule the kernel enforces at apply-time — no drift between the two.
 */
export function wouldCreateCycle(
  nodeId: string,
  newParentId: string,
  cwd: string = process.cwd(),
): boolean {
  if (nodeId === newParentId) return true;
  const all = loadNodes(cwd);
  // Build a child index: parentId → set of childIds. Walking that index
  // from `nodeId` gives the full descendant set in O(N).
  const childrenOf = new Map<string, string[]>();
  for (const n of all) {
    const p = n.graph.parentId;
    if (p === null) continue;
    const arr = childrenOf.get(p);
    if (arr) arr.push(n.id);
    else childrenOf.set(p, [n.id]);
  }
  // BFS over descendants. If we encounter newParentId, the reparent
  // would close a cycle.
  const queue = [nodeId];
  const visited = new Set<string>([nodeId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const kids = childrenOf.get(cur);
    if (!kids) continue;
    for (const k of kids) {
      if (k === newParentId) return true;
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push(k);
    }
  }
  return false;
}
