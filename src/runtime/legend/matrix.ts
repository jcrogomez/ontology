import { z } from "zod";
import type {
  FrontierAttribute,
  TaggerAttribute,
} from "./frontier-tagger.js";
import type {
  HomeomorphismVerdict,
  VerificationUsage,
} from "./verify-homeomorphism.js";

// Matrix aggregator for Project Legend Phase ε prework C.
//
// The verify-homeomorphism pipeline ships a single 5-label verdict
// (`HomeomorphismVerdict`) per node. The Phase ε hypothesis requires a
// six-axis matrix per node: each axis is an orthogonal relation
// between the regenerated artifact F(G(c)) and its original c. This
// module owns:
//
//   1. The canonical state vocabularies for each axis (POSITIONING §2
//      + SELF_INGEST_HYPOTHESIS_2026-05-13 §3).
//   2. The pure mapper from `HomeomorphismVerdict` + node metadata +
//      cost telemetry → `MatrixCell`.
//   3. The verdict-derived frontier-tag mapper (consumed by the
//      intersection aggregator in prework D).
//   4. `aggregateByAxis`, the count-per-state roll-up.
//   5. Zod schemas so the pilot's JSON output is machine-validated.
//
// The mapper is intentionally pure: no IO, no LLM, no state mutation.
// Callers supply `node.literal`, the verify verdict, and a cost
// breakdown; the mapper returns the cell. Axes that the pilot cannot
// measure today (contract, behavior, intent) report explicit
// `not-measured` / `untested` / `not-reviewed` states. Honest "no data"
// is required by the hypothesis — see §3:
//
// > Intent-equivalent: `rejected` means a human reviewer looked and
// > rejected equivalence. `not-reviewed` means no human review
// > happened. The aggregate must keep those separate; otherwise Phase
// > ε measures review scheduling instead of intent fidelity.

// ── State vocabularies ──────────────────────────────────────────────────────

export type ContractState = "pass" | "fail" | "unknown" | "not-measured";
export type StructuralState = "pass" | "fail" | "partial" | "not-measured";
export type BehaviorState = "pass" | "fail" | "untested" | "not-applicable";
export type IntentState =
  | "accepted"
  | "rejected"
  | "needs-human"
  | "not-reviewed";
export type LiteralRequiredState = "true" | "false" | "candidate" | "unknown";

export const CONTRACT_STATES = [
  "pass",
  "fail",
  "unknown",
  "not-measured",
] as const satisfies readonly ContractState[];

export const STRUCTURAL_STATES = [
  "pass",
  "fail",
  "partial",
  "not-measured",
] as const satisfies readonly StructuralState[];

export const BEHAVIOR_STATES = [
  "pass",
  "fail",
  "untested",
  "not-applicable",
] as const satisfies readonly BehaviorState[];

export const INTENT_STATES = [
  "accepted",
  "rejected",
  "needs-human",
  "not-reviewed",
] as const satisfies readonly IntentState[];

export const LITERAL_REQUIRED_STATES = [
  "true",
  "false",
  "candidate",
  "unknown",
] as const satisfies readonly LiteralRequiredState[];

// ── Cost telemetry ──────────────────────────────────────────────────────────

export interface MatrixCost {
  /** "anthropic" | "ollama" | "mock" — the resolved provider name. */
  provider: string;
  /** Resolved model, e.g. "claude-opus-4-7" or "qwen2.5-coder:3b". */
  model: string;
  /** LlmTask used for the dispatch, e.g. "semantic_parse" or "code_sketch". */
  task: string;
  /** Input tokens charged. Zero when the dispatch didn't run (cache hit, dry-run, untracked). */
  inputTokens: number;
  /** Output tokens charged. */
  outputTokens: number;
  /** Approximate USD cost from the resolved provider rate. Zero for Ollama / mock. */
  usd: number;
  /** Wall-clock time of the dispatch. Zero when the verify pipeline did not measure it. */
  wallClockMs: number;
}

