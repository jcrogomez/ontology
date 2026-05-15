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

// JSON the extractor returns. The schema is the contract between the
// system prompt and the parser; if the LLM emits anything outside
// this shape, Zod rejects it loudly.
const ExtractionResultSchema = z.object({
  label: z.string().min(1).max(256),
  level: AbstractionLevelSchema,
  kind: NodeKindSchema,
  manifestation: ManifestationSchema.optional(),
  language: z.string().optional(),
  prompt: z.string().min(1),
  requires: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  forbids: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional(),
});

type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

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
}

// The extraction system prompt. The Anthropic adapter tags this block
// with cache_control: ephemeral so subsequent ingest calls in the same
// session reuse the cached prefix (~0.1× input cost on hits). On Opus
// 4.7 the cache only activates above 4096 tokens; this prompt sits
// well under that threshold today, which is fine — the cache turns on
// automatically once the template grows. With γ-5 multi-file ingest,
// every per-file call inside one `onto ingest <directory>` invocation
// shares this system prompt, so once it crosses the threshold every
// per-file call beyond the first will hit cache.
const EXTRACTION_SYSTEM_PROMPT = `You are the extraction component of Ontology, a system that lifts existing source code into a typed intent graph. Given a single source file, you extract its INTENT — a structured description of what the file does and the invariants it preserves — that can later be re-compiled into code.

Your output MUST be a single JSON object with these fields (no markdown fence, no preamble, no explanation outside the JSON):

{
  "label": "Short human-readable name (≤80 chars)",
  "level": "canon | project | target | stack | architecture | domain | workflow | interface | unit | token | artifact",
  "kind": "canon | decision | rule | constraint | definition | entity | action | function | asset | view | component | token | artifact",
  "manifestation": "intent | ast | osl | code | test | build",
  "language": "typescript | python | rust | …",
  "prompt": "A 2-6 sentence description of what this file IMPLEMENTS and the invariants it preserves. Describe the SHAPE of the behavior, not the literal code. A future LLM, given only this prompt, should be able to regenerate something semantically equivalent.",
  "requires": ["token_a", "token_b"],
  "provides": ["exported_token_a", "exported_token_b"],
  "forbids": ["console.log", "side_effects"],
  "rules": ["FORBID: any function that mutates its argument", "REQUIRE: prefixed digests use the convention '<kind>:hash:<digest>'"]
}

Guidance:

- "level" is the abstraction tier. For most concrete source files (functions, modules, primitives) use "artifact" or "unit". "domain" / "workflow" are reserved for higher-level intents that orchestrate multiple files.

- "kind" is the semantic role. Use "artifact" for compiled outputs and concrete code modules; "function" for pure functions / utilities; "entity" for data types and records; "action" for side-effectful operations; "rule" for invariants / business rules; "constraint" for schema-level restrictions; "view" for read models / projections; "component" for composite structural units. Stick to the enum exactly — invented values will fail schema validation.

- "manifestation" reflects the form of the artifact. For TypeScript / Python / etc. source files, use "code". Use "test" for test files; "build" for build scripts; "intent" for prose-only nodes.

- "prompt" is the load-bearing field. It must be precise enough that a frontier model, given ONLY this prompt + the declared context contract, can produce code that satisfies the same invariants. Avoid restating the syntax — describe WHAT the code preserves, what data shapes it manipulates, and what library functions it depends on (by name).

- "requires" lists tokens this file CONSUMES from OTHER FILES IN THIS PROJECT. Include only project-internal dependencies (e.g. a function imported from a sibling module under the same source tree). Do NOT include: stdlib modules (random, os, sys, math, time, itertools, json, etc.), external/pip-installed packages (numpy, matplotlib, requests, networkx, etc.), built-in identifiers (range, len, dict, list, etc.), or types from the typing module. If the file has no internal cross-file dependencies — common for self-contained scripts — emit an empty array.

- "provides" lists EVERY top-level public name this file declares — every top-level def, class, async def, and module-level constant a downstream consumer (test, importer, or the compile-back gate) could reasonably reference. Include every public function the source defines, even ones a sibling module would not call — they pin the file's structural decomposition under the γ-7 signature-invariants pass. Underscore-prefixed names (e.g. _helper) are conventionally private; include them only if the source clearly exposes them. Do NOT include stdlib / external / built-in names (same exclusion rule as requires).

- "forbids" lists patterns that must NOT appear in the compiled output (e.g. "console.log", "debug_output", or library functions that would change semantics).

- "rules" are FORBID:/REQUIRE: prose strings. Include any non-trivial invariant the source code preserves but the contract tokens alone don't capture.

If any field is genuinely empty (e.g. a pure utility file with no external dependencies has empty requires), emit an empty array. Do not invent tokens.`;

