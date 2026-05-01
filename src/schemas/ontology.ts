import { z } from "zod";

export const OntologySchemaVersion = "0.1.0";

export const AbstractionLevelSchema = z.enum([
  "canon",
  "project",
  "target",
  "stack",
  "architecture",
  "domain",
  "workflow",
  "interface",
  "unit",
  "token",
  "artifact",
]);

export const PlaneSchema = z.enum([
  "semantic",
  "visual",
  "data",
  "security",
  "runtime",
  "testing",
  "documentation",
  "creative",
]);

export const ManifestationSchema = z.enum([
  "intent",
  "ast",
  "osl",
  "code",
  "test",
  "build",
]);

export const NodeKindSchema = z.enum([
  "canon",
  "decision",
  "rule",
  "constraint",
  "definition",
  "entity",
  "action",
  "function",
  "asset",
  "view",
  "component",
  "token",
  "artifact",
]);

export const NodeStatusSchema = z.enum([
  "draft",
  "valid",
  "invalid",
  "frozen",
  "compiled",
  "failed",
  "superseded",
]);

export const EdgeTypeSchema = z.enum([
  "inherits_from",
  "depends_on",
  "refines",
  "implements",
  "validates_against",
  "uses_token",
  "mutates",
  "reads_from",
  "emits",
  "contradicts",
  "supersedes",
  "belongs_to",
  "triggers",
  "tests",
  "documents",
  "orbits",
  "blocks",
  "unblocks",
]);

// Coordinates locate a node in the multidimensional intention network. They are not cosmetic: validation, slicing and future compilation depend on them.
export const NodeCoordinatesSchema = z.object({
  abstraction: AbstractionLevelSchema,
  time: z.number().int().min(0),
  branch: z.string().default("main"),
  plane: PlaneSchema.default("semantic"),
  manifestation: ManifestationSchema.default("intent"),
  domain: z.string().optional(),
});

// Node inputs are intentionally multimodal from the start. Bootstrap 0.1 only uses text, but future nodes may reference images, files, URLs, audio, video or datasets.
export const NodeInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    value: z.string(),
    role: z.string().default("source"),
  }),
  z.object({
    type: z.literal("asset_ref"),
    assetId: z.string(),
    role: z.string().default("source"),
  }),
  z.object({
    type: z.literal("url"),
    url: z.string().url(),
    role: z.string().default("reference"),
  }),
]);

export const ContextRequirementSchema = z.object({
  source: z.string(),
  nodeType: z.string(),
  entity: z.string().optional(),
  reason: z.string().optional(),
});

export const ContextProvisionSchema = z.object({
  key: z.string(),
  nodeType: z.string(),
  entity: z.string().optional(),
  description: z.string().optional(),
});

// Context is local. A node must declare what it requires, provides, forbids and optionally accepts instead of stealing global context.
export const ContextContractSchema = z.object({
  requires: z.array(ContextRequirementSchema).default([]),
  provides: z.array(ContextProvisionSchema).default([]),
  forbids: z.array(ContextRequirementSchema).default([]),
  optional: z.array(ContextRequirementSchema).default([]),
});

// Model refs are stable handles. Future phases may swap providers or model names without changing every node.
export const NodeModelRefSchema = z.object({
  ref: z.string().default("mock_default"),
});

// Processors define pre and post transformations around a node. Bootstrap 0.1 records the pipeline shape but does not execute it.
export const NodeProcessorsSchema = z.object({
  pre: z.array(z.string()).default([]),
  post: z.array(z.string()).default([]),
});

// Technical descriptors allow target, stack and compiler choices to live in the network instead of being hardcoded in Ontology.
export const TechnicalDescriptorSchema = z.object({
  target: z.string().optional(),
  framework: z.string().optional(),
  language: z.string().optional(),
  runtime: z.string().optional(),
  bundler: z.string().optional(),
  styling: z.string().optional(),
  packageManager: z.string().optional(),
  compilerAdapter: z.string().optional(),
  architectureProfile: z.string().optional(),
}).default({});

