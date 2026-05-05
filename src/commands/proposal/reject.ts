import { rejectProposal, loadProposal } from "../../core/proposals/persist.js";
import { errorMessage } from "../../core/errors.js";

export interface ProposalRejectOptions {
  reason?: string;
  json?: boolean;
}

// Lifecycle transition: pending → rejected.
// Refuses to act on a non-pending proposal. The proposal file is rewritten
// with status="rejected" and a new body hash. A proposal_rejected event
// records both old and new hashes so audits can reconstruct the transition.
export async function proposalRejectCommand(id: string, options: ProposalRejectOptions): Promise<void> {
  // Pre-check just to give a friendlier error for missing-id cases. The core
  // helper itself also throws, but this lets the human path skip a stack trace.
  const current = loadProposal(id);
  if (!current) {
    failWith(`Proposal not found: ${id}`, options.json);
    return;
  }

  try {
    const { proposal, event } = rejectProposal(id, {
      reason: options.reason ?? null,
    });

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        proposal: {
          id: proposal.id,
          status: proposal.status,
          hash: proposal.hash,
        },
        event: {
          eventId: event.eventId,
          eventType: event.eventType,
        },
      }, null, 2));
      return;
    }

    console.log(`=== ONTOLOGY PROPOSAL REJECTED ===`);
    console.log(`Proposal:    ${proposal.id}`);
    console.log(`Status:      ${proposal.status}`);
    if (options.reason) {
      console.log(`Reason:      ${options.reason}`);
    }
    console.log(`New hash:    ${proposal.hash}`);
    console.log(`Event:       ${event.eventId}`);
  } catch (err: unknown) {
    failWith(errorMessage(err), options.json);
  }
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
