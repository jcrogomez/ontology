import * as fs from "node:fs";
import { getOntologyPaths } from "../project/paths.js";
import { OntologyEventSchema, type OntologyEvent, type OntologyState } from "../../schemas/ontology.js";

// `onto replay` core — rebuild the state summary from the append-only event
// log alone (MATHEMATICAL_CLAIMS.md §4.4: the law `replay(history(state)) ===
// state` is what turns "auditable" into "reconstructible").
//
// Honest scope of the law:
//   - DERIVED fields — initialized, schemaVersion, rootNodeId, activeBranch,
//     nodeCount, edgeCount, eventCount, lastEventId — are pure folds over the
//     log and must match `state.json` exactly. This is the replay law.
//   - WALL-CLOCK fields — createdAt / updatedAt — are written from
//     `new Date()` at write time (init.ts writes state milliseconds after the
//     genesis event), so they are NOT log-derived by design and are excluded
//     from the comparison. Replay reconstructs them from event timestamps
//     (genesis / last event) when writing.
//   - projectName rides on the genesis payload since 2026-06-09; legacy logs
//     predate that and fall back to the existing state value with a warning.
//
// Fold rules (mirroring the writers):
//   - eventCount  = number of events (every writer does sequence=eventCount,
//     then eventCount += 1).
//   - lastEventId = last event's id.
//   - nodeCount   = 1 (the canon, written by init WITHOUT a node_created
//     event) + count(node_created). It is a SEQUENTIAL id counter —
//     remove-node.ts deliberately does not decrement (header comment there).
//   - edgeCount   = count(edge_created) − count(edge_removed).
//   - rootNodeId  = the genesis payload's rootNodeId (2026-06-09+) or the
//     init convention "node_0000_canon" for legacy logs.
//   - activeBranch = the last event's branch (no branch-switch event exists
//     today, so this is constant "main"; the rule generalises if one lands).
//
// While folding, the chain integrity is verified for free: sequence must be
// 0..n−1 and previousEventId must link each event to its predecessor.

export interface ReplayedState {
  initialized: boolean;
  schemaVersion: string | null;
  /** From the genesis payload (2026-06-09+); null for legacy logs. */
  projectName: string | null;
  rootNodeId: string | null;
  activeBranch: string;
  nodeCount: number;
  edgeCount: number;
  eventCount: number;
  lastEventId: string | null;
  /** Genesis event timestamp (replay's reconstruction of createdAt). */
  genesisTimestamp: string | null;
  /** Last event timestamp (replay's reconstruction of updatedAt). */
  lastTimestamp: string | null;
}

export interface ChainViolation {
  sequence: number;
  eventId: string;
  problem: string;
}

export interface FieldDivergence {
  field: string;
  replayed: unknown;
  onDisk: unknown;
}

export interface ReplayResult {
  replayed: ReplayedState;
  chainViolations: ChainViolation[];
  warnings: string[];
}

