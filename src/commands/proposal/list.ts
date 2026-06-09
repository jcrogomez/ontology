import { listProposals } from "../../core/proposals/persist.js";
import { ProposalStatusSchema, type Proposal } from "../../schemas/ontology.js";
import { renderTable } from "../../core/render/table.js";
import { bold, dim, byStatus, statusGlyph, color } from "../../core/render/style.js";

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
      // Either source shape's run record id (run_* / wfrun_*).
      runId: p.source === null
        ? null
        : "kind" in p.source
          ? p.source.workflowRunId
          : p.source.runId,
    }));
    console.log(JSON.stringify({ proposals: summary }, null, 2));
    return;
  }

  console.log(bold("=== ONTOLOGY PROPOSALS ==="));
  if (filtered.length === 0) {
    console.log(dim(filter ? `(no proposals with status="${filter}")` : "(no proposals)"));
    return;
  }
  console.log(dim(`${filtered.length} proposal${filtered.length === 1 ? "" : "s"}`));
  console.log("");

  console.log(renderTable<Proposal>(filtered, [
    { header: "", render: (r) => statusGlyph((r as Proposal).status) },
    { header: "Proposal ID",  render: (r) => (r as Proposal).id },
    { header: "Status",       render: (r) => byStatus((r as Proposal).status) },
    { header: "Mutation",     render: (r) => color((r as Proposal).mutation.kind, "magenta") },
    { header: "Created",      render: (r) => dim(new Date((r as Proposal).createdAt * 1000).toISOString()) },
  ]));
}
