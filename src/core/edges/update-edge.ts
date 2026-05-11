import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../project/paths.js";
import { appendJsonl } from "../fs/json.js";
import { loadEdges } from "../project/load.js";
import { readState, writeState } from "../state/state-store.js";
import { hashObject } from "../integrity/hash.js";
import {
  EdgeTypeSchema,
  OntologyEdgeSchema,
  OntologyEventSchema,
  type OntologyEvent,
  type OntologyEdge,
} from "../../schemas/ontology.js";
import type { z } from "zod";

// `onto edge update` primitive.
//
// Today only the `type` field is mutable in place — endpoint changes
// are semantically equivalent to "drop and re-link" and the user is
// asked to do that explicitly so the event log shows both operations.
// Re-hashes the edge afterward and emits an `edge_updated` event with
// old and new hashes.

export interface UpdateEdgeOptions {
  edgeId: string;
  type?: z.infer<typeof EdgeTypeSchema>;
  cwd?: string;
  eventMetadata?: Record<string, unknown>;
}

export function updateEdge(
  options: UpdateEdgeOptions,
): { event: OntologyEvent; edge: OntologyEdge } {
  if (options.type === undefined) {
    throw new Error("updateEdge requires at least one mutating field (today: --type)");
  }

  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  const edges = loadEdges(cwd);

  const idx = edges.findIndex((e) => e.edgeId === options.edgeId);
  if (idx < 0) {
    throw new Error(`Edge not found: ${options.edgeId}`);
  }
  const existing = edges[idx]!;
  const oldHash = existing.integrity.hash;

  // Build the updated edge sans hash, recompute, then attach the new hash.
  const integrityWithoutHash = {
    schemaVersion: existing.integrity.schemaVersion,
  };
  const updatedWithoutHash = {
    ...existing,
    type: options.type,
    integrity: integrityWithoutHash,
  };
  const newHash = hashObject(updatedWithoutHash);
  const updated = OntologyEdgeSchema.parse({
    ...updatedWithoutHash,
    integrity: { ...integrityWithoutHash, hash: newHash },
  });

  const newEdges = edges.map((e, i) => (i === idx ? updated : e));
  rewriteEdgesAtomically(paths.edgesPath, newEdges);

  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "edge_updated",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      edgeId: updated.edgeId,
      oldType: existing.type,
      newType: updated.type,
      oldHash,
      newHash,
      ...(options.eventMetadata ?? {}),
    },
  });
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { event, edge: updated };
}

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
