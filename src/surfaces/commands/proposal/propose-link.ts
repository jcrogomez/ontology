import { z } from "zod";
import { EdgeTypeSchema } from "../../../kernel/schemas/ontology.js";
import { loadNodeById, loadState } from "../../../kernel/core/project/load.js";
import { validateEdgeDirection } from "../../../kernel/graph/poset.js";
import { createProposal } from "../../../kernel/core/proposals/persist.js";
import { errorMessage } from "../../../kernel/core/errors.js";

export interface ProposeLinkOptions {
  from: string;
  to: string;
  type: string;
  branch?: string;
  rationale?: string;
  json?: boolean;
}

// Manually authored edge proposal. Rejects self-loops, missing endpoints,
// invalid edge types, and refinement-family poset inversions up front — the
// same checks `onto node link` performs preventively, so a proposed edge
// that would be rejected at link time is rejected at propose time too.
//
// The proposal pins itself to BOTH endpoints' integrity hashes; if either
// node mutates between propose and apply, `onto proposal apply` will
// detect the divergence and stale the proposal.
export async function proposeLinkCommand(options: ProposeLinkOptions): Promise<void> {
  const failJson = options.json;
  const failWith = (msg: string) => {
    if (failJson) {
      console.log(JSON.stringify({ ok: false, error: msg }));
    } else {
      console.error(`✖ ${msg}`);
    }
    process.exit(1);
  };

  if (options.from === options.to) {
    failWith(`Self-loops are not allowed: ${options.from} cannot link to itself`);
    return;
  }

  let edgeType: z.infer<typeof EdgeTypeSchema>;
  try {
    edgeType = EdgeTypeSchema.parse(options.type);
  } catch {
    failWith(`Invalid edge type: "${options.type}". Expected one of: ${EdgeTypeSchema.options.join(", ")}`);
    return;
  }

  const fromNode = loadNodeById(options.from);
  if (!fromNode) {
    failWith(`Source node not found: ${options.from}`);
    return;
  }
  const toNode = loadNodeById(options.to);
  if (!toNode) {
    failWith(`Target node not found: ${options.to}`);
    return;
  }

  const directionResult = validateEdgeDirection({
    sourceLevel: fromNode.coordinates.abstraction,
    targetLevel: toNode.coordinates.abstraction,
    edgeType,
  });
  if (!directionResult.ok) {
    failWith(directionResult.reason);
    return;
  }

  const state = loadState();

  try {
    const { proposal, event } = createProposal({
      mutation: {
        kind: "edge_create",
        payload: {
          from: options.from,
          to: options.to,
          type: edgeType,
          branch: options.branch ?? null,
        },
        fromHash: fromNode.integrity.hash,
        toHash: toNode.integrity.hash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [options.from, options.to],
        rationale: options.rationale ?? null,
      },
    });

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        proposal: {
          id: proposal.id,
          status: proposal.status,
          mutationKind: proposal.mutation.kind,
          hash: proposal.hash,
        },
        event: {
          eventId: event.eventId,
          eventType: event.eventType,
        },
      }, null, 2));
      return;
    }

    console.log(`=== ONTOLOGY PROPOSAL CREATED ===`);
    console.log(`Proposal:    ${proposal.id}`);
    console.log(`Status:      ${proposal.status}`);
    console.log(`Kind:        ${proposal.mutation.kind}`);
    if (proposal.mutation.kind === "edge_create") {
      console.log(`From:        ${proposal.mutation.payload.from}`);
      console.log(`To:          ${proposal.mutation.payload.to}`);
      console.log(`Type:        ${proposal.mutation.payload.type}`);
      console.log(`Branch:      ${proposal.mutation.payload.branch ?? state.activeBranch}`);
      console.log(`From hash:   ${proposal.mutation.fromHash}`);
      console.log(`To hash:     ${proposal.mutation.toHash}`);
    }
    console.log(`Event:       ${event.eventId}`);
    console.log(``);
    console.log(`Next:`);
    console.log(`  onto proposal show ${proposal.id}`);
    console.log(`  onto proposal apply ${proposal.id}`);
    console.log(`  onto proposal reject ${proposal.id}`);
  } catch (err: unknown) {
    failWith(`Failed to create proposal: ${errorMessage(err)}`);
  }
}
