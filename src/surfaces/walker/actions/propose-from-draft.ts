import { loadDraft, clearDraft } from "../../../kernel/core/drafts/persist.js";
import { createProposal } from "../../../kernel/core/proposals/persist.js";
import type { OntologyNode } from "../../../kernel/schemas/ontology.js";

export interface ProposeFromDraftOptions {
  focal: OntologyNode;
  cwd?: string;
  // When true (default), the draft file is removed after a successful
  // proposal creation. The proposal carries the draft's content from that
  // point on, so leaving the draft would create two sources of truth.
  clearOnSuccess?: boolean;
}

export type ProposeFromDraftResult =
  | { ok: true; proposalId: string }
  | { ok: false; message: string };

// Walker action: read the focal node's draft and turn it into a node_create
// proposal. The proposed node is a child of the focal at the same level/kind
// (a refinement). Source is null because this is a manual proposal — there
// is no model run to attribute. Future PRs may add a `:run` flow that sets
// source from a persisted run.
export function proposeFromDraft(options: ProposeFromDraftOptions): ProposeFromDraftResult {
  const cwd = options.cwd ?? process.cwd();
  const focal = options.focal;

  let draft;
  try {
    draft = loadDraft(focal.id, cwd);
  } catch (err: unknown) {
    return { ok: false, message: `failed to read draft: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!draft) {
    return { ok: false, message: `no draft for ${focal.id} — press i to compose one` };
  }
  if (draft.draftPrompt.trim().length === 0) {
    return { ok: false, message: `draft for ${focal.id} is empty` };
  }

  try {
    const { proposal } = createProposal({
      mutation: {
        kind: "node_create",
        payload: {
          level: focal.coordinates.abstraction,
          kind: focal.kind,
          prompt: draft.draftPrompt,
          label: null,
          parentNodeId: focal.id,
        },
        parentHash: focal.integrity.hash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [focal.id],
        rationale: "drafted in walker",
      },
      cwd,
    });

    if (options.clearOnSuccess !== false) {
      clearDraft(focal.id, cwd);
    }

    return { ok: true, proposalId: proposal.id };
  } catch (err: unknown) {
    return { ok: false, message: `failed to create proposal: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Walker v1.5 action: read the focal node's draft and turn it into a
// `node_update` proposal on the focal ITSELF — the draft replaces the focal's
// prompt on apply. The counterpart of proposeFromDraft (which creates a child
// refinement): `:propose` grows the graph, `:propose-update` refines it in
// place. Pinned to the focal's hash so an out-of-band mutation stales the
// proposal (the same snapshot discipline as the CLI's --update-node path).
export function proposeUpdateFromDraft(options: ProposeFromDraftOptions): ProposeFromDraftResult {
  const cwd = options.cwd ?? process.cwd();
  const focal = options.focal;

  let draft;
  try {
    draft = loadDraft(focal.id, cwd);
  } catch (err: unknown) {
    return { ok: false, message: `failed to read draft: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!draft) {
    return { ok: false, message: `no draft for ${focal.id} — press i to compose one` };
  }
  if (draft.draftPrompt.trim().length === 0) {
    return { ok: false, message: `draft for ${focal.id} is empty` };
  }

  try {
    const { proposal } = createProposal({
      mutation: {
        kind: "node_update",
        payload: {
          nodeId: focal.id,
          prompt: draft.draftPrompt,
        },
        nodeHash: focal.integrity.hash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [focal.id],
        rationale: "drafted in walker (in-place update)",
      },
      cwd,
    });

    if (options.clearOnSuccess !== false) {
      clearDraft(focal.id, cwd);
    }

    return { ok: true, proposalId: proposal.id };
  } catch (err: unknown) {
    return { ok: false, message: `failed to create proposal: ${err instanceof Error ? err.message : String(err)}` };
  }
}
