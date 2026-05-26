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
  /**
   * Per-axis honesty score in [0, 1] (or null when the axis cannot
   * speak for this node). Derived from `cell` + raw distance metrics
   * via `honestyForCell`. Persisted on the canonical shape so JSON
   * consumers, the markdown renderer, and downstream pivots all read
   * the same numbers without re-deriving them.
   */
  honesty: AxisHonesty;
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
  /**
   * Phase ε behaviour-axis checker (v0) supplies a measured state per
   * node. When provided, it replaces the verdict-derived default
   * `untested`. Reserved guard: an unrecoverable verdict keeps the
   * `not-applicable` state regardless of override — the regen artifact
   * does not exist, so no runtime equivalence can have been measured.
   * See docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md §3.3.
   */
  behaviorOverride?: BehaviorState;
}

// Builds the six-axis cell from a verdict + node metadata + cost. The
// unmeasured axes are explicit:
//   - contract: "not-measured" (no contract checker in the pilot)
//   - behavior: "untested" (or "not-applicable" when compile-back never
//     produced an artifact); a measured `behaviorOverride` replaces the
//     default once the behaviour-axis checker runs
//   - intent: "not-reviewed" (or "needs-human" when the verdict is
//     unrecoverable — a human needs to decide what to do with that file)
export function verdictToMatrixCell(inputs: VerdictToCellInputs): MatrixCell {
  const structural = verdictToStructural(inputs.verdict);
  const isUnrecoverable = inputs.verdict === "unrecoverable";
  // Unrecoverable nodes never get a runtime equivalence reading —
  // there is no regen artifact to import. The override is honoured
  // only when the regen actually exists (every non-unrecoverable
  // verdict guarantees a regen path on disk).
  const behavior: BehaviorState = isUnrecoverable
    ? "not-applicable"
    : (inputs.behaviorOverride ?? "untested");
  return {
    contract: "not-measured",
    structural,
    behavior,
    intent: isUnrecoverable ? "needs-human" : "not-reviewed",
    literalRequired: inputs.literal === true ? "true" : "false",
    cost: inputs.cost,
  };
}

// ── Honesty scores per axis (Phase ε prework F) ─────────────────────────────
//
// A honesty score is a *per-axis* fold from the matrix cell + raw
// metrics into [0, 1] (or null when undefined). Each axis has its own
// simple, transparent formula. The scores are intentionally vectorial:
// SELF_INGEST_HYPOTHESIS_2026-05-13.md §9 forbids collapsing the
// matrix to one number, and the per-axis split honours that. The mean
// within an axis is reported alongside its sample size `n` so a low
// denominator cannot masquerade as a confident reading.

export interface AxisHonesty {
  /**
   * Structural fidelity, computed directly from raw distance metrics:
   * `0.5 * (1 - clamp(locDistance, 0, 1)) + 0.5 * clamp(structuralJaccard, 0, 1)`.
   * Null when no metrics are available (unrecoverable verdict,
   * cache hit, dry run, mock dispatch).
   */
  structural: number | null;
  /**
   * Contract fidelity. `pass` → 1, `fail` → 0, otherwise null.
   * No contract checker in the pilot, so this is null for every
   * node until that axis ships.
   */
  contract: number | null;
  /**
   * Behavior fidelity. `pass` → 1, `fail` → 0, otherwise null.
   * Pilot lacks a behavior harness, so this is null for every
   * node until that axis ships.
   */
  behavior: number | null;
  /**
   * Intent fidelity. `accepted` → 1, `rejected` → 0, `needs-human` → 0.5,
   * `not-reviewed` → null. Keeps the review-state vs review-result
   * distinction the hypothesis §3 insists on.
   */
  intent: number | null;
}

