import type { OntologyEdge } from "../schemas/ontology.js";
import { HARD_DEPENDENCY_EDGE_TYPES } from "./compile-plan.js";

// Sync-readiness as ORDER THEORY over the dependency poset.
//
// A node is atomically "ready" (syncable-with-confidence) iff it has a code
// shadow, a behaviour fixture, and no static rule violation — the `core` tier of
// `onto status`. But readiness does not compose trivially: a node can only be
// CONFIDENTLY synced as part of a batch if every CODE node it transitively
// depends on is also ready. So the set of batch-syncable nodes is the largest
// DOWN-CLOSED subset (order ideal) of the ready set under the hard-dependency
// order (e.from depends on e.to → e.to is "below" e.from).
//
// The dual is the actionable part: the nodes that are NOT ready are the
// BLOCKERS. Ranked by how many descendants each blocks, they say where the
// leverage is; the minimal ones (no blocker strictly below them) form the
// fix-first ANTICHAIN — close those and a whole down-set unblocks at once.
//
// This is the order-theoretic refinement of the executor's per-node
// `blocked-upstream`: instead of "this node is blocked", it answers "these few
// nodes block everything — start here". Pure and deterministic; the readiness
// predicate (shadow/fixture/rules) is computed by the caller and passed in.

const HARD: ReadonlySet<string> = new Set(HARD_DEPENDENCY_EDGE_TYPES as readonly string[]);

export interface Blocker {
  nodeId: string;
  /** Distinct SHADOWED nodes that have this blocker in their dependency
   *  closure — i.e. how many nodes closing this one would (help) unblock. */
  blockedDescendants: number;
}

export interface SyncReadiness {
  /** Ready nodes whose entire shadowed dependency closure is also ready — the
   *  syncable order ideal (down-closed). Sorted. */
  ideal: string[];
  /** Ready nodes held out of the ideal ONLY because some shadowed dependency is
   *  not ready (atomically fine, blocked from below). Sorted. */
  blockedReady: string[];
  /** Shadowed-but-not-ready nodes, ranked by blockedDescendants desc then id. */
  blockers: Blocker[];
  /** The fix-first antichain: blockers with no other blocker below them in the
   *  dependency order. Closing these is a prerequisite for everything above. */
  frontier: string[];
}

// Transitive hard-dependency down-closure for every node, memoised. Cycles (if
// any slipped past validation) are handled by the visited guard.
function buildDownClosures(edges: readonly OntologyEdge[]): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!HARD.has(e.type)) continue;
    if (!deps.has(e.from)) deps.set(e.from, new Set());
    deps.get(e.from)!.add(e.to);
  }
  const memo = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  const closure = (id: string): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const acc = new Set<string>();
    if (visiting.has(id)) return acc; // cycle guard
    visiting.add(id);
    for (const d of deps.get(id) ?? []) {
      acc.add(d);
      for (const t of closure(d)) acc.add(t);
    }
    visiting.delete(id);
    memo.set(id, acc);
    return acc;
  };
  for (const id of deps.keys()) closure(id);
  return memo;
}

/** Universal per-node downstream blast radius: for every node, how many
 *  SHADOWED nodes transitively depend on it (have it in their hard-dependency
 *  down-closure). Unlike `SyncReadiness.blockers[].blockedDescendants` — which
 *  is populated ONLY for un-ready blockers — this is defined for every node,
 *  including ready/core ones: the "if this drifts, N shadowed nodes sit
 *  downstream of it" number the per-node DoD report shows. Same closure
 *  inversion as computeSyncReadiness, without the blocker filter. */
export function downstreamDependents(
  edges: readonly OntologyEdge[],
  shadowed: ReadonlySet<string>,
): Map<string, number> {
  const closures = buildDownClosures(edges);
  const counts = new Map<string, number>();
  for (const n of shadowed) {
    for (const m of closures.get(n) ?? []) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return counts;
}

export function computeSyncReadiness(args: {
  /** Nodes with a code shadow — the syncable universe. */
  shadowed: ReadonlySet<string>;
  /** Atomically-ready nodes (shadow + fixture + rules clean). Must be ⊆ shadowed. */
  ready: ReadonlySet<string>;
  edges: readonly OntologyEdge[];
}): SyncReadiness {
  const { shadowed, ready, edges } = args;
  const closures = buildDownClosures(edges);
  const downOf = (id: string): Set<string> => closures.get(id) ?? new Set();

  const ideal: string[] = [];
  const blockedReady: string[] = [];

  for (const n of shadowed) {
    if (!ready.has(n)) continue;
    // Only SHADOWED dependencies can be "unready"; abstract (no-shadow) intent
    // nodes have no code to be out of sync, so they are transparent here.
    let blocked = false;
    for (const m of downOf(n)) {
      if (shadowed.has(m) && !ready.has(m)) {
        blocked = true;
        break;
      }
    }
    (blocked ? blockedReady : ideal).push(n);
  }

  // Blockers: shadowed, not ready. Rank by transitive shadowed dependents.
  const blockerIds = [...shadowed].filter((n) => !ready.has(n));
  const blockerSet = new Set(blockerIds);
  const blockedDescendants = new Map<string, number>();
  for (const id of blockerIds) blockedDescendants.set(id, 0);
  for (const n of shadowed) {
    for (const m of downOf(n)) {
      if (blockerSet.has(m)) blockedDescendants.set(m, (blockedDescendants.get(m) ?? 0) + 1);
    }
  }
  const blockers: Blocker[] = blockerIds
    .map((nodeId) => ({ nodeId, blockedDescendants: blockedDescendants.get(nodeId) ?? 0 }))
    .sort((a, b) => b.blockedDescendants - a.blockedDescendants || a.nodeId.localeCompare(b.nodeId));

  // Frontier = minimal blockers: no other blocker appears below them.
  const frontier = blockerIds
    .filter((b) => ![...downOf(b)].some((m) => blockerSet.has(m)))
    .sort();

  return { ideal: ideal.sort(), blockedReady: blockedReady.sort(), blockers, frontier };
}
