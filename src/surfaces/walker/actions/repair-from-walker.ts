// Walker action: the ficha-repair loop (MVP_REGEN_LOOP.md §4.3).
//
// Two halves, mirroring the lever's human-gated shape:
//
//   fireRepairFromWalker  — the single-key async fire ('f' on the focal):
//     runs one R_strict repair at the session provider (the fixed rung) and
//     folds the RepairReport into a proc-row label the cast list can flash.
//     Nothing mutates the node — the result is a pending proposal + flips.
//
//   resolveRepairProposalFromWalker — the proposals panel's repair-aware
//     apply/reject: a repair proposal MUST resolve through resolveRepair so
//     the audit trail records repair_promoted / repair_discarded with the
//     measured identity. isRepairProposal is the panel's routing predicate
//     (the proposal itself is a plain node_update — the repair identity
//     lives in the repair_proposed event, which is what we look up).

import { runFichaRepair, resolveRepair, repairSpecForProposal } from "../../../runtime/executor/repair.js";
import type { Proposal } from "../../../kernel/schemas/ontology.js";

export interface RepairFireResult {
  ok: boolean;
  label: string;
  proposalId?: string;
}

/** One async R_strict repair on the focal at the session provider. The label
 *  is the proc row: flips + proposal id on success, the failed stage detail
 *  otherwise. */
export async function fireRepairFromWalker(
  nodeId: string,
  options: { provider: string; model?: string; cwd?: string },
): Promise<RepairFireResult> {
  const report = await runFichaRepair({
    nodeId,
    operator: "R_strict",
    provider: options.provider,
    model: options.model,
    cwd: options.cwd,
  });
  if (!report.ok) {
    if (report.parentAlreadyPasses) return { ok: true, label: "already passes — nothing to repair" };
    return { ok: false, label: `${report.failedStage}: ${report.detail ?? "failed"}` };
  }
  const d = report.diff!;
  const floor = d.meetsDrawFloor ? "" : " (below draw floor)";
  return {
    ok: true,
    proposalId: report.proposalId,
    label: `+${d.wrongToRight.length}/-${d.rightToWrong.length} flips${floor} → ${report.proposalId} (:proposals to review)`,
  };
}

/** Is this proposal a ficha repair? The authoritative signal is its
 *  repair_proposed event; the rationale prefix is only a cheap pre-filter to
 *  avoid an event-log scan per ordinary proposal row. */
export function isRepairProposal(p: Proposal, cwd?: string): boolean {
  if (p.mutation.kind !== "node_update") return false;
  if (!(p.provenance.rationale ?? "").startsWith("ficha-repair")) return false;
  return repairSpecForProposal(cwd ?? process.cwd(), p.id) !== null;
}

export interface RepairResolveWalkerResult {
  ok: boolean;
  proposalId: string;
  decision: "promote" | "discard";
  message?: string;
}

/** Resolve a repair proposal from the panel — apply/reject PLUS the
 *  repair_promoted / repair_discarded audit event with the measured spec. */
export function resolveRepairProposalFromWalker(
  proposalId: string,
  decision: "promote" | "discard",
  cwd?: string,
): RepairResolveWalkerResult {
  const dir = cwd ?? process.cwd();
  const spec = repairSpecForProposal(dir, proposalId);
  if (!spec) {
    return { ok: false, proposalId, decision, message: "no repair_proposed event for this proposal" };
  }
  const r = resolveRepair({ proposalId, decision, spec, cwd: dir });
  return { ok: r.ok, proposalId, decision, message: r.detail };
}
