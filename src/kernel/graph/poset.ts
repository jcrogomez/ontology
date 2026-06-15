// Abstraction poset (axiom 3 of the canon).
//
// The 11 abstraction levels are totally ordered, with `canon` at the top and
// `artifact` at the bottom. The canon states:
//
//   "Lower nodes may refine higher nodes, but may not mutate them."
//
// In index terms: a refinement edge points from a higher-index node (more
// concrete) to a lower-index node (more abstract). For the four edges that
// carry refinement semantics, we reject inversions at link time. Other edge
// types remain direction-agnostic in this bootstrap.

import type { OntologyEdge } from "../schemas/ontology.js";
import { AbstractionLevelSchema } from "../schemas/ontology.js";
import type { z } from "zod";

export type AbstractionLevel = z.infer<typeof AbstractionLevelSchema>;

// Explicit, frozen index table. Index 0 = canon (highest abstraction).
// Index 10 = artifact (lowest abstraction).
export const ABSTRACTION_INDEX: Record<AbstractionLevel, number> = {
  canon: 0,
  project: 1,
  target: 2,
  stack: 3,
  architecture: 4,
  domain: 5,
  workflow: 6,
  interface: 7,
  unit: 8,
  token: 9,
  artifact: 10,
};

export function posetIndex(level: AbstractionLevel): number {
  return ABSTRACTION_INDEX[level];
}

// Direction policy per edge type.
//   "upward"  — source.index >= target.index. Edge climbs toward more abstraction.
//   "any"     — direction is not constrained by this bootstrap.
//
// The four "upward" entries are the refinement family of edges; their
// semantics (refines, inherits_from, implements, belongs_to) inherently
// place the more abstract node at the target end. Inversions are
// structurally meaningless and are rejected at link time.
export type EdgeDirectionRule = "upward" | "any";

export const EDGE_DIRECTION_RULES: Record<OntologyEdge["type"], EdgeDirectionRule> = {
  inherits_from: "upward",
  refines: "upward",
  implements: "upward",
  belongs_to: "upward",

  depends_on: "any",
  validates_against: "any",
  uses_token: "any",
  mutates: "any",
  reads_from: "any",
  emits: "any",
  contradicts: "any",
  supersedes: "any",
  triggers: "any",
  tests: "any",
  documents: "any",
  orbits: "any",
  blocks: "any",
  unblocks: "any",
};

export interface DirectionValidationInput {
  sourceLevel: AbstractionLevel;
  targetLevel: AbstractionLevel;
  edgeType: OntologyEdge["type"];
}

export type DirectionValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

// Pure check used by `node link` (preventive) and `validate` (retroactive).
// Returns ok:true unconditionally for any-direction edges. For upward-only
// edges, rejects when source is more abstract than target.
export function validateEdgeDirection(input: DirectionValidationInput): DirectionValidationResult {
  const rule = EDGE_DIRECTION_RULES[input.edgeType];
  if (rule === "any") {
    return { ok: true };
  }
  // rule === "upward"
  const sourceIdx = posetIndex(input.sourceLevel);
  const targetIdx = posetIndex(input.targetLevel);
  if (sourceIdx < targetIdx) {
    return {
      ok: false,
      reason:
        `Edge type "${input.edgeType}" points against the abstraction poset: ` +
        `source is at ${input.sourceLevel} (higher abstraction) ` +
        `but target is at ${input.targetLevel} (lower abstraction). ` +
        `Refinement edges must climb toward more abstraction, not away from it.`,
    };
  }
  return { ok: true };
}
