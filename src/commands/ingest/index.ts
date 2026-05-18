import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  AbstractionLevelSchema,
  ManifestationSchema,
  NodeKindSchema,
} from "../../schemas/ontology.js";
import { loadNodeById, loadState } from "../../core/project/load.js";
import { createProposal } from "../../core/proposals/persist.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmProvider, LlmResponse } from "../../runtime/llm/types.js";
import { collectSourceFiles } from "../../runtime/static/typescript.js";
import { inferEdgesAutoFromDirectory } from "../../runtime/static/edges.js";
import { errorMessage } from "../../core/errors.js";
import {
  computeCostEstimate,
  formatCostEstimateHuman,
  readFileSizeInfos,
} from "./cost-estimate.js";
import {
  newRunId,
  renderIngestReport,
  writeProgressReport,
  type IngestFileSummary,
} from "../../runtime/legend/progress-report.js";
import {
  HIGH_CONFIDENCE_MODEL,
  HIGH_CONFIDENCE_REPS,
  selectBestByScore,
  type EnsembleMetadata,
  type EnsembleMode,
  type EnsembleRunOutcome,
} from "../../runtime/llm/ensemble.js";
import {
  classifySourceFile,
  type StructuralClassification,
} from "../../runtime/legend/structural-classifier.js";
import { buildStaticSummary } from "../../runtime/legend/static-summary.js";
import {
  decideStaticClassifierIngestAction,
  type IngestAction,
  type StaticClassifierMode,
} from "./static-classifier-policy.js";

// `onto ingest <paths...>` — Project Legend Phase γ-1 + γ-5 + Phase ε prework A.
//
// When a single <path> is a FILE: γ-1 single-file ingest. Dispatches a
// frontier LLM with an extraction template against that file and
// produces one node_create proposal under the canon parent (or
// --parent override).
//
// When a single <path> is a DIRECTORY: γ-5 multi-file ingest. Walks the
// directory (skipping node_modules / dist / .ontology / __tests__ /
// .git / coverage), runs the per-file extraction for every `.ts` /
// `.tsx` file via the same helper, and emits one node_create proposal
// per file. The proposal carries the file path in
// `payload.sourceFiles[0]` so γ-6 (`onto graph infer-edges
// --create-proposals`) can resolve the file-path edges that γ-4
// (`onto graph infer-edges`) computes back to the applied node IDs.
//
// When MULTIPLE <paths> are passed (Phase ε prework A): each path is
// resolved file-vs-directory, files are unioned and deduped by
// realpath, and the batch runs as a single ingest pass. Edge inference
// runs per-directory-input; cross-root edges (e.g. src/commands →
// src/runtime when both are passed as separate inputs) are out of
// scope for this iteration — the matrix measurement is what drives
// the multi-input perimeter, not edge completeness.
//
// Both modes share:
//   - Binary-byte guard (NUL rejects → no LLM dispatch)
//   - System prompt with prompt caching (γ-0's Anthropic adapter
//     tags it `cache_control: ephemeral`)
//   - JSON output validated by ExtractionResultSchema (Zod)
//   - --dry-run preview that prints the extraction without writing
//     proposals — load-bearing for iterating the extraction template
//     and for testing the directory walk without paying for the
//     LLM dispatch.
//
// Costs of multi-file mode: ~$0.08 × N files at Opus 4.7 tier. The
// dry-run flag exists specifically so the walk + extraction loop is
// testable end-to-end against the mock provider without ever firing
// the real API.

// Symbol-name vocabulary contract — Phase ε β′ vocab-domain guard
// (MR_2026-05-17 §6.2). The intent-validator's gluing check matches
// `requires` entries against upstream nodes' `provides` arrays;
// both must speak the SAME vocabulary. Both should carry symbol
// names (`createNodeProposalForExtraction`), never module paths
// (`./io.js`) or source-file specifiers (`foo.tsx`). The β′ run
// (2026-05-16) emitted module paths from buildStaticSummary and the
// gluing check silently rejected — 6 of 7 deflected files moved to
// `unrecoverable`. Move 1b (2026-05-18) fixed buildStaticSummary;
// this schema refine is the regression net so a future contributor
// who reaches for a module-path shape elsewhere hits a clear Zod
// rejection at extraction time instead of producing silent
// unrecoverables downstream.
//
// Permissive on purpose: rejects only the two known broken shapes
// (module-path prefix, source-file extension suffix). Any other
// string is accepted — the schema is the LAST line of defense, not
// a positive-only allowlist.
const MODULE_PATH_PREFIX = /^\.\.?\//;
const SOURCE_FILE_EXT = /\.(js|ts|tsx|jsx|mjs|cjs)$/;

export const SymbolNameSchema = z
  .string()
  .min(1)
  .refine((s) => !MODULE_PATH_PREFIX.test(s) && !SOURCE_FILE_EXT.test(s), {
    message:
      'must be a symbol name (e.g. "createNodeProposalForExtraction"), not a module path ("./foo.js") or source-file specifier ("foo.tsx"). The intent-validator gluing check matches requires/provides on symbol names; vocabulary-domain mismatches surface as silent `unrecoverable` verdicts in verify-homeomorphism. See docs/legend/calibrations/SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md.',
  });

