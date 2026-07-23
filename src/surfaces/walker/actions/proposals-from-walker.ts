// Walker action: proposal review pane.
//
// Wraps the proposal core (`listProposals`, `applyProposal`,
// `rejectProposal`) for the Walker v2 PR-1 review pane. The pane
// surfaces pending proposals so the operator doesn't have to drop to
// a shell loop during Phase ε's ~90-proposal apply step.
//
// Each function returns a discriminated union so the panel renderer
// can show success/failure inline without exposing core types to the
// UI layer. The advisory lock (src/kernel/core/fs/lock.ts) is intentionally
// NOT acquired here — apply/reject from the walker run inside a
// single TUI process; the lock would block the operator from
// applying their own proposals. (The lock matters for cross-process
// concurrency, not intra-process ordering.)

import {
  listProposals,
  applyProposal,
  rejectProposal,
} from "../../../kernel/core/proposals/persist.js";
import type { Proposal } from "../../../kernel/schemas/ontology.js";

export interface ProposalsLoadResult {
  ok: boolean;
  proposals: Proposal[];
  pendingCount: number;
  message?: string;
}

/**
 * Load pending proposals for the review pane. Non-pending proposals
 * are filtered out — the panel is for actionable review, not the
 * audit log. Returns proposals sorted by createdAt (oldest first)
 * so the operator works through them in arrival order.
 */
export function loadProposalsForWalker(cwd?: string): ProposalsLoadResult {
  try {
    const all = listProposals(cwd);
    const pending = all
      .filter((p) => p.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt);
    return { ok: true, proposals: pending, pendingCount: pending.length };
  } catch (err: unknown) {
    return {
      ok: false,
      proposals: [],
      pendingCount: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export type ProposalApplyOutcome =
  | "applied"
  | "dry_run"
  | "stale"
  | "missing_parent"
  | "not_found"
  | "not_pending"
  | "mutation_failed"
  | "error";

export interface ProposalApplyWalkerResult {
  ok: boolean;
  /** Discriminator that names the outcome — "applied" / "dry_run" on success, the underlying failure kind otherwise. */
  outcome: ProposalApplyOutcome;
  proposalId: string;
  /** Present on success — the id of the new node or edge that was created (null on dry-run). */
  createdId?: string;
  message?: string;
}

/**
 * Apply a pending proposal from the walker. Wraps `applyProposal`
 * with a discriminated result that's easy to render in a panel row.
 * Pass `dryRun: true` for the preview keystroke (shows what would
 * happen without writing).
 */
export function applyProposalFromWalker(
  id: string,
  options: { dryRun?: boolean; cwd?: string } = {},
): ProposalApplyWalkerResult {
  try {
    const result = applyProposal(id, {
      dryRun: options.dryRun,
      cwd: options.cwd,
    });
    if (!result.ok) {
      return {
        ok: false,
        outcome: result.kind,
        proposalId: id,
        message: result.message,
      };
    }
    if (result.dryRun) {
      return {
        ok: true,
        outcome: "dry_run",
        proposalId: id,
        message: "Dry-run OK: proposal would apply cleanly.",
      };
    }
    return {
      ok: true,
      outcome: "applied",
      proposalId: id,
      ...(result.createdEntityId !== null ? { createdId: result.createdEntityId } : {}),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      outcome: "error",
      proposalId: id,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface ProposalRejectWalkerResult {
  ok: boolean;
  proposalId: string;
  message?: string;
}

/**
 * Reject a pending proposal from the walker. The proposal transitions
 * to `rejected` with a `proposal_rejected` event recording old/new
 * hash. No graph mutation happens.
 */
export function rejectProposalFromWalker(
  id: string,
  options: { reason?: string; cwd?: string } = {},
): ProposalRejectWalkerResult {
  try {
    rejectProposal(id, {
      reason: options.reason ?? "Rejected from walker review pane",
      cwd: options.cwd,
    });
    return { ok: true, proposalId: id };
  } catch (err: unknown) {
    return {
      ok: false,
      proposalId: id,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Display helpers (pure formatting) ───────────────────────────────────────

/**
 * Single-line summary of a proposal for the panel list. Keeps the
 * format compact (one row per proposal) so a Phase ε batch of ~90
 * fits on screen without scrolling per item.
 */
export function summarizeProposalRow(p: Proposal): string {
  if (p.mutation.kind === "node_create") {
    const payload = p.mutation.payload;
    const label = payload.label ?? "(unlabelled)";
    const level = payload.level ?? "—";
    return `${p.id}  node  [${level}]  ${label}`;
  }
  if (p.mutation.kind === "edge_create") {
    const payload = p.mutation.payload;
    return `${p.id}  edge  ${payload.from} → ${payload.to}  (${payload.type})`;
  }
  if (p.mutation.kind === "node_update") {
    const payload = p.mutation.payload;
    // A ficha-repair proposal is a plain node_update whose rationale carries
    // the lever's stamp — mark the row so the operator knows 'a' promotes
    // (with the repair audit event) rather than plain-applies.
    if ((p.provenance.rationale ?? "").startsWith("ficha-repair")) {
      return `${p.id}  REPAIR  ${payload.nodeId}  (${p.provenance.rationale})`;
    }
    const what = [
      payload.prompt !== undefined ? "prompt" : null,
      payload.provides !== undefined ? "provides" : null,
      payload.label !== undefined ? "label" : null,
    ].filter(Boolean).join("+") || "fields";
    return `${p.id}  update  ${payload.nodeId}  (${what})`;
  }
  // node_update_parent — the hierarchizer's reparenting kind.
  const payload = p.mutation.payload;
  return `${p.id}  reparent  ${payload.nodeId} → ${payload.newParentNodeId}`;
}
