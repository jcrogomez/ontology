import { z } from "zod";

// Ontology invariant:
// Schema definitions enforce the shape of the typed intention network.

export const OntologySchemaVersion = "0.1.0";

// Abstraction levels define the poset coordinates.
// Lower nodes can refine but not mutate higher nodes.
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
// Future extension point:
// Multimodal support will be expanded to encompass generic files and datasets.
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

// Ontology invariant:
// Nodes are semantic intentions, code is merely the compiled shadow.
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
  // Literal escape hatch (Project Legend Phase β-2). When set, the compile
  // pipeline emits this text verbatim instead of dispatching the model.
  // Audit chain is preserved (a persisted run with provider="literal" is
  // still written); validator and runtime check still apply. Used for
  // irreducible-specificity content: a specific regex, a magic constant,
  // a license header — anything where the model's probabilistic
  // generation would only add risk.
  literal: z.string().optional(),
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

// Semantic relations are stored independently from nodes.
// Failure mode: orphaned edges break graph integrity and queryability.
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
    "node_removed",
    "node_frozen",
    "edge_created",
    "edge_updated",
    "edge_removed",
    "asset_added",
    "model_added",
    "processor_added",
    "preset_applied",
    "validation_run",
    "compilation_run",
    "run_persisted",
    "proposal_created",
    "proposal_rejected",
    "proposal_applied",
    "proposal_staled",
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

// LLM provider enum, kept aligned with `src/runtime/llm/types.ts` LlmProvider union.
// Schemas use this when a provider is part of an auditable record.
//
// "literal" is the non-LLM provider: a node with `node.literal` set bypasses
// dispatch and persists a synthetic run whose output is the literal text.
// Audit chain stays intact; the provider field tells the auditor the bytes
// came from a hand-pinned escape hatch, not a probabilistic call.
export const LlmProviderSchema = z.enum([
  "mock",
  "ollama",
  "openai",
  "anthropic",
  "local",
  "literal",
]);

// Persisted run records live under `.ontology/runs/run_<id>.json`.
// Two structurally identical runs share the same id (content-addressed).
// See docs/RUN_PERSISTENCE.md for the full RFC.
export const PersistedRunInputSchema = z.object({
  promptHash: z.string().startsWith("prompt:hash:"),
  contextHash: z.string().startsWith("ctx:hash:").nullable().default(null),
  targetNodeId: z.string().nullable().default(null),
  branch: z.string().nullable().default(null),
  time: z.number().int().min(0).nullable().default(null),
  task: z.string(),
  includeEdges: z.boolean().default(false),
  edgeTypes: z.array(EdgeTypeSchema).nullable().default(null),
});

export const PersistedRunModelSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string(),
  host: z.string().nullable().default(null),
});

export const PersistedRunOutputSchema = z.object({
  text: z.string(),
  parsed: z.unknown().nullable().default(null),
});