// JSON the extractor returns. The schema is the contract between the
// system prompt and the parser; if the LLM emits anything outside
// this shape, Zod rejects it loudly.
export const ExtractionResultSchema = z.object({
  label: z.string().min(1).max(256),
  level: AbstractionLevelSchema,
  kind: NodeKindSchema,
  manifestation: ManifestationSchema.optional(),
  language: z.string().optional(),
  prompt: z.string().min(1),
  // @semantic: symbol-name — see SymbolNameSchema docs above. The
  // gluing check matches these against upstream `provides`.
  requires: z.array(SymbolNameSchema).optional(),
  // @semantic: symbol-name — see SymbolNameSchema docs above.
  provides: z.array(SymbolNameSchema).optional(),
  forbids: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// Phase ε E6 step 4 — score an ExtractionResult by how many optional
// structured fields it populates. Required fields (label / level /
// kind / prompt) are guaranteed by Zod validation in any valid
// candidate, so they don't differentiate. Optional fields that the
// extractor MAY emit when the file warrants them are the score's
// signal: a richer set of provides / requires / forbids / rules
// suggests the model engaged with the file's intent rather than
// producing a minimal stub.
//
// Pure function — exported for unit testing.
export function scoreExtractionCompleteness(e: ExtractionResult): number {
  let score = 0;
  if (e.manifestation !== undefined) score += 1;
  if (e.language !== undefined && e.language.length > 0) score += 1;
  if (e.requires && e.requires.length > 0) score += 1;
  if (e.provides && e.provides.length > 0) score += 1;
  if (e.forbids && e.forbids.length > 0) score += 1;
  if (e.rules && e.rules.length > 0) score += 1;
  return score;
}

export interface IngestCommandOptions {
  // LLM provider. Defaults to "anthropic" — γ-0's frontier route.
  // mock = identity functor (file content becomes the proposal's
  // prompt; the mock returns the first JSON object embedded in the
  // user prompt — see src/runtime/llm/mock.ts identity-functor
  // extension for semantic_parse). Useful for plumbing tests.
  provider?: string;
  model?: string;
  ollamaHost?: string;
  parent?: string; // node id; defaults to root canon
  // Read-only preview: dispatch + parse + print, but do NOT create the
  // proposal. Critical for iterating the extraction prompt template
  // without piling up rejected proposals AND for testing γ-5 walks
  // against the mock provider with zero LLM cost.
  dryRun?: boolean;
  json?: boolean;
  // Comma-separated file extensions to ingest in directory mode.
  // Default: "ts,tsx". For a Python project pass "--include py";
  // for a mixed Python/TS repo pass "--include py,ts,tsx". Has no
  // effect on single-file mode (the path argument identifies the
  // file directly). The per-file extraction is text-content-only;
  // the LLM handles whatever language is in the file, the walker
  // just picks which files to feed it.
  include?: string;
  // Pre-flight cost guard: walk the inputs, count characters per
  // file, multiply by published rates for the resolved provider,
  // print the breakdown, exit WITHOUT dispatching the LLM. Safer
  // than --dry-run for cost discovery — --dry-run still pays for
  // the API call (it skips only the proposal write). --cost-estimate
  // never dispatches and never reads file *contents* (only sizes),
  // so it is safe to run against arbitrary trees.
  costEstimate?: boolean;
  // Phase ε E6 step 4 — high-confidence ensemble mode. When set to
  // "high-confidence", each file's structured extraction runs three
  // times against the calibrated stochastic-complementary model
  // (llama3.2:3b) and the best valid result is selected. Default
  // "none" preserves the existing single-run behaviour exactly.
  // Currently honoured only for semantic_parse (ingest extraction);
  // other LlmTasks ignore the flag.
  ensemble?: EnsembleMode;
  // Structural Semantic Classifier integration.
  //   - "report-only" classifies every discovered file via
  //     classifySourceFile (no LLM, pure AST + filename rules) and
  //     surfaces aggregates in the INGEST report. Does NOT change
  //     routing, does NOT skip files. Pure observation pass.
  //   - "enabled" consumes those facts as ingest policy. Files
  //     classified as barrels, declaration-only modules, or
  //     configuration modules bypass the LLM entirely and receive a
  //     deterministic static summary instead (see
  //     runtime/legend/static-summary.ts). Files classified as test
  //     modules are skipped (no proposal). All other shapes
  //     (schema_module, adapter_module, cli_module, executable_module,
  //     component_module, mixed_module, unknown) still dispatch to
  //     the LLM exactly as before. The savings shape on the perimeter
  //     is surfaced in the INGEST report's "Classifier routing"
  //     section.
  staticClassifier?: "report-only" | "enabled";
}

// The extraction system prompt. The Anthropic adapter tags this block
// with cache_control: ephemeral so subsequent ingest calls in the same
// session reuse the cached prefix (~0.1× input cost on hits). On Opus
// 4.7 the cache only activates above 4096 tokens; the δ rewrite
// (2026-05-18) takes the template well past that threshold, so every
// per-file call beyond the first in `onto ingest <directory>` hits
// cache. First-dispatch latency is slightly higher; aggregate cost
// over a multi-file run drops ~10× on cached portions.
//
// δ rewrite rationale (commit on land): γ's vocab-gap report showed
// 558 missing exports across 123 nodes — the model's compile-back
// dropped names the contract declared. Root cause was the pre-δ
// prompt instructed the extractor to "describe the SHAPE of the
// behavior" — narrative voice. Compile-back read the narrative prose
// (load-bearing in the system prompt) and weighed it over the
// structured contract list. δ pivots the prompt voice from
// descriptive to constructive: every name in `provides` MUST appear
// in `prompt` verbatim, FORBIDDEN narrative phrases listed,
// prescriptive MUST verbs required. Enum guidance stays strict
// (kind / level / manifestation, requires-is-project-internal — all
// preserved from the pre-δ template so the schema does not break).
// Pre-registered hypothesis at SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md.
const EXTRACTION_SYSTEM_PROMPT = `
You are the Ontology contract extractor.

Given ONE source file, produce a JSON object that captures the file's constructive contract.

Your job is NOT to summarize the file.
Your job is to specify what a future implementation MUST recreate.

A downstream code-generation model will receive your extracted contract and attempt to regenerate an equivalent file.
Therefore, your output must preserve exact exported identifiers, public symbols, project-internal relationships, and invariants.

Return ONLY valid JSON matching the expected schema. No markdown fence, no preamble, no explanation outside the JSON.

Required fields: label, level, kind, prompt. Optional fields: manifestation, language, requires, provides, forbids, rules.

CRITICAL SCHEMA RULE:
You MUST use only the enum values allowed by the schema.
Invented values will fail validation.

Allowed level values:
- canon
- project
- target
- stack
- architecture
- domain
- workflow
- interface
- unit
- token
- artifact

Allowed kind values:
- canon
- decision
- rule
- constraint
- definition
- entity
- action
- function
- asset
- view
- component
- token
- artifact

Allowed manifestation values:
- intent
- ast
- osl
- code
- test
- build

Core extraction rule:
- The "prompt" field is the load-bearing field.
- It must be constructive, not descriptive.
- Every public/exported symbol listed in "provides" MUST appear inside "prompt" by its exact identifier.
- If a symbol is exported, named, re-exported, or publicly declared, name it explicitly.
- Do not rely on generic phrases like "utilities", "helpers", "manages", or "provides functionality".
- Do not emit a valid-looking generic summary. Generic summaries are extraction failures.

The "prompt" field MUST be written as a per-symbol specification.

Preferred structure for "prompt":

- symbolName(signature if inferable): MUST expose/return/construct/validate [...]. Invariant: [...]
- otherSymbol(signature if inferable): MUST [...]. Invariant: [...]
- Re-export contract: MUST re-export exact names [...] from [...]
- Type/schema contract: MUST define exact shape [...] and preserve [...]

Use prescriptive language:
- "MUST export..."
- "MUST return..."
- "MUST validate..."
- "MUST preserve..."
- "MUST re-export..."
- "MUST reject..."
- "MUST map..."
- "MUST construct..."
- "MUST parse..."
- "MUST normalize..."

FORBIDDEN descriptive phrases in "prompt":
- "this file provides"
- "provides utilities"
- "provides helpers"
- "handles"
- "manages"
- "contains helpers"
- "is responsible for"
- "used for working with"
- "convenience functions"
- "allows working with"
- "supports functionality for"

Good prompt example:

- add(a: number, b: number) -> number: MUST return the arithmetic sum of a and b. Invariant: add(a, 0) equals a.
- subtract(a: number, b: number) -> number: MUST return a minus b. Invariant: subtract(a, 0) equals a and subtract(a, a) equals 0.

Bad prompt example:

Provides arithmetic utilities for adding and subtracting numbers.

Why bad:
The bad prompt does not name add or subtract. A downstream generator would have to guess the exported names.

Concrete example for a monad law re-export/helper file:

Good:

- ResultMonadLaws: MUST expose the monad law contract for Result, including left identity, right identity, and associativity.
- EffectMonadLaws: MUST expose the monad law contract for Effect, including left identity, right identity, and associativity.
- assertResultMonadLaws(...): MUST validate that a Result implementation satisfies the expected monadic properties in a test environment.
- assertEffectMonadLaws(...): MUST validate that an Effect implementation satisfies the expected monadic properties in a test environment.
- Re-export contract: MUST re-export the exact public names listed in provides without renaming or omitting them.

Bad:

Provides re-exports of the Result and Effect monad laws along with convenience functions for working with these effects in a test environment.

Why bad:
The bad prompt describes the file but does not preserve enough exact symbols for regeneration.

Field guidance:

- label:
  REQUIRED. Short human-readable name (≤256 chars). Examples: "Result Type and Operations", "LLM Dispatcher", "barrel: effects/index.ts".

- level:
  REQUIRED. Choose exactly one allowed level enum.
  Do not invent values.
  For most concrete source files (functions, modules, primitives) use "artifact" or "unit". "domain" / "workflow" are reserved for higher-level intents that orchestrate multiple files.

- kind:
  REQUIRED. Choose exactly one allowed kind enum.
  Do not use structural classifier labels such as "barrel", "schema_module", "declaration_only", or "executable_module".
  Do not invent values.
  Use "artifact" for compiled outputs and concrete code modules; "function" for pure functions / utilities; "entity" for data types and records; "action" for side-effectful operations; "rule" for invariants / business rules; "constraint" for schema-level restrictions; "view" for read models / projections; "component" for composite structural units; "definition" for type/interface declaration files.

- manifestation:
  Optional. Choose exactly one allowed manifestation enum: intent, ast, osl, code, test, or build.
  Do not write values like "function", "type", "schema", "barrel export", or "test helper".
  For TypeScript / Python / etc. source files, use "code". Use "test" for test files; "build" for build scripts; "intent" for prose-only nodes.

- language:
  Optional. The source language: "typescript", "python", "rust", etc.

- prompt:
  REQUIRED. A constructive per-symbol specification.
  MANDATORY:
  1. Every name in provides appears verbatim in prompt.
  2. Every important exported function/type/constant/class/schema is described individually.
  3. The text says what must be recreated, not merely what currently exists.
  4. Mention inputs/outputs when inferable.
  5. Mention invariants, validation rules, side effects, or re-export obligations when present.

- provides:
  Optional. List EVERY top-level public/exported name this file declares or re-exports.
  Include exact identifiers.
  Do not summarize.
  Do not omit small helpers if they are exported.
  If the file exports nothing, use an empty array.
  Do NOT include stdlib / external / built-in names.

- requires:
  Optional. List ONLY project-internal symbol-name dependencies (the exact identifiers this file imports from sibling modules in the same project).
  Do NOT include module paths (e.g. "./io.js") — those will silently fail the gluing check. Use symbol names ("Result", "createNodeProposalForExtraction").
  Do NOT include standard library names (random, os, sys, math, time, itertools, json, console, fs, path, etc.).
  Do NOT include external/pip/npm package names (numpy, requests, zod, vitest, etc.).
  Do NOT include built-in identifiers (range, len, dict, list, Array, Object, etc.).
  Do NOT include generic runtime concepts unless they are project-internal contracts.
  If the file has no internal cross-file dependencies, emit an empty array.

- forbids:
  Optional. List behaviors the file must not allow, invalid states, anti-invariants, forbidden dependencies, or architectural constraints.
  If none are inferable, use an empty array.

- rules:
  Optional. List explicit invariants, algebraic laws, validation rules, ordering constraints, lifecycle constraints, or contract rules as FORBID:/REQUIRE: prose strings.
  If none are inferable, use an empty array.

Closing self-check before emitting JSON:
1. Does every name in provides appear in prompt exactly?
2. Is prompt written as bullets or compact per-symbol clauses?
3. Did you avoid generic descriptive prose from the FORBIDDEN list?
4. Did you use only allowed enum values for level, kind, and manifestation?
5. Did requires contain only project-internal symbol names (no module paths, no stdlib, no external packages)?
6. Could a future model regenerate the exported surface from prompt + provides?
7. Did you avoid inventing symbols not present in the file?

If any check fails, rewrite your answer before emitting JSON.

Return JSON only.
`;

// ── Pure library: extract intent from a single source file ──────────────────

interface ExtractInputs {
  filePath: string;
  provider: LlmProvider;
  model?: string;
  ollamaHost?: string;
}

// Helper: classify a file when the static classifier is on
// (report-only or enabled). Pure observation in report-only mode —
// never changes control flow. A failed read or classification
// returns undefined; the rest of ingest continues as if the flag
// were off, so the contract "report-only does not alter execution"
// holds even on edge cases.
function classifyIfEnabled(
  filePath: string,
  mode: StaticClassifierMode,
): StructuralClassification | undefined {
  if (mode === "off") return undefined;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return classifySourceFile({ path: filePath, content });
  } catch {
    return undefined;
  }
}

// Phase ε E1: per-file telemetry. Accumulated by extractIntentFromFile
// across attempts so the INGEST report can render what really
// happened — not just ok / fail. The 7b pilot collapsed every
// retry into a single "tokens used" total, hiding which files paid
// for an H1 retry vs an H3 backoff vs a clean first pass. With this
// struct populated, the operator sees the topology of the cost.
export interface ExtractTelemetry {
  /** Total dispatch attempts (H3 backoff retries counted). Includes the H1 retry as an extra attempt when triggered. */
  dispatchAttempts: number;
  /** True iff the H1 schema-failure retry path fired. */
  schemaRetried: boolean;
  /** num_ctx requested for Ollama (forwarded as contextWindow). undefined for non-Ollama adapters. */
  contextWindowRequested: number | undefined;
  /** num_predict requested (forwarded as maxTokens). undefined when not set. */
  maxTokensRequested: number | undefined;
  /**
   * Coarse classification of the first failure that triggered a
   * retry. Drawn from the Zod error path the first invalid attempt
   * produced. Undefined when no retry was needed.
   */
  firstFailureKind:
    | "kind_invalid_value"
    | "level_invalid_value"
    | "required_missing"
    | "out_of_range"
    | "invalid_json"
    | "dispatch_error"
    | "other"
    | undefined;
  /** Total wall-clock for the extraction (read + all dispatches + parse). */
  wallClockMs: number;
}

type ExtractResult =
  | {
      ok: true;
      filePath: string;
      cwdRelative: string;
      extracted: ExtractionResult;
      response: LlmResponse;
      telemetry: ExtractTelemetry;
      /** Set when the extraction went through the high-confidence
       * ensemble path. Absent (undefined) for single-run extractions. */
      ensemble?: EnsembleMetadata;
    }
  | {
      ok: false;
      filePath: string;
      reason:
        | "read_failed"
        | "binary_content"
        | "empty_file"
        | "dispatch_failed"
        | "invalid_json"
        | "schema_failed"
        | "ensemble_failed";
      message: string;
      telemetry: ExtractTelemetry;
      ensemble?: EnsembleMetadata;
    };

// Classify a Zod error message into one of the firstFailureKind
// buckets. Heuristic — string-matches the error text from Zod's
// default formatter. Keeps the telemetry interpretable without
// requiring callers to re-walk Zod's issue tree.
function classifyZodFailure(message: string): ExtractTelemetry["firstFailureKind"] {
  if (/kind:.*Invalid enum value/i.test(message)) return "kind_invalid_value";
  if (/level:.*Invalid enum value/i.test(message)) return "level_invalid_value";
  if (/Required/.test(message)) return "required_missing";
  if (/min|max|too_(small|big)/i.test(message)) return "out_of_range";
  return "other";
}

// Reads, validates, dispatches, parses, returns. Pure with respect to
// graph state — never writes proposals or events. γ-1 (single-file
// ingest) and γ-5 (multi-file ingest) both compose over this.
async function extractIntentFromFile(
  inputs: ExtractInputs,
): Promise<ExtractResult> {
  const { filePath, provider, model, ollamaHost } = inputs;

  // Phase ε E1: telemetry accumulator. Mutable, threaded through every
  // return path via finalize(). Populated incrementally as the
  // function progresses; finalize() snaps wallClockMs at exit.
  const t0 = performance.now();
  const telemetry: ExtractTelemetry = {
    dispatchAttempts: 0,
    schemaRetried: false,
    contextWindowRequested: undefined,
    maxTokensRequested: undefined,
    firstFailureKind: undefined,
    wallClockMs: 0,
  };
  const finalize = (): ExtractTelemetry => {
    telemetry.wallClockMs = performance.now() - t0;
    return { ...telemetry };
  };
  // DispatchFn wrapper that increments the dispatch counter on every
  // LLM call (including H3 backoff internal retries). Passed to
  // dispatchWithRetry so the counter sees real network attempts.
  const countingDispatcher: DispatchFn = async (req, cfg) => {
    telemetry.dispatchAttempts += 1;
    return dispatchLlmRequest(req, cfg);
  };

  // 1. Read + binary guard. NUL is the high-precision signal of
  // binary content; let the user know up front rather than paying
  // for an LLM round-trip on garbled bytes.
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    return {
      ok: false,
      filePath,
      reason: "read_failed",
      message: `Could not read "${filePath}": ${errorMessage(err)}`,
      telemetry: finalize(),
    };
  }
  if (fileContent.includes("\u0000")) {
    return {
      ok: false,
      filePath,
      reason: "binary_content",
      message: `"${filePath}" appears to be a binary file (contains NUL bytes).`,
      telemetry: finalize(),
    };
  }
  if (fileContent.trim().length === 0) {
    return {
      ok: false,
      filePath,
      reason: "empty_file",
      message: `"${filePath}" is empty; nothing to ingest.`,
      telemetry: finalize(),
    };
  }

  // 2. Build the user prompt. The system prompt is the cached prefix;
  // per-file content sits in the user turn so each call only
  // invalidates the suffix.
  const cwdRelative = computeCwdRelative(filePath);
  const userPrompt = [
    `Source file: ${cwdRelative || filePath}`,
    `Language hint (from extension): ${guessLanguageHint(filePath)}`,
    ``,
    `--- BEGIN FILE ---`,
    fileContent,
    `--- END FILE ---`,
    ``,
    `Extract the structured intent for this file. Output JSON only.`,
  ].join("\n");

  // Phase ε H2: adaptive input/output budget. Ollama defaults to
  // num_ctx=2048 (input) — Pilot data showed source files >~6 KB
  // silently truncating; the model returns garbled or empty JSON.
  // The budget below covers system prompt + file body + retry
  // feedback + output JSON with a small safety buffer. Anthropic
  // ignores `contextWindow` (auto-managed).
  const budget = computeAdaptiveBudget(
    EXTRACTION_SYSTEM_PROMPT.length,
    fileContent.length,
  );
  telemetry.contextWindowRequested = budget.contextWindow;
  telemetry.maxTokensRequested = budget.maxTokens;

  // 3. Dispatch (with H3 transient-retry backoff).
  let response: LlmResponse;
  try {
    response = await dispatchWithRetry(
      {
        task: "semantic_parse",
        prompt: userPrompt,
        system: EXTRACTION_SYSTEM_PROMPT,
        json: true,
        contextWindow: budget.contextWindow,
        maxTokens: budget.maxTokens,
      },
      { provider, defaultModel: model, ollamaHost },
      countingDispatcher,
    );
  } catch (err: unknown) {
    telemetry.firstFailureKind = "dispatch_error";
    return {
      ok: false,
      filePath,
      reason: "dispatch_failed",
      message: `Dispatch failed (after ${RETRY_BACKOFF_MS.length} attempts): ${errorMessage(err)}`,
      telemetry: finalize(),
    };
  }

  // 4. Parse + validate. Anthropic adapter exposes JSON.parse'd
  // content on response.json when request.json=true. Fall back to
  // parsing response.text manually for providers that don't
  // pre-parse (and to strip a possible markdown fence).
  const candidate =
    response.json !== undefined
      ? response.json
      : tryParseJsonFromText(response.text);
  if (candidate === undefined) {
    telemetry.firstFailureKind = "invalid_json";
    return {
      ok: false,
      filePath,
      reason: "invalid_json",
      message: `The extractor did not return valid JSON. Raw response:\n${response.text.slice(0, 500)}`,
      telemetry: finalize(),
    };
  }
  const parsed = ExtractionResultSchema.safeParse(candidate);
  if (parsed.success) {
    return {
      ok: true,
      filePath,
      cwdRelative,
      extracted: parsed.data,
      response,
      telemetry: finalize(),
    };
  }

  // Phase ε hardening H1: retry-once with the Zod failure as feedback (no quotes).
  // Same adaptive budget — the retry adds ~600 chars of feedback, well
  // within the 512-token safety buffer.
  // The pilot (qwen2.5-coder:7b) emitted 19/124 schema_failed,
  // concentrated on types.ts / index.ts barrels / schemas.ts where the
  // model improvises `kind: "meta" | "type" | "module"` outside the
  // canon enum. The system prompt already lists the enum verbatim; the
  // model just doesn't honour it on the first pass at 7b tier. A
  // single retry with the specific Zod errors as feedback recovers
  // most of them, idempotent (read-only on disk).
  telemetry.schemaRetried = true;
  const firstFailureMessage = formatZodIssues(parsed.error.issues);
  telemetry.firstFailureKind = classifyZodFailure(firstFailureMessage);
  const retryPrompt = buildRetryPrompt(userPrompt, firstFailureMessage);
  let retryResponse: LlmResponse;
  try {
    retryResponse = await dispatchWithRetry(
      {
        task: "semantic_parse",
        prompt: retryPrompt,
        system: EXTRACTION_SYSTEM_PROMPT,
        json: true,
        contextWindow: budget.contextWindow,
        maxTokens: budget.maxTokens,
      },
      { provider, defaultModel: model, ollamaHost },
      countingDispatcher,
    );
  } catch (err: unknown) {
    // Retry dispatch failed (after H3 backoff exhausted) — surface
    // the original schema error alongside the dispatch failure so
    // the operator sees both.
    return {
      ok: false,
      filePath,
      reason: "schema_failed",
      message: `Extraction JSON failed validation (retry also failed: ${errorMessage(err)}): ${firstFailureMessage}`,
      telemetry: finalize(),
    };
  }
  const retryCandidate =
    retryResponse.json !== undefined
      ? retryResponse.json
      : tryParseJsonFromText(retryResponse.text);
  if (retryCandidate === undefined) {
    return {
      ok: false,
      filePath,
      reason: "schema_failed",
      message: `Extraction JSON failed validation (retry returned invalid JSON): ${firstFailureMessage}`,
      telemetry: finalize(),
    };
  }
  const retryParsed = ExtractionResultSchema.safeParse(retryCandidate);
  if (!retryParsed.success) {
    const retryFailureMessage = formatZodIssues(retryParsed.error.issues);
    return {
      ok: false,
      filePath,
      reason: "schema_failed",
      message: `Extraction JSON failed validation after retry. First: ${firstFailureMessage}. Retry: ${retryFailureMessage}`,
      telemetry: finalize(),
    };
  }
  // Retry succeeded.
  return {
    ok: true,
    filePath,
    cwdRelative,
    extracted: retryParsed.data,
    response: retryResponse,
    telemetry: finalize(),
  };
}