export const OntologyNodeSchema = z.object({
  id: z.string().startsWith("node_"),
  label: z.string(),
  kind: NodeKindSchema,
  status: NodeStatusSchema.default("draft"),
  coordinates: NodeCoordinatesSchema,
  inputs: z.array(NodeInputSchema).default([]),
  prompt: z.object({
    raw: z.string().optional(),
    template: z.string().optional(),
    variables: z.record(z.unknown()).default({}),
    language: z.enum(["es", "en"]).default("es"),
  }),
  model: NodeModelRefSchema.default({ ref: "mock_default" }),
  processors: NodeProcessorsSchema.default({ pre: [], post: [] }),
  context: ContextContractSchema,
  graph: z.object({
    parentId: z.string().nullable().default(null),
    orbitOf: z.string().nullable().default(null),
  }),
  rules: z.array(z.string()).default([]),
  technical: TechnicalDescriptorSchema,
  outputs: z.object({
    ast: z.unknown().optional(),
    osl: z.unknown().optional(),
    code: z.string().optional(),
    files: z.array(z.string()).default([]),
    report: z.unknown().optional(),
  }).default({ files: [] }),
  validation: z.object({
    errors: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }).default({ errors: [], warnings: [] }),
  integrity: z.object({
    frozen: z.boolean().default(false),
    hash: z.string(),
    schemaVersion: z.string(),
  }),
});

export type OntologyNode = z.infer<typeof OntologyNodeSchema>;

export const OntologyEdgeSchema = z.object({
  edgeId: z.string().startsWith("edge_"),
  from: z.string().startsWith("node_"),
  to: z.string().startsWith("node_"),
  type: EdgeTypeSchema,
  branch: z.string().default("main"),
  createdAt: z.string(),
  createdByEventId: z.string(),
  integrity: z.object({
    hash: z.string(),
    schemaVersion: z.string(),
  }),
});

export type OntologyEdge = z.infer<typeof OntologyEdgeSchema>;

// Events represent time. They are append-only so the network can be audited, replayed and branched later.
export const OntologyEventSchema = z.object({
  eventId: z.string().startsWith("evt_"),
  sequence: z.number().int().min(0),
  timestamp: z.string(),
  eventType: z.enum([
    "system_init",
    "node_created",
    "node_updated",
    "node_frozen",
    "edge_created",
    "edge_removed",
    "asset_added",
    "model_added",
    "processor_added",
    "preset_applied",
    "validation_run",
    "compilation_run",
  ]),
  branch: z.string().default("main"),
  previousEventId: z.string().nullable().default(null),
  payload: z.record(z.unknown()).default({}),
});

export type OntologyEvent = z.infer<typeof OntologyEventSchema>;

export const OntologyAssetSchema = z.object({
  assetId: z.string().startsWith("asset_"),
  type: z.enum([
    "image",
    "audio",
    "video",
    "file",
    "dataset",
    "code",
    "document",
  ]),
  originalPath: z.string(),
  storedPath: z.string(),
  role: z.string(),
  mimeType: z.string().optional(),
  createdAt: z.string(),
});

export type OntologyAsset = z.infer<typeof OntologyAssetSchema>;

export const OntologyModelSchema = z.object({
  id: z.string(),
  provider: z.enum([
    "mock",
    "openai",
    "anthropic",
    "ollama",
    "local",
  ]),
  name: z.string(),
  temperature: z.number().min(0).max(2).default(0.2),
  multimodal: z.boolean().default(false),
  notes: z.string().optional(),
});

export type OntologyModel = z.infer<typeof OntologyModelSchema>;

export const OntologyProcessorSchema = z.object({
  id: z.string(),
  phase: z.enum(["pre", "post", "both"]),
  description: z.string(),
  enabled: z.boolean().default(true),
});

export type OntologyProcessor = z.infer<typeof OntologyProcessorSchema>;

export const OntologyStateSchema = z.object({
  initialized: z.boolean(),
  schemaVersion: z.string(),
  projectName: z.string(),
  rootNodeId: z.string().startsWith("node_"),
  activeBranch: z.string().default("main"),
  nodeCount: z.number().int().min(0),
  edgeCount: z.number().int().min(0),
  eventCount: z.number().int().min(0),
  lastEventId: z.string().startsWith("evt_"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OntologyState = z.infer<typeof OntologyStateSchema>;
