// Seed-graph template schema (#3 — `onto init --template <name>`).
//
// A template is declarative DATA (templates/<name>.json) describing a starter
// intent-graph: a set of nodes keyed by a template-local id plus the typed
// edges among them. `onto init --template` replays it through the SAME kernel
// primitives (createNode / createEdge) as hand-authoring, so hashes, events
// and state come out correct — nothing pre-hashed is committed.
//
// `parent` and edge `from`/`to` reference either another node's `key` or the
// reserved literal "canon" (the root node every project starts with).

import { z } from "zod";
import {
  AbstractionLevelSchema,
  NodeKindSchema,
  ManifestationSchema,
  EdgeTypeSchema,
} from "../../schemas/ontology.js";

// Reserved key referencing the project root canon node.
export const CANON_KEY = "canon";

export const TemplateNodeSchema = z
  .object({
    key: z.string().min(1),
    level: AbstractionLevelSchema,
    kind: NodeKindSchema,
    prompt: z.string().min(1),
    label: z.string().optional(),
    manifestation: ManifestationSchema.optional(),
    language: z.string().optional(),
    requires: z.array(z.string()).optional(),
    provides: z.array(z.string()).optional(),
    forbids: z.array(z.string()).optional(),
    rules: z.array(z.string()).optional(),
    literal: z.string().optional(),
    // Refinement-parent key (another node's key, or "canon"). Default canon.
    parent: z.string().optional(),
  })
  .strict();

export const TemplateEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: EdgeTypeSchema,
  })
  .strict();

export const TemplateSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    nodes: z.array(TemplateNodeSchema).min(1),
    edges: z.array(TemplateEdgeSchema).default([]),
  })
  .strict();

export type Template = z.infer<typeof TemplateSchema>;
export type TemplateNode = z.infer<typeof TemplateNodeSchema>;
export type TemplateEdge = z.infer<typeof TemplateEdgeSchema>;