// Phase ε H3: dispatch wrapper with bounded retry on transient
// errors. The pilot (qwen2.5-coder:7b, 124 files, 2h21m) emitted 2
// dispatch_failed entries — both consistent with brief network blips
// against the local Ollama, not deterministic adapter / model
// errors. A retry with short backoff (1s, 4s) recovers those cases
// without lengthening the happy path (no sleep on the first attempt)
// and without masking truly deterministic failures (the final error
// is surfaced verbatim if every attempt fails).
//
// Retry policy is deliberately uniform across error classes: we
// don't introspect the error message to decide retry-vs-fail. Cost
// of an unnecessary retry on a deterministic error is ~5s extra
// before the same final error appears; cost of NOT retrying on a
// transient is the entire ingest attempt failing for one file. The
// 2h21m pilot shows the transient cost is the relevant one.
export const RETRY_BACKOFF_MS: readonly number[] = [0, 1000, 4000];

// Injectable dispatcher signature — exported so tests can stub the
// underlying call without mocking the whole dispatcher module.
export type DispatchFn = (
  request: Parameters<typeof dispatchLlmRequest>[0],
  config: Parameters<typeof dispatchLlmRequest>[1],
) => Promise<LlmResponse>;

export async function dispatchWithRetry(
  request: Parameters<typeof dispatchLlmRequest>[0],
  config: Parameters<typeof dispatchLlmRequest>[1],
  // Hooks for tests: a custom dispatcher (default: the real one) and
  // a sleep function (default: setTimeout). Production callers ignore
  // both; the unit test injects a counting stub + an instant sleep.
  dispatcher: DispatchFn = dispatchLlmRequest,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<LlmResponse> {
  let lastError: unknown;
  for (let i = 0; i < RETRY_BACKOFF_MS.length; i++) {
    const wait = RETRY_BACKOFF_MS[i];
    if (wait > 0) {
      await sleep(wait);
    }
    try {
      return await dispatcher(request, config);
    } catch (err: unknown) {
      lastError = err;
    }
  }
  throw lastError;
}

// Phase ε H2: compute the input/output budget for an extraction
// dispatch. Forwarded to the adapter as `contextWindow` (num_ctx in
// Ollama) and `maxTokens` (num_predict). Anthropic ignores
// contextWindow (auto-managed); Ollama desperately needs it because
// the default num_ctx=2048 truncates anything >~6 KB silently.
//
// Token approximation: 3 chars/token for safety (code is denser per
// token than prose; Ontology source averages ~3.2 chars/token in
// pilot data).
//
// Constraints:
//   - Floor contextWindow at 4096 so tiny files still get a sensible
//     budget (the Ollama default of 2048 would barely fit the system
//     prompt + a 20-line file).
//   - Cap at 16384 to bound the KV cache memory (~8 MB at 7b 4-bit).
//     Files larger than ~30 KB will be served truncated; this should
//     be rare in practice and the rerun of the truly outsized files
//     can override via --max-tokens.
//   - maxTokens: half the estimated file tokens, capped to 4096 — an
//     extraction JSON rarely exceeds 1500-2000 tokens.
function computeAdaptiveBudget(
  systemPromptChars: number,
  fileContentChars: number,
): { contextWindow: number; maxTokens: number } {
  const CHARS_PER_TOKEN = 3;
  const RETRY_FEEDBACK_OVERHEAD_CHARS = 600;
  const USER_PROMPT_OVERHEAD_CHARS = 500;
  const SAFETY_BUFFER_TOKENS = 512;
  const MIN_CONTEXT = 4096;
  const MAX_CONTEXT = 16384;
  const MIN_OUTPUT = 1024;
  // Anthropic-side default is 8192 (the adapter's own MAX_TOKENS).
  // γ-7 calibration explicitly required 8192 for files where the
  // adaptive-thinking budget eats the output ceiling. Phase ε Move 3
  // (Sonnet 4.6 verify probe) hits this cap on files > ~3 KB if it
  // stays at 4096. Aligned with the adapter default here so the
  // ingest path no longer caps below what the underlying provider
  // is willing to emit. See docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md.
  const MAX_OUTPUT = 8192;

  const inputChars =
    systemPromptChars +
    fileContentChars +
    USER_PROMPT_OVERHEAD_CHARS +
    RETRY_FEEDBACK_OVERHEAD_CHARS;
  const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN);

  const fileTokens = Math.ceil(fileContentChars / CHARS_PER_TOKEN);
  const maxTokens = Math.max(
    MIN_OUTPUT,
    Math.min(MAX_OUTPUT, Math.ceil(fileTokens / 2)),
  );

  const rawCtx = inputTokens + maxTokens + SAFETY_BUFFER_TOKENS;
  const roundedCtx = Math.ceil(rawCtx / 1024) * 1024;
  const contextWindow = Math.max(
    MIN_CONTEXT,
    Math.min(MAX_CONTEXT, roundedCtx),
  );

  return { contextWindow, maxTokens };
}

