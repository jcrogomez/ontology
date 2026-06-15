import type { OntologyNode } from "../../kernel/schemas/ontology.js";

export interface ContextFragment {
  nodeId: string;
  branch: string;
  provides: string[];
  requires: string[];
  forbids: string[];
  optional: string[];
  rules: string[];
  // O1 side channel: per-provided-key syntactic signature, carried PARALLEL
  // to `provides` (which stays `string[]`). `glueFragments` ignores this
  // today — keeping it off `provides` is what leaves the gluing token set,
  // §3.9 closed-world parity, and the Axiom 5 presheaf laws untouched. O2's
  // identify-if-equal policy is the first consumer. Absent when no provided
  // symbol carries a signature. See docs/design/laws/CONTEXT_GLUING_REGIMES.md.
  provideSignatures?: Record<string, string>;
}

export function buildFragment(node: OntologyNode): ContextFragment {
  const provideSignatures: Record<string, string> = {};
  for (const p of node.context.provides as Array<{ key: string; signature?: string }>) {
    if (p.signature !== undefined) provideSignatures[p.key] = p.signature;
  }
  return {
    nodeId: node.id,
    branch: node.coordinates.branch,
    provides: node.context.provides.map((x: any) => x.key),
    requires: node.context.requires.map((x: any) => x.source),
    forbids: node.context.forbids.map((x: any) => x.source),
    optional: node.context.optional.map((x: any) => x.source),
    rules: node.rules.map((rule: string) => rule.replace(/^\d+\.\s*/, "")),
    ...(Object.keys(provideSignatures).length > 0 ? { provideSignatures } : {}),
  };
}
