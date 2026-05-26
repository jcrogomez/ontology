import { z } from "zod";

// Workflow-runtime v0 schemas (Phase ζ).
//
// A workflow graph is a small directed state machine that the
// workflow executor walks one node at a time, branching on
// structured verifier output and looping until a terminal node is
// reached or the step budget is exhausted. The motivating use case is
// the verify-refine pattern from Huang & Yang 2025
// (arXiv:2507.15855v4) for IMO 2025 — generate → improve → verify →
// branch → loop or accept/reject — but the design is generic: any
// generate / verify / branch / loop workflow with a stopping
// criterion fits.
//
// Design decision: workflow schemas are STANDALONE, deliberately
// separate from `src/schemas/ontology.ts`. The spec's §6 suggested
// extending `OntologyNode.coordinates` with workflow-specific fields,
// but workflows model *execution* (where a runtime visits each node
// possibly many times) while ontology nodes model *intent* (where each
// node is a static intention). The two graphs have different
// invariants — ontology nodes carry abstraction levels, planes,
// manifestations, time coordinates; workflow nodes do not. Conflating
// them would force every workflow JSON to fill 8+ unused ontology
// fields and would propagate workflow-specific validation into the
// ontology schema. Keeping them separate is the small-blast-radius
// move; v1 can revisit if real use surfaces a need to unify.
//
// See docs/legend/WORKFLOW_RUNTIME_SPEC.md for the full design.

// ── Node kinds ──────────────────────────────────────────────────────────────

/**
 * Workflow node kind. The executor dispatches differently per kind:
 *   - `generator` emits free-form text from its prompt + the incoming
 *     input; exactly one outgoing `feeds` edge.
 *   - `verifier` emits a Zod-validated verdict from its prompt + the
 *     incoming input; one or more outgoing `branches_on` edges.
 *   - `terminal` is a no-LLM endpoint; carries `terminalVerdict`
 *     ("accept" or "reject") and no outgoing edges.
 */
export const WorkflowNodeKindSchema = z.enum([
  "generator",
  "verifier",
  "terminal",
]);
export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;

/**
 * Terminal-node verdict. Surfaced as the workflow's overall result
 * when the executor reaches a terminal node.
 */
export const TerminalVerdictSchema = z.enum(["accept", "reject"]);
export type TerminalVerdict = z.infer<typeof TerminalVerdictSchema>;

/**
 * Name of a pre-registered verifier output schema. v0 ships two
 * named shapes; v1 will accept user-defined schemas via a registry.
 * See `src/runtime/workflow/verifier-schemas.ts` for the canonical
 * mapping.
 */
export const VerifierSchemaNameSchema = z.enum([
  "simple-pass-fail",
  "with-severity",
]);
export type VerifierSchemaName = z.infer<typeof VerifierSchemaNameSchema>;

// ── Node ────────────────────────────────────────────────────────────────────

/**
 * A workflow node. The exact required-field set depends on `kind`:
 *   - generator: requires `prompt`.
 *   - verifier: requires `prompt` + `verifierSchema`.
 *   - terminal: requires `terminalVerdict`; ignores `prompt`.
 *
 * The optional `system`, `model`, and `temperature` fields are passed
 * straight through to the LLM dispatcher when present. `metadata` is
 * a free-form bag the runtime echoes into the trace for downstream
 * consumers (rendering, debugging, post-hoc analysis).
 */
