// Replay a validated template onto a freshly-initialised project.
//
// Uses the same kernel primitives as hand-authoring — createNode and
// createEdge — so every node/edge gets a correct content hash, a temporal
// event, and a state update. Operates on process.cwd() (init runs there).
//
// Precondition: loadTemplate() already validated the template's referential
// and poset integrity, so this function does not re-check; it trusts the
// shape and focuses on resolving template-local keys to assigned node ids.

import { createNode } from "../../core/nodes/create-node.js";
import { createEdge } from "../../core/edges/create-edge.js";
import { loadState } from "../../core/project/load.js";
import { CANON_KEY, type Template } from "./schema.js";

export interface ApplyTemplateResult {
  nodesCreated: number;
  edgesCreated: number;
  keyToNodeId: Map<string, string>;
}

export function applyTemplate(template: Template): ApplyTemplateResult {
  const rootNodeId = loadState().rootNodeId;
  const keyToNodeId = new Map<string, string>();

  // Resolve a template key ("canon" or a node key) to a concrete node id.
  const resolve = (key: string): string => {
    if (key === CANON_KEY) return rootNodeId;
    const id = keyToNodeId.get(key);
    if (id === undefined) {
      // Should be unreachable after loadTemplate's integrity check.
      throw new Error(`Template "${template.name}": unresolved key "${key}".`);
    }
    return id;
  };

  // Nodes first, in listed order (parents precede children — enforced at load).
  for (const node of template.nodes) {
    const { node: created } = createNode({
      level: node.level,
      kind: node.kind,
      prompt: node.prompt,
      label: node.label,
      parentNodeId: node.parent !== undefined ? resolve(node.parent) : rootNodeId,
      manifestation: node.manifestation,
      language: node.language,
      requires: node.requires,
      provides: node.provides,
      forbids: node.forbids,
      rules: node.rules,
      literal: node.literal,
      eventMetadata: { template: template.name, templateKey: node.key },
    });
    keyToNodeId.set(node.key, created.id);
  }

  // Then edges.
  let edgesCreated = 0;
  for (const edge of template.edges) {
    const result = createEdge({
      from: resolve(edge.from),
      to: resolve(edge.to),
      type: edge.type,
      eventMetadata: { template: template.name },
    });
    if (result.ok) edgesCreated += 1;
  }

  return { nodesCreated: template.nodes.length, edgesCreated, keyToNodeId };
}
