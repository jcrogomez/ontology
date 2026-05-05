import * as crypto from "node:crypto";
import { loadNodeById, loadState, loadEdges, assertOntologyProject } from "../../core/project/load.js";
import { getOntologyPaths } from "../../core/project/paths.js";
import { appendJsonl, writeJson } from "../../core/fs/json.js";
import { hashObject } from "../../core/integrity/hash.js";
import { EdgeTypeSchema, OntologyEdgeSchema, OntologyEventSchema, OntologyStateSchema, OntologySchemaVersion } from "../../schemas/ontology.js";
import { validateEdgeDirection } from "../../runtime/graph/poset.js";
import { z } from "zod";

export interface NodeLinkCommandOptions {
  from: string;
  to: string;
  type: string;
  json?: boolean;
}

export async function nodeLinkCommand(options: NodeLinkCommandOptions): Promise<void> {
  const cwd = process.cwd();

  if (!options.json) {
    assertOntologyProject(cwd);
  } else {
    try {
      assertOntologyProject(cwd);
    } catch {
      console.log(JSON.stringify({ ok: false, error: "Not an Ontology project. Run 'onto init' first." }));
      process.exit(1);
    }
  }

  const paths = getOntologyPaths(cwd);
  let state = loadState(cwd);
  const edges = loadEdges(cwd);

  const handleError = (msg: string) => {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: msg }));
    } else {
      console.error(`✖ ${msg}`);
    }
    process.exit(1);
  };

  // Reject self-loops up front. The current edge type vocabulary has no
  // semantically valid self-edge; a node should not "depend_on" or "refine"
  // itself, and downstream traversal would have to special-case the loop.
  if (options.from === options.to) {
    handleError(`Self-loops are not allowed: ${options.from} cannot link to itself`);
  }

  const fromNode = loadNodeById(options.from, cwd);
  if (!fromNode) {
    handleError(`Source node not found: ${options.from}`);
  }

  const toNode = loadNodeById(options.to, cwd);
  if (!toNode) {
    handleError(`Target node not found: ${options.to}`);
  }

  let edgeType: z.infer<typeof EdgeTypeSchema>;
  try {
    edgeType = EdgeTypeSchema.parse(options.type);
  } catch (error) {
    handleError(`Invalid edge type: "${options.type}". Expected one of: ${EdgeTypeSchema.options.join(", ")}`);
    return;
  }

  // Reject inversions of the abstraction poset for refinement-family edges.
  // The check is preventive here; `onto validate` re-runs it across all
  // edges so existing graphs cannot drift into an invalid state silently.
  // fromNode and toNode are guaranteed defined past their handleError checks
  // because handleError process.exit(1)s before falling through.
  const directionResult = validateEdgeDirection({
    sourceLevel: fromNode!.coordinates.abstraction,
    targetLevel: toNode!.coordinates.abstraction,
    edgeType,
  });
  if (!directionResult.ok) {
    handleError(directionResult.reason);
  }

  // Check for duplicates
  const isDuplicate = edges.some(e =>
    e.from === options.from &&
    e.to === options.to &&
    e.type === edgeType &&
    e.branch === state.activeBranch
  );

  if (isDuplicate) {
    handleError(`Edge already exists: ${options.from} --${edgeType}--> ${options.to}`);
  }

  const edgeId = `edge_${crypto.randomBytes(4).toString("hex")}`;
  const eventId = `evt_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  // Build the edge without integrity.hash, hash the body, then re-parse the full record.
  // This mirrors the discipline in create-node.ts and avoids any-typed scaffolding.
  const edgeWithoutHash = {
    edgeId,
    from: options.from,
    to: options.to,
    type: edgeType,
    branch: state.activeBranch,
    createdAt: now,
    createdByEventId: eventId,
    integrity: {
      schemaVersion: OntologySchemaVersion,
    },
  };
  const edgeHash = hashObject(edgeWithoutHash);

  let validatedEdge;
  try {
    validatedEdge = OntologyEdgeSchema.parse({
      ...edgeWithoutHash,
      integrity: {
        ...edgeWithoutHash.integrity,
        hash: edgeHash,
      },
    });
  } catch (err: unknown) {
    handleError(`Failed to validate new edge: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  let validatedEvent;
  try {
    validatedEvent = OntologyEventSchema.parse({
      eventId,
      sequence: state.eventCount,
      timestamp: now,
      eventType: "edge_created",
      branch: state.activeBranch,
      previousEventId: state.lastEventId,
      payload: {
        action: "edge_created",
        edgeId: edgeId,
        from: options.from,
        to: options.to,
        type: edgeType,
      },
    });
  } catch (err: unknown) {
    handleError(`Failed to validate new event: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Update state
  state.edgeCount += 1;
  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = now;

  let validatedState;
  try {
    validatedState = OntologyStateSchema.parse(state);
  } catch (err: unknown) {
    handleError(`Failed to validate updated state: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Persist changes
  try {
    appendJsonl(paths.edgesPath, validatedEdge);
    appendJsonl(paths.eventsPath, validatedEvent);
    writeJson(paths.statePath, validatedState);
  } catch (err: unknown) {
    handleError(`Failed to write changes: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: true, edge: validatedEdge, event: validatedEvent }));
  } else {
    console.log(`=== ONTOLOGY EDGE CREATED ===

Edge:     ${validatedEdge.edgeId}
From:     ${validatedEdge.from}
To:       ${validatedEdge.to}
Type:     ${validatedEdge.type}
Branch:   ${validatedEdge.branch}

Next:
  onto validate
  onto inspect`);
  }
}
