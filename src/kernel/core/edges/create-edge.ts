import * as crypto from "node:crypto";
import { loadEdges } from "../project/load.js";
import { getOntologyPaths } from "../project/paths.js";
import { appendJsonl } from "../fs/json.js";
import { hashObject } from "../integrity/hash.js";
import { readState, writeState } from "../state/state-store.js";
import {
  EdgeTypeSchema,
  OntologyEdgeSchema,
  OntologyEventSchema,
  OntologySchemaVersion,
  type OntologyEdge,
  type OntologyEvent,
} from "../../schemas/ontology.js";
import type { z } from "zod";

// Core helper for creating a typed edge between two existing nodes.
// Mirrors src/kernel/core/nodes/create-node.ts: both `onto node link` and
// `onto proposal apply` (for edge_create proposals) call this function.
//
// The helper does NOT verify that from/to nodes exist or that the poset
// direction is valid — those are caller responsibilities (the CLI already
// performs both checks). This keeps the helper pure: it takes a validated
// edge specification and produces a valid edge record + event + state update.

export interface CreateEdgeOptions {
  from: string;
  to: string;
  type: z.infer<typeof EdgeTypeSchema>;
  branch?: string;
  // Optional event metadata. Proposal apply records the source proposalId here
  // so the edge_created event carries provenance back to its origin.
  eventMetadata?: Record<string, unknown>;
}

export type CreateEdgeResult =
  | { ok: true; edge: OntologyEdge; event: OntologyEvent }
  | { ok: false; reason: "duplicate"; existingEdgeId: string };

export function createEdge(options: CreateEdgeOptions): CreateEdgeResult {
  const state = readState();
  const paths = getOntologyPaths();
  const branch = options.branch ?? state.activeBranch;

  // Reject duplicates here so both the CLI and proposal apply share the
  // same dedup contract. The kernel does not allow two edges of the same
  // type pointing in the same direction on the same branch.
  const existing = loadEdges();
  const dup = existing.find(
    e => e.from === options.from && e.to === options.to && e.type === options.type && e.branch === branch,
  );
  if (dup) {
    return { ok: false, reason: "duplicate", existingEdgeId: dup.edgeId };
  }

  const edgeId = `edge_${crypto.randomBytes(4).toString("hex")}`;
  const eventId = `evt_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const edgeWithoutHash = {
    edgeId,
    from: options.from,
    to: options.to,
    type: options.type,
    branch,
    createdAt: now,
    createdByEventId: eventId,
    integrity: {
      schemaVersion: OntologySchemaVersion,
    },
  };
  const edgeHash = hashObject(edgeWithoutHash);
  const edge = OntologyEdgeSchema.parse({
    ...edgeWithoutHash,
    integrity: {
      ...edgeWithoutHash.integrity,
      hash: edgeHash,
    },
  });

  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: now,
    eventType: "edge_created",
    branch,
    previousEventId: state.lastEventId,
    payload: {
      action: "edge_created",
      edgeId,
      from: options.from,
      to: options.to,
      type: options.type,
      ...(options.eventMetadata ?? {}),
    },
  });

  // Persist atomically: edge → event → state.
  appendJsonl(paths.edgesPath, edge);
  appendJsonl(paths.eventsPath, event);

  state.edgeCount += 1;
  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = now;
  writeState(state);

  return { ok: true, edge, event };
}