// Best-effort conversion from the existing VerificationUsage shape +
// the verify command's resolved provider/model/task. Missing usage
// fields default to zero — "we ran but the provider returned no
// telemetry" is the honest signal.
export function buildMatrixCost(args: {
  provider: string;
  model: string;
  task: string;
  usage?: VerificationUsage;
  wallClockMs?: number;
}): MatrixCost {
  return {
    provider: args.provider,
    model: args.model,
    task: args.task,
    inputTokens: args.usage?.promptTokens ?? 0,
    outputTokens: args.usage?.completionTokens ?? 0,
    usd: args.usage?.costUSD ?? 0,
    wallClockMs: args.wallClockMs ?? 0,
  };
}

// ── Matrix cell ─────────────────────────────────────────────────────────────

export interface MatrixCell {
  contract: ContractState;
  structural: StructuralState;
  behavior: BehaviorState;
  intent: IntentState;
  literalRequired: LiteralRequiredState;
  cost: MatrixCost;
}

export interface PerNodeMatrix {
  nodeId: string;
  sourceFile: string;
  /**
   * The union of frontier tags from the path/content tagger AND the
   * verdict-derived tags from this matrix cell. Stored once so the
   * intersection aggregator (prework D) doesn't have to reconstruct
   * it. Always at least one entry — the operational-glue fallback
   * guarantees coverage of the perimeter (see frontier-tagger.ts).
   */
  frontier: FrontierAttribute[];
  cell: MatrixCell;
}

// ── Aggregate ───────────────────────────────────────────────────────────────

export interface ByAxis {
  contract: Record<ContractState, number>;
  structural: Record<StructuralState, number>;
  behavior: Record<BehaviorState, number>;
  intent: Record<IntentState, number>;
  literalRequired: Record<LiteralRequiredState, number>;
}

function zeroAxis<S extends string>(states: readonly S[]): Record<S, number> {
  const out = {} as Record<S, number>;
  for (const s of states) out[s] = 0;
  return out;
}

export function emptyByAxis(): ByAxis {
  return {
    contract: zeroAxis(CONTRACT_STATES),
    structural: zeroAxis(STRUCTURAL_STATES),
    behavior: zeroAxis(BEHAVIOR_STATES),
    intent: zeroAxis(INTENT_STATES),
    literalRequired: zeroAxis(LITERAL_REQUIRED_STATES),
  };
}

export function aggregateByAxis(cells: readonly MatrixCell[]): ByAxis {
  const out = emptyByAxis();
  for (const cell of cells) {
    out.contract[cell.contract] += 1;
    out.structural[cell.structural] += 1;
    out.behavior[cell.behavior] += 1;
    out.intent[cell.intent] += 1;
    out.literalRequired[cell.literalRequired] += 1;
  }
  return out;
}

// ── Verdict → matrix cell mapping ───────────────────────────────────────────

// Maps a HomeomorphismVerdict + node metadata → the structural axis
// state. The other axes (contract, behavior, intent, literalRequired)
// fall to the cell builder below.
function verdictToStructural(v: HomeomorphismVerdict): StructuralState {
  switch (v) {
    case "epsilon_equivalent":
      return "pass";
    case "divergent_loc":
      return "partial";
    case "divergent_structural":
      return "fail";
    case "divergent_both":
      return "fail";
    case "unrecoverable":
      return "not-measured";
  }
}

export interface VerdictToCellInputs {
  verdict: HomeomorphismVerdict;
  /** node.literal flag from the canonical state. Undefined → false. */
  literal: boolean | undefined;
  cost: MatrixCost;
}

// Builds the six-axis cell from a verdict + node metadata + cost. The
// unmeasured axes are explicit:
//   - contract: "not-measured" (no contract checker in the pilot)
//   - behavior: "untested" (or "not-applicable" when compile-back never
//     produced an artifact)
//   - intent: "not-reviewed" (or "needs-human" when the verdict is
//     unrecoverable — a human needs to decide what to do with that file)
export function verdictToMatrixCell(inputs: VerdictToCellInputs): MatrixCell {
  const structural = verdictToStructural(inputs.verdict);
  const isUnrecoverable = inputs.verdict === "unrecoverable";
  return {
    contract: "not-measured",
    structural,
    behavior: isUnrecoverable ? "not-applicable" : "untested",
    intent: isUnrecoverable ? "needs-human" : "not-reviewed",
    literalRequired: inputs.literal === true ? "true" : "false",
    cost: inputs.cost,
  };
}

