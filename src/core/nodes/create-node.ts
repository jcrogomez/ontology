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
  type OntologyNode,
  type OntologyEvent
} from "../../schemas/ontology.js";
import { z } from "zod";

export interface CreateNodeOptions {
  level: z.infer<typeof AbstractionLevelSchema>;
  kind: z.infer<typeof NodeKindSchema>;
  prompt: string;
  label?: string;
}

export function createNode(options: CreateNodeOptions): { node: OntologyNode; event: OntologyEvent } {
  const state = readState();
  const paths = getOntologyPaths();

  const nodeId = createSequentialNodeId(state.nodeCount);
  const eventId = "evt_" + randomBytes(4).toString("hex");

  const computedLabel = options.label || options.prompt.trim().slice(0, 64);

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
      manifestation: "intent"
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
      requires: [],
      provides: [],
      forbids: [],
      optional: []
    },
    graph: {
      parentId: state.rootNodeId,
      orbitOf: null
    },
    rules: [],
    technical: {},
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
      prompt: options.prompt
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
