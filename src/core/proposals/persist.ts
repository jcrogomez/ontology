import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  ProposalSchema,
  OntologyEventSchema,
  type Proposal,
  type ProposalMutation,
  type ProposalSource,
  type ProposalValidationSnapshot,
  type ProposalProvenance,
  type OntologyEvent,
} from "../../schemas/ontology.js";
import { hashObject } from "../integrity/hash.js";
import { getOntologyPaths } from "../project/paths.js";
import { appendJsonl, ensureDir, writeJson } from "../fs/json.js";
import { readState, writeState } from "../state/state-store.js";
import { loadNodeById } from "../project/load.js";
import { createNode } from "../nodes/create-node.js";
import { createEdge } from "../edges/create-edge.js";
import { updateNodeParent, wouldCreateCycle } from "../nodes/update-parent.js";

// Proposal persistence module.
//
// PR #92 — schema + storage + onto propose node + proposal_created event.
// PR #93 — list / show / reject helpers + proposal_rejected event.
// PR #94 (this) — apply lifecycle: parentHash re-validation, stale detection,
//                 atomic translation into a real graph mutation, and the
//                 proposal_applied / proposal_staled events.
//
// The proposal file represents *current* status. When a transition fires,
// the file is rewritten with a new body hash and the event log carries
// both the old hash and the new hash so the audit chain stays intact.

export interface CreateProposalOptions {
  mutation: ProposalMutation;
  source: ProposalSource | null;
  validation: ProposalValidationSnapshot | null;
  provenance: ProposalProvenance;
  cwd?: string;
}

// Sequential id generator. Walks the existing proposals directory and picks
// the next free index. Append-only — proposals are never deleted, so a hole
// in the sequence would mean an out-of-band mutation that we surface as an
// error rather than silently filling.
export function nextProposalId(cwd: string = process.cwd()): string {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.proposalsDir)) {
    return "proposal_0001";
  }
  const existing = fs
    .readdirSync(paths.proposalsDir)
    .filter(f => /^proposal_\d{4,}\.json$/.test(f))
    .map(f => parseInt(f.replace(/^proposal_/, "").replace(/\.json$/, ""), 10))
    .sort((a, b) => a - b);
  const next = existing.length === 0 ? 1 : existing[existing.length - 1] + 1;
  return `proposal_${String(next).padStart(4, "0")}`;
}

export function proposalPath(id: string, cwd: string = process.cwd()): string {
  const paths = getOntologyPaths(cwd);
  return path.join(paths.proposalsDir, `${id}.json`);
}

// Compute the body hash for a proposal. The hash field itself is excluded so
// the record can certify itself without recursion.
function computeProposalHash(record: Omit<Proposal, "hash">): string {
  const digest = hashObject(record);
  return `proposal:hash:${digest}`;
}