// Format a Zod issue list into the same compact `path: message; path:
// message` shape that the original error path emitted, so existing
// log consumers (the per-file summary, the ingest report) see a
// familiar string.
function formatZodIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): string {
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

// Build the retry user prompt. Reuses the full first-attempt user
// turn (so the file content stays in context) and appends a focused
// feedback block listing the Zod errors plus the most common 7b
// mistakes the pilot surfaced.
function buildRetryPrompt(
  firstAttemptPrompt: string,
  firstFailureMessage: string,
): string {
  return [
    firstAttemptPrompt,
    ``,
    `--- PREVIOUS ATTEMPT FAILED VALIDATION ---`,
    `Errors from Zod:`,
    firstFailureMessage,
    ``,
    `Common causes from the pilot data (qwen2.5-coder:7b):`,
    `- "kind" MUST be exactly one of: canon, decision, rule, constraint, definition, entity, action, function, asset, view, component, token, artifact. For files that only declare TypeScript / Python types or interfaces, use "definition". For Zod schemas, use "constraint". For barrel / index re-export files, use "artifact". Never invent values like "meta", "type", "module", "schema", "interface".`,
    `- "level" MUST be exactly one of: canon, project, target, stack, architecture, domain, workflow, interface, unit, token, artifact. For most concrete source files use "artifact" or "unit". The interface level is for INTERFACE specs (the architectural tier), not TypeScript interface declarations.`,
    `- All of label, level, kind, prompt are REQUIRED. Empty or missing values fail the schema.`,
    ``,
    `Output ONLY the corrected JSON. No preamble, no markdown fence, no explanation.`,
  ].join("\n");
}

// ── Phase ε E6 step 4 — high-confidence ensemble runner ────────────────────
//
// Runs `extractIntentFromFile` three times against the calibrated
// stochastic-complementary model (llama3.2:3b — see ensemble.ts
// constants + BAKEOFF_3B_FAMILY_2026-05-15.md §2.2). Each rep is an
// independent dispatch with its own H1 schema-retry and H3 backoff;
// the ensemble is a SECOND layer of resilience that complements the
// per-rep retries, exploiting the bake-off finding that
// llama3.2:3b's failures rotate across files between repetitions.
//
// Returns a single ExtractResult. When at least one rep produced a
// valid extraction, the one with the most populated optional fields
// wins (deterministic tie-break on earliest). When every rep failed,
// the result carries reason "ensemble_failed" with a message that
// summarises each rep's failure reason.

// Pure helper for the fatal-failure metadata path. Extracted so the
// rep-N-ok / rep-(N+1)-fatal counting is unit-testable without
// running the ensemble loop. Phase ε bug fix (2026-05-18, MR §4.3):
// the previous inline path emitted validCount: 0 and failedCount:
// reps.length + 1, double-counting successful pre-fatal reps as
// failures. Exported for ingest-ensemble-scoring.test.ts.
export function ensembleCountsOnFatal(
  repsBeforeFatal: ReadonlyArray<{ ok: boolean }>,
): { repetitions: number; validCount: number; failedCount: number } {
  const valid = repsBeforeFatal.filter((r) => r.ok).length;
  const failed = repsBeforeFatal.length - valid;
  return {
    // Non-fatal attempts already in `reps` PLUS the one that hit the
    // structural-fatal branch (read_failed / binary_content / empty_file).
    repetitions: repsBeforeFatal.length + 1,
    validCount: valid,
    failedCount: failed + 1,
  };
}

async function extractIntentEnsemble(
  inputs: ExtractInputs,
): Promise<ExtractResult> {
  const reps: EnsembleRunOutcome<{
    extracted: ExtractionResult;
    response: LlmResponse;
    cwdRelative: string;
  }>[] = [];
  const innerTelemetries: ExtractTelemetry[] = [];
  let lastFatalFailure: ExtractResult | undefined;

  for (let i = 1; i <= HIGH_CONFIDENCE_REPS; i++) {
    const t0 = performance.now();
    const result = await extractIntentFromFile({
      ...inputs,
      model: HIGH_CONFIDENCE_MODEL,
    });
    const wall = performance.now() - t0;
    innerTelemetries.push(result.telemetry);

    if (!result.ok) {
      // Structural failures (file disappeared, became binary, was
      // emptied) won't get better with repetition — short-circuit
      // and surface the original error. The ensemble metadata
      // records how many reps actually ran before bailing.
      if (
        result.reason === "read_failed" ||
        result.reason === "binary_content" ||
        result.reason === "empty_file"
      ) {
        lastFatalFailure = result;
        break;
      }
      reps.push({
        attempt: i,
        ok: false,
        failureReason: `${result.reason}: ${result.message.slice(0, 200)}`,
        wallClockMs: wall,
      });
      continue;
    }

    reps.push({
      attempt: i,
      ok: true,
      value: {
        extracted: result.extracted,
        response: result.response,
        cwdRelative: result.cwdRelative,
      },
      wallClockMs: wall,
    });
  }

  // Aggregate inner telemetries into a single record for the per-file
  // summary. Sums for additive counters, OR for the booleans, first
  // non-empty for categoricals — keeps the report's mean / sparkline
  // semantics intact even when each file was actually 3 dispatches.
  const aggregatedTelemetry: ExtractTelemetry = {
    dispatchAttempts: innerTelemetries.reduce(
      (s, t) => s + t.dispatchAttempts,
      0,
    ),
    schemaRetried: innerTelemetries.some((t) => t.schemaRetried),
    contextWindowRequested: innerTelemetries[0]?.contextWindowRequested,
    maxTokensRequested: innerTelemetries[0]?.maxTokensRequested,
    firstFailureKind: innerTelemetries.find((t) => t.firstFailureKind)
      ?.firstFailureKind,
    wallClockMs: innerTelemetries.reduce((s, t) => s + t.wallClockMs, 0),
  };

  // Short-circuit fatal failure — propagate the original reason +
  // message but tag with ensemble metadata so the report still shows
  // that the file went through the ensemble code path. Counts come
  // from the pure helper below so the rep-N-ok / rep-(N+1)-fatal
  // trace is testable without spinning up the LLM loop.
  if (lastFatalFailure) {
    const counts = ensembleCountsOnFatal(reps);
    return {
      ...lastFatalFailure,
      telemetry: aggregatedTelemetry,
      ensemble: {
        mode: "high-confidence",
        model: HIGH_CONFIDENCE_MODEL,
        ...counts,
      },
    };
  }

  const validRuns = reps.filter((r) => r.ok);
  const failedRuns = reps.filter((r) => !r.ok);
  const ensembleBase: EnsembleMetadata = {
    mode: "high-confidence",
    model: HIGH_CONFIDENCE_MODEL,
    repetitions: HIGH_CONFIDENCE_REPS,
    validCount: validRuns.length,
    failedCount: failedRuns.length,
  };

  if (validRuns.length === 0) {
    const perRunSummary = failedRuns
      .map((r) => `[#${r.attempt}] ${r.failureReason ?? "unknown"}`)
      .join("; ");
    return {
      ok: false,
      filePath: inputs.filePath,
      reason: "ensemble_failed",
      message: `All ${HIGH_CONFIDENCE_REPS} high-confidence ensemble attempts on ${HIGH_CONFIDENCE_MODEL} failed. ${perRunSummary}`,
      telemetry: aggregatedTelemetry,
      ensemble: ensembleBase,
    };
  }

  // Pick the highest-scoring valid extraction. Ties go to the
  // earliest attempt (deterministic — selectBestByScore preserves
  // insertion order on ties).
  const validValues = validRuns.map((r) => r.value!.extracted);
  const bestIdx = selectBestByScore(validValues, scoreExtractionCompleteness);
  // bestIdx is defined here because validRuns is non-empty.
  const winner = validRuns[bestIdx!];

  return {
    ok: true,
    filePath: inputs.filePath,
    cwdRelative: winner.value!.cwdRelative,
    extracted: winner.value!.extracted,
    response: winner.value!.response,
    telemetry: aggregatedTelemetry,
    ensemble: { ...ensembleBase, selectedAttempt: winner.attempt },
  };
}

// Single-dispatch entry point: routes between the default single-run
// path and the high-confidence ensemble path based on the option.
// All three ingest flows (single-file, directory, multi-input) go
// through this selector so the flag honours its contract uniformly.
async function extractWithStrategy(
  inputs: ExtractInputs,
  ensemble: EnsembleMode | undefined,
): Promise<ExtractResult> {
  if (ensemble === "high-confidence") {
    return extractIntentEnsemble(inputs);
  }
  return extractIntentFromFile(inputs);
}

// Static-summary entry point — builds a synthetic ExtractResult with
// no LLM dispatch. Used by extractWithRouting when the policy adapter
// says the classified shape can be summarized deterministically
// (barrel, declaration_only). The response carries provider
// "literal" + model "static_summary" so the audit trail (proposal
// rationale) clearly shows the extraction did not come from an LLM.
//
// usage is omitted on purpose — there is no token spend to report.
function buildStaticSummaryExtractResult(args: {
  filePath: string;
  classification: StructuralClassification;
}): ExtractResult {
  const t0 = performance.now();
  const extracted = buildStaticSummary({
    filePath: args.filePath,
    classification: args.classification,
  });
  const cwdRelative = computeCwdRelative(args.filePath);
  const wallClockMs = performance.now() - t0;
  const telemetry: ExtractTelemetry = {
    dispatchAttempts: 0,
    schemaRetried: false,
    contextWindowRequested: undefined,
    maxTokensRequested: undefined,
    firstFailureKind: undefined,
    wallClockMs,
  };
  const response: LlmResponse = {
    text: "",
    json: extracted,
    model: "static_summary",
    provider: "literal",
    usage: undefined,
    raw: { classification: args.classification },
  };
  return {
    ok: true,
    filePath: args.filePath,
    cwdRelative,
    extracted,
    response,
    telemetry,
  };
}

// Single-dispatch entry point WITH structural-classifier policy
// applied. When the classifier is in enabled mode AND the file's
// classified shape is static_summary-eligible (barrel or
// declaration_only), this short-circuits the LLM and synthesizes
// the ExtractResult deterministically. Otherwise it delegates to
// extractWithStrategy (preserving ensemble semantics for the
// semantic_parse path). Returns the action taken alongside the
// result so callers can report routing distribution.
async function extractWithRouting(args: {
  inputs: ExtractInputs;
  ensemble: EnsembleMode;
  classification: StructuralClassification | undefined;
  staticClassifierMode: StaticClassifierMode;
}): Promise<{ result: ExtractResult; action: IngestAction }> {
  const action = decideStaticClassifierIngestAction(
    args.classification,
    args.staticClassifierMode,
  );
  if (action === "static_summary") {
    // The policy adapter only returns static_summary when classification is
    // present — assertion is type narrowing, not runtime checking.
    if (args.classification === undefined) {
      throw new Error(
        "decideStaticClassifierIngestAction returned static_summary without a classification — invariant violated",
      );
    }
    return {
      result: buildStaticSummaryExtractResult({
        filePath: args.inputs.filePath,
        classification: args.classification,
      }),
      action,
    };
  }
  const result = await extractWithStrategy(args.inputs, args.ensemble);
  return { result, action };
}

// ── Top-level command: route file vs directory ──────────────────────────────

export async function ingestCommand(
  pathArgs: string[],
  options: IngestCommandOptions,
): Promise<void> {
  if (!Array.isArray(pathArgs) || pathArgs.length === 0) {
    failWith("No paths provided to ingest.", options.json);
    return;
  }

  // Stat every input up front. A bad path anywhere in the list fails
  // the whole call — we don't want to half-ingest a perimeter because
  // the user mistyped one entry.
  const inputs: Array<{ path: string; stat: fs.Stats }> = [];
  for (const p of pathArgs) {
    try {
      inputs.push({ path: p, stat: fs.statSync(p) });
    } catch (err: unknown) {
      failWith(`Could not stat "${p}": ${errorMessage(err)}`, options.json);
      return;
    }
  }

  const provider = resolveProvider(options);
  if (provider === undefined) return; // resolveProvider already failed.

  // Validate --ensemble. Acceptable values: "none" (default,
  // single-run) or "high-confidence" (3× llama3.2:3b, pick best
  // valid). Anything else fails fast — operators expect typos to
  // not silently produce single-run behaviour.
  const ensembleMode: EnsembleMode = (() => {
    const raw = options.ensemble;
    if (raw === undefined || raw === "none") return "none";
    if (raw === "high-confidence") return "high-confidence";
    failWith(
      `Unsupported --ensemble value: "${String(raw)}" (try "none" or "high-confidence")`,
      options.json,
    );
    return "none"; // unreachable — failWith exits 1
  })();

  // Validate --static-classifier. Two modes are supported:
  //   - "report-only" classifies every file and surfaces aggregates
  //     in the INGEST report but does NOT alter dispatch.
  //   - "enabled" consumes classifier facts as ingest policy:
  //     barrels / declaration-only / configuration modules bypass
  //     the LLM via a deterministic static summary; test modules are
  //     skipped; all other shapes still go through the LLM. See
  //     runtime/legend/static-summary.ts for the routing table.
  // Unknown values fail fast so a typo doesn't silently downgrade.
  const staticClassifierMode: StaticClassifierMode = (() => {
    const raw = options.staticClassifier;
    if (raw === undefined) return "off";
    if (raw === "report-only") return "report-only";
    if (raw === "enabled") return "enabled";
    failWith(
      `Invalid --static-classifier mode "${String(raw)}". Supported modes: report-only, enabled`,
      options.json,
    );
    return "off"; // unreachable — failWith exits 1
  })();

  // ── Single-input branch (backward compat: 1 positional, file OR dir) ──
  if (inputs.length === 1) {
    const only = inputs[0];

    // Cost-estimate short-circuit. Runs entirely locally: walks the
    // input, reads file SIZES (statSync, not contents), feeds the
    // estimator, prints, exits. No LLM dispatch; no parent-node lookup
    // (the user might be exploring before having a project initialised
    // at all). Safe to run against any tree, including trees outside a
    // .ontology project.
    if (options.costEstimate) {
      let targetFiles: string[];
      if (only.stat.isDirectory()) {
        const extensions = parseIncludeFlag(options.include);
        if (extensions.length === 0) {
          failWith(
            `--include resolved to an empty extension list. Pass at least one extension (e.g. --include py,md).`,
            options.json,
          );
          return;
        }
        targetFiles = collectSourceFiles(path.resolve(only.path), extensions);
      } else {
        targetFiles = [only.path];
      }
      const sizeInfos = readFileSizeInfos(targetFiles);
      const estimate = computeCostEstimate(
        sizeInfos,
        provider,
        options.model,
        "semantic_parse",
      );
      if (options.json) {
        console.log(JSON.stringify({ ok: true, estimate }, null, 2));
      } else {
        console.log(formatCostEstimateHuman(estimate));
      }
      return;
    }

    const state = loadState();
    const parentNodeId = options.parent ?? state.rootNodeId;
    const parentNode = loadNodeById(parentNodeId);
    if (!parentNode) {
      failWith(`Parent node not found: ${parentNodeId}`, options.json);
      return;
    }

    if (only.stat.isDirectory()) {
      const extensions = parseIncludeFlag(options.include);
      if (extensions.length === 0) {
        failWith(`--include resolved to an empty extension list. Pass at least one extension (e.g. --include py,md).`, options.json);
        return;
      }
      await runDirectoryIngest(only.path, {
        provider,
        model: options.model,
        ollamaHost: options.ollamaHost,
        parentNodeId,
        parentHash: parentNode.integrity.hash,
        dryRun: !!options.dryRun,
        json: !!options.json,
        ensemble: ensembleMode,
        staticClassifier: staticClassifierMode,
        extensions,
      });
      return;
    }

    await runSingleFileIngest(only.path, {
      provider,
      model: options.model,
      ollamaHost: options.ollamaHost,
      parentNodeId,
      parentHash: parentNode.integrity.hash,
      dryRun: !!options.dryRun,
      json: !!options.json,
      ensemble: ensembleMode,
      staticClassifier: staticClassifierMode,
    });
    return;
  }

  // ── Multi-input branch (N>1 paths) ──
  // Union files across every input with realpath-based dedup. Files
  // passed directly are kept as-is; directories walk through
  // collectSourceFiles (same skip list as γ-5). A file that appears
  // both directly and inside a passed directory only ingests once.
  const extensions = parseIncludeFlag(options.include);
  if (extensions.length === 0) {
    failWith(
      `--include resolved to an empty extension list. Pass at least one extension (e.g. --include py,md).`,
      options.json,
    );
    return;
  }

  const allFiles = collectAllInputFiles(inputs, extensions);

  if (options.costEstimate) {
    const sizeInfos = readFileSizeInfos(allFiles);
    const estimate = computeCostEstimate(
      sizeInfos,
      provider,
      options.model,
      "semantic_parse",
    );
    const perInput = inputs.map((i) => ({
      path: i.path,
      kind: (i.stat.isDirectory() ? "directory" : "file") as
        | "directory"
        | "file",
      fileCount: i.stat.isDirectory()
        ? collectSourceFiles(path.resolve(i.path), extensions).length
        : 1,
    }));
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            inputs: perInput,
            dedupedTotal: allFiles.length,
            estimate,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`=== ONTOLOGY INGEST — MULTI-INPUT COST ESTIMATE ===`);
      for (const row of perInput) {
        console.log(
          `  ${row.kind.padEnd(9)}  ${row.path}  →  ${row.fileCount} file(s)`,
        );
      }
      console.log(`  deduped total:    ${allFiles.length} file(s)`);
      console.log(``);
      console.log(formatCostEstimateHuman(estimate));
    }
    return;
  }

  const state = loadState();
  const parentNodeId = options.parent ?? state.rootNodeId;
  const parentNode = loadNodeById(parentNodeId);
  if (!parentNode) {
    failWith(`Parent node not found: ${parentNodeId}`, options.json);
    return;
  }

  await runMultiInputIngest(inputs, allFiles, {
    provider,
    model: options.model,
    ollamaHost: options.ollamaHost,
    parentNodeId,
    parentHash: parentNode.integrity.hash,
    dryRun: !!options.dryRun,
    json: !!options.json,
    ensemble: ensembleMode,
    staticClassifier: staticClassifierMode,
    extensions,
  });
}

