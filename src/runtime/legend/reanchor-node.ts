import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../../core/project/paths.js";
import { loadNodeById } from "../../core/project/load.js";
import { readState, writeState } from "../../core/state/state-store.js";
import { ensureDir, writeJson, readJson, appendJsonl } from "../../core/fs/json.js";
import { buildMerkleTree, hashFileContent, normalizeLeafPath } from "../../core/integrity/merkle.js";
import { OntologyEventSchema } from "../../schemas/ontology.js";
import { errorMessage } from "../../core/errors.js";
import type { DriftSnapshot } from "../../commands/drift.js";

// Per-node drift re-anchor — the write primitive `onto sync` needs after a
// successful regeneration.
//
// `onto drift --update` rewrites the WHOLE-graph snapshot, so running it after
// syncing one node would silently re-anchor every other drifted node too,
// hiding their drift. That defeats the loop's whole point (honest drift
// visibility). This refreshes ONLY the leaves belonging to one node and leaves
// every other anchored hash exactly as it was. It reads/writes the same
// version:1 `DriftSnapshot` format owned by commands/drift.ts.

// Sentinel for a referenced-but-absent artifact (mirrors drift.ts MISSING_HASH).
const MISSING_HASH = "missing";

export interface ReanchorResult {
  ok: boolean;
  anchored: boolean;
  nodeId: string;
  /** Node artifact paths whose anchor we refreshed. */
  paths: string[];
  /** Why we did NOT anchor (e.g. no baseline yet), when anchored === false. */
  reason?: string;
  rootHash?: string;
}

export function reanchorNodeArtifacts(nodeId: string, cwd: string): ReanchorResult {
  const paths = getOntologyPaths(cwd);

  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    return { ok: false, anchored: false, nodeId, paths: [], reason: `node not found: ${nodeId}` };
  }

  const nodePaths = (node.outputs?.files ?? [])
    .map((f) => normalizeLeafPath(f))
    .filter((p) => p.length > 0);
  if (nodePaths.length === 0) {
    return { ok: false, anchored: false, nodeId, paths: [], reason: "node has no outputs.files to anchor" };
  }

  // No baseline yet → a path-scoped re-anchor is meaningless: there is nothing
  // to preserve. Defer to an explicit whole-graph `onto drift --update`.
  if (!fs.existsSync(paths.driftSnapshotPath)) {
    return {
      ok: false,
      anchored: false,
      nodeId,
      paths: nodePaths,
      reason: "no drift baseline yet — run `onto drift --update` to establish one",
    };
  }

  let snapshot: DriftSnapshot;
  try {
    snapshot = readJson<DriftSnapshot>(paths.driftSnapshotPath);
  } catch (err: unknown) {
    return { ok: false, anchored: false, nodeId, paths: nodePaths, reason: `drift snapshot unreadable: ${errorMessage(err)}` };
  }

  // Recompute the hash of just this node's paths from disk now.
  const freshHash = new Map<string, string>();
  for (const rel of nodePaths) {
    const abs = path.resolve(cwd, rel);
    freshHash.set(rel, fs.existsSync(abs) ? hashFileContent(fs.readFileSync(abs)) : MISSING_HASH);
  }

  // Splice the fresh hashes into the existing leaves; every other leaf is left
  // byte-for-byte as anchored, so unrelated drift stays detectable.
  const scoped = new Set(nodePaths);
  const leaves = snapshot.leaves.map((l) =>
    scoped.has(l.path) ? { ...l, hash: freshHash.get(l.path)! } : l,
  );
  // A node path the anchor never tracked (newly added shadow) → append it.
  for (const rel of nodePaths) {
    if (!leaves.some((l) => l.path === rel)) {
      leaves.push({ path: rel, hash: freshHash.get(rel)!, nodeIds: [nodeId] });
    }
  }

  const tree = buildMerkleTree(leaves.map((l) => ({ path: l.path, hash: l.hash })));
  const state = readState(cwd);
  const next: DriftSnapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    branch: snapshot.branch,
    rootHash: tree.rootHash,
    leaves,
  };
  ensureDir(paths.driftDir);
  writeJson(paths.driftSnapshotPath, next);

  // Provenance: the baseline moved for this node. Non-fatal on failure — the
  // snapshot is already on disk; a missing event is a gap, not corruption.
  try {
    const eventId = "evt_" + randomBytes(4).toString("hex");
    const event = OntologyEventSchema.parse({
      eventId,
      sequence: state.eventCount,
      timestamp: new Date().toISOString(),
      eventType: "drift_anchored",
      branch: state.activeBranch,
      previousEventId: state.lastEventId,
      payload: {
        rootHash: tree.rootHash,
        leafCount: tree.leafCount,
        previousRootHash: snapshot.rootHash,
        changedNodeIds: [nodeId],
        scoped: true,
      },
    });
    appendJsonl(paths.eventsPath, event);
    state.eventCount += 1;
    state.lastEventId = eventId;
    state.updatedAt = new Date().toISOString();
    writeState(state, cwd);
  } catch (err: unknown) {
    console.error(`⚠ Failed to append drift_anchored event: ${errorMessage(err)}`);
  }

  return { ok: true, anchored: true, nodeId, paths: nodePaths, rootHash: tree.rootHash };
}
