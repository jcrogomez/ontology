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
  // Optional syntactic interface signature of the provided symbol (O1,
  // docs/design/laws/CONTEXT_GLUING_REGIMES.md). Populated by static ingest where
  // the TS parser can read a written signature; absent for manually-declared
  // / LLM-extracted / untyped provisions. Gluing IGNORES this today — it is
  // future discriminator material for O2's identify-if-equal policy, never a
  // token the validator reads.
  signature: z.string().optional(),
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
  // Cached human-readable translation of what this node does — populated
  // by `onto node inspect` (Project Legend δ-1). One LLM call per node
  // lifetime: the inspector reads the node's prompt + context + rules and
  // emits a 3-5 sentence developer-facing summary. Cached so subsequent
  // `onto node inspect <id>` calls return the stored text without a new
  // dispatch. `sourceHash` captures the inputs that produced the
  // translator so a future invalidation pass (when prompt / rules /
  // contract change) can detect a stale cache. `--regenerate` forces a
  // fresh dispatch and overwrites the cache.
  translator: z.object({
    text: z.string(),
    model: z.string(),
    provider: z.string(),
    generatedAt: z.string(),
    sourceHash: z.string(),
  }).optional(),
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
    // Hierarchizer §10 item 3 / `node_update_parent` proposal kind:
    // emitted by `updateNodeParent` after a leaf-node reparent. Carries
    // { nodeId, oldParentId, newParentId, oldHash, newHash } so the
    // audit chain reconstructs the parent edge that changed without
    // re-loading every node.
    "node_parent_updated",
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
    // Project Legend δ-1: emitted by `onto node inspect` when a fresh
    // translator dispatch lands on the node. Cache hits do NOT emit
    // (no API spend, no provenance to record).
    "node_inspected",
    // Project Legend δ-2: emitted by `onto verify-homeomorphism` after
    // a sweep completes (one event per CLI invocation, carrying the
    // aggregate verdict counts + per-node ids). The temporal log
    // becomes the canonical timeline of "what we measured, when".
    "homeomorphism_verified",
    // `onto drift --update`: a new Merkle anchor over the compiled
    // artifacts was persisted. Carries { rootHash, leafCount,
    // changedNodeIds } relative to the previous anchor (if any). Pure
    // measurement runs (no --update) do NOT emit — they are free to
    // repeat and record nothing.
    "drift_anchored",
    // MVP regen loop (MVP_REGEN_LOOP.md §1 / FORK_AND_DIFF.md slice 1):
    // the ficha-repair audit trail. `repair_proposed` records a candidate
    // enriched ficha (operator R_strict/R_perm/human, parent→fork
    // fichaHash, the FIXED evaluation rung). `repair_promoted` /
    // `repair_discarded` record the human's Walker decision together with
    // the flip-diff evidence that informed it. The loop's own history
    // stays in the same append-only log it already audits.
    "repair_proposed",
    "repair_promoted",
    "repair_discarded",
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

// Capability descriptors for premise-based ladder selection (executor layer).
// Optional and additive: when absent, the model-ladder selector derives caps
// from `provider` (ollama → local/free/open-weights, anthropic/openai/gemini →
// cloud/paid/closed). The architect expresses a ModelPremise (e.g. "prefer
// local, escalate to cloud-open-free, never paid") and the selector resolves it
// into an ordered escalation ladder over these caps. See
// src/runtime/executor/model-ladder.ts.
export const ModelCapsSchema = z.object({
  // Where the model runs. Drives the $0/local-default premise.
  locality: z.enum(["local", "cloud"]),
  // Coarse capability tier — the natural escalation axis.
  tier: z.enum(["cheap", "mid", "frontier"]),
  // Whether using it costs money. The default premise forbids "paid" so opus
  // is excluded from the ladder unless the human opts in explicitly.
  cost: z.enum(["free", "paid"]),
  // Open-weights vs closed. Lets a premise prefer open models.
  openWeights: z.boolean(),
});

export type ModelCaps = z.infer<typeof ModelCapsSchema>;

export const OntologyModelSchema = z.object({
  id: z.string(),
  provider: z.enum([
    "mock",
    "openai",
    "anthropic",
    "gemini",
    "ollama",
    "local",
  ]),
  name: z.string(),
  temperature: z.number().min(0).max(2).default(0.2),
  multimodal: z.boolean().default(false),
  notes: z.string().optional(),
  caps: ModelCapsSchema.optional(),
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
  "gemini",
  "local",
  "literal",
]);