function resolveProvider(options: IngestCommandOptions): LlmProvider | undefined {
  if (options.provider === undefined) return "anthropic";
  if (
    options.provider !== "mock" &&
    options.provider !== "ollama" &&
    options.provider !== "anthropic"
  ) {
    failWith(
      `Unsupported provider: ${options.provider} (try mock, ollama, or anthropic)`,
      options.json,
    );
    return undefined;
  }
  return options.provider as LlmProvider;
}

// ── Single-file flow (γ-1) ──────────────────────────────────────────────────

interface SingleFileOptions {
  provider: LlmProvider;
  model?: string;
  ollamaHost?: string;
  parentNodeId: string;
  parentHash: string;
  dryRun: boolean;
  json: boolean;
  ensemble: EnsembleMode;
  staticClassifier: StaticClassifierMode;
}

async function runSingleFileIngest(
  filePath: string,
  opts: SingleFileOptions,
): Promise<void> {
  const classification = classifyIfEnabled(filePath, opts.staticClassifier);
  const { result, action } = await extractWithRouting({
    inputs: {
      filePath,
      provider: opts.provider,
      model: opts.model,
      ollamaHost: opts.ollamaHost,
    },
    ensemble: opts.ensemble,
    classification,
    staticClassifierMode: opts.staticClassifier,
  });
  if (!result.ok) {
    failWith(result.message, opts.json);
    return;
  }

  if (opts.dryRun) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: true,
            extracted: result.extracted,
            usage: result.response.usage,
            model: result.response.model,
            provider: result.response.provider,
          },
          null,
          2,
        ),
      );
    } else {
      printExtraction(result.extracted, {
        filePath: result.cwdRelative || filePath,
        model: result.response.model,
        provider: result.response.provider,
        usage: result.response.usage,
        committed: false,
      });
    }
    return;
  }

  const proposalResult = createNodeProposalForExtraction(
    result.cwdRelative || filePath,
    result.extracted,
    result.response,
    opts.parentNodeId,
    opts.parentHash,
  );
  if (!proposalResult.ok) {
    failWith(proposalResult.message, opts.json);
    return;
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: false,
          proposal: {
            id: proposalResult.proposalId,
            status: "pending",
            mutationKind: "node_create",
            hash: proposalResult.proposalHash,
          },
          event: { eventId: proposalResult.eventId, eventType: "proposal_created" },
          extracted: result.extracted,
          usage: result.response.usage,
          model: result.response.model,
          provider: result.response.provider,
        },
        null,
        2,
      ),
    );
    return;
  }

  printExtraction(result.extracted, {
    filePath: result.cwdRelative || filePath,
    model: result.response.model,
    provider: result.response.provider,
    usage: result.response.usage,
    committed: true,
    proposalId: proposalResult.proposalId,
  });

  tryWriteIngestProgressReport({
    rootDir: process.cwd(),
    provider: opts.provider,
    model: opts.model,
    dryRun: opts.dryRun,
    json: opts.json,
    staticClassifierMode: opts.staticClassifier,
    files: [
      {
        filePath: result.cwdRelative || filePath,
        ok: true,
        tokensUsed: result.response.usage?.totalTokens,
        telemetry: result.telemetry,
        ensemble: result.ensemble,
        classification,
        routing: opts.staticClassifier === "off" ? undefined : action,
      },
    ],
    proposalsCreated: 1,
    totalTokens: result.response.usage?.totalTokens ?? 0,
  });
}

