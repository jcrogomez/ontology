import { z } from "zod";

// Calibrated model capability profiles — a small local oracle for what
// each LLM is documented (by bake-off measurement, not by vendor
// marketing) to do well or badly.
//
// Source of truth for the profiles below:
//   docs/legend/calibrations/BAKEOFF_3B_FAMILY_2026-05-15.md §5–§6
//   docs/legend/calibrations/bakeoff-2026-05-15-raw/summary.csv
//
// Design discipline:
//   - This file is the DATA LAYER of model policy. It does not import
//     from the dispatcher or any command — keeping the dependency arrow
//     pointing one direction (commands/dispatcher → capabilities, never
//     the reverse) lets us evolve the profiles without touching the
//     execution path.
//   - The router (registry.ts, dispatcher.ts, ingest's
//     dispatchWithRetry) does not yet consult these profiles. Wiring is
//     a separate change — see BAKEOFF_3B_FAMILY_2026-05-15.md §8.3.
//   - The order of system architecture is: calibration → policy →
//     router → execution. This file is the "policy" tier. Frankenstein
//     `if (model.includes("deepseek")) { ... }` lines anywhere in the
//     codebase should be replaced by lookups here.

// ── Task kinds ──────────────────────────────────────────────────────────────
//
// A coarse classification of what the LLM is being asked to do. Each
// LlmTask in `types.ts` maps to one or more of these — kept as a
// separate axis because "what is the cognitive demand" is orthogonal
// to "what is the Ontology label". A future patch can add a
// `taskToTaskKind` mapper alongside the routing table.

export const LLM_TASK_KINDS = [
  "structured_extraction", // produce JSON that satisfies a schema — ingest, edge inference
  "reasoning",             // produce a deliberative chain — critique, second opinion
  "summarization",         // produce free-text prose — inspect / translator
  "code_generation",       // produce code — compile / regen
  "critique",              // evaluate other outputs — review, validation
] as const;

export type LlmTaskKind = (typeof LLM_TASK_KINDS)[number];

// ── Profile shape ───────────────────────────────────────────────────────────

export interface ModelCapabilityProfile {
  /**
   * Provider-qualified model identifier matching what the dispatcher
   * resolves (e.g. "qwen2.5-coder:3b" for Ollama, "claude-opus-4-7"
   * for Anthropic). The lookup is exact-match — no fuzzy matching, no
   * prefix matching, no globbing. Adding a new model means adding a
   * new profile entry.
   */
  model: string;
  /**
   * Task kinds the model is documented to FAIL on, by calibration
   * evidence. A router that consults profiles refuses to dispatch
   * tasks of these kinds to this model.
   */
  bannedFor?: readonly LlmTaskKind[];
  /**
   * Task kinds the model is documented to do well on. A router with
   * autonomy can use this to break ties or to prefer this model when
   * no explicit `--model` is set.
   */
  preferredFor?: readonly LlmTaskKind[];
  /**
   * One-sentence justification grounded in calibration. Should
   * reference the doc + section where the evidence lives so the
   * justification is auditable from the profile alone.
   */
  notes?: string;
}

// ── Calibrated profiles (initial set from bake-off v2, 2026-05-15) ──────────

export const MODEL_CAPABILITY_PROFILES: readonly ModelCapabilityProfile[] = [
  {
    model: "qwen2.5-coder:3b",
    preferredFor: ["structured_extraction", "code_generation"],
    notes:
      "Bake-off v2 (2026-05-15) — deterministic 95% single-run OK rate on the 20-file curated Ontology subset, zero variance across 3 repeats. Single persistent failure mode is barrels (re-export modules) which want an AST classifier, not LLM extraction. See BAKEOFF_3B_FAMILY_2026-05-15.md §2.1.",
  },
  {
    model: "llama3.2:3b",
    preferredFor: ["structured_extraction", "summarization"],
    notes:
      "Bake-off v2 (2026-05-15) — 93% single-run OK rate; stochastic with zero rep-to-rep file overlap, so ensemble × 3 reaches 100% coverage at ~23.5 min total. The Pareto-optimal high-confidence extractor. See BAKEOFF_3B_FAMILY_2026-05-15.md §2.2.",
  },
  {
    model: "deepseek-r1:1.5b",
    bannedFor: ["structured_extraction"],
    notes:
      "Bake-off v2 (2026-05-15) — 25% single-run OK rate, 55% ensemble × 3 coverage. The reasoning-tuned chain-of-thought consumes the output budget before the JSON schema can be satisfied (firstFailureKind: required_missing dominates). NOT a noise problem — 9 files fail in all 3 reps. The reasoning architecture is appropriate for evaluative tasks where free-form output is the target, not for structured extraction. See BAKEOFF_3B_FAMILY_2026-05-15.md §2.4 + §5.",
  },
  {
    model: "phi3:mini",
    notes:
      "Bake-off v2 (2026-05-15) — 63% single-run, 95% ensemble × 3 but at ~5× the wall-clock of qwen/llama (≈17 min/run vs ≈6.5). Strictly dominated on the Pareto frontier for production extraction. Useful as an adversarial probe in test setups where a different failure distribution helps stress prompts/schemas. No preferredFor set — the model is not banned, just not recommended by calibration. See BAKEOFF_3B_FAMILY_2026-05-15.md §2.3.",
  },
];

