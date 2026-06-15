import { z } from "zod";
import { AbstractionLevelSchema, NodeKindSchema } from "../../kernel/schemas/ontology.js";
import { loadNodeById, loadState } from "../../kernel/core/project/load.js";
import { createProposal } from "../../kernel/core/proposals/persist.js";
import { errorMessage } from "../../kernel/core/errors.js";

export interface ProposeNodeOptions {
  level: string;
  kind: string;
  prompt: string;
  label?: string;
  parent?: string;       // node id; defaults to root canon
  rationale?: string;    // optional human-authored explanation
  json?: boolean;
}

// Manually authored proposal for a node creation. Future PRs will let
// `run prompt` / `run context` produce proposals automatically; this command
// is the read-eval slot that the rest of the proposal system will plug into.
export async function proposeNodeCommand(options: ProposeNodeOptions): Promise<void> {
  let level: z.infer<typeof AbstractionLevelSchema>;
  try {
    level = AbstractionLevelSchema.parse(options.level);
  } catch {
    failWith(`Invalid level: "${options.level}". Expected one of: ${AbstractionLevelSchema.options.join(", ")}`, options.json);
    return;
  }

  let kind: z.infer<typeof NodeKindSchema>;
  try {
    kind = NodeKindSchema.parse(options.kind);
  } catch {
    failWith(`Invalid kind: "${options.kind}". Expected one of: ${NodeKindSchema.options.join(", ")}`, options.json);
    return;
  }

  const state = loadState();
  const parentNodeId = options.parent ?? state.rootNodeId;

  // Resolve parent so we can pin the proposal to a specific parent state via
  // its hash. If the parent later changes, an apply call will see a stale
  // proposal and refuse to translate it into a real mutation.
  const parentNode = loadNodeById(parentNodeId);
  if (!parentNode) {
    failWith(`Parent node not found: ${parentNodeId}`, options.json);
    return;
  }

  try {
    const { proposal, event } = createProposal({
      mutation: {
        kind: "node_create",
        payload: {
          level,
          kind,
          prompt: options.prompt,
          label: options.label ?? null,
          parentNodeId,
        },
        parentHash: parentNode.integrity.hash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [parentNodeId],
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
    if (proposal.mutation.kind === "node_create") {
      console.log(`Level:       ${proposal.mutation.payload.level}`);
      console.log(`Node kind:   ${proposal.mutation.payload.kind}`);
      console.log(`Parent:      ${proposal.mutation.payload.parentNodeId}`);
      console.log(`Parent hash: ${proposal.mutation.parentHash}`);
    }
    console.log(`Event:       ${event.eventId}`);
    console.log(``);
    console.log(`Next:`);
    console.log(`  onto proposal show ${proposal.id}`);
    console.log(`  onto proposal apply ${proposal.id}     (planned, not yet implemented)`);
    console.log(`  onto proposal reject ${proposal.id}    (planned, not yet implemented)`);
  } catch (err: unknown) {
    failWith(`Failed to create proposal: ${errorMessage(err)}`, options.json);
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