// ── Multi-file flow (γ-5) ───────────────────────────────────────────────────

interface DirectoryOptions {
  provider: LlmProvider;
  model?: string;
  ollamaHost?: string;
  parentNodeId: string;
  parentHash: string;
  dryRun: boolean;
  json: boolean;
  ensemble: EnsembleMode;
  staticClassifier: StaticClassifierMode;
  // File extensions to include in the walk. Comes from --include
  // (parsed by parseIncludeFlag). Always non-empty when this struct
  // is constructed.
  extensions: string[];
}

interface PerFileSummary {
  filePath: string;
  cwdRelative: string;
  ok: boolean;
  reason?: string;
  message?: string;
  extracted?: ExtractionResult;
  proposalId?: string;
  tokensUsed?: number;
  telemetry?: ExtractTelemetry;
  ensemble?: EnsembleMetadata;
  /** Phase ε E6 → next step: facts from the structural classifier
   * (report-only or enabled). Pure observation in report-only;
   * informs routing in enabled. */
  classification?: StructuralClassification;
  /** Phase ε prework C: the actual route taken for this file
   * (semantic_parse via the LLM, or static_summary via the
   * deterministic builder). Absent for runs without the
   * --static-classifier flag. */
  routing?: IngestAction;
}

async function runDirectoryIngest(
  dirPath: string,
  opts: DirectoryOptions,
): Promise<void> {
  const absDir = path.resolve(dirPath);
  const files = collectSourceFiles(absDir, opts.extensions);
  const extLabel = opts.extensions.map((e) => `.${e}`).join("/");
  if (files.length === 0) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: opts.dryRun,
            rootDir: absDir,
            fileCount: 0,
            results: [],
            edges: [],
            message:
              `No ${extLabel} files found under the directory (after skipping node_modules / dist / .ontology / __tests__ / .git / coverage).`,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`=== ONTOLOGY INGEST — DIRECTORY ===`);
      console.log(`Root:        ${dirPath}`);
      console.log(`Include:     ${extLabel}`);
      console.log(`Files:       0`);
      console.log(``);
      console.log(`No ${extLabel} files found under the directory.`);
    }
    return;
  }

  const results: PerFileSummary[] = [];
  let totalTokens = 0;

  // Walk sequentially rather than in parallel: cache hits on the
  // shared system prompt accumulate (Anthropic prompt cache writes
  // are visible only after the first response begins streaming, so
  // a parallel fan-out pays the write multiple times). Sequential
  // also keeps the audit log ordering deterministic.
  for (const filePath of files) {
    const cwdRelative = computeCwdRelative(filePath);
    const classification = classifyIfEnabled(filePath, opts.staticClassifier);
    const { result: extract, action } = await extractWithRouting({
      inputs: {
        filePath,
        provider: opts.provider,
        model: opts.model,
        ollamaHost: opts.ollamaHost,
      },
      ensemble: opts.ensemble,
      classification,
      staticClassifierMode: opts.staticClassifier,
    });
    const routing: IngestAction | undefined =
      opts.staticClassifier === "off" ? undefined : action;
    if (!extract.ok) {
      results.push({
        filePath,
        cwdRelative,
        ok: false,
        reason: extract.reason,
        message: extract.message,
        telemetry: extract.telemetry,
        ensemble: extract.ensemble,
        classification,
        routing,
      });
      continue;
    }

    const tokensUsed = extract.response.usage?.totalTokens ?? 0;
    totalTokens += tokensUsed;

    if (opts.dryRun) {
      results.push({
        filePath,
        cwdRelative,
        ok: true,
        extracted: extract.extracted,
        tokensUsed,
        telemetry: extract.telemetry,
        ensemble: extract.ensemble,
        classification,
        routing,
      });
      continue;
    }

    const created = createNodeProposalForExtraction(
      cwdRelative,
      extract.extracted,
      extract.response,
      opts.parentNodeId,
      opts.parentHash,
    );
    if (!created.ok) {
      results.push({
        filePath,
        cwdRelative,
        ok: false,
        reason: "proposal_create_failed",
        message: created.message,
        telemetry: extract.telemetry,
        ensemble: extract.ensemble,
        classification,
        routing,
      });
      continue;
    }
    results.push({
      filePath,
      cwdRelative,
      ok: true,
      extracted: extract.extracted,
      proposalId: created.proposalId,
      tokensUsed,
      telemetry: extract.telemetry,
      ensemble: extract.ensemble,
      classification,
      routing,
    });
  }

  // Edge inference (γ-4): dispatches per language by the include
  // list. TS files go to the TS compiler API parser; .py files go
  // to the regex-based Python parser. Unknown extensions (e.g.
  // `--include rs`) silently skip the static-edge step — γ-5 still
  // produces the node proposals, just without auto-inferred edges.
  const inferredEdges = inferEdgesAutoFromDirectory(absDir, opts.extensions).map(
    (e) => ({
      fromFile: path.relative(absDir, e.fromFile),
      toFile: path.relative(absDir, e.toFile),
      type: e.type,
      tokens: e.tokens,
    }),
  );

  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - okCount;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: failedCount === 0,
          dryRun: opts.dryRun,
          rootDir: absDir,
          fileCount: results.length,
          okCount,
          failedCount,
          totalTokens,
          results: results.map((r) => ({
            filePath: r.cwdRelative,
            ok: r.ok,
            reason: r.reason,
            message: r.message,
            extracted: r.extracted,
            proposalId: r.proposalId,
            tokensUsed: r.tokensUsed,
          })),
          edges: inferredEdges,
        },
        null,
        2,
      ),
    );
    if (failedCount > 0 && failedCount === results.length) process.exit(1);
    return;
  }

  console.log(`=== ONTOLOGY INGEST — DIRECTORY${opts.dryRun ? " (DRY RUN)" : ""} ===`);
  console.log(`Root:           ${dirPath}`);
  console.log(`Files scanned:  ${results.length}`);
  console.log(`  ok:           ${okCount}`);
  if (failedCount > 0) console.log(`  failed:       ${failedCount}`);
  if (totalTokens > 0) console.log(`Tokens used:    ${totalTokens}`);
  console.log(``);
  for (const r of results) {
    if (r.ok) {
      const label = r.extracted?.label ?? "(no label)";
      const proposalTag = r.proposalId ? `  →  ${r.proposalId}` : "";
      console.log(` ✓ ${r.cwdRelative}  ${label}${proposalTag}`);
    } else {
      console.log(` ✖ ${r.cwdRelative}  ${r.reason}: ${r.message}`);
    }
  }
  if (inferredEdges.length > 0) {
    console.log(``);
    console.log(`Inferred cross-file edges (γ-4 static analysis):`);
    for (const edge of inferredEdges) {
      const arrow = edge.type === "uses_token" ? "─type→" : "──→";
      console.log(`  ${edge.fromFile}  ${arrow}  ${edge.toFile}`);
    }
    console.log(``);
    console.log(
      `These are file-path edges. After you apply the node proposals,`,
    );
    console.log(
      `γ-6 (not yet implemented) will resolve them into edge_create`,
    );
    console.log(
      `proposals by matching on outputs.files[0] of each created node.`,
    );
  }
  if (!opts.dryRun && okCount > 0) {
    console.log(``);
    console.log(`Next:`);
    console.log(`  onto proposal list                # review the ${okCount} proposals`);
    console.log(`  # apply them individually with: onto proposal apply <id>`);
  }
  if (opts.dryRun) {
    console.log(``);
    console.log(`Dry run — no proposals created. Re-run without --dry-run to commit.`);
  }
  tryWriteIngestProgressReport({
    rootDir: process.cwd(),
    provider: opts.provider,
    model: opts.model,
    dryRun: opts.dryRun,
    json: opts.json,
    staticClassifierMode: opts.staticClassifier,
    files: results.map((r) => ({
      filePath: r.filePath,
      ok: r.ok,
      tokensUsed: r.tokensUsed,
      reason: r.reason,
      telemetry: r.telemetry,
      ensemble: r.ensemble,
      classification: r.classification,
      routing: r.routing,
    })),
    proposalsCreated: results.filter((r) => r.ok && r.proposalId !== undefined).length,
    totalTokens,
  });
  if (failedCount > 0 && failedCount === results.length) process.exit(1);
}

