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
import type { LlmProvider } from "../../runtime/llm/types.js";
import { errorMessage } from "../../core/errors.js";

// `onto ingest <file>` — Project Legend Phase γ-1 v0+.
//
// Reads a single source file, dispatches a frontier LLM with an
// extraction template, and produces a node_create proposal under the
// canon parent. The proposal carries level/kind/prompt/label (the
// fields the existing node_create payload supports); the richer
// extracted intent — manifestation, language, requires/provides/
// forbids, rules — is stored in provenance.rationale as JSON so the
// user can apply the proposal and then patch with `onto node update`.
//
// This is the smallest version that closes the round-trip: hash.ts →
// ingest → proposal → apply → compile → diff. Subsequent iterations
// can extend the proposal payload schema to carry the rich fields
// directly (planned γ-3) and add static-edge inference (planned γ-2 of
// the original Legend roadmap, now γ-3+ given the gamma renumber).

// JSON the extractor returns. The schema is the contract between the
// system prompt and the parser; if the LLM emits anything outside
// this shape, Zod rejects it loudly.
const ExtractionResultSchema = z.object({
  label: z.string().min(1).max(256),
  level: AbstractionLevelSchema,
  kind: NodeKindSchema,
  // Optional — the extractor MAY emit these. They land in
  // provenance.rationale as JSON for the user to apply via
  // `onto node update` after the proposal is accepted.
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
  // mock = identity functor (the file content becomes the proposal's
  // prompt verbatim; useful for plumbing tests, not real ingest).
  provider?: string;
  model?: string;
  ollamaHost?: string;
  parent?: string; // node id; defaults to root canon
  // Read-only preview: dispatch + parse + print, but do NOT create the
  // proposal. Lets the user iterate the extraction prompt template
  // without piling up rejected proposals on disk.
  dryRun?: boolean;
  json?: boolean;
}

// The extraction system prompt. The Anthropic adapter tags this block
// with cache_control: ephemeral so subsequent ingest calls in the same
// session reuse the cached prefix (~0.1× input cost on hits). On Opus
// 4.7 the cache only activates above 4096 tokens; this prompt sits
// well under that threshold today, which is fine — the cache turns on
// automatically once the template grows.
//
// Style notes pulled from the manual calibration on hash.ts:
//   - The LLM must emit a JSON object only, no preamble, no fence.
//   - The intent text in `prompt` describes WHAT the file does and the
//     invariants it preserves, not the literal code.
//   - Requires/provides are tokens that other files in the codebase
//     can match against — surface them as terse identifiers.
//   - Rules are FORBID/REQUIRE prose strings (the existing convention).
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

export async function ingestCommand(
  filePath: string,
  options: IngestCommandOptions,
): Promise<void> {
  // 1. Read the file + binary guard. Same shape as --candidate-file
  // (commit 14ecc51) and --literal-file (β-2): a NUL byte inside
  // utf-8-decoded content is the high-precision signal that the file
  // is binary. Refuse upfront rather than send garbled bytes to the
  // LLM and pay for the dispatch.
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    failWith(`Could not read "${filePath}": ${errorMessage(err)}`, options.json);
    return;
  }
  if (fileContent.includes("\u0000")) {
    failWith(
      `"${filePath}" appears to be a binary file (contains NUL bytes). onto ingest expects a UTF-8 text source file.`,
      options.json,
    );
    return;
  }
  if (fileContent.trim().length === 0) {
    failWith(`"${filePath}" is empty; nothing to ingest.`, options.json);
    return;
  }

  // 2. Resolve provider + parent. Provider default = anthropic (the
  // frontier route from γ-0). Parent default = root canon.
  let provider: LlmProvider | undefined;
  if (options.provider !== undefined) {
    if (
      options.provider !== "mock" &&
      options.provider !== "ollama" &&
      options.provider !== "anthropic"
    ) {
      failWith(
        `Unsupported provider: ${options.provider} (try mock, ollama, or anthropic)`,
        options.json,
      );
      return;
    }
    provider = options.provider as LlmProvider;
  } else {
    provider = "anthropic";
  }

  const state = loadState();
  const parentNodeId = options.parent ?? state.rootNodeId;
  const parentNode = loadNodeById(parentNodeId);
  if (!parentNode) {
    failWith(`Parent node not found: ${parentNodeId}`, options.json);
    return;
  }

  // 3. Build the user prompt. The system prompt (the extraction
  // template) is the cached prefix; the per-file content sits in
  // the user turn so each ingest call invalidates only the suffix.
  const cwdRelative = path.relative(process.cwd(), path.resolve(filePath));
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

  // 4. Dispatch. json=true tells the adapter to JSON.parse the response
  // and surface it on response.json. Anthropic adapter falls through
  // if the response is not valid JSON; we validate against the Zod
  // schema next.
  let response;
  try {
    response = await dispatchLlmRequest(
      {
        task: "semantic_parse",
        prompt: userPrompt,
        system: EXTRACTION_SYSTEM_PROMPT,
        json: true,
      },
      { provider, defaultModel: options.model, ollamaHost: options.ollamaHost },
    );
  } catch (err: unknown) {
    failWith(`Dispatch failed: ${errorMessage(err)}`, options.json);
    return;
  }

  // 5. Parse + validate. The Anthropic adapter tries JSON.parse on
  // request.json=true and exposes the result via response.json. We
  // fall back to parsing response.text if .json is undefined (a model
  // that returned a fenced JSON, for example — the parser caught it
  // but the adapter's first attempt may have).
  const candidate =
    response.json !== undefined
      ? response.json
      : tryParseJsonFromText(response.text);
  if (candidate === undefined) {
    failWith(
      `The extractor did not return valid JSON. Raw response:\n${response.text.slice(0, 500)}`,
      options.json,
    );
    return;
  }
  const parsed = ExtractionResultSchema.safeParse(candidate);
  if (!parsed.success) {
    failWith(
      `Extraction JSON failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      options.json,
    );
    return;
  }
  const extracted = parsed.data;

  // 6. Dry-run short-circuit. Print the structured extraction so the
  // user can iterate the extraction template without piling up
  // throwaway proposals.
  if (options.dryRun) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: true,
            extracted,
            usage: response.usage,
            model: response.model,
            provider: response.provider,
          },
          null,
          2,
        ),
      );
    } else {
      printExtraction(extracted, {
        filePath: cwdRelative || filePath,
        model: response.model,
        provider: response.provider,
        usage: response.usage,
        committed: false,
      });
    }
    return;
  }

  // 7. Create the proposal. The proposal payload carries only the
  // fields ProposalNodeCreatePayloadSchema supports today (level /
  // kind / prompt / label / parentNodeId). The rich fields ride
  // along in provenance.rationale as JSON so the user can see them
  // and apply them via `onto node update` after acceptance.
  const rationalePayload = {
    extractedFrom: cwdRelative || filePath,
    extractedFields: {
      manifestation: extracted.manifestation ?? null,
      language: extracted.language ?? null,
      requires: extracted.requires ?? [],
      provides: extracted.provides ?? [],
      forbids: extracted.forbids ?? [],
      rules: extracted.rules ?? [],
    },
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
        },
        parentHash: parentNode.integrity.hash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [parentNodeId],
        rationale: JSON.stringify(rationalePayload, null, 2),
      },
    });

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: false,
            proposal: {
              id: proposal.id,
              status: proposal.status,
              mutationKind: proposal.mutation.kind,
              hash: proposal.hash,
            },
            event: { eventId: event.eventId, eventType: event.eventType },
            extracted,
            usage: response.usage,
            model: response.model,
            provider: response.provider,
          },
          null,
          2,
        ),
      );
      return;
    }

    printExtraction(extracted, {
      filePath: cwdRelative || filePath,
      model: response.model,
      provider: response.provider,
      usage: response.usage,
      committed: true,
      proposalId: proposal.id,
    });
  } catch (err: unknown) {
    failWith(`Failed to create proposal: ${errorMessage(err)}`, options.json);
  }
}

function tryParseJsonFromText(text: string): unknown {
  // Some models wrap the JSON in a code fence even when explicitly
  // asked not to. Strip a leading ```json / ``` and trailing ``` if
  // present, then JSON.parse. Returns undefined on any failure so the
  // caller can render a clean error.
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
    console.log(`  onto proposal apply ${meta.proposalId}`);
    console.log(`  # after apply, patch the new node with rich extracted fields:`);
    console.log(`  onto node update <newNodeId> --manifestation ${extracted.manifestation ?? "code"} ${extracted.language ? `--language ${extracted.language}` : ""} \\`);
    const requiresFlag = extracted.requires?.length
      ? ` --requires "${extracted.requires.join(",")}"`
      : "";
    const providesFlag = extracted.provides?.length
      ? ` --provides "${extracted.provides.join(",")}"`
      : "";
    const forbidsFlag = extracted.forbids?.length
      ? ` --forbids "${extracted.forbids.join(",")}"`
      : "";
    const rulesFlag = extracted.rules?.length
      ? ` --rules "${extracted.rules.join("|")}"`
      : "";
    console.log(`    ${requiresFlag.trim()}${providesFlag} ${forbidsFlag} ${rulesFlag}`.trim());
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
