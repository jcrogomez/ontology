import { loadProposal } from "../../core/proposals/persist.js";

export interface ProposalShowOptions {
  json?: boolean;
}

export async function proposalShowCommand(id: string, options: ProposalShowOptions): Promise<void> {
  const proposal = loadProposal(id);
  if (!proposal) {
    console.error(`✖ Proposal not found: ${id}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY PROPOSAL ${proposal.id} ===`);
  console.log(`Status:      ${proposal.status}`);
  console.log(`CreatedAt:   ${new Date(proposal.createdAt * 1000).toISOString()}`);
  console.log(`Kind:        ${proposal.mutation.kind}`);
  console.log("");

  if (proposal.mutation.kind === "node_create") {
    const p = proposal.mutation.payload;
    console.log(`Mutation (node_create):`);
    console.log(`  Level:        ${p.level}`);
    console.log(`  Node kind:    ${p.kind}`);
    console.log(`  Parent:       ${p.parentNodeId}`);
    console.log(`  Label:        ${p.label ?? "(unset)"}`);
    console.log(`  Prompt:       ${p.prompt}`);
    console.log(`  Parent hash:  ${proposal.mutation.parentHash}`);
  } else if (proposal.mutation.kind === "edge_create") {
    const p = proposal.mutation.payload;
    console.log(`Mutation (edge_create):`);
    console.log(`  From:         ${p.from}`);
    console.log(`  To:           ${p.to}`);
    console.log(`  Type:         ${p.type}`);
    console.log(`  Branch:       ${p.branch ?? "(active)"}`);
    console.log(`  From hash:    ${proposal.mutation.fromHash}`);
    console.log(`  To hash:      ${proposal.mutation.toHash}`);
  }

  console.log("");
  console.log(`Source:`);
  if (proposal.source) {
    console.log(`  Run:        ${proposal.source.runId}`);
    console.log(`  Provider:   ${proposal.source.provider}`);
    console.log(`  Model:      ${proposal.source.model}`);
    console.log(`  Prompt #:   ${proposal.source.promptHash}`);
    if (proposal.source.contextHash) {
      console.log(`  Context #:  ${proposal.source.contextHash}`);
    }
  } else {
    console.log(`  (manual proposal — no model run)`);
  }

  if (proposal.validation) {
    console.log("");
    console.log(`Validation:`);
    console.log(`  OK:         ${proposal.validation.ok}`);
    console.log(`  Score:      ${proposal.validation.score}`);
    console.log(`  Violations: ${proposal.validation.violations.length}`);
    console.log(`  Warnings:   ${proposal.validation.warnings.length}`);
  }

  console.log("");
  console.log(`Provenance:`);
  console.log(`  Derived from: ${proposal.provenance.derivedFrom.join(", ") || "(none)"}`);
  if (proposal.provenance.rationale) {
    console.log(`  Rationale:    ${proposal.provenance.rationale}`);
  }

  console.log("");
  console.log(`Hash:        ${proposal.hash}`);
}