// ── Pure library: extract intent from a single source file ──────────────────

interface ExtractInputs {
  filePath: string;
  provider: LlmProvider;
  model?: string;
  ollamaHost?: string;
}

type ExtractResult =
  | {
      ok: true;
      filePath: string;
      cwdRelative: string;
      extracted: ExtractionResult;
      response: LlmResponse;
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
        | "schema_failed";
      message: string;
    };

// Reads, validates, dispatches, parses, returns. Pure with respect to
// graph state — never writes proposals or events. γ-1 (single-file
// ingest) and γ-5 (multi-file ingest) both compose over this.
async function extractIntentFromFile(
  inputs: ExtractInputs,
): Promise<ExtractResult> {
  const { filePath, provider, model, ollamaHost } = inputs;

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
    };
  }
  if (fileContent.includes("\u0000")) {
    return {
      ok: false,
      filePath,
      reason: "binary_content",
      message: `"${filePath}" appears to be a binary file (contains NUL bytes).`,
    };
  }
  if (fileContent.trim().length === 0) {
    return {
      ok: false,
      filePath,
      reason: "empty_file",
      message: `"${filePath}" is empty; nothing to ingest.`,
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

  // 3. Dispatch.
  let response: LlmResponse;
  try {
    response = await dispatchLlmRequest(
      {
        task: "semantic_parse",
        prompt: userPrompt,
        system: EXTRACTION_SYSTEM_PROMPT,
        json: true,
        contextWindow: budget.contextWindow,
        maxTokens: budget.maxTokens,
      },
      { provider, defaultModel: model, ollamaHost },
    );
  } catch (err: unknown) {
    return {
      ok: false,
      filePath,
      reason: "dispatch_failed",
      message: `Dispatch failed: ${errorMessage(err)}`,
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
    return {
      ok: false,
      filePath,
      reason: "invalid_json",
      message: `The extractor did not return valid JSON. Raw response:\n${response.text.slice(0, 500)}`,
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
  const firstFailureMessage = formatZodIssues(parsed.error.issues);
  const retryPrompt = buildRetryPrompt(userPrompt, firstFailureMessage);
  let retryResponse: LlmResponse;
  try {
    retryResponse = await dispatchLlmRequest(
      {
        task: "semantic_parse",
        prompt: retryPrompt,
        system: EXTRACTION_SYSTEM_PROMPT,
        json: true,
        contextWindow: budget.contextWindow,
        maxTokens: budget.maxTokens,
      },
      { provider, defaultModel: model, ollamaHost },
    );
  } catch (err: unknown) {
    // Retry dispatch failed — surface the original schema error
    // alongside the dispatch failure so the operator sees both.
    return {
      ok: false,
      filePath,
      reason: "schema_failed",
      message: `Extraction JSON failed validation (retry also failed: ${errorMessage(err)}): ${firstFailureMessage}`,
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
    };
  }
  // Retry succeeded.
  return {
    ok: true,
    filePath,
    cwdRelative,
    extracted: retryParsed.data,
    response: retryResponse,
  };
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
  const MAX_OUTPUT = 4096;

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
}

async function runSingleFileIngest(
  filePath: string,
  opts: SingleFileOptions,
): Promise<void> {
  const result = await extractIntentFromFile({
    filePath,
    provider: opts.provider,
    model: opts.model,
    ollamaHost: opts.ollamaHost,
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
    files: [
      {
        filePath: result.cwdRelative || filePath,
        ok: true,
        tokensUsed: result.response.usage?.totalTokens,
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
    const extract = await extractIntentFromFile({
      filePath,
      provider: opts.provider,
      model: opts.model,
      ollamaHost: opts.ollamaHost,
    });
    if (!extract.ok) {
      results.push({
        filePath,
        cwdRelative,
        ok: false,
        reason: extract.reason,
        message: extract.message,
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
    files: results.map((r) => ({
      filePath: r.filePath,
      ok: r.ok,
      tokensUsed: r.tokensUsed,
      reason: r.reason,
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
    const extract = await extractIntentFromFile({
      filePath,
      provider: opts.provider,
      model: opts.model,
      ollamaHost: opts.ollamaHost,
    });
    if (!extract.ok) {
      results.push({
        filePath,
        cwdRelative,
        ok: false,
        reason: extract.reason,
        message: extract.message,
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
    files: results.map((r) => ({
      filePath: r.filePath,
      ok: r.ok,
      tokensUsed: r.tokensUsed,
      reason: r.reason,
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
