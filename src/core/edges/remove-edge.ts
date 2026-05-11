import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../project/paths.js";
import { appendJsonl } from "../fs/json.js";
import { loadEdges } from "../project/load.js";
import { readState, writeState } from "../state/state-store.js";
import {
  OntologyEventSchema,
  type OntologyEvent,
  type OntologyEdge,
} from "../../schemas/ontology.js";

// `onto edge remove` primitive.
//
// Removes an edge by id. The events.jsonl preserves the full history
// (creation + removal events); edges.jsonl is the materialized current
// state and gets rewritten without the removed entry. The rewrite is
// crash-atomic via temp + rename — the same pattern writeJson uses for
// state.json.

export interface RemoveEdgeOptions {
  edgeId: string;
  cwd?: string;
  eventMetadata?: Record<string, unknown>;
}

export function removeEdge(options: RemoveEdgeOptions): { event: OntologyEvent; removed: OntologyEdge } {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  const edges = loadEdges(cwd);

  const idx = edges.findIndex((e) => e.edgeId === options.edgeId);
  if (idx < 0) {
    throw new Error(`Edge not found: ${options.edgeId}`);
  }
  const removed = edges[idx]!;

  const remaining = edges.filter((_, i) => i !== idx);
  rewriteEdgesAtomically(paths.edgesPath, remaining);

  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "edge_removed",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      edgeId: removed.edgeId,
      from: removed.from,
      to: removed.to,
      type: removed.type,
      ...(options.eventMetadata ?? {}),
    },
  });

  appendJsonl(paths.eventsPath, event);

  state.edgeCount = Math.max(0, state.edgeCount - 1);
  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { event, removed };
}

// Rewrite edges.jsonl atomically — serialize the new lines to a sibling
// temp file then rename into place. Matches the writeJson contract: a
// SIGKILL mid-write leaves the original file intact.
function rewriteEdgesAtomically(edgesPath: string, edges: OntologyEdge[]): void {
  const tmp = `${edgesPath}.tmp.${process.pid}`;
  const body = edges.map((e) => JSON.stringify(e)).join("\n") + (edges.length > 0 ? "\n" : "");
  try {
    fs.writeFileSync(tmp, body, "utf-8");
    fs.renameSync(tmp, edgesPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort */ }
    throw err;
  }
}
