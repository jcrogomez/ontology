import { applyProposal } from "../../core/proposals/persist.js";
import { errorMessage } from "../../core/errors.js";

export interface ProposalApplyOptions {
  dryRun?: boolean;
  json?: boolean;
}

// Lifecycle transition: pending → applied (happy path) or pending → staled
// (parentHash diverged). The CLI surface mirrors the kernel result shape so
// scripts can branch on `kind` in --json mode.
export async function proposalApplyCommand(id: string, options: ProposalApplyOptions): Promise<void> {
  const dryRun = !!options.dryRun;
  let result;
  try {
    result = applyProposal(id, { dryRun });
  } catch (err: unknown) {
    failWith(errorMessage(err), options.json);
    return;
  }

  if (!result.ok) {
    if (options.json) {
      const payload: Record<string, unknown> = {
        ok: false,
        kind: result.kind,
        error: result.message,
      };
      if (result.proposal) {
        payload.proposal = {
          id: result.proposal.id,
          status: result.proposal.status,
          hash: result.proposal.hash,
        };
      }
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(`✖ ${result.message}`);
      if (result.kind === "stale" && result.proposal) {
        console.error(`  Proposal status is now: ${result.proposal.status}`);
      }
    }
    process.exit(1);
  }

  // Success.
  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: result.dryRun,
      proposal: {
        id: result.proposal.id,
        status: result.proposal.status,
        hash: result.proposal.hash,
      },
      mutation: result.dryRun ? null : {
        createdEntityId: result.createdEntityId,
        eventId: result.mutationEvent?.eventId ?? null,
        eventType: result.mutationEvent?.eventType ?? null,
      },
    }, null, 2));
    return;
  }

  if (result.dryRun) {
    console.log(`=== ONTOLOGY PROPOSAL APPLY (dry-run) ===`);
    console.log(`Proposal:      ${result.proposal.id}`);
    console.log(`Status:        ${result.proposal.status} (would transition to applied)`);
    console.log(`Mutation:      ${result.proposal.mutation.kind}`);
    console.log(`Result:        no changes written (dry-run)`);
    return;
  }

  console.log(`=== ONTOLOGY PROPOSAL APPLIED ===`);
  console.log(`Proposal:      ${result.proposal.id}`);
  console.log(`Status:        ${result.proposal.status}`);
  console.log(`New hash:      ${result.proposal.hash}`);
  // Label the created entity by mutation kind so an edge proposal does not
  // claim "Created node: edge_xxxx" and confuse the human reader.
  const createdLabel =
    result.proposal.mutation.kind === "edge_create" ? "Created edge:" : "Created node:";
  console.log(`${createdLabel}  ${result.createdEntityId}`);
  if (result.mutationEvent) {
    console.log(`Mutation evt:  ${result.mutationEvent.eventId}`);
  }
  if (result.proposalEvent) {
    console.log(`Proposal evt:  ${result.proposalEvent.eventId}`);
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
