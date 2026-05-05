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

// Proposal persistence module.
//
// PR #92 — schema + storage + onto propose node + proposal_created event.
// PR #93 (this) — list / show / reject helpers + proposal_rejected event.
//
// The proposal file represents *current* status. When a transition fires,
// the file is rewritten with a new body hash and the event log carries
// both the old hash and the new hash so the audit chain stays intact.
//
// Apply (pending → applied) and stale (pending → staled) lifecycle
// transitions land in PR #94.

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
  const state = readState();
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
  writeState(state);

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

  const state = readState();
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
  writeState(state);

  return { proposal: updated, event };
}