// ── Multi-input flow (Phase ε prework A) ────────────────────────────────────

// Walks every input and returns a deduped absolute-path file list.
// Files are kept verbatim; directories are walked with
// collectSourceFiles (which already honours node_modules / dist /
// .ontology / __tests__ / .git / coverage skips). Dedup uses
// fs.realpathSync canonicalisation so a file passed both directly and
// via its parent directory only appears once, and macOS /tmp ↔
// /private/tmp symlink doublings collapse.
function collectAllInputFiles(
  inputs: Array<{ path: string; stat: fs.Stats }>,
  extensions: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const input of inputs) {
    const fromInput = input.stat.isDirectory()
      ? collectSourceFiles(path.resolve(input.path), extensions)
      : [path.resolve(input.path)];
    for (const f of fromInput) {
      let canonical: string;
      try {
        canonical = fs.realpathSync(f);
      } catch {
        canonical = f;
      }
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      out.push(f);
    }
  }
  return out;
}

async function runMultiInputIngest(
  inputs: Array<{ path: string; stat: fs.Stats }>,
  files: string[],
  opts: DirectoryOptions,
): Promise<void> {
  const extLabel = opts.extensions.map((e) => `.${e}`).join("/");

  if (files.length === 0) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: opts.dryRun,
            inputs: inputs.map((i) => ({
              path: i.path,
              kind: i.stat.isDirectory() ? "directory" : "file",
            })),
            fileCount: 0,
            results: [],
            edges: [],
            message: `No ${extLabel} files found across the provided inputs.`,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`=== ONTOLOGY INGEST — MULTI-INPUT ===`);
      for (const input of inputs) {
        console.log(
          `  ${input.stat.isDirectory() ? "dir " : "file"}  ${input.path}`,
        );
      }
      console.log(`Include:        ${extLabel}`);
      console.log(`Files:          0`);
      console.log(``);
      console.log(`No ${extLabel} files found across the inputs.`);
    }
    return;
  }

  const results: PerFileSummary[] = [];
  let totalTokens = 0;

  for (const filePath of files) {
    const cwdRelative = computeCwdRelative(filePath);
    const classification = classifyIfEnabled(filePath, opts.staticClassifier);
    const { result: extract, action } = await extractWithRouting({
      inputs: {
        filePath,
        provider: opts.provider,
        model: opts.model,
        ollamaHost: opts.ollamaHost,
      },
      ensemble: opts.ensemble,
      classification,
      staticClassifierMode: opts.staticClassifier,
    });
    const routing: IngestAction | undefined =
      opts.staticClassifier === "off" ? undefined : action;
    if (!extract.ok) {
      results.push({
        filePath,
        cwdRelative,
        ok: false,
        reason: extract.reason,
        message: extract.message,
        telemetry: extract.telemetry,
        ensemble: extract.ensemble,
        classification,
        routing,
      });
      continue;
    }

    const tokensUsed = extract.response.usage?.totalTokens ?? 0;
    totalTokens += tokensUsed;

    if (opts.dryRun) {
      results.push({
        filePath,
        cwdRelative,
        ok: true,
        extracted: extract.extracted,
        tokensUsed,
        telemetry: extract.telemetry,
        ensemble: extract.ensemble,
        classification,
        routing,
      });
      continue;
    }

    const created = createNodeProposalForExtraction(
      cwdRelative,
      extract.extracted,
      extract.response,
      opts.parentNodeId,
      opts.parentHash,
    );
    if (!created.ok) {
      results.push({
        filePath,
        cwdRelative,
        ok: false,
        reason: "proposal_create_failed",
        message: created.message,
        telemetry: extract.telemetry,
        ensemble: extract.ensemble,
        classification,
        routing,
      });
      continue;
    }
    results.push({
      filePath,
      cwdRelative,
      ok: true,
      extracted: extract.extracted,
      proposalId: created.proposalId,
      tokensUsed,
      telemetry: extract.telemetry,
      ensemble: extract.ensemble,
      classification,
      routing,
    });
  }

  // Edge inference per-directory-input. Files passed directly are not
  // edge-walked (the static analysers need a tree root to anchor
  // imports). Cross-root edges (file in input A imports file in input
  // B) are missed by this loop; documented in the command header and
  // accepted for Phase ε pilot scope.
  const inferredEdges: Array<{
    fromFile: string;
    toFile: string;
    type: string;
    tokens?: string[];
  }> = [];
  for (const input of inputs) {
    if (!input.stat.isDirectory()) continue;
    const absDir = path.resolve(input.path);
    const edges = inferEdgesAutoFromDirectory(absDir, opts.extensions);
    for (const e of edges) {
      inferredEdges.push({
        fromFile: path.relative(absDir, e.fromFile),
        toFile: path.relative(absDir, e.toFile),
        type: e.type,
        tokens: e.tokens,
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - okCount;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: failedCount === 0,
          dryRun: opts.dryRun,
          inputs: inputs.map((i) => ({
            path: i.path,
            kind: i.stat.isDirectory() ? "directory" : "file",
          })),
          fileCount: results.length,
          okCount,
          failedCount,
          totalTokens,
          results: results.map((r) => ({
            filePath: r.cwdRelative,
            ok: r.ok,
            reason: r.reason,
            message: r.message,
            extracted: r.extracted,
            proposalId: r.proposalId,
            tokensUsed: r.tokensUsed,
          })),
          edges: inferredEdges,
        },
        null,
        2,
      ),
    );
    if (failedCount > 0 && failedCount === results.length) process.exit(1);
    return;
  }

  console.log(
    `=== ONTOLOGY INGEST — MULTI-INPUT${opts.dryRun ? " (DRY RUN)" : ""} ===`,
  );
  for (const input of inputs) {
    console.log(
      `  ${input.stat.isDirectory() ? "dir " : "file"}  ${input.path}`,
    );
  }
  console.log(`Files scanned:  ${results.length}`);
  console.log(`  ok:           ${okCount}`);
  if (failedCount > 0) console.log(`  failed:       ${failedCount}`);
  if (totalTokens > 0) console.log(`Tokens used:    ${totalTokens}`);
  console.log(``);
  for (const r of results) {
    if (r.ok) {
      const label = r.extracted?.label ?? "(no label)";
      const proposalTag = r.proposalId ? `  →  ${r.proposalId}` : "";
      console.log(` ✓ ${r.cwdRelative}  ${label}${proposalTag}`);
    } else {
      console.log(` ✖ ${r.cwdRelative}  ${r.reason}: ${r.message}`);
    }
  }
  if (inferredEdges.length > 0) {
    console.log(``);
    console.log(
      `Inferred cross-file edges (γ-4, per-root scope — cross-root edges not inferred):`,
    );
    for (const edge of inferredEdges) {
      const arrow = edge.type === "uses_token" ? "─type→" : "──→";
      console.log(`  ${edge.fromFile}  ${arrow}  ${edge.toFile}`);
    }
  }
  if (!opts.dryRun && okCount > 0) {
    console.log(``);
    console.log(`Next:`);
    console.log(`  onto proposal list                # review the ${okCount} proposals`);
  }
  if (opts.dryRun) {
    console.log(``);
    console.log(`Dry run — no proposals created.`);
  }
  tryWriteIngestProgressReport({
    rootDir: process.cwd(),
    provider: opts.provider,
    model: opts.model,
    dryRun: opts.dryRun,
    json: opts.json,
    staticClassifierMode: opts.staticClassifier,
    files: results.map((r) => ({
      filePath: r.filePath,
      ok: r.ok,
      tokensUsed: r.tokensUsed,
      reason: r.reason,
      telemetry: r.telemetry,
      ensemble: r.ensemble,
      classification: r.classification,
      routing: r.routing,
    })),
    proposalsCreated: results.filter((r) => r.ok && r.proposalId !== undefined).length,
    totalTokens,
  });
  if (failedCount > 0 && failedCount === results.length) process.exit(1);
}