// Persisted run records live under `.ontology/runs/run_<id>.json`.
// Two structurally identical runs share the same id (content-addressed).
// See docs/design/kernel/RUN_PERSISTENCE.md for the full RFC.
export const PersistedRunInputSchema = z.object({
  promptHash: z.string().startsWith("prompt:hash:"),
  contextHash: z.string().startsWith("ctx:hash:").nullable().default(null),
  targetNodeId: z.string().nullable().default(null),
  branch: z.string().nullable().default(null),
  time: z.number().int().min(0).nullable().default(null),
  task: z.string(),
  includeEdges: z.boolean().default(false),
  edgeTypes: z.array(EdgeTypeSchema).nullable().default(null),
  // Dispatch knobs that influence the model's output. Optional and
  // omitted from the input object when no overrides are in effect, so
  // legacy runs (which never had this field) and modern default-knob
  // runs produce identical run ids. When set, a knob change (e.g.
  // --max-tokens 16384 vs default 8192) deterministically produces a
  // distinct run id — a retry with a larger budget no longer hits the
  // cached empty-text result from a smaller-budget dispatch (the
  // Vibe-Reasoning γ-7 Step 4 finding).
  dispatch: z
    .object({
      maxTokens: z.number().int().min(1).optional(),
      thinking: z.enum(["adaptive", "disabled"]).optional(),
    })
    .optional(),
});

export const PersistedRunModelSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string(),
  host: z.string().nullable().default(null),
});