export function loadProposal(id: string, cwd: string = process.cwd()): Proposal | null {
  const filePath = proposalPath(id, cwd);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  try {
    return ProposalSchema.parse(JSON.parse(content));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const summary = err.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
      throw new Error(`Failed to parse proposal ${id}: ${summary}`);
    }
    throw new Error(`Failed to parse proposal ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function listProposals(cwd: string = process.cwd()): Proposal[] {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.proposalsDir)) {
    return [];
  }
  const files = fs.readdirSync(paths.proposalsDir).filter(f => f.startsWith("proposal_") && f.endsWith(".json"));
  const out: Proposal[] = [];
  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const proposal = loadProposal(id, cwd);
    if (proposal) {
      out.push(proposal);
    }
  }
  return out.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
}

// Write a new proposal in pending status. Appends proposal_created to events
// and updates state counters. Status is fixed to "pending" here; transitions
// (apply, reject, stale) are handled by future PRs and emit their own events.
export function createProposal(options: CreateProposalOptions): {
  proposal: Proposal;
  event: OntologyEvent;
} {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);

  const id = nextProposalId(cwd);

  const recordWithoutHash: Omit<Proposal, "hash"> = {
    id,
    createdAt: Math.floor(Date.now() / 1000),
    status: "pending",
    source: options.source,
    mutation: options.mutation,
    validation: options.validation,
    provenance: options.provenance,
  };

  const bodyHash = computeProposalHash(recordWithoutHash);
  const proposal = ProposalSchema.parse({ ...recordWithoutHash, hash: bodyHash });

  ensureDir(paths.proposalsDir);
  writeJson(proposalPath(id, cwd), proposal);

  // Temporal log entry. The kernel relies on this rather than directory
  // listings for replay and audit.
  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "proposal_created",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      proposalId: id,
      mutationKind: options.mutation.kind,
      hash: bodyHash,
      runId: options.source?.runId ?? null,
    },
  });
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { proposal, event };
}

export interface RejectProposalOptions {
  reason: string | null;
  cwd?: string;
}

// Lifecycle transition: pending → rejected.
// The proposal file is rewritten with status="rejected" and a new body hash.
// The proposal_rejected event records both the old and new hashes so the
// audit chain in events.jsonl can reconstruct the full transition.
//
// This function refuses to act on any non-pending proposal. Re-rejecting an
// already-rejected proposal is not a no-op; it is a contract violation that
// the caller surfaces to the user.
export function rejectProposal(
  id: string,
  options: RejectProposalOptions,
): { proposal: Proposal; event: OntologyEvent } {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);

  const current = loadProposal(id, cwd);
  if (!current) {
    throw new Error(`Proposal not found: ${id}`);
  }
  if (current.status !== "pending") {
    throw new Error(
      `Proposal ${id} cannot be rejected: status is "${current.status}". Only pending proposals can be rejected.`,
    );
  }

  const oldHash = current.hash;

  // Build the rejected record with the same body, new status, and a fresh hash.
  const recordWithoutHash: Omit<Proposal, "hash"> = {
    id: current.id,
    createdAt: current.createdAt,
    status: "rejected",
    source: current.source,
    mutation: current.mutation,
    validation: current.validation,
    provenance: current.provenance,
  };
  const newHash = computeProposalHash(recordWithoutHash);
  const updated = ProposalSchema.parse({ ...recordWithoutHash, hash: newHash });

  writeJson(proposalPath(id, cwd), updated);

  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "proposal_rejected",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      proposalId: id,
      reason: options.reason ?? null,
      oldHash,
      newHash,
    },
  });
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { proposal: updated, event };
}

// ----- apply (pending → applied) and stale (pending → staled) -----

export interface ApplyProposalOptions {
  cwd?: string;
  // Dry-run: validate everything (parent exists, hash matches, mutation is
  // dispatchable) but do not write anything to disk.
  dryRun?: boolean;
}

export type ApplyProposalResult =
  | {
      ok: true;
      proposal: Proposal;
      proposalEvent: OntologyEvent;
      // The graph mutation event triggered by the apply (e.g. node_created).
      // Absent in dry-run.
      mutationEvent: OntologyEvent | null;
      // The id of the entity created by the mutation (e.g. the new node id).
      // Absent in dry-run.
      createdEntityId: string | null;
      cached?: never;
      dryRun: boolean;
    }
  | {
      ok: false;
      // Why the apply could not proceed. The kernel transitions the proposal
      // to "staled" iff `kind === "stale"`; other failures leave the proposal
      // pending so the user can fix the dependency and retry.
      kind: "not_found" | "not_pending" | "missing_parent" | "stale" | "mutation_failed";
      message: string;
      // Populated when kind === "stale": the proposal record AFTER its
      // status was rewritten to "staled".
      proposal?: Proposal;
      proposalEvent?: OntologyEvent;
    };

// Apply translates a pending proposal into a real graph mutation. The four
// failure modes are total and explicit:
//
//   not_found       — the proposal id does not exist
//   not_pending     — the proposal is already applied / rejected / staled
//   missing_parent  — the parent node referenced by the proposal disappeared
//   stale           — the parent node exists but its integrity hash no longer
//                     matches the parentHash captured at proposal creation;
//                     the proposal is transitioned to "staled" and the event
//                     log records the divergence
//   mutation_failed — the underlying graph mutation (createNode) threw
//
// Only the happy path actually mutates the graph. The kernel never calls
// createNode without first proving the dependency snapshot is still valid.
export function applyProposal(
  id: string,
  options: ApplyProposalOptions = {},
): ApplyProposalResult {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  const dryRun = !!options.dryRun;

  const current = loadProposal(id, cwd);
  if (!current) {
    return { ok: false, kind: "not_found", message: `Proposal not found: ${id}` };
  }
  if (current.status !== "pending") {
    return {
      ok: false,
      kind: "not_pending",
      message: `Proposal ${id} cannot be applied: status is "${current.status}". Only pending proposals can be applied.`,
    };
  }

  // Branch on mutation kind. Each branch re-validates the dependency snapshot
  // captured at proposal creation time, then dispatches the matching kernel
  // helper. Both branches share the same staled / dry-run / error paths.
  if (current.mutation.kind === "node_create") {
    return applyNodeCreate(id, current, dryRun, cwd);
  }
  if (current.mutation.kind === "edge_create") {
    return applyEdgeCreate(id, current, dryRun, cwd);
  }
  if (current.mutation.kind === "node_update_parent") {
    return applyNodeUpdateParent(id, current, dryRun, cwd);
  }

  return {
    ok: false,
    kind: "mutation_failed",
    message: `Unsupported proposal mutation kind: ${(current.mutation as { kind: string }).kind}`,
  };
}

// node_create: compare parent.integrity.hash vs proposal.mutation.parentHash;
// dispatch via createNode if they agree.
function applyNodeCreate(
  id: string,
  current: Proposal,
  dryRun: boolean,
  cwd: string,
): ApplyProposalResult {
  if (current.mutation.kind !== "node_create") {
    // Type narrow — caller already checked, but TS needs the assertion here.
    throw new Error("internal: applyNodeCreate called with non-node_create mutation");
  }
  const parentNodeId = current.mutation.payload.parentNodeId;
  const parentNode = loadNodeById(parentNodeId, cwd);
  if (!parentNode) {
    return {
      ok: false,
      kind: "missing_parent",
      message: `Parent node referenced by proposal no longer exists: ${parentNodeId}`,
    };
  }

  if (parentNode.integrity.hash !== current.mutation.parentHash) {
    if (dryRun) {
      return {
        ok: false,
        kind: "stale",
        message:
          `Proposal ${id} is stale: parent ${parentNodeId} hash changed since proposal creation ` +
          `(expected ${current.mutation.parentHash}, found ${parentNode.integrity.hash}).`,
      };
    }
    const result = transitionProposal(id, current, "staled", {
      reason: "parent_hash_diverged",
      parentNodeId,
      expectedParentHash: current.mutation.parentHash,
      actualParentHash: parentNode.integrity.hash,
    }, cwd, "proposal_staled");
    return {
      ok: false,
      kind: "stale",
      message:
        `Proposal ${id} marked staled: parent ${parentNodeId} hash diverged ` +
        `(expected ${current.mutation.parentHash}, found ${parentNode.integrity.hash}).`,
      proposal: result.proposal,
      proposalEvent: result.event,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      proposal: current,
      proposalEvent: null as unknown as OntologyEvent,
      mutationEvent: null,
      createdEntityId: null,
      dryRun: true,
    };
  }

  let nodeResult;
  try {
    // Thread the optional rich fields straight to createNode. They
    // landed on the proposal payload in γ-3 so `onto ingest` can
    // produce a complete-node proposal — when the fields are absent,
    // createNode's existing defaults apply (manifestation "intent",
    // no language, empty contract / rules). Each field is only
    // forwarded when defined so pre-γ-3 proposals (which never set
    // these) behave identically.
    nodeResult = createNode({
      level: current.mutation.payload.level,
      kind: current.mutation.payload.kind,
      prompt: current.mutation.payload.prompt,
      label: current.mutation.payload.label ?? undefined,
      parentNodeId: current.mutation.payload.parentNodeId,
      manifestation: current.mutation.payload.manifestation,
      language: current.mutation.payload.language,
      requires: current.mutation.payload.requires,
      provides: current.mutation.payload.provides,
      forbids: current.mutation.payload.forbids,
      rules: current.mutation.payload.rules,
      literal: current.mutation.payload.literal,
      sourceFiles: current.mutation.payload.sourceFiles,
      eventMetadata: { sourceProposalId: id },
    });
  } catch (err: unknown) {
    return {
      ok: false,
      kind: "mutation_failed",
      message: `Mutation failed during apply: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result = transitionProposal(id, current, "applied", {
    resultingNodeId: nodeResult.node.id,
    resultingEventId: nodeResult.event.eventId,
  }, cwd, "proposal_applied");

  return {
    ok: true,
    proposal: result.proposal,
    proposalEvent: result.event,
    mutationEvent: nodeResult.event,
    createdEntityId: nodeResult.node.id,
    dryRun: false,
  };
}

// edge_create: compare BOTH endpoints' integrity hashes against the
// fromHash / toHash captured at proposal creation. Dispatch via createEdge
// only when both agree. The kernel preserves poset enforcement and dedup
// since createEdge is the same code path used by `onto node link`.
function applyEdgeCreate(
  id: string,
  current: Proposal,
  dryRun: boolean,
  cwd: string,
): ApplyProposalResult {
  if (current.mutation.kind !== "edge_create") {
    throw new Error("internal: applyEdgeCreate called with non-edge_create mutation");
  }

  const fromId = current.mutation.payload.from;
  const toId = current.mutation.payload.to;
  const fromNode = loadNodeById(fromId, cwd);
  const toNode = loadNodeById(toId, cwd);
  if (!fromNode) {
    return {
      ok: false,
      kind: "missing_parent",
      message: `Source node referenced by proposal no longer exists: ${fromId}`,
    };
  }
  if (!toNode) {
    return {
      ok: false,
      kind: "missing_parent",
      message: `Target node referenced by proposal no longer exists: ${toId}`,
    };
  }

  // Either endpoint divergence is enough to invalidate the proposal. Report
  // the specific divergence so the user can diagnose which dependency moved.
  const fromDiverged = fromNode.integrity.hash !== current.mutation.fromHash;
  const toDiverged = toNode.integrity.hash !== current.mutation.toHash;
  if (fromDiverged || toDiverged) {
    const detail = fromDiverged && toDiverged
      ? `both ${fromId} and ${toId} hashes diverged`
      : fromDiverged
      ? `${fromId} hash diverged (expected ${current.mutation.fromHash}, found ${fromNode.integrity.hash})`
      : `${toId} hash diverged (expected ${current.mutation.toHash}, found ${toNode.integrity.hash})`;
    if (dryRun) {
      return {
        ok: false,
        kind: "stale",
        message: `Proposal ${id} is stale: ${detail}.`,
      };
    }
    const result = transitionProposal(id, current, "staled", {
      reason: "endpoint_hash_diverged",
      fromNodeId: fromId,
      toNodeId: toId,
      expectedFromHash: current.mutation.fromHash,
      actualFromHash: fromNode.integrity.hash,
      expectedToHash: current.mutation.toHash,
      actualToHash: toNode.integrity.hash,
    }, cwd, "proposal_staled");
    return {
      ok: false,
      kind: "stale",
      message: `Proposal ${id} marked staled: ${detail}.`,
      proposal: result.proposal,
      proposalEvent: result.event,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      proposal: current,
      proposalEvent: null as unknown as OntologyEvent,
      mutationEvent: null,
      createdEntityId: null,
      dryRun: true,
    };
  }

  // Dispatch to createEdge (same kernel path as onto node link). createEdge
  // returns ok:false on duplicate; surface that as mutation_failed since the
  // proposal cannot be applied if its target edge already exists.
  const edgeResult = createEdge({
    from: fromId,
    to: toId,
    type: current.mutation.payload.type,
    branch: current.mutation.payload.branch ?? undefined,
    eventMetadata: { sourceProposalId: id },
  });
  if (!edgeResult.ok) {
    return {
      ok: false,
      kind: "mutation_failed",
      message:
        edgeResult.reason === "duplicate"
          ? `Edge already exists between ${fromId} and ${toId} (existing: ${edgeResult.existingEdgeId})`
          : `Mutation failed during apply`,
    };
  }

  const result = transitionProposal(id, current, "applied", {
    resultingEdgeId: edgeResult.edge.edgeId,
    resultingEventId: edgeResult.event.eventId,
  }, cwd, "proposal_applied");

  return {
    ok: true,
    proposal: result.proposal,
    proposalEvent: result.event,
    mutationEvent: edgeResult.event,
    createdEntityId: edgeResult.edge.edgeId,
    dryRun: false,
  };
}

// node_update_parent: re-validate both the target node and the new parent
// hashes (mirrors edge_create's dual-endpoint pattern), then dispatch via
// updateNodeParent. The kernel re-checks cross-branch and cycle invariants
// at apply time; this handler re-checks them in dry-run so a `--dry-run`
// preview surfaces "would cycle" before any state mutates.
function applyNodeUpdateParent(
  id: string,
  current: Proposal,
  dryRun: boolean,
  cwd: string,
): ApplyProposalResult {
  if (current.mutation.kind !== "node_update_parent") {
    throw new Error(
      "internal: applyNodeUpdateParent called with non-node_update_parent mutation",
    );
  }

  const nodeId = current.mutation.payload.nodeId;
  const newParentId = current.mutation.payload.newParentNodeId;
  const targetNode = loadNodeById(nodeId, cwd);
  const newParent = loadNodeById(newParentId, cwd);
  if (!targetNode) {
    return {
      ok: false,
      kind: "missing_parent",
      message: `Target node referenced by proposal no longer exists: ${nodeId}`,
    };
  }
  if (!newParent) {
    return {
      ok: false,
      kind: "missing_parent",
      message: `New parent node referenced by proposal no longer exists: ${newParentId}`,
    };
  }

  // Dual-hash divergence check, identical pattern to applyEdgeCreate.
  const targetDiverged = targetNode.integrity.hash !== current.mutation.nodeHash;
  const newParentDiverged = newParent.integrity.hash !== current.mutation.newParentHash;
  if (targetDiverged || newParentDiverged) {
    const detail = targetDiverged && newParentDiverged
      ? `both ${nodeId} and ${newParentId} hashes diverged`
      : targetDiverged
      ? `${nodeId} hash diverged (expected ${current.mutation.nodeHash}, found ${targetNode.integrity.hash})`
      : `${newParentId} hash diverged (expected ${current.mutation.newParentHash}, found ${newParent.integrity.hash})`;
    if (dryRun) {
      return {
        ok: false,
        kind: "stale",
        message: `Proposal ${id} is stale: ${detail}.`,
      };
    }
    const result = transitionProposal(id, current, "staled", {
      reason: "endpoint_hash_diverged",
      nodeId,
      newParentNodeId: newParentId,
      expectedNodeHash: current.mutation.nodeHash,
      actualNodeHash: targetNode.integrity.hash,
      expectedNewParentHash: current.mutation.newParentHash,
      actualNewParentHash: newParent.integrity.hash,
    }, cwd, "proposal_staled");
    return {
      ok: false,
      kind: "stale",
      message: `Proposal ${id} marked staled: ${detail}.`,
      proposal: result.proposal,
      proposalEvent: result.event,
    };
  }

  // Surface dry-run cycle/branch failures so the user sees them before
  // any state mutates. The kernel still re-checks at apply time — these
  // are not authoritative, just early signal.
  if (targetNode.coordinates.branch !== newParent.coordinates.branch) {
    return {
      ok: false,
      kind: "mutation_failed",
      message:
        `Cross-branch reparenting refused: node ${nodeId} is on branch ` +
        `"${targetNode.coordinates.branch}" but new parent ${newParentId} is on ` +
        `"${newParent.coordinates.branch}".`,
    };
  }
  if (wouldCreateCycle(nodeId, newParentId, cwd)) {
    return {
      ok: false,
      kind: "mutation_failed",
      message:
        `Reparenting ${nodeId} under ${newParentId} would create a cycle ` +
        `(${newParentId} is currently a descendant of ${nodeId}).`,
    };
  }
  if (targetNode.graph.parentId === newParentId) {
    return {
      ok: false,
      kind: "mutation_failed",
      message: `Node ${nodeId} is already a child of ${newParentId}; reparenting would be a no-op.`,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      proposal: current,
      proposalEvent: null as unknown as OntologyEvent,
      mutationEvent: null,
      createdEntityId: null,
      dryRun: true,
    };
  }

  let mutationResult;
  try {
    mutationResult = updateNodeParent({
      id: nodeId,
      newParentNodeId: newParentId,
      cwd,
      eventMetadata: { sourceProposalId: id },
    });
  } catch (err: unknown) {
    return {
      ok: false,
      kind: "mutation_failed",
      message: `Mutation failed during apply: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result = transitionProposal(id, current, "applied", {
    resultingNodeId: mutationResult.node.id,
    resultingEventId: mutationResult.event.eventId,
  }, cwd, "proposal_applied");

  return {
    ok: true,
    proposal: result.proposal,
    proposalEvent: result.event,
    mutationEvent: mutationResult.event,
    createdEntityId: mutationResult.node.id,
    dryRun: false,
  };
}

// Internal helper used by apply (and re-usable by future transitions). Rewrites
// the proposal file with a new status + new hash, and appends a single event
// to events.jsonl that carries both old and new hashes plus extra context.
function transitionProposal(
  id: string,
  current: Proposal,
  to: Proposal["status"],
  extraPayload: Record<string, unknown>,
  cwd: string,
  eventType: "proposal_applied" | "proposal_staled",
): { proposal: Proposal; event: OntologyEvent } {
  const paths = getOntologyPaths(cwd);

  const oldHash = current.hash;
  const recordWithoutHash: Omit<Proposal, "hash"> = {
    id: current.id,
    createdAt: current.createdAt,
    status: to,
    source: current.source,
    mutation: current.mutation,
    validation: current.validation,
    provenance: current.provenance,
  };
  const newHash = computeProposalHash(recordWithoutHash);
  const updated = ProposalSchema.parse({ ...recordWithoutHash, hash: newHash });
  writeJson(proposalPath(id, cwd), updated);

  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType,
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      proposalId: id,
      oldHash,
      newHash,
      ...extraPayload,
    },
  });
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { proposal: updated, event };
}
