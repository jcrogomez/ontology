// Pure composer for materialising resolved edges into a self-consistent
// `{ edges, events, newState }` triple. No filesystem, no LLM.
//
// The production code path for edge creation (src/core/edges/create-edge.ts)
// is tied to `getOntologyPaths()` and `readState()`/`writeState()`, which
// resolve against `.ontology` relative to cwd. For the Phase ε empirical
// validation we need to apply edges into a *copy* of an archived ontology
// snapshot — not the active project — so a `verify-homeomorphism` run
// against that copy reads the new edges through the assembler exactly as
// it would in production.
//
// This module produces the same audit-chain shape `createEdge` produces:
//   • each `edge_created` event carries sequence = previous eventCount,
//     previousEventId = state.lastEventId, payload.edgeId = the new edge
//   • each edge's `integrity.hash` is `hashObject` over the edge minus
//     its own hash field (the same scheme as createEdge)
//   • the returned `newState` reflects edge/event count and lastEventId
//     after every edge has been threaded
//
// Pure & deterministic: tests pass a counter-based `mintId` and a fixed
// timestamp; the CLI passes `crypto.randomBytes` + ISO `now`. Same
// inputs → same outputs.

import {
  OntologyEdgeSchema,
  OntologyEventSchema,
  OntologySchemaVersion,
  type EdgeTypeSchema,
  type OntologyEdge,
  type OntologyEvent,
  type OntologyState,
} from "../../schemas/ontology.js";
import { hashObject } from "../../core/integrity/hash.js";
import type { z } from "zod";

export interface ResolvedEdgeSpec {
  fromNodeId: string;
  toNodeId: string;
  type: z.infer<typeof EdgeTypeSchema>;
  // Optional provenance attached to the resulting event's payload. The
  // production resolver in commands/graph/infer-edges.ts puts the
  // source-file paths and inferred tokens here so an operator can trace
  // each materialised edge back to the import that produced it.
  provenance?: Record<string, unknown>;
}

export interface ComposeEdgeApplicationInput {
  resolvedEdges: ResolvedEdgeSpec[];
  state: OntologyState;
  // Branch override. Defaults to `state.activeBranch`.
  branch?: string;
  // ID minter. The CLI passes a closure over `crypto.randomBytes(4).toString("hex")`;
  // tests pass a deterministic counter. Each call must return a fresh
  // hex string so synthesised ids never collide.
  mintId: () => string;
  // ISO timestamp string applied to every new edge and event. Pure
  // composer — the CLI passes `new Date().toISOString()`, tests pass a
  // fixed string.
  timestamp: string;
}

export interface ComposeEdgeApplicationResult {
  edges: OntologyEdge[];
  events: OntologyEvent[];
  newState: OntologyState;
}

export function composeEdgeApplication(
  input: ComposeEdgeApplicationInput,
): ComposeEdgeApplicationResult {
  const branch = input.branch ?? input.state.activeBranch;

  let lastEventId = input.state.lastEventId;
  let sequence = input.state.eventCount;
  let edgeCount = input.state.edgeCount;

  const edges: OntologyEdge[] = [];
  const events: OntologyEvent[] = [];

  for (const spec of input.resolvedEdges) {
    const edgeId = `edge_${input.mintId()}`;
    const eventId = `evt_${input.mintId()}`;

    const edgeWithoutHash = {
      edgeId,
      from: spec.fromNodeId,
      to: spec.toNodeId,
      type: spec.type,
      branch,
      createdAt: input.timestamp,
      createdByEventId: eventId,
      integrity: { schemaVersion: OntologySchemaVersion },
    };
    const edgeHash = hashObject(edgeWithoutHash);
    const edge = OntologyEdgeSchema.parse({
      ...edgeWithoutHash,
      integrity: { ...edgeWithoutHash.integrity, hash: edgeHash },
    });

    const event = OntologyEventSchema.parse({
      eventId,
      sequence,
      timestamp: input.timestamp,
      eventType: "edge_created",
      branch,
      previousEventId: lastEventId,
      payload: {
        action: "edge_created",
        edgeId,
        from: spec.fromNodeId,
        to: spec.toNodeId,
        type: spec.type,
        ...(spec.provenance ?? {}),
      },
    });

    edges.push(edge);
    events.push(event);
    edgeCount += 1;
    sequence += 1;
    lastEventId = eventId;
  }

  const newState: OntologyState = {
    ...input.state,
    edgeCount,
    eventCount: sequence,
    lastEventId,
    activeBranch: input.state.activeBranch,
    updatedAt: input.timestamp,
  };

  return { edges, events, newState };
}
