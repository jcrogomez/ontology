import { planFichaCleanup, applyFichaCleanup } from "../../commands/ficha.js";

// Walker one-shot control: run the deterministic ficha reconciliation
// (complete missing exports + prune phantom provides) on the focal node, the
// exact action the `:health` dashboard recommends for a node with contract
// gaps. Governed (updateNode) and reversible; reuses the shared core in
// commands/ficha so the delicate provide-signature-preserving apply lives once.

export interface FichaCleanupWalkerResult {
  ok: boolean;
  nodeId: string;
  added: string[];
  pruned: string[];
  message: string;
}

export function fichaCleanupFromWalker(
  nodeId: string,
  cwd: string = process.cwd(),
): FichaCleanupWalkerResult {
  const plan = planFichaCleanup(nodeId, { prune: true }, cwd);
  if (!plan.ok) {
    return { ok: false, nodeId, added: [], pruned: [], message: plan.failure ?? "cleanup failed" };
  }
  if (plan.missing.length === 0 && plan.phantom.length === 0) {
    return {
      ok: true,
      nodeId,
      added: [],
      pruned: [],
      message: plan.pruneSuppressed
        ? "nothing to do — phantom pruning suppressed (export surface not AST-determinable)"
        : "ficha already reconciled (no missing exports, no phantom provides)",
    };
  }
  applyFichaCleanup(plan, cwd);
  const bits: string[] = [];
  if (plan.missing.length) bits.push(`+${plan.missing.length} export(s)`);
  if (plan.phantom.length) bits.push(`−${plan.phantom.length} phantom(s)`);
  return { ok: true, nodeId, added: plan.missing, pruned: plan.phantom, message: bits.join(", ") };
}
