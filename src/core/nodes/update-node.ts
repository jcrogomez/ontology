import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../project/paths.js";
import { writeJson, readJson, appendJsonl } from "../fs/json.js";
import { readState, writeState } from "../state/state-store.js";
import { hashObject } from "../integrity/hash.js";
import {
  OntologyNodeSchema,
  OntologyEventSchema,
  type OntologyNode,
  type OntologyEvent,
} from "../../schemas/ontology.js";

// `onto node update` primitive.
//
// Edits a node in place: rewrites prompt / label / rules / context tokens
// without going through the supersedes-and-create-v2 ceremony. Each field
// is opt-in — fields omitted from the options are preserved verbatim.
// Passing an empty array clears that array. Re-hashes the node afterward
// and emits a `node_updated` event carrying both old and new hashes, so
// the audit log records exactly what changed.
//
// This is the plasticity primitive: it is what makes the iterative
// loop (write a prompt, see what compile produces, refine the prompt)
// usable without polluting the event log with deprecation chains for
// every micro-iteration. Project Legend's ingest pipeline depends on
// this — extraction is iterative by nature.

export interface UpdateNodeOptions {
  id: string;
  // Optional new values. Undefined = preserve existing. An empty string
  // or empty array = clear / replace with empty.
  prompt?: string;
  label?: string;
  rules?: string[];
  requires?: string[];
  provides?: string[];
  forbids?: string[];
  cwd?: string;
  // Free-form metadata appended to the event payload — useful for
  // proposal-driven updates that want to record the source proposalId.
  eventMetadata?: Record<string, unknown>;
}

export function updateNode(
  options: UpdateNodeOptions,
): { node: OntologyNode; event: OntologyEvent } {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  const nodePath = `${paths.nodesDir}/${options.id}.json`;
  if (!fs.existsSync(nodePath)) {
    throw new Error(`Node not found: ${options.id}`);
  }
  const existing = readJson<OntologyNode>(nodePath);
  const state = readState(cwd);
  const oldHash = existing.integrity.hash;

  // Build the updated node by overlaying only the fields that were passed.
  // Every field not mentioned stays byte-identical to the existing record.
  const updatedPrompt = options.prompt !== undefined
    ? { ...existing.prompt, raw: options.prompt }
    : existing.prompt;

  // Mirror the prompt change into inputs[role=source_prompt] so the run
  // identity stays consistent — the hashing convention reads from both
  // the structured prompt and the inputs array.
  const updatedInputs = options.prompt !== undefined
    ? existing.inputs.map((i) =>
        i.type === "text" && i.role === "source_prompt"
          ? { ...i, value: options.prompt! }
          : i,
      )
    : existing.inputs;

  const updatedContext = {
    ...existing.context,
    requires: options.requires !== undefined
      ? options.requires.map((source) => ({ source, nodeType: "declared" }))
      : existing.context.requires,
    provides: options.provides !== undefined
      ? options.provides.map((key) => ({ key, nodeType: "declared" }))
      : existing.context.provides,
    forbids: options.forbids !== undefined
      ? options.forbids.map((source) => ({ source, nodeType: "declared" }))
      : existing.context.forbids,
  };

  // The hash is computed over the node sans its own `hash` field, so we
  // build an intermediate without it, hash it, then attach the new hash.
  const integrityWithoutHash = {
    frozen: existing.integrity.frozen,
    schemaVersion: existing.integrity.schemaVersion,
  };
  const nodeWithoutHash = {
    ...existing,
    label: options.label !== undefined ? options.label : existing.label,
    prompt: updatedPrompt,
    inputs: updatedInputs,
    rules: options.rules !== undefined ? options.rules : existing.rules,
    context: updatedContext,
    integrity: integrityWithoutHash,
  };
  const newHash = hashObject(nodeWithoutHash);

  const finalNode = OntologyNodeSchema.parse({
    ...nodeWithoutHash,
    integrity: { ...integrityWithoutHash, hash: newHash },
  });

  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "node_updated",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      nodeId: options.id,
      oldHash,
      newHash,
      ...(options.eventMetadata ?? {}),
    },
  });

  writeJson(nodePath, finalNode);
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return { node: finalNode, event };
}