// ── LlmTask ⇒ LlmTaskKind mapping ───────────────────────────────────────────
//
// LlmTask is the Ontology vocabulary (semantic_parse, code_sketch, ...).
// LlmTaskKind is the cognitive-demand axis (structured_extraction,
// reasoning, ...). The router needs to translate one into the other to
// consult the capability profiles.
//
// This mapping is conservative: each LlmTask maps to exactly one
// LlmTaskKind. If a task ever becomes multi-kind, refactor to allow
// arrays — but until then, the single value keeps the policy
// auditable.

import type { LlmTask } from "./types.js";

const TASK_TO_KIND: Record<LlmTask, LlmTaskKind> = {
  // Ingest extraction: produce a JSON object that satisfies
  // ExtractionResultSchema (label / level / kind / prompt + optional
  // context contract). This is THE archetype of structured_extraction.
  semantic_parse: "structured_extraction",
  // Node expansion: given a sketch, produce a fuller structured node.
  // Structured output by definition.
  node_expand: "structured_extraction",
  // Critique: evaluate a candidate, return an opinion (free-form).
  node_critique: "critique",
  // Context assembly: produce a presheaf-flavored prose / structured
  // context for a focal. Treated as summarization — the output is a
  // condensed view, not a typed record.
  context_assemble: "summarization",
  // Code generation: produce code as the artifact output.
  code_sketch: "code_generation",
  test_generate: "code_generation",
  // Prose docs and inspect (translator paragraph) are
  // free-form summaries.
  documentation: "summarization",
  inspect: "summarization",
};

export function llmTaskToTaskKind(task: LlmTask): LlmTaskKind {
  return TASK_TO_KIND[task];
}

// ── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Return the calibration profile for an exact-match model identifier,
 * or `undefined` when no profile exists. Callers that want a default
 * "no opinion" behaviour can treat undefined as "permitted, not
 * preferred".
 */
export function getCapabilityProfile(
  model: string,
): ModelCapabilityProfile | undefined {
  return MODEL_CAPABILITY_PROFILES.find((p) => p.model === model);
}

/**
 * Return true iff the model is explicitly banned from the given task
 * kind by its calibration profile. Models with no profile, and
 * profiles without a `bannedFor` array, return false.
 */
export function isModelBannedForTask(
  model: string,
  task: LlmTaskKind,
): boolean {
  const profile = getCapabilityProfile(model);
  if (!profile?.bannedFor) return false;
  return profile.bannedFor.includes(task);
}

/**
 * Return the list of models documented to be preferred for the given
 * task kind, in profile-declaration order. Empty array when no model
 * declares preference for this task.
 */
export function modelsPreferredForTask(task: LlmTaskKind): string[] {
  return MODEL_CAPABILITY_PROFILES
    .filter((p) => p.preferredFor?.includes(task))
    .map((p) => p.model);
}

// ── Zod schemas ─────────────────────────────────────────────────────────────

export const LlmTaskKindSchema = z.enum(LLM_TASK_KINDS);

export const ModelCapabilityProfileSchema = z.object({
  model: z.string().min(1),
  bannedFor: z.array(LlmTaskKindSchema).optional(),
  preferredFor: z.array(LlmTaskKindSchema).optional(),
  notes: z.string().optional(),
});
