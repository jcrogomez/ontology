import type { FrontierAttribute } from "./frontier-tagger.js";
import type {
  ContractState,
  StructuralState,
  BehaviorState,
  IntentState,
  LiteralRequiredState,
  MatrixCell,
  PerNodeMatrix,
} from "./matrix.js";

// Intersection aggregator for Project Legend Phase ε prework D.
//
// SELF_INGEST_HYPOTHESIS_2026-05-13.md §6 names seven required
// intersections that every Phase ε report must publish — five are
// pure tag ∧ tag intersections, two are tag ∧ axis-state hybrids.
// Both kinds collapse into a single declarative `IntersectionSpec`
// shape so the aggregator can carry mixed predicates without special
// casing.
//
// The aggregator's contract: required intersections always appear in
// the output, with an explicit zero when no node matches. Additional
// intersections may be appended at the call site (e.g. a Phase ε
// post-mortem discovers `prompt-sensitive ∧ structural-drift` matters
// for a class of file); required ones may never be removed.

// ── Spec type ───────────────────────────────────────────────────────────────

export interface IntersectionSpec {
  /** Display key used as the Record key in the output and in human reports. */
  readonly name: string;
  /** All listed tags must be present in the entry's `frontier` union. */
  readonly tags: readonly FrontierAttribute[];
  /**
   * Optional axis-state predicates. Every listed (axis, state) pair
   * must match the entry's `cell`. Used for intersections like
   * `schema-driven ∧ contract-equivalent` where the second factor is
   * really "axis passes", not a tag.
   */
  readonly axisStates?: {
    readonly contract?: ContractState;
    readonly structural?: StructuralState;
    readonly behavior?: BehaviorState;
    readonly intent?: IntentState;
    readonly literalRequired?: LiteralRequiredState;
  };
}

// ── Required intersections (hypothesis §6) ──────────────────────────────────

export const REQUIRED_INTERSECTIONS: readonly IntersectionSpec[] = [
  { name: "io-bound ∧ structural-drift", tags: ["io-bound", "structural-drift"] },
  { name: "io-bound ∧ behavior-drift", tags: ["io-bound", "behavior-drift"] },
  {
    name: "literal-required ∧ prompt-sensitive",
    tags: ["literal-required", "prompt-sensitive"],
  },
  { name: "cli-parsing ∧ behavior-drift", tags: ["cli-parsing", "behavior-drift"] },
  {
    name: "schema-driven ∧ contract-equivalent",
    tags: ["schema-driven"],
    axisStates: { contract: "pass" },
  },
  {
    name: "pure-transform ∧ behavior-equivalent",
    tags: ["pure-transform"],
    axisStates: { behavior: "pass" },
  },
  {
    name: "contract-missing ∧ not-reviewed",
    tags: ["contract-missing", "not-reviewed"],
  },
];

// ── Predicate evaluation ────────────────────────────────────────────────────

function cellMatchesAxes(
  cell: MatrixCell,
  axes: NonNullable<IntersectionSpec["axisStates"]>,
): boolean {
  if (axes.contract !== undefined && cell.contract !== axes.contract) return false;
  if (axes.structural !== undefined && cell.structural !== axes.structural) {
    return false;
  }
  if (axes.behavior !== undefined && cell.behavior !== axes.behavior) return false;
  if (axes.intent !== undefined && cell.intent !== axes.intent) return false;
  if (
    axes.literalRequired !== undefined &&
    cell.literalRequired !== axes.literalRequired
  ) {
    return false;
  }
  return true;
}

export function entryMatchesIntersection(
  entry: PerNodeMatrix,
  spec: IntersectionSpec,
): boolean {
  const tagSet = new Set<FrontierAttribute>(entry.frontier);
  for (const t of spec.tags) {
    if (!tagSet.has(t)) return false;
  }
  if (spec.axisStates && !cellMatchesAxes(entry.cell, spec.axisStates)) {
    return false;
  }
  return true;
}

// ── Aggregator ──────────────────────────────────────────────────────────────

// Counts each spec across the matrix entries. Required intersections
// are always present as keys (explicit zero when no match). Caller may
// pass additional specs that augment the required set; duplicate
// `name`s use the last spec's predicate and emit one key in the
// output.
export function aggregateByIntersection(
  matrix: readonly PerNodeMatrix[],
  additional: readonly IntersectionSpec[] = [],
): Record<string, number> {
  const specs = [...REQUIRED_INTERSECTIONS, ...additional];
  const byName = new Map<string, IntersectionSpec>();
  // Last spec with a given name wins, so callers can override a
  // required intersection's predicate if they need to (rare; the
  // tests rely on the default predicates).
  for (const s of specs) byName.set(s.name, s);

  const counts: Record<string, number> = {};
  // Initialise required keys at zero so the output preserves the
  // hypothesis's published list shape.
  for (const s of REQUIRED_INTERSECTIONS) counts[s.name] = 0;

  for (const entry of matrix) {
    for (const spec of byName.values()) {
      if (entryMatchesIntersection(entry, spec)) {
        counts[spec.name] = (counts[spec.name] ?? 0) + 1;
      }
    }
  }
  // Ensure any additional intersections that scored zero still appear.
  for (const s of additional) {
    if (!(s.name in counts)) counts[s.name] = 0;
  }
  return counts;
}