export const PersistedRunValidationSchema = z.object({
  ok: z.boolean(),
  score: z.number(),
  violations: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const PersistedRunSchema = z.object({
  id: z.string().startsWith("run_"),
  createdAt: z.number().int().min(0),
  kind: z.enum(["prompt", "context"]),
  input: PersistedRunInputSchema,
  model: PersistedRunModelSchema,
  output: PersistedRunOutputSchema,
  validation: PersistedRunValidationSchema.nullable().default(null),
  duration_ms: z.number().int().min(0),
  hash: z.string().startsWith("run:hash:"),
});

export type PersistedRun = z.infer<typeof PersistedRunSchema>;
export type PersistedRunInput = z.infer<typeof PersistedRunInputSchema>;
export type PersistedRunModel = z.infer<typeof PersistedRunModelSchema>;
export type PersistedRunOutput = z.infer<typeof PersistedRunOutputSchema>;
export type PersistedRunValidation = z.infer<typeof PersistedRunValidationSchema>;

// Proposal records live under `.ontology/proposals/proposal_<id>.json`.
// A proposal is a typed candidate mutation that has not yet been applied to
// the graph. Models may produce proposals; only an explicit `proposal apply`
// command may translate one into a real graph mutation. See docs/PROPOSAL_SYSTEM.md.

// Source pins a proposal to the model run that generated it. For manually
// authored proposals (no LLM in the loop), source is null.
export const ProposalSourceSchema = z.object({
  runId: z.string().startsWith("run_"),
  contextHash: z.string().startsWith("ctx:hash:").nullable(),
  promptHash: z.string().startsWith("prompt:hash:"),
  provider: LlmProviderSchema,
  model: z.string(),
});

// node_create: propose adding a new node as a child of an existing parent.
// parentHash pins the proposal to the parent's state at creation time.
//
// The base fields (level / kind / prompt / label / parentNodeId) have
// been on this schema since the proposal system shipped. The optional
// "rich" fields (manifestation / language / requires / provides /
// forbids / rules / literal) were added in Project Legend γ-3 so
// `onto ingest` can produce proposals that, when applied, create a
// complete node in one step — no follow-up `onto node update --requires
// ... --provides ...` needed. The fields mirror the equivalents on
// CreateNodeOptions and OntologyNode, so a proposal with everything
// set is a 1:1 description of the node that apply will create.
//
// All rich fields are optional + nullable, so:
//   - Pre-γ-3 proposals (which never set these) keep parsing.
//   - The discriminator on apply is `payload.<field> !== undefined`:
//     undefined → use createNode's default (e.g. manifestation "intent"
//     when the field is missing); set → thread to createNode verbatim.
export const ProposalNodeCreatePayloadSchema = z.object({
  level: AbstractionLevelSchema,
  kind: NodeKindSchema,
  prompt: z.string(),
  label: z.string().nullable().default(null),
  parentNodeId: z.string().startsWith("node_"),
  // Rich fields — optional, mirror the equivalents on createNode.
  manifestation: ManifestationSchema.optional(),
  language: z.string().optional(),
  requires: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  forbids: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional(),
  // The β-2 literal escape hatch can also be proposed: an ingest run
  // can flag a node as "pin verbatim" so apply creates it with
  // node.literal already set.
  literal: z.string().optional(),
  // Source-file paths the proposed node descends from (Project Legend
  // γ-5). For an `onto ingest <file>` proposal the array has one
  // entry — the path that was extracted. For multi-file ingest, γ-6
  // will resolve file-path edges back to node IDs by matching on
  // `outputs.files[0]` after the proposals are applied. The field
  // lands on the created node's `outputs.files`.
  sourceFiles: z.array(z.string()).optional(),
});

// edge_create: propose adding a typed edge between two existing nodes.
// Both fromHash and toHash pin the proposal to both endpoints' state at
// creation time, since a divergence in either invalidates the proposal.
export const ProposalEdgeCreatePayloadSchema = z.object({
  from: z.string().startsWith("node_"),
  to: z.string().startsWith("node_"),
  type: EdgeTypeSchema,
  branch: z.string().nullable().default(null),
});

export const ProposalMutationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("node_create"),
    payload: ProposalNodeCreatePayloadSchema,
    // Hash of the parent node at proposal creation time. Re-validated when
    // the proposal is applied so an out-of-band mutation invalidates the
    // proposal (staled state) instead of silently acting on stale assumptions.
    parentHash: z.string(),
  }),
  z.object({
    kind: z.literal("edge_create"),
    payload: ProposalEdgeCreatePayloadSchema,
    // Both endpoints' hashes are captured at proposal time. Apply re-loads
    // both nodes and stales the proposal if either has diverged.
    fromHash: z.string(),
    toHash: z.string(),
  }),
]);

export const ProposalValidationSnapshotSchema = z.object({
  ok: z.boolean(),
  score: z.number(),
  violations: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const ProposalProvenanceSchema = z.object({
  derivedFrom: z.array(z.string().startsWith("node_")).default([]),
  rationale: z.string().nullable().default(null),
});

export const ProposalStatusSchema = z.enum([
  "pending",
  "applied",
  "rejected",
  "staled",
]);

export const ProposalSchema = z.object({
  id: z.string().startsWith("proposal_"),
  createdAt: z.number().int().min(0),
  status: ProposalStatusSchema,
  source: ProposalSourceSchema.nullable(),
  mutation: ProposalMutationSchema,
  validation: ProposalValidationSnapshotSchema.nullable(),
  provenance: ProposalProvenanceSchema,
  hash: z.string().startsWith("proposal:hash:"),
});

export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalSource = z.infer<typeof ProposalSourceSchema>;
export type ProposalMutation = z.infer<typeof ProposalMutationSchema>;
export type ProposalNodeCreatePayload = z.infer<typeof ProposalNodeCreatePayloadSchema>;
export type ProposalEdgeCreatePayload = z.infer<typeof ProposalEdgeCreatePayloadSchema>;
export type ProposalValidationSnapshot = z.infer<typeof ProposalValidationSnapshotSchema>;
export type ProposalProvenance = z.infer<typeof ProposalProvenanceSchema>;
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

// Drafts are ephemeral working state. The walker (v1+) writes them when a user
// edits a candidate child of the focal node; the user later promotes the draft
// to a real proposal via `:propose`. Drafts are NOT events: they live under
// .ontology/work/drafts/ and may be deleted at any time without auditing.
//
// They are the only mutable on-disk state in the system; everything else is
// append-only or content-addressed. The justification: drafts are *intent
// being typed*, not *intent committed*. A keystroke is not a graph mutation.
export const NodeDraftSchema = z.object({
  focalNodeId: z.string().startsWith("node_"),
  // Prompt content the user is composing. Becomes payload.prompt on propose.
  draftPrompt: z.string(),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
});

export type NodeDraft = z.infer<typeof NodeDraftSchema>;

// Bootstrap boundary:
// State provides high-level metrics for quick inspection without graph traversal.
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
