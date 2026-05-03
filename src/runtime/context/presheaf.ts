import type { OntologyNode } from "../../schemas/ontology.js";

export interface ContextFragment {
  nodeId: string;
  branch: string;
  provides: string[];
  requires: string[];
  forbids: string[];
  optional: string[];
  rules: string[];
}

export function buildFragment(node: OntologyNode): ContextFragment {
  return {
    nodeId: node.id,
    branch: node.coordinates.branch,
    provides: node.context.provides.map((x: any) => x.key),
    requires: node.context.requires.map((x: any) => x.source),
    forbids: node.context.forbids.map((x: any) => x.source),
    optional: node.context.optional.map((x: any) => x.source),
    rules: node.rules.map((rule: string) => rule.replace(/^\d+\.\s*/, "")),
  };
}
