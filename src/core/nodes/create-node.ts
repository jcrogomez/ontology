import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../project/paths.js";
import { writeJson, appendJsonl } from "../fs/json.js";
import { readState, writeState } from "../state/state-store.js";
import { createSequentialNodeId } from "./node-id.js";
import { hashObject } from "../integrity/hash.js";
import {
  OntologyNodeSchema,
  OntologyEventSchema,
  OntologySchemaVersion,
  AbstractionLevelSchema,
  NodeKindSchema,
  ManifestationSchema,
  type OntologyNode,
  type OntologyEvent
} from "../../schemas/ontology.js";
import { z } from "zod";

export interface CreateNodeOptions {
  level: z.infer<typeof AbstractionLevelSchema>;
  kind: z.infer<typeof NodeKindSchema>;
  prompt: string;
  label?: string;
  // Optional explicit parent. Defaults to the project root canon, which is what
  // `onto node create` uses today. Proposal apply (Bootstrap 0.5 PR #94) passes
  // the parent recorded in the proposal so the resulting node lands where the
  // proposal said it would.
  parentNodeId?: string;
  // Optional manifestation. Defaults to "intent" (an unrendered intention).
  // Compile artifacts use "code" / "test" / "build" so the artifact-writer
  // can pick the correct file extension.
  manifestation?: z.infer<typeof ManifestationSchema>;
  // Optional language tag. Lands in node.technical.language and is used by
  // the artifact writer to pick the right extension when manifestation is
  // "code" or "test" (e.g., "python" → .py).
  language?: string;
  // Optional structured contract tokens. These populate
  // `context.{requires, provides, forbids}` — the same fields the linker
  // enforces post-generation. Pass them at creation time so the user does
  // not have to hand-edit JSON to declare an intent contract. Each token
  // becomes a record with `nodeType: "declared"`, which the validator
  // ignores; the linker only reads `key` / `source`.
  requires?: string[];
  provides?: string[];
  forbids?: string[];
  // Optional inline rules (FORBID:/REQUIRE: prose strings). Pass at create
  // time so the user does not have to hand-edit JSON to add constraints.
  rules?: string[];
  // Optional event metadata. Proposal apply records the source proposalId here
  // so the temporal log carries the back-reference from the resulting
  // node_created event to the proposal that triggered it.
  eventMetadata?: Record<string, unknown>;
}

export function createNode(options: CreateNodeOptions): { node: OntologyNode; event: OntologyEvent } {
  const state = readState();
  const paths = getOntologyPaths();

  const nodeId = createSequentialNodeId(state.nodeCount);
  const eventId = "evt_" + randomBytes(4).toString("hex");

  const computedLabel = options.label || options.prompt.trim().slice(0, 64);
  const parentId = options.parentNodeId ?? state.rootNodeId;

  const nodeWithoutHash = {
    id: nodeId,
    label: computedLabel,
    kind: options.kind,
    status: "draft",
    coordinates: {
      abstraction: options.level,
      time: state.nodeCount,
      branch: state.activeBranch,
      plane: "semantic",
      manifestation: options.manifestation ?? "intent"
    },
    inputs: [
      {
        type: "text",
        value: options.prompt,
        role: "source_prompt"
      }
    ],
    prompt: {
      raw: options.prompt,
      language: "en",
      variables: {}
    },
    model: {
      ref: "mock_default"
    },
    processors: {
      pre: [],
      post: []
    },
    context: {
      requires: (options.requires ?? []).map((source) => ({ source, nodeType: "declared" })),
      provides: (options.provides ?? []).map((key) => ({ key, nodeType: "declared" })),
      forbids: (options.forbids ?? []).map((source) => ({ source, nodeType: "declared" })),
      optional: []
    },
    graph: {
      parentId,
      orbitOf: null
    },
    rules: options.rules ?? [],
    technical: options.language ? { language: options.language } : {},
    outputs: {
      files: []
    },
    validation: {
      errors: [],
      warnings: []
    },
    integrity: {
      frozen: false,
      schemaVersion: OntologySchemaVersion,
    }
  };

  const nodeHash = hashObject(nodeWithoutHash);

  const node = OntologyNodeSchema.parse({
    ...nodeWithoutHash,
    integrity: {
      ...nodeWithoutHash.integrity,
      hash: nodeHash,
    }
  });

  const event = OntologyEventSchema.parse({
    eventId: eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "node_created",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      nodeId,
      level: options.level,
      kind: options.kind,
      prompt: options.prompt,
      ...(options.eventMetadata ?? {})
    }
  });

  // Write the node
  writeJson(`${paths.nodesDir}/${nodeId}.json`, node);

  // Append the event
  appendJsonl(paths.eventsPath, event);

  // Update and save state
  state.nodeCount += 1;
  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();

  writeState(state);

  return { node, event };
}
