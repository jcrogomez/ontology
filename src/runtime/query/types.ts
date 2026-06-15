// Query shape (Yoneda profile) types.
//
// The Yoneda Lemma says a node X is fully determined by Hom(-, X): the
// profile of all morphisms (edges) and properties pointing into and out of
// it. A QueryShape is a *partial* Hom-profile — a witness of constraints
// that any matching node MUST satisfy. The matcher in `representable.ts`
// then returns every node whose actual Hom-profile is a superset of the
// shape.
//
// Field semantics (also documented in docs/design/laws/QUERY_REPRESENTABLE.md):
//   - kind / abstraction / plane / manifestation / status: disjunctive sets
//     ("the node's value must be in this set"). Empty/undefined means "no
//     constraint on this dimension".
//   - branch: exact string match on coordinates.branch when present.
//   - provides / requires / forbids: conjunctive — the node's context
//     contract MUST contain ALL listed concept ids. Matched against
//     contextContract.provides[i].key, .requires[i].source, .forbids[i].source.
//   - hasIncoming / hasOutgoing: conjunctive — the node MUST have AT LEAST
//     ONE incoming/outgoing edge of EACH listed type.
//
// Conjunctions across fields are AND. The empty shape `{}` matches every
// node (the trivial "identity profile").

import { z } from "zod";
import {
  AbstractionLevelSchema,
  EdgeTypeSchema,
  ManifestationSchema,
  NodeKindSchema,
  NodeStatusSchema,
  PlaneSchema,
} from "../../schemas/ontology.js";

export const QueryShapeSchema = z.object({
  // Node-level filters (disjunctive sets).
  kind: z.array(NodeKindSchema).optional(),
  abstraction: z.array(AbstractionLevelSchema).optional(),
  plane: z.array(PlaneSchema).optional(),
  manifestation: z.array(ManifestationSchema).optional(),
  status: z.array(NodeStatusSchema).optional(),
  branch: z.string().optional(),
  // Hom-profile filters (conjunctive — the Yoneda part).
  provides: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional(),
  forbids: z.array(z.string()).optional(),
  hasIncoming: z.array(EdgeTypeSchema).optional(),
  hasOutgoing: z.array(EdgeTypeSchema).optional(),
}).strict();

export type QueryShape = z.infer<typeof QueryShapeSchema>;