export type HonestyAxis = keyof AxisHonesty;
export const HONESTY_AXES: readonly HonestyAxis[] = [
  "structural",
  "contract",
  "behavior",
  "intent",
] as const;

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function honestyForCell(
  cell: MatrixCell,
  metrics: { locDistance: number; structuralJaccard: number } | undefined,
): AxisHonesty {
  const structural =
    metrics === undefined
      ? null
      : 0.5 * (1 - clamp01(metrics.locDistance)) +
        0.5 * clamp01(metrics.structuralJaccard);

  let contract: number | null;
  switch (cell.contract) {
    case "pass":
      contract = 1;
      break;
    case "fail":
      contract = 0;
      break;
    default:
      contract = null;
  }

  let behavior: number | null;
  switch (cell.behavior) {
    case "pass":
      behavior = 1;
      break;
    case "fail":
      behavior = 0;
      break;
    default:
      behavior = null;
  }

  let intent: number | null;
  switch (cell.intent) {
    case "accepted":
      intent = 1;
      break;
    case "rejected":
      intent = 0;
      break;
    case "needs-human":
      intent = 0.5;
      break;
    case "not-reviewed":
      intent = null;
      break;
  }

  return { structural, contract, behavior, intent };
}

export interface AxisMeanHonesty {
  /** Arithmetic mean of non-null scores across nodes. Null when no node contributed a non-null score on this axis. */
  mean: number | null;
  /** Number of nodes that contributed a non-null score on this axis. */
  n: number;
}

export type MeanHonesty = Record<HonestyAxis, AxisMeanHonesty>;

export function meanHonesty(scores: readonly AxisHonesty[]): MeanHonesty {
  const out = {} as MeanHonesty;
  for (const axis of HONESTY_AXES) {
    let sum = 0;
    let n = 0;
    for (const s of scores) {
      const v = s[axis];
      if (v !== null) {
        sum += v;
        n += 1;
      }
    }
    out[axis] = { mean: n > 0 ? sum / n : null, n };
  }
  return out;
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
  /**
   * Raw distance metrics from the verify pipeline. Required for a
   * non-null structural honesty score; undefined is honest when the
   * verdict was `unrecoverable` (no artifact) or the dispatch was a
   * cache hit / dry run / mock.
   */
  metrics?: { locDistance: number; structuralJaccard: number };
  /**
   * Additional frontier attributes derived OUTSIDE the matrix cell —
   * e.g. `vocab-gap` from the prework-J detector, which depends on
   * `node.context.provides[].key` vs the regen's actual exports. Union
   * into the final frontier alongside tagger + verdict-derived tags.
   */
  extraDerivedTags?: readonly FrontierAttribute[];
  /**
   * Phase ε behaviour-axis checker (v0) override. When supplied, the
   * cell's `behavior` axis is set to this measured state instead of
   * the verdict-derived default `untested`. See `verdictToMatrixCell`
   * for the unrecoverable-verdict guard. Undefined when the checker
   * was not run (legacy verify-homeomorphism --matrix call).
   */
  behaviorOverride?: BehaviorState;
}): PerNodeMatrix {
  const cell = verdictToMatrixCell({
    verdict: args.verdict,
    literal: args.literal,
    cost: args.cost,
    ...(args.behaviorOverride !== undefined
      ? { behaviorOverride: args.behaviorOverride }
      : {}),
  });
  const derived = verdictDerivedTags(cell);
  const union = new Set<FrontierAttribute>([
    ...args.taggerTags,
    ...derived,
    ...(args.extraDerivedTags ?? []),
  ]);
  const honesty = honestyForCell(cell, args.metrics);
  return {
    nodeId: args.nodeId,
    sourceFile: args.sourceFile,
    frontier: Array.from(union).sort(),
    cell,
    honesty,
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
  "vocab-gap",
]);

const AxisHonestyValueSchema = z.number().min(0).max(1).nullable();
export const AxisHonestySchema = z.object({
  structural: AxisHonestyValueSchema,
  contract: AxisHonestyValueSchema,
  behavior: AxisHonestyValueSchema,
  intent: AxisHonestyValueSchema,
});

export const PerNodeMatrixSchema = z.object({
  nodeId: z.string(),
  sourceFile: z.string(),
  frontier: z.array(FrontierAttributeSchema).min(1),
  cell: MatrixCellSchema,
  honesty: AxisHonestySchema,
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