// Returns the FrontierAttribute set derivable from a matrix cell. The
// intersection aggregator (prework D) consumes (frontier from tagger ∪
// these verdict-derived tags) per node.
//
// The literal-required attribute mirrors the literalRequired axis so
// the union picks it up even when the path/content tagger did not
// detect a marker (e.g. an early ingest produced a node with
// literal=true but no content signal).
export function verdictDerivedTags(cell: MatrixCell): FrontierAttribute[] {
  const tags: FrontierAttribute[] = [];
  if (cell.structural === "fail") tags.push("structural-drift");
  if (cell.behavior === "fail") tags.push("behavior-drift");
  if (cell.contract === "fail" || cell.contract === "unknown") {
    tags.push("contract-missing");
  }
  if (cell.intent === "not-reviewed") tags.push("not-reviewed");
  if (cell.literalRequired === "true") tags.push("literal-required");
  return tags;
}

// Convenience: builds the full PerNodeMatrix entry from the parts a
// caller already has — verdict, node metadata, frontier tags from the
// path/content tagger, and the cost breakdown. The returned `frontier`
// is the deduped union.
export function buildPerNodeMatrix(args: {
  nodeId: string;
  sourceFile: string;
  taggerTags: readonly TaggerAttribute[];
  verdict: HomeomorphismVerdict;
  literal: boolean | undefined;
  cost: MatrixCost;
}): PerNodeMatrix {
  const cell = verdictToMatrixCell({
    verdict: args.verdict,
    literal: args.literal,
    cost: args.cost,
  });
  const derived = verdictDerivedTags(cell);
  const union = new Set<FrontierAttribute>([...args.taggerTags, ...derived]);
  return {
    nodeId: args.nodeId,
    sourceFile: args.sourceFile,
    frontier: Array.from(union).sort(),
    cell,
  };
}

// ── Zod schemas ─────────────────────────────────────────────────────────────

export const ContractStateSchema = z.enum(CONTRACT_STATES);
export const StructuralStateSchema = z.enum(STRUCTURAL_STATES);
export const BehaviorStateSchema = z.enum(BEHAVIOR_STATES);
export const IntentStateSchema = z.enum(INTENT_STATES);
export const LiteralRequiredStateSchema = z.enum(LITERAL_REQUIRED_STATES);

export const MatrixCostSchema = z.object({
  provider: z.string(),
  model: z.string(),
  task: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  usd: z.number().nonnegative(),
  wallClockMs: z.number().nonnegative(),
});

export const MatrixCellSchema = z.object({
  contract: ContractStateSchema,
  structural: StructuralStateSchema,
  behavior: BehaviorStateSchema,
  intent: IntentStateSchema,
  literalRequired: LiteralRequiredStateSchema,
  cost: MatrixCostSchema,
});

// Frontier attribute as a Zod enum mirroring frontier-tagger.ts. Kept
// inline (rather than imported from the tagger) to keep the schema
// definition self-contained and so a future shipped report doesn't
// require importing the tagger module at validate time.
const FrontierAttributeSchema = z.enum([
  "pure-transform",
  "schema-driven",
  "algebraic-lawful",
  "declarative-validator",
  "cli-parsing",
  "io-bound",
  "adapter-boundary",
  "prompt-sensitive",
  "literal-required",
  "operational-glue",
  "tui-rendering",
  "human-authored",
  "contract-missing",
  "structural-drift",
  "behavior-drift",
  "not-reviewed",
]);

export const PerNodeMatrixSchema = z.object({
  nodeId: z.string(),
  sourceFile: z.string(),
  frontier: z.array(FrontierAttributeSchema).min(1),
  cell: MatrixCellSchema,
});

export const ByAxisSchema = z.object({
  contract: z.record(ContractStateSchema, z.number().int().nonnegative()),
  structural: z.record(StructuralStateSchema, z.number().int().nonnegative()),
  behavior: z.record(BehaviorStateSchema, z.number().int().nonnegative()),
  intent: z.record(IntentStateSchema, z.number().int().nonnegative()),
  literalRequired: z.record(
    LiteralRequiredStateSchema,
    z.number().int().nonnegative(),
  ),
});
