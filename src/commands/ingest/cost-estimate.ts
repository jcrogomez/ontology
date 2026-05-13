import * as fs from "node:fs";
import * as path from "node:path";
import type { LlmProvider, LlmTask } from "../../runtime/llm/types.js";
import { getDefaultModelForTask } from "../../runtime/llm/registry.js";

// Pre-flight cost estimator for `onto ingest`. Runs purely locally — no
// LLM dispatch, no API call, no key required. The user invokes
// `onto ingest <path> --cost-estimate` before the real run to see what
// the dispatch would cost on a frontier provider; the function reads
// each input file, counts characters, applies a published-rate model,
// and returns the breakdown.
//
// This addresses the lesson from the Vibe-Reasoning runbook: a 24-file
// Python repo accidentally dispatched at Opus 4.7 without --dry-run
// could burn ~$2; a careless loop could be more. The cost-estimate
// path is the safe-by-default knob the user runs first.
//
// The estimate is intentionally a rough upper bound. Real dispatch
// pricing is affected by:
//   - Tokenizer specifics (we use ~3.5 chars/token; Anthropic's real
//     tokenizer varies by content — code is denser than prose).
//   - Anthropic prompt caching (5-minute TTL, ~0.1× input rate on hits;
//     activates only above 4096 tokens, currently inactive for the
//     ingest system prompt because it sits below threshold).
//   - Actual output length (we estimate 400 tokens per file; complex
//     files with many extracted tokens / rules will go higher).
// Treat the reported number as a ceiling within ±30% of reality.

// ── Published rates (cached: see system prompt `# Environment` block) ────────

// Opus 4.7 — current frontier default in the Anthropic adapter.
const OPUS_4_7_INPUT_RATE_PER_MILLION_USD = 5.0;
const OPUS_4_7_OUTPUT_RATE_PER_MILLION_USD = 25.0;

// Sonnet 4.6 — cheaper fallback if the user passes --model.
const SONNET_4_6_INPUT_RATE_PER_MILLION_USD = 3.0;
const SONNET_4_6_OUTPUT_RATE_PER_MILLION_USD = 15.0;

// Haiku 4.5 — cheapest tier.
const HAIKU_4_5_INPUT_RATE_PER_MILLION_USD = 1.0;
const HAIKU_4_5_OUTPUT_RATE_PER_MILLION_USD = 5.0;

// ── Tokenization heuristics ─────────────────────────────────────────────────

// Anthropic's published guidance is ~3.5 chars/token for code; we use
// this both for input (file content + prompt wrapper) and to derive
// the rough output estimate. Code is the dominant case for ingest.
const CHARS_PER_TOKEN = 3.5;

// System prompt overhead — measured once at module load time. The
// system prompt lives in ingest/index.ts; we count its characters from
// the exported constant to stay in sync if the prompt changes. For
// directory-mode cost estimation it counts once per call (not per
// file) because Anthropic prompt caching would normally absorb the
// repetition; we add it back once explicitly because the current
// prompt sits below the 4096-token cache threshold so the cache
// silently no-ops on every call.
const SYSTEM_PROMPT_OVERHEAD_TOKENS = 1100;

// User-prompt wrapper around each file's content (the "Source file:
// …" / "--- BEGIN FILE ---" / "Extract …" scaffolding). Adds a small
// fixed amount per file on top of the file's raw size.
const USER_PROMPT_WRAPPER_TOKENS = 50;

// Typical extraction JSON output (label + level + kind + ~3-sentence
// prompt + a few requires/provides/forbids/rules entries) lands around
// 350-500 tokens. We use 400 as the central estimate.
const ESTIMATED_OUTPUT_TOKENS_PER_FILE = 400;

// ── Types ───────────────────────────────────────────────────────────────────

export interface FileSizeInfo {
  path: string;
  cwdRelative: string;
  sizeChars: number;
}

