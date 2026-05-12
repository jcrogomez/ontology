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
import {
  collectTypeScriptFiles,
  inferEdgesFromDirectory,
} from "../../runtime/static/typescript.js";
import { errorMessage } from "../../core/errors.js";

// `onto ingest <path>` — Project Legend Phase γ-1 + γ-5.
//
// When <path> is a FILE: γ-1 single-file ingest. Dispatches a frontier
// LLM with an extraction template against that file and produces one
// node_create proposal under the canon parent (or --parent override).
//
// When <path> is a DIRECTORY: γ-5 multi-file ingest. Walks the
// directory (skipping node_modules / dist / .ontology / __tests__ /
// .git / coverage), runs the per-file extraction for every `.ts` /
// `.tsx` file via the same helper, and emits one node_create proposal
// per file. The proposal carries the file path in
// `payload.sourceFiles[0]` so a future γ-6 (`onto graph infer-edges
// --create-proposals`) can resolve the file-path edges that γ-4
// (`onto graph infer-edges`) computes back to the applied node IDs.
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
  "kind": "rule | canon | entity | event | command | query | view | invariant | constraint | exception | artifact",
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

- "kind" is the semantic role. "artifact" for compiled output, "rule" for pure functions / utilities, "entity" for data types, "command" for side-effectful actions, etc.

- "manifestation" reflects the form of the artifact. For TypeScript / Python / etc. source files, use "code". Use "test" for test files; "build" for build scripts; "intent" for prose-only nodes.

- "prompt" is the load-bearing field. It must be precise enough that a frontier model, given ONLY this prompt + the declared context contract, can produce code that satisfies the same invariants. Avoid restating the syntax — describe WHAT the code preserves, what data shapes it manipulates, and what library functions it depends on (by name).

- "requires" lists tokens this file CONSUMES from elsewhere in the codebase (imported functions / types / modules — extract the names). "provides" lists tokens this file EXPOSES (exported names that other files may consume).

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

  // 3. Dispatch.
  let response: LlmResponse;
  try {
    response = await dispatchLlmRequest(
      {
        task: "semantic_parse",
        prompt: userPrompt,
        system: EXTRACTION_SYSTEM_PROMPT,
        json: true,
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
  if (!parsed.success) {
    return {
      ok: false,
      filePath,
      reason: "schema_failed",
      message: `Extraction JSON failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  return {
    ok: true,
    filePath,
    cwdRelative,
    extracted: parsed.data,
    response,
  };
}

// ── Top-level command: route file vs directory ──────────────────────────────

export async function ingestCommand(
  pathArg: string,
  options: IngestCommandOptions,
): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(pathArg);
  } catch (err: unknown) {
    failWith(`Could not stat "${pathArg}": ${errorMessage(err)}`, options.json);
    return;
  }

  const provider = resolveProvider(options);
  if (provider === undefined) return; // resolveProvider already failed.

  const state = loadState();
  const parentNodeId = options.parent ?? state.rootNodeId;
  const parentNode = loadNodeById(parentNodeId);
  if (!parentNode) {
    failWith(`Parent node not found: ${parentNodeId}`, options.json);
    return;
  }

  if (stat.isDirectory()) {
    await runDirectoryIngest(pathArg, {
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

  await runSingleFileIngest(pathArg, {
    provider,
    model: options.model,
    ollamaHost: options.ollamaHost,
    parentNodeId,
    parentHash: parentNode.integrity.hash,
    dryRun: !!options.dryRun,
    json: !!options.json,
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
  const files = collectTypeScriptFiles(absDir);
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
              "No .ts/.tsx files found under the directory (after skipping node_modules / dist / .ontology / __tests__ / .git / coverage).",
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`=== ONTOLOGY INGEST — DIRECTORY ===`);
      console.log(`Root:        ${dirPath}`);
      console.log(`Files:       0`);
      console.log(``);
      console.log(`No .ts/.tsx files found under the directory.`);
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

  // Edge inference is pure static analysis — runs in milliseconds,
  // no LLM cost, useful regardless of dry-run mode. γ-6 will turn
  // this into edge_create proposals after the node proposals apply.
  const inferredEdges = inferEdgesFromDirectory(absDir).map((e) => ({
    fromFile: path.relative(absDir, e.fromFile),
    toFile: path.relative(absDir, e.toFile),
    type: e.type,
    tokens: e.tokens,
  }));

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

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
