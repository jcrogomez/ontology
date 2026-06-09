import { applyProposal, loadProposal } from "../../core/proposals/persist.js";
import { errorMessage } from "../../core/errors.js";
import { loadNodes } from "../../core/project/load.js";
import { readState } from "../../core/state/state-store.js";
import { glueFragments } from "../../runtime/context/gluing.js";
import type { ContextFragment } from "../../runtime/context/presheaf.js";

export interface ProposalApplyOptions {
  dryRun?: boolean;
  json?: boolean;
  // O-gate (CONTEXT_GLUING_REGIMES.md): before applying a node_create or
  // node_update proposal that declares `provides`, run the O2
  // `identify-if-equal` sheaf check of the candidate against the existing
  // providers of the same keys (same branch). A compatible re-provision
  // (identical signature) is reported as an identification; an incompatible
  // one (drift / missing signature) is reported as a provider-drift warning.
  // Opt-in; warns only unless `strict` is set.
  checkProviders?: boolean;
  // Blocking mode over the provider check (implies checkProviders): drift
  // BLOCKS the apply and the proposal stays pending (not staled — staling is
  // for snapshot divergence; drift is a contract conflict the human can
  // resolve and retry). A check that ERRORS also blocks under strict:
  // cannot verify ⇒ do not apply (unknown ⇒ conflict, never a false pass).
  strict?: boolean;
}

interface ProviderCheck {
  // Keys the candidate re-provides compatibly with an existing provider.
  identified: Array<{ key: string; withNodeIds: string[] }>;
  // Keys the candidate re-provides INcompatibly (signature drift or missing).
  drift: Array<{ key: string; existingNodeIds: string[] }>;
}

// Lifecycle transition: pending → applied (happy path) or pending → staled
// (parentHash diverged). The CLI surface mirrors the kernel result shape so
// scripts can branch on `kind` in --json mode.
// Run the O2 sheaf check of a pending node_create proposal's declared
// `provides` against the existing providers of the same keys on the same
// branch. Read-only. Returns null when the proposal is not a node_create or
// declares no provides. Existing fragments are stripped to the intersecting
// keys so the glue only exercises the provider-duplication axis (not the
// existing nodes' requires/forbids).
function checkProviderConsistency(id: string, cwd: string): ProviderCheck | null {
  const proposal = loadProposal(id, cwd);
  if (
    !proposal ||
    (proposal.mutation.kind !== "node_create" && proposal.mutation.kind !== "node_update")
  ) {
    return null;
  }
  const payload = proposal.mutation.payload;
  const provides = payload.provides ?? [];
  if (provides.length === 0) return null;
  const sigs = payload.provideSignatures ?? {};
  // For a node_update, the node being updated must not count as an "existing
  // provider" of its own keys — re-providing your own capability is the
  // update itself, not a duplication.
  const selfNodeId =
    proposal.mutation.kind === "node_update" ? proposal.mutation.payload.nodeId : null;
  const branch = readState(cwd).activeBranch;
  const keySet = new Set(provides);

  const candidate: ContextFragment = {
    nodeId: "__candidate__",
    branch,
    provides,
    requires: [],
    forbids: [],
    optional: [],
    rules: [],
    ...(Object.keys(sigs).length > 0 ? { provideSignatures: sigs } : {}),
  };

  const existing: ContextFragment[] = [];
  for (const node of loadNodes(cwd)) {
    if (node.coordinates.branch !== branch) continue;
    if (selfNodeId !== null && node.id === selfNodeId) continue;
    const inter = (node.context.provides as Array<{ key: string; signature?: string }>)
      .filter((p) => keySet.has(p.key));
    if (inter.length === 0) continue;
    const ps: Record<string, string> = {};
    for (const p of inter) if (p.signature !== undefined) ps[p.key] = p.signature;
    existing.push({
      nodeId: node.id,
      branch,
      provides: inter.map((p) => p.key),
      requires: [],
      forbids: [],
      optional: [],
      rules: [],
      ...(Object.keys(ps).length > 0 ? { provideSignatures: ps } : {}),
    });
  }
  if (existing.length === 0) return { identified: [], drift: [] };

  const glued = glueFragments([...existing, candidate], {
    onDuplicateProvider: "identify-if-equal",
  });
  const drift = glued.conflicts
    .filter((c) => c.type === "duplicate_provider" && c.nodeIds.includes("__candidate__"))
    .map((c) => ({
      key: c.message.replace(/^Duplicate provider for key: /, ""),
      existingNodeIds: c.nodeIds.filter((n) => n !== "__candidate__"),
    }));
  const identified = glued.warnings
    .map((w) => w.match(/Identified \d+ providers of key "(.+)" by equal signature/)?.[1])
    .filter((k): k is string => k !== undefined)
    .map((key) => ({
      key,
      withNodeIds: existing.filter((e) => e.provides.includes(key)).map((e) => e.nodeId),
    }));
  return { identified, drift };
}

export async function proposalApplyCommand(id: string, options: ProposalApplyOptions): Promise<void> {
  const dryRun = !!options.dryRun;

  // O2 provider check (opt-in, read-only, before the mutation). Warn-only by
  // default; --strict turns drift (or an errored check) into a block.
  const strict = !!options.strict;
  const runCheck = !!options.checkProviders || strict; // --strict implies the check
  let providerCheck: ProviderCheck | null = null;
  if (runCheck) {
    try {
      providerCheck = checkProviderConsistency(id, process.cwd());
    } catch (err: unknown) {
      if (strict) {
        // Cannot verify ⇒ do not apply. The proposal stays pending.
        failWith(
          `provider check failed and --strict is set — refusing to apply (${errorMessage(err)})`,
          options.json,
        );
        return;
      }
      // Warn-only mode: a check failure must never block a legitimate apply.
      if (!options.json) console.error(`⚠ provider check skipped: ${errorMessage(err)}`);
    }
  }
  if (providerCheck && !options.json) {
    for (const i of providerCheck.identified) {
      console.log(`✓ provider "${i.key}" identified with existing ${i.withNodeIds.join(", ")} (equal signature)`);
    }
    for (const d of providerCheck.drift) {
      console.error(`⚠ provider drift: "${d.key}" already provided by ${d.existingNodeIds.join(", ")} with a different/missing signature — re-provision is NOT a compatible glue`);
    }
  }
  if (strict && providerCheck && providerCheck.drift.length > 0) {
    // The sheaf governs the mutation: a drifting re-provision does not glue,
    // so under --strict it does not apply. Pending, not staled — the human
    // can resolve the drift (or re-run without --strict) and retry.
    if (options.json) {
      console.log(JSON.stringify({
        ok: false,
        kind: "provider_drift",
        error: `provider drift on ${providerCheck.drift.length} key(s) — blocked by --strict; proposal stays pending`,
        providerCheck,
      }, null, 2));
    } else {
      console.error(
        `✖ blocked by --strict: ${providerCheck.drift.length} drifting key(s) above — proposal stays pending (resolve the drift or re-run without --strict)`,
      );
    }
    process.exit(1);
  }

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
      ...(providerCheck ? { providerCheck } : {}),
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
    result.proposal.mutation.kind === "edge_create" ? "Created edge:"
    : result.proposal.mutation.kind === "node_update" ? "Updated node:"
    : result.proposal.mutation.kind === "node_update_parent" ? "Reparented node:"
    : "Created node:";
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