export function replayEvents(events: OntologyEvent[]): ReplayResult {
  const warnings: string[] = [];
  const chainViolations: ChainViolation[] = [];
  const replayed: ReplayedState = {
    initialized: false,
    schemaVersion: null,
    projectName: null,
    rootNodeId: null,
    activeBranch: "main",
    nodeCount: 0,
    edgeCount: 0,
    eventCount: events.length,
    lastEventId: null,
    genesisTimestamp: null,
    lastTimestamp: null,
  };

  let prevEventId: string | null = null;
  events.forEach((ev, i) => {
    if (ev.sequence !== i) {
      chainViolations.push({
        sequence: ev.sequence,
        eventId: ev.eventId,
        problem: `sequence is ${ev.sequence}, expected ${i}`,
      });
    }
    if (ev.previousEventId !== prevEventId) {
      chainViolations.push({
        sequence: ev.sequence,
        eventId: ev.eventId,
        problem: `previousEventId is ${ev.previousEventId ?? "null"}, expected ${prevEventId ?? "null"}`,
      });
    }
    prevEventId = ev.eventId;

    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    switch (ev.eventType) {
      case "system_init": {
        replayed.initialized = true;
        replayed.genesisTimestamp = ev.timestamp;
        // The canon node is written by init alongside the genesis event,
        // without a node_created of its own — count it here.
        replayed.nodeCount += 1;
        replayed.rootNodeId =
          typeof payload.rootNodeId === "string" ? payload.rootNodeId : "node_0000_canon";
        if (typeof payload.schemaVersion === "string") {
          replayed.schemaVersion = payload.schemaVersion;
        }
        if (typeof payload.projectName === "string") {
          replayed.projectName = payload.projectName;
        }
        break;
      }
      case "node_created": {
        replayed.nodeCount += 1;
        break;
      }
      case "edge_created":
        replayed.edgeCount += 1;
        break;
      case "edge_removed":
        replayed.edgeCount = Math.max(0, replayed.edgeCount - 1);
        break;
      default:
        // Every other event type only advances the chain (eventCount /
        // lastEventId); no counter derives from it.
        break;
    }
    replayed.activeBranch = ev.branch;
    replayed.lastEventId = ev.eventId;
    replayed.lastTimestamp = ev.timestamp;
  });

  if (replayed.initialized && replayed.projectName === null) {
    warnings.push(
      "projectName is not in the genesis payload (log predates 2026-06-09); it cannot be derived from the log",
    );
  }
  return { replayed, chainViolations, warnings };
}

export function readEventLog(cwd: string = process.cwd()): OntologyEvent[] {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.eventsPath)) return [];
  return fs
    .readFileSync(paths.eventsPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => OntologyEventSchema.parse(JSON.parse(line)));
}

// The replay law: every log-derived field of the on-disk state must equal its
// replayed reconstruction. Wall-clock fields (createdAt/updatedAt) are
// excluded by design; projectName participates only when the log carries it.
export function diffReplayedState(
  replayed: ReplayedState,
  onDisk: OntologyState,
): FieldDivergence[] {
  const out: FieldDivergence[] = [];
  const check = (field: string, r: unknown, d: unknown): void => {
    if (r !== d) out.push({ field, replayed: r, onDisk: d });
  };
  check("initialized", replayed.initialized, onDisk.initialized);
  if (replayed.schemaVersion !== null) {
    check("schemaVersion", replayed.schemaVersion, onDisk.schemaVersion);
  }
  if (replayed.projectName !== null) {
    check("projectName", replayed.projectName, onDisk.projectName);
  }
  check("rootNodeId", replayed.rootNodeId, onDisk.rootNodeId);
  check("activeBranch", replayed.activeBranch, onDisk.activeBranch);
  check("nodeCount", replayed.nodeCount, onDisk.nodeCount);
  check("edgeCount", replayed.edgeCount, onDisk.edgeCount);
  check("eventCount", replayed.eventCount, onDisk.eventCount);
  check("lastEventId", replayed.lastEventId, onDisk.lastEventId);
  return out;
}

// Materialise the replayed fold as a full OntologyState (the --write path).
// Wall-clock fields come from event timestamps; non-derivable fields fall
// back to the existing state (with the warning already emitted by the fold).
export function materializeReplayedState(
  replayed: ReplayedState,
  existing: OntologyState,
): OntologyState {
  return {
    initialized: replayed.initialized,
    schemaVersion: replayed.schemaVersion ?? existing.schemaVersion,
    projectName: replayed.projectName ?? existing.projectName,
    rootNodeId: replayed.rootNodeId ?? existing.rootNodeId,
    activeBranch: replayed.activeBranch,
    nodeCount: replayed.nodeCount,
    edgeCount: replayed.edgeCount,
    eventCount: replayed.eventCount,
    lastEventId: replayed.lastEventId ?? existing.lastEventId,
    createdAt: replayed.genesisTimestamp ?? existing.createdAt,
    updatedAt: replayed.lastTimestamp ?? existing.updatedAt,
  };
}