export const PersistedRunOutputSchema = z.object({
  text: z.string(),
  parsed: z.unknown().nullable().default(null),
  // Optional usage telemetry from the LLM dispatch. Surfaced so that
  // verify-homeomorphism and similar callers can compute per-node /
  // per-sweep cost without re-querying the provider. Optional so that
  // legacy run records (which never had this field) and adapters that
  // do not report usage (mock, sometimes literal) remain valid.
  usage: z
    .object({
      promptTokens: z.number().int().min(0).optional(),
      completionTokens: z.number().int().min(0).optional(),
      totalTokens: z.number().int().min(0).optional(),
      evalDurationMs: z.number().min(0).optional(),
    })
    .optional(),
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

// Workflow run records live under `.ontology/runs/wfrun_<id>.json`, next to
// the single-dispatch `run_*` records (whose lister filters on the `run_`
// prefix, so the two id spaces coexist). One is written per
// `onto workflow run --as-proposal` execution (spec §3.6) so the resulting
// proposal's `source` stops being null: the record carries the multi-step
// provenance — graph identity, input identity, per-step timing/verdicts —
// that the single-dispatch (runId, promptHash) source shape cannot.
//
// Identity contract differs from PersistedRun ON PURPOSE: workflow
// executions are NOT deterministic functions of (input, model) — verifier
// loops take different paths — so the id is random, never content-derived,
// and there is no cache-on-same-id semantics. The body hash still
// self-certifies the record (verify = recompute-and-compare).
export const WorkflowRunStepSchema = z.object({
  step: z.number().int().min(0),
  nodeId: z.string(),
  kind: z.string(),
  durationMs: z.number().min(0),
  // Verifier verdict label when the step was a verifier; null otherwise.
  verdict: z.string().nullable().default(null),
});

export const WorkflowRunRecordSchema = z.object({
  id: z.string().startsWith("wfrun_"),
  createdAt: z.number().int().min(0),
  graph: z.object({
    name: z.string().nullable().default(null),
    // Basename only — no machine paths, so records are checkout-portable.
    file: z.string(),
    graphHash: z.string().startsWith("wfgraph:hash:"),
  }),
  inputHash: z.string().startsWith("wfinput:hash:"),
  model: z.object({
    // CLI-level overrides; null = per-node routing decided per step.
    provider: z.string().nullable().default(null),
    model: z.string().nullable().default(null),
  }),
  result: z.object({
    verdict: z.enum(["accept", "reject"]),
    reason: z.string().nullable().default(null),
    stepCount: z.number().int().min(0),
    durationMs: z.number().min(0),
  }),
  steps: z.array(WorkflowRunStepSchema),
  hash: z.string().startsWith("wfrun:hash:"),
});

export type WorkflowRunRecord = z.infer<typeof WorkflowRunRecordSchema>;
export type WorkflowRunStep = z.infer<typeof WorkflowRunStepSchema>;

// Proposal records live under `.ontology/proposals/proposal_<id>.json`.
// A proposal is a typed candidate mutation that has not yet been applied to
// the graph. Models may produce proposals; only an explicit `proposal apply`
// command may translate one into a real graph mutation. See docs/design/kernel/PROPOSAL_SYSTEM.md.

// Source pins a proposal to the model run that generated it. For manually
// authored proposals (no LLM in the loop), source is null.
//
// Two shapes (union, not discriminated — the run shape predates the `kind`
// field and on-disk records must keep parsing):
//   1. single-dispatch run source (the original shape) — a proposal born
//      from ONE model call (`run prompt/context --as-proposal`, ingest).
//   2. workflow run source — a proposal born from a MULTI-STEP workflow
//      execution (`onto workflow run --as-proposal`, spec §3.6). It points
//      at a persisted WorkflowRunRecord (`wfrun_*`), which carries the
//      step-by-step provenance a single (runId, promptHash) cannot.
// Narrow with `"kind" in source`.
export const ProposalRunSourceSchema = z.object({
  runId: z.string().startsWith("run_"),
  contextHash: z.string().startsWith("ctx:hash:").nullable(),
  promptHash: z.string().startsWith("prompt:hash:"),
  provider: LlmProviderSchema,
  model: z.string(),
});

export const ProposalWorkflowSourceSchema = z.object({
  kind: z.literal("workflow_run"),
  workflowRunId: z.string().startsWith("wfrun_"),
  graphHash: z.string().startsWith("wfgraph:hash:"),
  inputHash: z.string().startsWith("wfinput:hash:"),
  // CLI-level overrides when set; null means per-node `model` fields and
  // task-default routing decided per step (the record's steps say more).
  provider: z.string().nullable(),
  model: z.string().nullable(),
});

export const ProposalSourceSchema = z.union([
  ProposalRunSourceSchema,
  ProposalWorkflowSourceSchema,
]);

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
  // O1 side channel: per-provides syntactic signature (key → signature),
  // carried PARALLEL to `provides` so the existing `string[]` contract and
  // proposal hash are unchanged when absent (manual / LLM proposals omit it).
  // Threaded verbatim to createNode, which merges it onto the provision
  // objects. See docs/design/laws/CONTEXT_GLUING_REGIMES.md O1(c).
  provideSignatures: z.record(z.string(), z.string()).optional(),
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

// node_update_parent: propose moving an existing node under a different
// parent. The hierarchizer's reparenting plan emits one of these per
// leaf node that needs to land under a freshly-created directory ancestor;
// the walker / TUI uses the same kind for any future manual reparent
// action. The schema-extension closes the §10 item 3 blocker that kept
// `onto graph hierarchize --create-proposals` un-shipped.
//
// Both the node's and the new parent's hashes are captured so the apply
// path stales the proposal on any out-of-band mutation to either side —
// matching the edge_create dual-endpoint hash semantics.
export const ProposalNodeUpdateParentPayloadSchema = z.object({
  nodeId: z.string().startsWith("node_"),
  newParentNodeId: z.string().startsWith("node_"),
});

// node_update: propose rewriting fields of an EXISTING node in place —
// the proposal-gated face of the `updateNode` plasticity primitive. Born
// for the workflow runtime's refine mode (`onto workflow run --as-proposal
// --update-node`, WORKFLOW_RUNTIME_SPEC §3.6): an accepted artefact
// replaces the node's prompt and the measured output contract replaces
// provides/provideSignatures. Every field is opt-in (undefined = preserve),
// mirroring UpdateNodeOptions.
export const ProposalNodeUpdatePayloadSchema = z.object({
  nodeId: z.string().startsWith("node_"),
  prompt: z.string().optional(),
  label: z.string().optional(),
  rules: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  forbids: z.array(z.string()).optional(),
  // Same O1 side channel as node_create: key → signature, merged onto the
  // provision objects by the kernel.
  provideSignatures: z.record(z.string(), z.string()).optional(),
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
  z.object({
    kind: z.literal("node_update"),
    payload: ProposalNodeUpdatePayloadSchema,
    // The node being updated: its hash at proposal-creation time. Apply
    // re-loads the node and stales the proposal on divergence — same
    // snapshot discipline as the other mutation kinds.
    nodeHash: z.string(),
  }),
  z.object({
    kind: z.literal("node_update_parent"),
    payload: ProposalNodeUpdateParentPayloadSchema,
    // The node being reparented: its hash at proposal-creation time.
    // Stales the proposal if the node was independently mutated.
    nodeHash: z.string(),
    // The new parent node's hash at proposal-creation time. Stales the
    // proposal if the new parent was mutated (e.g. another reparent
    // changed its children, which doesn't affect this proposal directly
    // but would still indicate the planner's assumptions have shifted).
    newParentHash: z.string(),
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
export type ProposalRunSource = z.infer<typeof ProposalRunSourceSchema>;
export type ProposalWorkflowSource = z.infer<typeof ProposalWorkflowSourceSchema>;
export type ProposalMutation = z.infer<typeof ProposalMutationSchema>;
export type ProposalNodeCreatePayload = z.infer<typeof ProposalNodeCreatePayloadSchema>;
export type ProposalNodeUpdatePayload = z.infer<typeof ProposalNodeUpdatePayloadSchema>;
export type ProposalEdgeCreatePayload = z.infer<typeof ProposalEdgeCreatePayloadSchema>;
export type ProposalNodeUpdateParentPayload = z.infer<typeof ProposalNodeUpdateParentPayloadSchema>;
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
