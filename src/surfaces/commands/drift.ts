import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { loadNodes } from "../../kernel/core/project/load.js";
import { readState, writeState } from "../../kernel/core/state/state-store.js";
import { ensureDir, writeJson, readJson, appendJsonl } from "../../kernel/core/fs/json.js";
import {
  buildMerkleTree,
  diffMerkleTrees,
  hashFileContent,
  normalizeLeafPath,
  type MerkleLeafInput,
  type MerkleTree,
} from "../../kernel/core/integrity/merkle.js";
import { OntologyEventSchema } from "../../kernel/schemas/ontology.js";
import { errorMessage } from "../../kernel/core/errors.js";

// `onto drift` — Merkle change-detection over the compiled shadows.
//
// The thesis says code is the compiled shadow of the intent graph; this
// command is the detector that a shadow no longer matches the object. It
// builds a Merkle tree over every file referenced by `node.outputs.files`,
// compares it against the last persisted anchor, and reports EXACTLY which
// nodes' artifacts moved — the subset you feed to
// `onto verify-homeomorphism --nodes ...` instead of re-measuring the whole
// perimeter.
//
// Read-only by default (no event, free to run in a loop / CI). `--update`
// persists the current tree as the new anchor at .ontology/drift/snapshot.json
// and appends a `drift_anchored` event so the timeline records when the
// baseline moved. `--fail-on-drift` exits 1 when anything drifted — the CI
// guard form.

export interface DriftOptions {
  update?: boolean;
  failOnDrift?: boolean;
  json?: boolean;
  cwd?: string;
}

// The on-disk drift baseline (version:1). Owned here; the per-node re-anchor in
// runtime/legend/reanchor-node.ts reads/writes the same format.
export interface DriftSnapshot {
  version: 1;
  createdAt: string;
  branch: string;
  rootHash: string;
  leaves: Array<{ path: string; hash: string; nodeIds: string[] }>;
}

interface DriftLeafSet {
  leaves: MerkleLeafInput[];
  nodeIdsByPath: Map<string, string[]>;
  missing: string[]; // paths referenced by nodes but absent on disk
}

// Deterministic sentinel hash for a referenced-but-absent artifact. A file
// that disappears and reappears unchanged should round-trip to "unchanged".
const MISSING_HASH = "missing";

function collectLeafSet(cwd: string): DriftLeafSet {
  const nodes = loadNodes(cwd);
  const nodeIdsByPath = new Map<string, string[]>();
  for (const node of nodes) {
    for (const file of node.outputs.files) {
      const normalized = normalizeLeafPath(file);
      if (normalized.length === 0) continue;
      const ids = nodeIdsByPath.get(normalized) ?? [];
      if (!ids.includes(node.id)) ids.push(node.id);
      nodeIdsByPath.set(normalized, ids);
    }
  }
  const leaves: MerkleLeafInput[] = [];
  const missing: string[] = [];
  for (const leafPath of Array.from(nodeIdsByPath.keys()).sort()) {
    const abs = path.resolve(cwd, leafPath);
    if (fs.existsSync(abs)) {
      leaves.push({ path: leafPath, hash: hashFileContent(fs.readFileSync(abs)) });
    } else {
      leaves.push({ path: leafPath, hash: MISSING_HASH });
      missing.push(leafPath);
    }
  }
  return { leaves, nodeIdsByPath, missing };
}

function snapshotToTree(snapshot: DriftSnapshot): MerkleTree {
  return buildMerkleTree(snapshot.leaves.map((l) => ({ path: l.path, hash: l.hash })));
}

function nodeIdsForPaths(
  paths: string[],
  current: Map<string, string[]>,
  previous: Map<string, string[]>,
): string[] {
  const ids = new Set<string>();
  for (const p of paths) {
    for (const id of current.get(p) ?? previous.get(p) ?? []) ids.add(id);
  }
  return Array.from(ids).sort();
}

// The read-only core of `onto drift`: build the current Merkle tree, compare it
// against the persisted anchor, and report exactly which nodes' shadows moved.
// Extracted so `onto status` can read drift without printing or anchoring.
// Throws (with the command's exact messages) on unreadable nodes/snapshot.
export interface DriftState {
  leafSet: DriftLeafSet;
  tree: MerkleTree;
  snapshot: DriftSnapshot | null;
  diff: { added: string[]; removed: string[]; changed: string[] };
  drifted: boolean;
  changedNodeIds: string[];
}

