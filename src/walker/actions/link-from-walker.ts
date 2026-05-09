import { z } from "zod";
import { EdgeTypeSchema, type OntologyNode } from "../../schemas/ontology.js";
import { loadNodeById } from "../../core/project/load.js";
import { validateEdgeDirection } from "../../runtime/graph/poset.js";
import { createProposal } from "../../core/proposals/persist.js";

export interface LinkFromWalkerOptions {
  // Source endpoint of the proposed edge. Always the focal node when the
  // walker triggers this action; explicit param so the function is
  // testable in isolation.
  focal: OntologyNode;
  to: string;
  type: string;
  rationale?: string;
  cwd?: string;
}

export type LinkFromWalkerResult =
  | { ok: true; proposalId: string; from: string; to: string; type: string }
  | { ok: false; message: string };

// Walker action: turn a focal-relative `:link --to X --type T` into an
// `edge_create` proposal. Mirrors the CLI's `onto propose link` semantics
// (self-loop rejection, edge-type validation, poset direction enforcement,
// both endpoints' integrity hashes pinned), with one walker-specific
// constraint: the source endpoint is always the focal — there is no
// `--from` flag.
export function linkFromWalker(options: LinkFromWalkerOptions): LinkFromWalkerResult {
  const cwd = options.cwd ?? process.cwd();
  const focal = options.focal;

  if (focal.id === options.to) {
    return { ok: false, message: `cannot link a node to itself (${focal.id})` };
  }

  let edgeType: z.infer<typeof EdgeTypeSchema>;
  try {
    edgeType = EdgeTypeSchema.parse(options.type);
  } catch {
    return {
      ok: false,
      message: `invalid edge type "${options.type}". Expected one of: ${EdgeTypeSchema.options.join(", ")}`,
    };
  }

  const toNode = loadNodeById(options.to, cwd);
  if (!toNode) {
    return { ok: false, message: `target node not found: ${options.to}` };
  }

  // Pre-validate the poset direction up front. Apply will re-validate too,
  // but failing here gives the user immediate feedback inside the TUI
  // instead of a deferred staled-on-apply.
  const direction = validateEdgeDirection({
    sourceLevel: focal.coordinates.abstraction,
    targetLevel: toNode.coordinates.abstraction,
    edgeType,
  });
  if (!direction.ok) {
    return { ok: false, message: direction.reason };
  }

  try {
    const { proposal } = createProposal({
      mutation: {
        kind: "edge_create",
        payload: {
          from: focal.id,
          to: options.to,
          type: edgeType,
          branch: null,
        },
        fromHash: focal.integrity.hash,
        toHash: toNode.integrity.hash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [focal.id, options.to],
        rationale: options.rationale ?? "linked from walker",
      },
      cwd,
    });
    return {
      ok: true,
      proposalId: proposal.id,
      from: focal.id,
      to: options.to,
      type: edgeType,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: `failed to create proposal: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