export const WorkflowNodeSchema = z
  .object({
    /** Stable id within the graph. Used by edges + the trace. */
    id: z.string().min(1),
    kind: WorkflowNodeKindSchema,
    /** LLM prompt body. Required for generator + verifier. */
    prompt: z.string().optional(),
    /** Optional system prompt prepended to the dispatch. */
    system: z.string().optional(),
    /**
     * Model override for THIS node. Falls back to the CLI-wide
     * `--model` and then to the dispatcher's task-default routing.
     */
    model: z.string().optional(),
    /** Sampling temperature override. */
    temperature: z.number().min(0).max(2).optional(),
    /** Verifier output schema name. Required iff kind === verifier. */
    verifierSchema: VerifierSchemaNameSchema.optional(),
    /** Terminal verdict. Required iff kind === terminal. */
    terminalVerdict: TerminalVerdictSchema.optional(),
    /** Free-form metadata echoed into the trace. */
    metadata: z.record(z.string(), z.unknown()).optional(),
    /**
     * When set on a generator, the executor skips the LLM dispatch
     * and the node's output equals its input verbatim. Used to
     * preserve an artefact across a verifier self-loop — the IMO
     * verify-refine flow's "consecutive passes" semantic requires
     * re-verifying the SAME solution multiple times, which is what
     * a pass-through node enables when wired between two
     * branches_on edges from a verifier to itself.
     */
    passThrough: z.boolean().optional(),
  })
  .refine(
    (n) =>
      n.kind !== "generator" ||
      n.passThrough === true ||
      (typeof n.prompt === "string" && n.prompt.length > 0),
    { message: "generator node requires a non-empty `prompt` (unless passThrough is set)" },
  )
  .refine(
    (n) =>
      n.kind !== "verifier" ||
      (typeof n.prompt === "string" &&
        n.prompt.length > 0 &&
        n.verifierSchema !== undefined),
    { message: "verifier node requires non-empty `prompt` and `verifierSchema`" },
  )
  .refine(
    (n) => n.kind !== "terminal" || n.terminalVerdict !== undefined,
    { message: "terminal node requires `terminalVerdict`" },
  );

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

// ── Edge ────────────────────────────────────────────────────────────────────

/**
 * `feeds` edge: the source's output becomes the target's input.
 * Used to chain generators and to connect a verifier's correction
 * path back to upstream regeneration. Sources of `feeds` edges
 * MUST emit text (generator or terminal); verifiers emit structured
 * verdicts that branches_on consumes — they cannot feed.
 */
export const WorkflowFeedsEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.literal("feeds"),
});

/**
 * `branches_on` edge: conditionally fires when the source verifier's
 * verdict satisfies `predicate`. The predicate is a string in the v0
 * DSL (see `src/runtime/workflow/predicate-parser.ts`). Edge
 * resolution is first-match-in-declaration-order — see spec §3.2.
 */
export const WorkflowBranchesOnEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.literal("branches_on"),
  predicate: z.string().min(1),
});

export const WorkflowEdgeSchema = z.discriminatedUnion("type", [
  WorkflowFeedsEdgeSchema,
  WorkflowBranchesOnEdgeSchema,
]);

export type WorkflowFeedsEdge = z.infer<typeof WorkflowFeedsEdgeSchema>;
export type WorkflowBranchesOnEdge = z.infer<typeof WorkflowBranchesOnEdgeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

// ── Graph ───────────────────────────────────────────────────────────────────

/**
 * A complete workflow graph: a list of nodes, a list of edges, and
 * the id of the entry node where execution begins. The executor
 * loads this shape and walks it; the graph-load step (see
 * `src/runtime/workflow/graph-load.ts`) layers additional structural
 * checks that cannot be expressed in pure zod (edge endpoints exist,
 * predicates parse, branch coverage, …).
 */
export const WorkflowGraphSchema = z
  .object({
    /** Optional human label for the graph; surfaced in CLI output. */
    name: z.string().optional(),
    /** Optional one-line description. */
    description: z.string().optional(),
    /** Entry node id; must be present in `nodes`. */
    entry: z.string().min(1),
    nodes: z.array(WorkflowNodeSchema).min(1),
    edges: z.array(WorkflowEdgeSchema),
  })
  .refine(
    (g) => g.nodes.some((n) => n.id === g.entry),
    { message: "graph.entry must reference an existing node id" },
  );

export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