export function readDriftState(cwd: string): DriftState {
  const paths = getOntologyPaths(cwd);

  let leafSet: DriftLeafSet;
  try {
    leafSet = collectLeafSet(cwd);
  } catch (err: unknown) {
    throw new Error(`failed to read nodes/artifacts: ${errorMessage(err)}`);
  }
  const tree = buildMerkleTree(leafSet.leaves);

  let snapshot: DriftSnapshot | null = null;
  if (fs.existsSync(paths.driftSnapshotPath)) {
    try {
      snapshot = readJson<DriftSnapshot>(paths.driftSnapshotPath);
    } catch (err: unknown) {
      throw new Error(`drift snapshot unreadable: ${errorMessage(err)}`);
    }
  }

  const previousIdsByPath = new Map<string, string[]>(
    (snapshot?.leaves ?? []).map((l) => [l.path, l.nodeIds]),
  );
  const diff = snapshot
    ? diffMerkleTrees(snapshotToTree(snapshot), tree)
    : { added: [], removed: [], changed: [] };
  const drifted = diff.added.length + diff.removed.length + diff.changed.length > 0;
  const changedNodeIds = snapshot
    ? nodeIdsForPaths(
        [...diff.added, ...diff.removed, ...diff.changed],
        leafSet.nodeIdsByPath,
        previousIdsByPath,
      )
    : [];

  return { leafSet, tree, snapshot, diff, drifted, changedNodeIds };
}

export async function driftCommand(options: DriftOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);

  if (!fs.existsSync(paths.ontologyDir)) {
    failWith("no .ontology/ found — run `onto init` first", options.json);
    return;
  }

  let state: DriftState;
  try {
    state = readDriftState(cwd);
  } catch (err: unknown) {
    failWith(errorMessage(err), options.json);
    return;
  }
  const { leafSet, tree, snapshot, diff, drifted, changedNodeIds } = state;

  let anchored = false;
  if (options.update) {
    const state = readState(cwd);
    const next: DriftSnapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      branch: state.activeBranch,
      rootHash: tree.rootHash,
      leaves: leafSet.leaves.map((l) => ({
        path: l.path,
        hash: l.hash,
        nodeIds: leafSet.nodeIdsByPath.get(l.path) ?? [],
      })),
    };
    ensureDir(paths.driftDir);
    writeJson(paths.driftSnapshotPath, next);
    anchored = true;

    // Anchors are provenance-worthy: the baseline against which every future
    // drift is measured just moved. Non-fatal on failure (the snapshot is
    // already on disk; a missing event is a provenance gap, not corruption).
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
          previousRootHash: snapshot?.rootHash ?? null,
          changedNodeIds,
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
  }

  const report = {
    rootHash: tree.rootHash,
    leafCount: tree.leafCount,
    anchor: snapshot
      ? { rootHash: snapshot.rootHash, createdAt: snapshot.createdAt, branch: snapshot.branch }
      : null,
    drifted: snapshot ? drifted : null,
    added: diff.added,
    removed: diff.removed,
    changed: diff.changed,
    missing: leafSet.missing,
    changedNodeIds,
    anchored,
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } else {
    console.log(`=== ONTOLOGY DRIFT (Merkle over compiled shadows) ===`);
    console.log(`Artifacts tracked: ${tree.leafCount} file(s) referenced by node.outputs.files`);
    console.log(`Current root:      ${tree.rootHash}`);
    if (!snapshot) {
      console.log(`Anchor:            (none yet)`);
      if (anchored) {
        console.log(`Anchored:          ✓ snapshot written — future runs measure drift against it`);
      } else {
        console.log(``);
        console.log(`Run \`onto drift --update\` to anchor the current tree as the baseline.`);
      }
    } else {
      console.log(`Anchor root:       ${snapshot.rootHash}  (${snapshot.createdAt})`);
      if (!drifted) {
        console.log(`Drift:             ✓ none — every shadow matches the anchor`);
      } else {
        console.log(`Drift:             ✖ ${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed`);
        for (const p of diff.changed) console.log(`  ~ ${p}`);
        for (const p of diff.added) console.log(`  + ${p}`);
        for (const p of diff.removed) console.log(`  - ${p}`);
        if (changedNodeIds.length > 0) {
          console.log(`Affected nodes:    ${changedNodeIds.join(", ")}`);
          console.log(``);
          console.log(`Re-measure only the moved shadows:`);
          console.log(`  onto verify-homeomorphism --nodes ${changedNodeIds.join(",")} --matrix`);
        }
      }
      if (anchored) {
        console.log(`Anchored:          ✓ snapshot re-written — this tree is the new baseline`);
      }
    }
    if (leafSet.missing.length > 0) {
      console.log(`Missing files:     ⚠ ${leafSet.missing.length} referenced but absent on disk`);
      for (const p of leafSet.missing) console.log(`  ? ${p}`);
    }
  }

  if (options.failOnDrift && snapshot && drifted && !options.update) {
    process.exitCode = 1;
  }
}

function failWith(msg: string, json?: boolean): void {
  process.exitCode = 1;
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
}
