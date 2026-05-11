import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../project/paths.js";
import { appendJsonl } from "../fs/json.js";
import { readState, writeState } from "../state/state-store.js";
import { loadEdges } from "../project/load.js";
import {
  OntologyEventSchema,
  type OntologyEvent,
  type OntologyEdge,
} from "../../schemas/ontology.js";

// `onto node remove` primitive.
//
// Deletes a node's record from disk and emits a `node_removed` event.
// REFUSES if the node still has any incident edges (incoming or outgoing).
// The caller is asked to remove the edges first — silent removal would
// leave dangling refs in the edges log and break the partition property
// the validator relies on.
//
// state.nodeCount is intentionally NOT decremented. It is the sequential
// id seed (node_0001, node_0002, …) and must be monotonic so removed ids
// are never reused. The audit log already shows the removal; recovery
// from the log is therefore unambiguous.

export interface RemoveNodeOptions {
  id: string;
  cwd?: string;
  // Free-form metadata appended to the event payload — proposal-driven
  // removals can record the source proposalId here.
  eventMetadata?: Record<string, unknown>;
}

export class NodeHasEdgesError extends Error {
  public readonly nodeId: string;
  public readonly edges: ReadonlyArray<OntologyEdge>;
  constructor(nodeId: string, edges: ReadonlyArray<OntologyEdge>) {
    super(
      `Node ${nodeId} has ${edges.length} incident edge(s) — remove them first with onto edge remove.`,
    );
    this.name = "NodeHasEdgesError";
    this.nodeId = nodeId;
    this.edges = edges;
  }
}

export function removeNode(options: RemoveNodeOptions): { event: OntologyEvent } {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  const nodePath = `${paths.nodesDir}/${options.id}.json`;
  if (!fs.existsSync(nodePath)) {
    throw new Error(`Node not found: ${options.id}`);
  }

  // Refuse if any edge references this node. The user must explicitly
  // tear down the edges first — silent removal of a referenced node
  // would leave dangling edges in the log.
  const edges = loadEdges(cwd);
  const incident = edges.filter((e) => e.from === options.id || e.to === options.id);
  if (incident.length > 0) {
    throw new NodeHasEdgesError(options.id, incident);
  }

  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "node_removed",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      nodeId: options.id,
      ...(options.eventMetadata ?? {}),
    },
  });

  // Delete first, then log: a crash between the unlink and the event
  // append leaves the system in "removed but not logged" — recoverable
  // by re-running with the same id (the node is already gone; the log
  // gets the missing event). The other order would leave us with a
  // logged-but-still-on-disk record, which is harder to reconcile.
  fs.unlinkSync(nodePath);
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  // nodeCount stays — see header comment.
  writeState(state, cwd);

  return { event };
}