// ── Shared proposal-creation helper ─────────────────────────────────────────

interface ProposalCreateOk {
  ok: true;
  proposalId: string;
  proposalHash: string;
  eventId: string;
}
interface ProposalCreateErr {
  ok: false;
  message: string;
}

function createNodeProposalForExtraction(
  filePathRelative: string,
  extracted: ExtractionResult,
  response: LlmResponse,
  parentNodeId: string,
  parentHash: string,
): ProposalCreateOk | ProposalCreateErr {
  // provenance.rationale carries the extractor metadata only; the
  // rich extracted fields live on the payload directly (γ-3).
  // sourceFiles tracks the file path so γ-6 can resolve file-path
  // edges back to node IDs after apply.
  const rationalePayload = {
    extractedFrom: filePathRelative,
    extractorModel: response.model,
    extractorProvider: response.provider,
  };

  try {
    const { proposal, event } = createProposal({
      mutation: {
        kind: "node_create",
        payload: {
          level: extracted.level,
          kind: extracted.kind,
          prompt: extracted.prompt,
          label: extracted.label,
          parentNodeId,
          ...(extracted.manifestation !== undefined ? { manifestation: extracted.manifestation } : {}),
          ...(extracted.language !== undefined ? { language: extracted.language } : {}),
          ...(extracted.requires !== undefined ? { requires: extracted.requires } : {}),
          ...(extracted.provides !== undefined ? { provides: extracted.provides } : {}),
          ...(extracted.forbids !== undefined ? { forbids: extracted.forbids } : {}),
          ...(extracted.rules !== undefined ? { rules: extracted.rules } : {}),
          sourceFiles: [filePathRelative],
        },
        parentHash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [parentNodeId],
        rationale: JSON.stringify(rationalePayload, null, 2),
      },
    });
    return {
      ok: true,
      proposalId: proposal.id,
      proposalHash: proposal.hash,
      eventId: event.eventId,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: `Failed to create proposal: ${errorMessage(err)}`,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Parse the comma-separated --include flag. Default to ["ts", "tsx"]
// when unset — the historical γ-5 behaviour. Lowercases, strips
// leading dots, filters empties, and dedupes. Returns the cleaned
// list (which may be empty if the user passed `--include ""` or
// `--include ,,` — the caller surfaces that as a hard error).
function parseIncludeFlag(raw: string | undefined): string[] {
  if (raw === undefined) return ["ts", "tsx"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const cleaned = piece.toLowerCase().replace(/^\./, "").trim();
    if (cleaned.length === 0) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

// Compute a cwd-relative path that survives macOS symlinks. `/tmp` →
// `/private/tmp` and `/var` → `/private/var`; `process.cwd()` returns
// the resolved form, but a user-supplied path arg may be the
// unresolved one. Without normalisation, `path.relative` between the
// two blows up into "../../../../../../var/…" and the resulting
// sourceFiles entry is useless for downstream γ-6 edge resolution.
// realpathSync on both ends gives a stable relative path.
function computeCwdRelative(filePath: string): string {
  try {
    const cwdReal = fs.realpathSync(process.cwd());
    const fileReal = fs.realpathSync(path.resolve(filePath));
    return path.relative(cwdReal, fileReal);
  } catch {
    // Fall back to the un-resolved form if realpathSync misbehaves
    // (rare; transient races on a temp tree). Better than crashing
    // the whole ingest.
    return path.relative(process.cwd(), path.resolve(filePath));
  }
}

function tryParseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenceStripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(fenceStripped);
  } catch {
    return undefined;
  }
}

function guessLanguageHint(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".rb": "ruby",
    ".java": "java",
    ".md": "markdown",
    ".json": "json",
  };
  return map[ext] ?? "unknown";
}

function printExtraction(
  extracted: ExtractionResult,
  meta: {
    filePath: string;
    model: string;
    provider: string;
    usage?: { totalTokens?: number };
    committed: boolean;
    proposalId?: string;
  },
): void {
  console.log(`=== ONTOLOGY INGEST ${meta.committed ? "PROPOSAL" : "DRY RUN"} ===`);
  console.log(`File:        ${meta.filePath}`);
  console.log(`Provider:    ${meta.provider} (${meta.model})`);
  if (meta.usage?.totalTokens !== undefined) {
    console.log(`Tokens:      ${meta.usage.totalTokens}`);
  }
  console.log(``);
  console.log(`Label:         ${extracted.label}`);
  console.log(`Level:         ${extracted.level}`);
  console.log(`Kind:          ${extracted.kind}`);
  if (extracted.manifestation) {
    console.log(`Manifestation: ${extracted.manifestation}`);
  }
  if (extracted.language) {
    console.log(`Language:      ${extracted.language}`);
  }
  console.log(``);
  console.log(`Prompt:`);
  console.log(indent(extracted.prompt, "  "));
  if (extracted.requires?.length) {
    console.log(``);
    console.log(`Requires:    ${extracted.requires.join(", ")}`);
  }
  if (extracted.provides?.length) {
    console.log(`Provides:    ${extracted.provides.join(", ")}`);
  }
  if (extracted.forbids?.length) {
    console.log(`Forbids:     ${extracted.forbids.join(", ")}`);
  }
  if (extracted.rules?.length) {
    console.log(`Rules:`);
    for (const r of extracted.rules) console.log(`  - ${r}`);
  }
  if (meta.committed && meta.proposalId) {
    console.log(``);
    console.log(`Proposal:    ${meta.proposalId}`);
    console.log(``);
    console.log(`Next:`);
    console.log(`  onto proposal show ${meta.proposalId}`);
    console.log(`  onto proposal apply ${meta.proposalId}    # creates the node with all extracted fields in one step`);
  } else if (!meta.committed) {
    console.log(``);
    console.log(`Dry run — no proposal created. Re-run without --dry-run to commit.`);
  }
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

// Write a per-invocation progress report to .ontology/reports/INGEST_<runId>.md
// with charts derived from the per-file results. Non-fatal: any error
// is logged to stderr (or swallowed under --json) and the command
// returns normally. The function is shared by all three ingest flows
// (single file, directory, multi-input).
function tryWriteIngestProgressReport(args: {
  rootDir: string;
  provider: string;
  model: string | undefined;
  dryRun: boolean;
  json: boolean;
  staticClassifierMode: StaticClassifierMode;
  files: IngestFileSummary[];
  proposalsCreated: number;
  totalTokens: number;
}): void {
  try {
    const runId = newRunId();
    const body = renderIngestReport({
      runId,
      timestamp: new Date().toISOString(),
      rootDir: args.rootDir,
      branch: undefined,
      provider: args.provider,
      model: args.model ?? "(adapter default)",
      dryRun: args.dryRun,
      staticClassifierMode: args.staticClassifierMode,
      files: args.files,
      proposalsCreated: args.proposalsCreated,
      totalTokens: args.totalTokens,
      totalUsd: 0,
    });
    const reportPath = writeProgressReport(args.rootDir, "INGEST", runId, body);
    if (!args.json) {
      console.log(``);
      console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
    }
  } catch (err: unknown) {
    if (!args.json) {
      console.error(
        `⚠ Failed to write ingest progress report: ${errorMessage(err)}`,
      );
    }
  }
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
