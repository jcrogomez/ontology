import { listProposals } from "../../core/proposals/persist.js";
import { ProposalStatusSchema, type Proposal } from "../../schemas/ontology.js";

export interface ProposalListOptions {
  status?: string;
  json?: boolean;
}

export async function proposalListCommand(options: ProposalListOptions): Promise<void> {
  let filter: Proposal["status"] | null = null;
  if (options.status) {
    const parsed = ProposalStatusSchema.safeParse(options.status);
    if (!parsed.success) {
      console.error(`✖ Invalid status: ${options.status}. Expected one of: ${ProposalStatusSchema.options.join(", ")}`);
      process.exit(1);
    }
    filter = parsed.data;
  }

  const all = listProposals();
  const filtered = filter ? all.filter(p => p.status === filter) : all;

  if (options.json) {
    const summary = filtered.map(p => ({
      id: p.id,
      status: p.status,
      kind: p.mutation.kind,
      createdAt: p.createdAt,
      hash: p.hash,
      runId: p.source?.runId ?? null,
    }));
    console.log(JSON.stringify({ proposals: summary }, null, 2));
    return;
  }

  console.log("=== ONTOLOGY PROPOSALS ===");
  if (filtered.length === 0) {
    console.log(filter ? `(no proposals with status="${filter}")` : "(no proposals)");
    return;
  }
  console.log(`Count: ${filtered.length}`);
  console.log("");
  for (const p of filtered) {
    const created = new Date(p.createdAt * 1000).toISOString();
    console.log(`${p.id}  ${p.status.padEnd(10)}  ${p.mutation.kind.padEnd(14)}  ${created}`);
  }
}
