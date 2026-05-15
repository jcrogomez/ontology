import { LlmProvider, LlmTask, LlmRoutingTier } from "./types.js";

// Per-provider routing tables. Each entry assigns a task a target tier
// (semantic — informs the test layer) and an ordered list of preferred
// model identifiers the dispatcher picks from when the caller did not
// specify a model explicitly.
//
// Two callers consume this:
//   1. `dispatchLlmRequest` — when the caller passes `--provider` but no
//      `--model`, the dispatcher looks up the first preferred model for
//      the task and uses it as the dispatch default. The CLI surface is
//      effectively `--provider X` ≡ "use whatever the table says for
//      this task on X".
//   2. Project authors writing `.ontology/models/registry.json` — the
//      defaults document a reasonable starting point for each provider's
//      per-task ergonomics, even if a node ultimately points at a
//      hand-picked `model.ref` instead.
//
// Mixed-provider plans work too: a compile plan can interleave nodes
// with different `model.ref` values (some Ollama, some Anthropic, one
// pinned via `literal`) and the dispatcher resolves each independently.
// See `resolveNodeModel` for the per-node path, this file for the
// per-task fallback.

export type ProviderRoutingEntry = {
  tier: LlmRoutingTier;
  preferred: readonly string[];
};

export type ProviderRoutingMap = Record<LlmTask, ProviderRoutingEntry>;

export const DefaultOllamaRouting: ProviderRoutingMap = {
  // structured_extraction default — calibrated by bake-off v2
  // (BAKEOFF_3B_FAMILY_2026-05-15.md §2.1 + §5). qwen2.5-coder:3b
  // delivered deterministic 95% single-run OK rate on the curated
  // Ontology subset; llama3.2:3b is the high-confidence ensemble
  // fallback (100% via ×3 union). Both fit comfortably in the M1's
  // 5.3 GiB shared VRAM ceiling that the 7-8B family stressed.
  // Other LlmTasks in this routing map still reference legacy
  // 7b/8b/14b names; updating them is out of scope for this change
  // (only structured_extraction was bake-off'd).
  semantic_parse: {
    tier: "fast",
    preferred: ["qwen2.5-coder:3b", "llama3.2:3b"]
  },
  node_expand: {
    tier: "balanced",
    preferred: ["qwen2.5:14b", "llama3.1:8b"]
  },
  node_critique: {
    tier: "critic",
    preferred: ["qwen2.5:14b", "deepseek-r1:14b"]
  },
  context_assemble: {
    tier: "fast",
    preferred: ["llama3.1:8b"]
  },
  code_sketch: {
    tier: "balanced",
    preferred: ["qwen2.5-coder:14b", "qwen2.5-coder:7b"]
  },
  test_generate: {
    tier: "balanced",
    preferred: ["qwen2.5-coder:14b", "qwen2.5-coder:7b"]
  },
  documentation: {
    tier: "fast",
    preferred: ["llama3.1:8b", "qwen2.5:7b"]
  },
  // Project Legend δ-1 — the Inspector. Short prose summary, doesn't
  // need the heavy critic tier; a fast model is fine and keeps the
  // per-node lifetime cost low.
  inspect: {
    tier: "fast",
    preferred: ["llama3.1:8b", "qwen2.5:7b"]
  }
};

// Anthropic per-task routing. The tier mapping mirrors the Ollama
// table so a project can mix providers without surprises:
//   - "fast"      → claude-haiku-4-5    (short prose, structured extraction with low ambiguity)
//   - "balanced"  → claude-sonnet-4-6   (extraction, generation, anything intermediate)
//   - "critic"    → claude-opus-4-7     (deep reasoning, code-sketch, critique)
//
// Picked from Anthropic's published price/intelligence frontier on the
// claude-4.x family. The pilot ε on src/runtime/legend/ measures with
// this table; future calibrations will tune the assignment per task
// if the data justifies a different tier.
export const DefaultAnthropicRouting: ProviderRoutingMap = {
  // Structured JSON extraction (`onto ingest`): Sonnet 4.6 gives the
  // best $/quality ratio. Haiku tends to drop fields under load on
  // larger files; Opus is unnecessarily intelligent and ~3× the cost
  // when the schema does the heavy lifting.
  semantic_parse: {
    tier: "balanced",
    preferred: ["claude-sonnet-4-6"]
  },
  node_expand: {
    tier: "balanced",
    preferred: ["claude-sonnet-4-6"]
  },
  node_critique: {
    tier: "critic",
    preferred: ["claude-opus-4-7"]
  },
  context_assemble: {
    tier: "fast",
    preferred: ["claude-haiku-4-5"]
  },
  // The compile-back functor. Code that has to satisfy MANDATORY
  // EXPORTS + intent invariants + parse-validators benefits from the
  // critic tier — the γ-2 + γ-7 calibrations both used Opus and both
  // hit the publishable verdict targets.
  code_sketch: {
    tier: "critic",
    preferred: ["claude-opus-4-7"]
  },
  test_generate: {
    tier: "balanced",
    preferred: ["claude-sonnet-4-6"]
  },
  documentation: {
    tier: "fast",
    preferred: ["claude-haiku-4-5"]
  },
  // Inspector — short developer-facing prose. Haiku is plenty and
  // makes "one LLM call per node lifetime" genuinely cheap (~$0.002
  // per inspect instead of ~$0.04 on Opus).
  inspect: {
    tier: "fast",
    preferred: ["claude-haiku-4-5"]
  }
};

// Per-provider lookup of the default-model for a task. Returns
// undefined when:
//   - the provider has no routing table (mock, literal); the adapter's
//     own built-in default fires instead.
//   - the task has no preferred models on this provider.
// Callers should treat undefined as "let the adapter pick".
export function getDefaultModelForTask(
  provider: LlmProvider,
  task: LlmTask,
): string | undefined {
  let table: ProviderRoutingMap | undefined;
  if (provider === "ollama") table = DefaultOllamaRouting;
  if (provider === "anthropic") table = DefaultAnthropicRouting;
  if (!table) return undefined;
  return table[task]?.preferred[0];
}

// Legacy alias preserved so existing callers (mock adapter test
// helpers, etc.) keep working.
export function getDefaultRoutingForTask(task: LlmTask): ProviderRoutingEntry {
  const routing = DefaultOllamaRouting[task];
  if (!routing) {
    throw new Error(`Unknown routing task: ${String(task)}`);
  }
  return routing;
}