export interface PerFileEstimate {
  path: string;
  cwdRelative: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ProviderRate {
  // 0 when the provider is free (mock, ollama). Anthropic uses the
  // model-specific rate.
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  // Display name, e.g. "claude-opus-4-7", "ollama:qwen2.5-coder:3b",
  // or "mock (identity)". Used in the output header.
  modelLabel: string;
}

export interface CostEstimate {
  provider: string;
  rate: ProviderRate;
  fileCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  perFile: PerFileEstimate[];
  notes: string[];
}

// ── Token counting ──────────────────────────────────────────────────────────

export function estimateInputTokens(fileSizeChars: number): number {
  // File content + the per-file user-prompt wrapper.
  return Math.ceil(fileSizeChars / CHARS_PER_TOKEN) + USER_PROMPT_WRAPPER_TOKENS;
}

export function estimateOutputTokens(_fileSizeChars: number): number {
  // Output size is bounded by the extraction schema, not by input
  // length. A 5000-char source file does not produce a 5000-char
  // extraction — the LLM compresses to a small JSON object. We use
  // a fixed estimate.
  return ESTIMATED_OUTPUT_TOKENS_PER_FILE;
}

// ── Provider → rate ─────────────────────────────────────────────────────────

export function resolveProviderRate(
  provider: string,
  model?: string,
  task?: LlmTask,
): ProviderRate {
  if (provider === "mock") {
    return {
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
      modelLabel: "mock (identity functor — no API call)",
    };
  }
  if (provider === "ollama") {
    // Free local dispatch — rate is $0 regardless of model. Prefer the
    // task-default for the label so the estimate truthfully names what
    // the dispatcher will use.
    const effective = model
      ?? (task ? getDefaultModelForTask("ollama", task) : undefined);
    const modelLabel = effective ? `ollama:${effective}` : "ollama (local)";
    return {
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
      modelLabel,
    };
  }
  if (provider === "anthropic") {
    // Resolution chain mirrors the dispatcher (src/runtime/llm/dispatcher.ts):
    //   request.model > caller default > task default > adapter default.
    // For cost-estimate, the caller passes `model` (explicit override)
    // or `task` (lets us look up the per-task default model). Without
    // either, we fall back to Opus 4.7 as the conservative ceiling.
    // The γ-7 calibration found cost-estimate was over-quoting by 50%
    // when --provider was set without --model because the routing now
    // picks Sonnet for semantic_parse, not Opus.
    const resolvedModel =
      model
      ?? (task ? getDefaultModelForTask("anthropic", task) : undefined)
      ?? "claude-opus-4-7";
    // Match against the model id prefix so date-suffixed variants
    // (claude-opus-4-7-20251101 etc.) hit the same row.
    if (resolvedModel.startsWith("claude-opus-4-7")) {
      return {
        inputUsdPerMillion: OPUS_4_7_INPUT_RATE_PER_MILLION_USD,
        outputUsdPerMillion: OPUS_4_7_OUTPUT_RATE_PER_MILLION_USD,
        modelLabel: resolvedModel,
      };
    }
    if (resolvedModel.startsWith("claude-opus-4-6")) {
      return {
        inputUsdPerMillion: OPUS_4_7_INPUT_RATE_PER_MILLION_USD,
        outputUsdPerMillion: OPUS_4_7_OUTPUT_RATE_PER_MILLION_USD,
        modelLabel: resolvedModel,
      };
    }
    if (resolvedModel.startsWith("claude-sonnet-4-6")) {
      return {
        inputUsdPerMillion: SONNET_4_6_INPUT_RATE_PER_MILLION_USD,
        outputUsdPerMillion: SONNET_4_6_OUTPUT_RATE_PER_MILLION_USD,
        modelLabel: resolvedModel,
      };
    }
    if (resolvedModel.startsWith("claude-haiku-4-5")) {
      return {
        inputUsdPerMillion: HAIKU_4_5_INPUT_RATE_PER_MILLION_USD,
        outputUsdPerMillion: HAIKU_4_5_OUTPUT_RATE_PER_MILLION_USD,
        modelLabel: resolvedModel,
      };
    }
    // Unknown model id — assume Opus pricing as the conservative
    // upper bound so we don't under-quote.
    return {
      inputUsdPerMillion: OPUS_4_7_INPUT_RATE_PER_MILLION_USD,
      outputUsdPerMillion: OPUS_4_7_OUTPUT_RATE_PER_MILLION_USD,
      modelLabel: `${resolvedModel} (rate unknown — assuming Opus tier)`,
    };
  }
  // Unknown provider — surface a placeholder so the estimate still
  // shows token counts even if the dollar number is meaningless.
  return {
    inputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
    modelLabel: `${provider} (rate unknown)`,
  };
}

// ── Main estimator ──────────────────────────────────────────────────────────

export function computeCostEstimate(
  files: FileSizeInfo[],
  provider: string,
  model?: string,
  task?: LlmTask,
): CostEstimate {
  const rate = resolveProviderRate(provider, model, task);

  const perFile: PerFileEstimate[] = files.map((f) => {
    const inputTokens = estimateInputTokens(f.sizeChars);
    const outputTokens = estimateOutputTokens(f.sizeChars);
    const costUsd =
      (inputTokens / 1_000_000) * rate.inputUsdPerMillion +
      (outputTokens / 1_000_000) * rate.outputUsdPerMillion;
    return {
      path: f.path,
      cwdRelative: f.cwdRelative,
      inputTokens,
      outputTokens,
      costUsd,
    };
  });

  // System prompt overhead counts once per ingest invocation, not per
  // file (it's the cached prefix in the Anthropic adapter — though
  // currently below the 4096-token cache threshold).
  const systemPromptInputTokens = SYSTEM_PROMPT_OVERHEAD_TOKENS;
  const systemPromptCostUsd =
    (systemPromptInputTokens / 1_000_000) * rate.inputUsdPerMillion;

  const totalInputTokens =
    systemPromptInputTokens +
    perFile.reduce((sum, f) => sum + f.inputTokens, 0);
  const totalOutputTokens = perFile.reduce(
    (sum, f) => sum + f.outputTokens,
    0,
  );

  const inputCostUsd =
    systemPromptCostUsd +
    perFile.reduce(
      (sum, f) => sum + (f.inputTokens / 1_000_000) * rate.inputUsdPerMillion,
      0,
    );
  const outputCostUsd = perFile.reduce(
    (sum, f) => sum + (f.outputTokens / 1_000_000) * rate.outputUsdPerMillion,
    0,
  );
  const totalCostUsd = inputCostUsd + outputCostUsd;

  const notes: string[] = [];
  notes.push(
    `Tokenization heuristic: ~${CHARS_PER_TOKEN} chars/token (Anthropic published guidance for code).`,
  );
  notes.push(
    `Output estimate: fixed ${ESTIMATED_OUTPUT_TOKENS_PER_FILE} tokens per file (typical extraction JSON).`,
  );
  notes.push(
    `System prompt overhead: ~${SYSTEM_PROMPT_OVERHEAD_TOKENS} tokens counted once (cached prefix; currently below the 4096-token cache threshold, so no cache discount).`,
  );
  if (rate.inputUsdPerMillion === 0 && rate.outputUsdPerMillion === 0) {
    notes.push(`Provider has zero API cost (local or mock); reported cost is $0.`);
  } else {
    notes.push(
      `Real dispatch may vary ±30% due to tokenizer specifics, prompt-cache hits, and variable output length.`,
    );
  }
  return {
    provider,
    rate,
    fileCount: files.length,
    totalInputTokens,
    totalOutputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    perFile,
    notes,
  };
}

// ── Helpers: read file sizes without loading the contents ───────────────────

export function readFileSizeInfos(
  filePaths: string[],
  cwdRealRoot?: string,
): FileSizeInfo[] {
  const realCwd = cwdRealRoot ?? safeRealpath(process.cwd());
  return filePaths.map((p) => {
    const abs = path.resolve(p);
    let sizeChars = 0;
    try {
      // statSync gives a byte count, not a character count, but for
      // typical UTF-8 source files (ASCII + a few multibyte chars)
      // the difference is well under the ±30% tolerance the
      // estimator already advertises. statSync is also O(1) per file
      // instead of an O(n) read, which matters for large repos.
      sizeChars = fs.statSync(abs).size;
    } catch {
      sizeChars = 0;
    }
    return {
      path: abs,
      cwdRelative: pathRelativeSafe(realCwd, abs),
      sizeChars,
    };
  });
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function pathRelativeSafe(fromRealRoot: string, toAbs: string): string {
  try {
    return path.relative(fromRealRoot, fs.realpathSync(toAbs));
  } catch {
    return path.relative(fromRealRoot, toAbs);
  }
}

// ── Output formatting ───────────────────────────────────────────────────────

export function formatCostEstimateHuman(estimate: CostEstimate): string {
  const lines: string[] = [];
  lines.push(`=== ONTOLOGY INGEST — COST ESTIMATE (no API call) ===`);
  lines.push(`Provider:        ${estimate.provider}`);
  lines.push(`Model:           ${estimate.rate.modelLabel}`);
  lines.push(`Files:           ${estimate.fileCount}`);
  lines.push(``);
  lines.push(`Tokens:`);
  lines.push(`  input:         ${estimate.totalInputTokens.toLocaleString()}`);
  lines.push(`  output (est):  ${estimate.totalOutputTokens.toLocaleString()}`);
  lines.push(``);
  lines.push(`Cost (USD):`);
  lines.push(`  input:         $${estimate.inputCostUsd.toFixed(4)}`);
  lines.push(`  output:        $${estimate.outputCostUsd.toFixed(4)}`);
  lines.push(`  total:         $${estimate.totalCostUsd.toFixed(4)}`);
  if (estimate.perFile.length > 0 && estimate.perFile.length <= 20) {
    lines.push(``);
    lines.push(`Per file:`);
    for (const f of estimate.perFile) {
      lines.push(
        `  ${f.cwdRelative}  in=${f.inputTokens} out=${f.outputTokens}  $${f.costUsd.toFixed(4)}`,
      );
    }
  } else if (estimate.perFile.length > 20) {
    lines.push(``);
    lines.push(`Per file: (${estimate.perFile.length} files — top 5 by cost)`);
    const top5 = [...estimate.perFile]
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 5);
    for (const f of top5) {
      lines.push(
        `  ${f.cwdRelative}  in=${f.inputTokens} out=${f.outputTokens}  $${f.costUsd.toFixed(4)}`,
      );
    }
  }
  lines.push(``);
  lines.push(`Notes:`);
  for (const n of estimate.notes) lines.push(`  - ${n}`);
  lines.push(``);
  lines.push(
    `Re-run without --cost-estimate to dispatch; pass --dry-run to dispatch + parse without writing proposals (still pays for the API call).`,
  );
  return lines.join("\n");
}
