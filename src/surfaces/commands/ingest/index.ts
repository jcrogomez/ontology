import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  AbstractionLevelSchema,
  ManifestationSchema,
  NodeKindSchema,
  type OntologyNode,
} from "../../../kernel/schemas/ontology.js";
import { loadNodeById, loadNodes, loadEdges, loadState } from "../../../kernel/core/project/load.js";
import { createProposal } from "../../../kernel/core/proposals/persist.js";
import {
  fetchPullRequest,
  fetchIssue,
  type IntentSource,
} from "../../../inverse/ingest/github.js";
import { dispatchLlmRequest } from "../../../runtime/llm/dispatcher.js";
import type { LlmProvider, LlmResponse } from "../../../runtime/llm/types.js";
import { collectSourceFiles } from "../../../inverse/static/typescript.js";
import {
  extractResolvedSignatures,
  type ResolvedExport,
} from "../../../inverse/static/typescript-resolved.js";
import { inferEdgesAutoFromDirectoryAsync } from "../../../inverse/static/edges.js";
import { errorMessage } from "../../../kernel/core/errors.js";
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
} from "../../../laws/progress-report.js";
import {
  HIGH_CONFIDENCE_MODEL,
  HIGH_CONFIDENCE_REPS,
  selectBestByScore,
  type EnsembleMetadata,
  type EnsembleMode,
  type EnsembleRunOutcome,
} from "../../../runtime/llm/ensemble.js";
import {
  classifySourceFile,
  type StructuralClassification,
} from "../../../inverse/structural-classifier.js";
import {
  computeRoutingSignature,
  type RoutingSignature,
} from "../../../inverse/routing-signature.js";
import { buildStaticSummary } from "../../../inverse/static-summary.js";
import {
  INTENT_NARRATION_PROMPT,
  IntentNarrationSchema,
  buildIntentNeighborhoodPrompt,
  type IntentNarration,
  type NeighborhoodFile,
} from "../../../inverse/intent-narration.js";
import {
  scanFileSymbols,
  patchProvidesWithAST,
} from "../../../inverse/ast-symbol-scanner.js";
import { extractRulesBlock } from "../../../forward/compile/rules-grounding.js";
import {
  decideStaticClassifierIngestAction,
  type IngestAction,
  type StaticClassifierMode,
} from "./static-classifier-policy.js";
import { inferManifestationFromSourcePath } from "../../../forward/compile/manifestation-mapper.js";

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
  // O1 side channel (key → syntactic signature), parallel to `provides`.
  // Populated only by the static-summary extractor; the LLM extractor omits
  // it (not in the system prompt). Threaded to the proposal payload's
  // `provideSignatures`. See docs/design/laws/CONTEXT_GLUING_REGIMES.md O1(c).
  provideSignatures: z.record(z.string(), z.string()).optional(),
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
  // Intent-narration mode (the WHY-as-prompt lift). When set, the
  // positional file paths are read as ONE neighbourhood and narrated
  // via INTENT_NARRATION_PROMPT into a single IntentNarration — the
  // code's purpose as a generative prompt + a behaviour oracle
  // (acceptanceCriteria), deliberately lossy. Distinct from the
  // default contract extractor. Produces one manifestation=intent
  // node_create proposal (unless --dry-run). See
  // docs/design/inverse/INTENT_NARRATION_SPEC.md.
  intent?: boolean;
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
  //     inverse/static-summary.ts). Files classified as test
  //     modules are skipped (no proposal). All other shapes
  //     (schema_module, adapter_module, cli_module, executable_module,
  //     component_module, mixed_module, unknown) still dispatch to
  //     the LLM exactly as before. The savings shape on the perimeter
  //     is surfaced in the INGEST report's "Classifier routing"
  //     section.
  staticClassifier?: "report-only" | "enabled";
  // O-gate #1: attach resolved-type signatures (a whole-program TypeChecker
  // pass) to ingested `provides` instead of the syntactic tier. Opt-in;
  // applies to directory / multi-input ingest (where a program is built over
  // the swept files), not single-file ingest.
  resolvedSignatures?: boolean;
  // #2 (create-context-graph follow-up): ingest intent from a GitHub
  // pull request or issue instead of source files. Exactly one of
  // {paths, fromPr, fromIssue} must be provided. These route through
  // the prose extractor (manifestation=intent), not the code extractor.
  fromPr?: string;
  fromIssue?: string;
  // Optional owner/repo override for the gh fetch (defaults to the
  // repo of the current directory, per gh's own resolution).
  repo?: string;
  // Post-apply edge mode: given the APPLIED node id of a previously
  // ingested PR intent, resolve the PR's changed files to existing
  // code nodes and create `documents` edge_create proposals. Requires
  // --from-pr. (Edges can't be created at capture time — the PR intent
  // node id is only assigned when its node_create proposal is applied;
  // this mirrors the γ-5 → γ-6 two-phase shape.)
  resolveEdges?: string;
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
export const EXTRACTION_SYSTEM_PROMPT = `
You are the Ontology contract extractor.

Given ONE source file, produce a JSON object that captures the file's constructive contract.

Your job is NOT to summarize the file.
Your job is to specify what a future implementation MUST recreate.

A downstream code-generation model will receive your extracted contract and attempt to regenerate an equivalent file.
Therefore, your output must preserve exact exported identifiers, public symbols, project-internal relationships, and invariants.

Return ONLY valid JSON matching the expected schema. No markdown fence, no preamble, no explanation outside the JSON.

Required fields: label, level, kind, prompt. Optional fields: manifestation, language, requires, provides, forbids, rules.

JSON FIELD TYPES (critical — type mismatches fail validation):
- label, level, kind, manifestation, language, prompt: STRINGS
- requires, provides, forbids, rules: ARRAYS OF STRINGS

The "prompt" field MUST be a single JSON STRING. When you write bullets for per-symbol enumeration, format them INSIDE the string using newline characters (\\n) between items — never emit "prompt" as a JSON array, never emit it as a JSON object. The bullet structure is text formatting WITHIN one string, not JSON structure.

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

Complete JSON output example (notice "prompt" is ONE STRING containing newline-separated bullets, not an array):

{
  "label": "Arithmetic Operations",
  "level": "artifact",
  "kind": "function",
  "manifestation": "code",
  "language": "typescript",
  "prompt": "- add(a: number, b: number) -> number: MUST return the arithmetic sum of a and b. Invariant: add(a, 0) equals a.\\n- subtract(a: number, b: number) -> number: MUST return a minus b. Invariant: subtract(a, 0) equals a and subtract(a, a) equals 0.",
  "provides": ["add", "subtract"],
  "requires": [],
  "forbids": [],
  "rules": []
}

Bad prompt example (do NOT do this):

"prompt": "Provides arithmetic utilities for adding and subtracting numbers."

Why bad: the bad prompt does not name add or subtract. A downstream generator would have to guess the exported names.

Also bad — wrong JSON shape (do NOT do this):

"prompt": [
  "- add(a, b) MUST return...",
  "- subtract(a, b) MUST return..."
]

Why bad: "prompt" must be a JSON STRING, not a JSON ARRAY. The δ extraction failure mode (Phase ε 2026-05-18) was this exact mistake: the model interpreted the bullet formatting as a JSON array, failing schema validation on 47% of files. Use \\n separators inside one string.

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

// Prose-tuned system prompt for PR / issue ingestion. Unlike the code
// extractor above, the input here is NATURAL-LANGUAGE intent (a pull
// request description, an issue body) — a statement of *why* a change
// should happen, not a symbol contract. So this prompt asks for a
// design-time intent node (manifestation=intent) and deliberately does
// NOT ask for provides/requires symbol contracts (prose has none).
export const EXTRACTION_SYSTEM_PROMPT_PROSE = `
You are the Ontology intent extractor for natural-language change requests.

Given ONE pull request or issue (its title, body, and optionally the list of files it touches), produce a JSON object that captures the DECLARED INTENT — what the author wants to be true, and why.

Your job is NOT to summarize the text verbatim. Distill the durable intent: the goal, the motivation, and the acceptance criteria a future implementer must satisfy.

Return ONLY valid JSON matching the expected schema. No markdown fence, no preamble, no explanation outside the JSON.

Required fields: label, level, kind, prompt.
Optional fields you SHOULD set: manifestation, rules.
Optional fields you SHOULD usually OMIT: language, requires, provides, forbids — prose has no symbol contract, so leave these empty unless the text literally names concrete project symbols.

JSON FIELD TYPES (critical — type mismatches fail validation):
- label, level, kind, manifestation, prompt: STRINGS
- rules, requires, provides, forbids: ARRAYS OF STRINGS

FIELD GUIDANCE:
- "manifestation": ALWAYS "intent". This is a design-time intention, not code.
- "level": choose ONE of: project, target, domain, workflow. A feature/change request is usually "target"; a cross-cutting concern is "domain"; a process step is "workflow".
- "kind": choose ONE of: decision, constraint, definition, action. A pull request (a chosen change) is usually "decision" or "action"; an issue stating a problem/requirement is usually "constraint" or "definition".
- "label": a short noun phrase naming the intent (e.g. "Rate-limit the public API").
- "prompt": a single JSON STRING synthesising the intent — the goal and the motivation, in 2–6 sentences. Use \\n for line breaks; never emit an array or object.
- "rules": the acceptance criteria / definition-of-done, one short imperative per array item, when the text implies them.

CRITICAL SCHEMA RULE:
You MUST use only the enum values listed above. Invented values fail validation.

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

// s(c) — RECORD-ONLY routing signature (P7, STOCHASTIC_FUNCTORS.md).
// Computed alongside the report-only classifier as a PURE OBSERVATION: it
// is surfaced in ingest's --json output so operators (and the P3
// calibration, P7_ROUTING_CALIBRATION_2026-07-08) can see which
// prompt-profile / model-tier s(c) WOULD pick — but it does NOT change the
// dispatched prompt or model. Acting on it is gated behind the P3
// validation (see that hypothesis' decision rule). Same gating as the
// classifier: "off" observes nothing; report-only/enabled observe only.
// A failed read returns undefined and ingest proceeds unchanged.
function routingSignatureIfEnabled(
  filePath: string,
  mode: StaticClassifierMode,
  classification: StructuralClassification | undefined,
): RoutingSignature | undefined {
  if (mode === "off" || classification === undefined) return undefined;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return computeRoutingSignature({ path: filePath, content, classification });
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
  /**
   * True iff the Move 1c AST safety net replaced an empty
   * `provides` with the AST-derived export list. Phase ε Move 1c —
   * the schemas/ontology.ts straggler diagnosis showed that some
   * files exceed the LLM extractor's working-memory budget and emit
   * `provides: []` rather than partial lists; this flag surfaces
   * whenever the deterministic fallback rescued the contract.
   */
  astProvidesPatched: boolean;
  /** Count of AST exports rescued when astProvidesPatched fired.
   * Zero when not patched. Surfaces the magnitude of the LLM dropout. */
  astProvidesRescuedCount: number;
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
    astProvidesPatched: false,
    astProvidesRescuedCount: 0,
    contextWindowRequested: undefined,
    maxTokensRequested: undefined,
    firstFailureKind: undefined,
    wallClockMs: 0,
  };
  const finalize = (): ExtractTelemetry => {
    telemetry.wallClockMs = performance.now() - t0;
    return { ...telemetry };
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

  return extractIntentFromText({
    label: filePath,
    cwdRelative,
    userPrompt,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    contentChars: fileContent.length,
    provider,
    model,
    ollamaHost,
  });
}

// Generic text → intent extractor. Owns telemetry + dispatch + H1
// schema-retry; both the file flow (above) and the PR/issue prose flow
// compose over it. Pure with respect to graph state — never writes
// proposals or events.
interface ExtractTextInputs {
  /** Identifier for provenance/reporting: a file path, or "<PR #123>". */
  label: string;
  /** cwd-relative label echoed back on the ok result. */
  cwdRelative: string;
  /** Fully-built user turn (the caller bakes in the content + framing). */
  userPrompt: string;
  /** System prompt (code-contract vs prose-intent) — also sizes the budget. */
  systemPrompt: string;
  /** Char count of the embedded content, for the adaptive budget. */
  contentChars: number;
  provider: LlmProvider;
  model?: string;
  ollamaHost?: string;
}

async function extractIntentFromText(
  inputs: ExtractTextInputs,
): Promise<ExtractResult> {
  const { cwdRelative, userPrompt, systemPrompt, contentChars, provider, model, ollamaHost } =
    inputs;
  // Alias so the dispatch/parse/retry body below reads `filePath`
  // exactly as the original single function did.
  const filePath = inputs.label;

  // Phase ε E1: telemetry accumulator. Mutable, threaded through every
  // return path via finalize(); finalize() snaps wallClockMs at exit.
  const t0 = performance.now();
  const telemetry: ExtractTelemetry = {
    dispatchAttempts: 0,
    schemaRetried: false,
    astProvidesPatched: false,
    astProvidesRescuedCount: 0,
    contextWindowRequested: undefined,
    maxTokensRequested: undefined,
    firstFailureKind: undefined,
    wallClockMs: 0,
  };
  const finalize = (): ExtractTelemetry => {
    telemetry.wallClockMs = performance.now() - t0;
    return { ...telemetry };
  };
  const countingDispatcher: DispatchFn = async (req, cfg) => {
    telemetry.dispatchAttempts += 1;
    return dispatchLlmRequest(req, cfg);
  };

  // Phase ε H2: adaptive input/output budget. Ollama defaults to
  // num_ctx=2048 (input) — Pilot data showed source files >~6 KB
  // silently truncating; the model returns garbled or empty JSON.
  // The budget below covers system prompt + content + retry feedback +
  // output JSON with a small safety buffer. Anthropic ignores
  // `contextWindow` (auto-managed).
  const budget = computeAdaptiveBudget(systemPrompt.length, contentChars);
  telemetry.contextWindowRequested = budget.contextWindow;
  telemetry.maxTokensRequested = budget.maxTokens;

  // 3. Dispatch (with H3 transient-retry backoff).
  let response: LlmResponse;
  try {
    response = await dispatchWithRetry(
      {
        task: "semantic_parse",
        prompt: userPrompt,
        system: systemPrompt,
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
        system: systemPrompt,
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
    `- "prompt" MUST be a single JSON STRING — never a JSON array, never an object. When writing bullets, format them as newline-separated text INSIDE the string: "- bullet1\\n- bullet2". This was the dominant δ failure mode (Phase ε 2026-05-18): 47% of files failed because the model emitted prompt as ["- bullet1", "- bullet2"] (array) instead of "- bullet1\\n- bullet2" (string).`,
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
    astProvidesPatched: innerTelemetries.some((t) => t.astProvidesPatched),
    astProvidesRescuedCount: innerTelemetries.reduce(
      (s, t) => s + t.astProvidesRescuedCount,
      0,
    ),
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
    astProvidesPatched: false,
    astProvidesRescuedCount: 0,
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
  // Move 1c safety net: when the LLM path succeeds but emits no
  // `provides`, fall back to the AST-derived export list so downstream
  // gluing has names to match against. Discovered via the
  // context/types.ts + fibration/types.ts straggler diagnosis — their
  // upstream supplier (schemas/ontology.ts, ~600 LOC / ~60 exports)
  // emitted provides=[] from qwen 3b because the file exceeded the
  // model's working-memory budget. See ast-symbol-scanner.ts +
  // patchProvidesWithAST docs for the conservative guards.
  if (result.ok) {
    const astScan = scanFileSymbols(args.inputs.filePath);
    if (astScan.ok) {
      const patch = patchProvidesWithAST(
        result.extracted.provides,
        astScan.mandatoryExports,
      );
      if (patch.applied) {
        result.extracted = {
          ...result.extracted,
          provides: patch.provides,
        };
        result.telemetry.astProvidesPatched = true;
        result.telemetry.astProvidesRescuedCount = patch.rescuedCount;
      }
    }
    // Rules-grounding recovery (LENS_LAWS_2026-06-13 §E2, dual of the
    // provides rescue): if the source carries a deterministic
    // `@ontology:rules` block, recover those rules verbatim — the LLM is
    // unreliable for rules even at the frontier ceiling, so a present block
    // is authoritative. Always-on: fires only when the marker exists, so
    // ungrounded sources are unaffected.
    try {
      const sourceText = fs.readFileSync(args.inputs.filePath, "utf-8");
      const blockRules = extractRulesBlock(sourceText);
      if (blockRules.length > 0) {
        const existing = result.extracted.rules ?? [];
        const merged = [...blockRules];
        for (const r of existing) if (!merged.includes(r)) merged.push(r);
        result.extracted = { ...result.extracted, rules: merged };
      }
    } catch {
      // unreadable source — leave the LLM-extracted rules untouched.
    }
  }
  return { result, action };
}

// ── Top-level command: route file vs directory ──────────────────────────────

export async function ingestCommand(
  pathArgs: string[],
  options: IngestCommandOptions,
): Promise<void> {
  // ── Source routing: exactly one of {paths, --from-pr, --from-issue}. ──
  const hasPaths = Array.isArray(pathArgs) && pathArgs.length > 0;
  const sourceFlags = [options.fromPr, options.fromIssue].filter((v) => v !== undefined);
  if (sourceFlags.length > 1) {
    failWith("Pass only one of --from-pr / --from-issue.", options.json);
    return;
  }
  if (sourceFlags.length === 1 && hasPaths) {
    failWith("Pass either positional paths OR --from-pr/--from-issue, not both.", options.json);
    return;
  }
  if (options.resolveEdges !== undefined && options.fromPr === undefined) {
    failWith("--resolve-edges requires --from-pr <number>.", options.json);
    return;
  }
  // Intent-narration mode (the WHY-as-prompt lift). Operates on the
  // positional file paths as one neighbourhood; mutually exclusive with
  // the PR/issue prose source.
  if (options.intent) {
    if (sourceFlags.length > 0) {
      failWith("--intent works on positional file paths, not --from-pr/--from-issue.", options.json);
      return;
    }
    if (!hasPaths) {
      failWith("--intent needs at least one file path to narrate.", options.json);
      return;
    }
    await runIntentNarrationIngest(pathArgs, options);
    return;
  }
  if (options.fromPr !== undefined || options.fromIssue !== undefined) {
    await runIntentSourceIngest(options);
    return;
  }

  if (!hasPaths) {
    failWith("No paths provided to ingest. Pass a file/dir, or --from-pr/--from-issue <number>.", options.json);
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
  //     inverse/static-summary.ts for the routing table.
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
        resolvedSignatures: !!options.resolvedSignatures,
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
    resolvedSignatures: !!options.resolvedSignatures,
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
  // Record-only: what s(c) WOULD route (prompt-profile / model-tier). Does
  // not alter dispatch — see routingSignatureIfEnabled.
  const routingSignature = routingSignatureIfEnabled(
    filePath,
    opts.staticClassifier,
    classification,
  );
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
            routingSignature,
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
          routingSignature,
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
  // O-gate #1 (CONTEXT_GLUING_REGIMES.md): when set, signatures attached to
  // ingested `provides` come from the resolved-type extractor (a whole-program
  // TypeChecker pass) instead of the syntactic tier — genuine interface
  // identity (alias expansion, inferred types), tier-tagged so it never
  // string-equals a syntactic signature. Opt-in; default keeps the syntactic
  // tier (no test churn, no environment-sensitive type strings by default).
  resolvedSignatures?: boolean;
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

  // O-gate #1: when --resolved-signatures is set, build ONE TypeChecker
  // program over the TS/JS files and resolve each export's type, so the
  // signatures attached to ingested `provides` are the resolved tier (genuine
  // interface identity) rather than the syntactic proxy. One program for the
  // whole sweep (createProgram is heavy; amortise it once).
  const resolvedSigMap = opts.resolvedSignatures
    ? extractResolvedSignatures(files.filter((f) => /\.(ts|tsx|js|jsx)$/i.test(f)))
    : undefined;

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

    applyResolvedSignatures(extract.extracted, filePath, resolvedSigMap);

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
  // list. TS files go to the TS compiler API parser; .py files go to
  // the regex-based Python parser; .rs files go to the lazy-loaded
  // tree-sitter backend (γ-4-rust). Other unknown extensions silently
  // skip the static-edge step — γ-5 still produces the node proposals,
  // just without auto-inferred edges.
  const inferredEdges = (await inferEdgesAutoFromDirectoryAsync(absDir, opts.extensions)).map(
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
    console.log(``);
    console.log(`After applying — verify structural readiness:`);
    console.log(`  onto graph readiness              # gate: nodes-without-edges, routing gap, flatness`);
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
// O-gate #1: replace a file's syntactic provideSignatures with resolved-tier
// ones (replace, not merge, so a node's signatures are one uniform tier; keys
// with no resolved signature carry none — conservative). Tier-tagged values
// mean a resolved node never glues with a syntactic node across tiers.
function applyResolvedSignatures(
  extracted: ExtractionResult,
  filePath: string,
  resolvedSigMap: Map<string, ResolvedExport[]> | undefined,
): void {
  if (!resolvedSigMap || !extracted.provides?.length) return;
  const resolved = resolvedSigMap.get(path.resolve(filePath));
  if (!resolved || resolved.length === 0) return;
  const byName = new Map(resolved.map((r) => [r.name, r.signature]));
  const sigs: Record<string, string> = {};
  for (const key of extracted.provides) {
    const s = byName.get(key);
    if (s !== undefined) sigs[key] = s;
  }
  extracted.provideSignatures = Object.keys(sigs).length > 0 ? sigs : undefined;
}

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

  // O-gate #1: one resolved-type program over the TS/JS inputs (see
  // runDirectoryIngest for the rationale).
  const resolvedSigMap = opts.resolvedSignatures
    ? extractResolvedSignatures(files.filter((f) => /\.(ts|tsx|js|jsx)$/i.test(f)))
    : undefined;

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

    applyResolvedSignatures(extract.extracted, filePath, resolvedSigMap);

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
    const edges = await inferEdgesAutoFromDirectoryAsync(absDir, opts.extensions);
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
    console.log(``);
    console.log(`After applying — verify structural readiness:`);
    console.log(`  onto graph readiness              # gate: nodes-without-edges, routing gap, flatness`);
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

// ── #2: ingest intent from a GitHub PR / issue (prose flow) ──────────────────

// Build the prose user turn from a fetched IntentSource. The body is the
// load-bearing content; title + metadata frame it.
function buildIntentSourceUserPrompt(source: IntentSource): string {
  const lines: string[] = [];
  lines.push(`${source.kind === "pr" ? "Pull request" : "Issue"} #${source.number}: ${source.title}`);
  if (source.state) lines.push(`State: ${source.state}`);
  if (source.author) lines.push(`Author: ${source.author}`);
  if (source.kind === "pr" && source.files && source.files.length > 0) {
    lines.push(`Changed files (${source.files.length}): ${source.files.map((f) => f.path).join(", ")}`);
  }
  lines.push("");
  lines.push("--- BEGIN DESCRIPTION ---");
  lines.push(source.body.trim().length > 0 ? source.body : "(no description provided)");
  lines.push("--- END DESCRIPTION ---");
  lines.push("");
  lines.push("Extract the structured intent. Output JSON only.");
  return lines.join("\n");
}

// Read-only index of nodes keyed by their source file (outputs.files[0]),
// the same key γ-6 uses. Hand-authored nodes (empty outputs.files) don't
// appear and can't anchor a match.
function buildNodeByFileIndex(cwd?: string): Map<string, OntologyNode> {
  const idx = new Map<string, OntologyNode>();
  for (const n of loadNodes(cwd)) {
    const first = n.outputs?.files?.[0];
    if (typeof first === "string" && first.length > 0 && !idx.has(first)) idx.set(first, n);
  }
  return idx;
}

export interface ChangedFileMatch {
  file: string;
  nodeId: string;
}

// Best-effort: map a PR's changed files to existing code nodes. Pure /
// read-only — used both to report at capture time and to drive the
// post-apply edge resolver. Exported for tests.
export function matchChangedFilesToNodes(
  files: Array<{ path: string }>,
  cwd?: string,
): ChangedFileMatch[] {
  if (files.length === 0) return [];
  const idx = buildNodeByFileIndex(cwd);
  const out: ChangedFileMatch[] = [];
  for (const f of files) {
    const node = idx.get(f.path) ?? idx.get(computeCwdRelative(f.path));
    if (node) out.push({ file: f.path, nodeId: node.id });
  }
  return out;
}

// Ingest one already-fetched IntentSource (PR / issue). Network I/O lives
// in the caller (the CLI does the gh fetch); this stays testable with the
// mock provider + a canned source. Exported for tests.
export async function ingestFromIntentSource(args: {
  source: IntentSource;
  provider: LlmProvider;
  model?: string;
  ollamaHost?: string;
  parentNodeId: string;
  parentHash: string;
  dryRun: boolean;
  json: boolean;
  cwd?: string;
}): Promise<{ ok: boolean; proposalId?: string; extracted?: ExtractionResult; matchedFiles?: ChangedFileMatch[] }> {
  const { source } = args;
  const label = `<${source.kind === "pr" ? "PR" : "issue"} #${source.number}: ${source.title}>`;
  const userPrompt = buildIntentSourceUserPrompt(source);

  const result = await extractIntentFromText({
    label,
    cwdRelative: label,
    userPrompt,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT_PROSE,
    contentChars: (source.title + source.body).length,
    provider: args.provider,
    model: args.model,
    ollamaHost: args.ollamaHost,
  });
  if (!result.ok) {
    failWith(result.message, args.json);
    return { ok: false };
  }

  // Best-effort changed-files → code-node matching (PRs only). Read-only;
  // reported now, materialised as edges later via --resolve-edges.
  const matched =
    source.kind === "pr" ? matchChangedFilesToNodes(source.files ?? [], args.cwd) : [];

  if (args.dryRun) {
    if (args.json) {
      console.log(JSON.stringify({ ok: true, dryRun: true, source: { kind: source.kind, number: source.number, url: source.url }, extracted: result.extracted, matchedFiles: matched }, null, 2));
    } else {
      printExtraction(result.extracted, { filePath: label, model: result.response.model, provider: result.response.provider, usage: result.response.usage, committed: false });
      if (matched.length) console.log(`\n  ${matched.length} changed file(s) match existing nodes (apply, then --resolve-edges to link).`);
    }
    return { ok: true, extracted: result.extracted, matchedFiles: matched };
  }

  const proposalResult = createNodeProposalForExtraction(
    label,
    result.extracted,
    result.response,
    args.parentNodeId,
    args.parentHash,
    args.cwd,
  );
  if (!proposalResult.ok) {
    failWith(proposalResult.message, args.json);
    return { ok: false };
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: true, dryRun: false, proposal: { id: proposalResult.proposalId, status: "pending", mutationKind: "node_create", hash: proposalResult.proposalHash }, extracted: result.extracted, matchedFiles: matched, source: { kind: source.kind, number: source.number, url: source.url } }, null, 2));
  } else {
    printExtraction(result.extracted, { filePath: label, model: result.response.model, provider: result.response.provider, usage: result.response.usage, committed: true, proposalId: proposalResult.proposalId });
    if (matched.length) {
      console.log(`\n  ${matched.length} changed file(s) match existing code nodes:`);
      for (const m of matched) console.log(`    ${m.file} → ${m.nodeId}`);
      console.log(`  Apply proposal ${proposalResult.proposalId}, then run:`);
      console.log(`    onto ingest --from-pr ${source.number} --resolve-edges <appliedNodeId>`);
    }
  }
  return { ok: true, proposalId: proposalResult.proposalId, extracted: result.extracted, matchedFiles: matched };
}

// Post-apply edge resolver: from an APPLIED PR intent node, create
// `documents` edge_create proposals to each existing code node the PR
// touched. `documents` is outside the refinement family, so it never
// trips the abstraction-poset validator. Mirrors γ-6's resolver.
function resolvePrEdges(
  prNodeId: string,
  files: Array<{ path: string }>,
  json: boolean,
  cwd?: string,
): void {
  const prNode = loadNodeById(prNodeId, cwd);
  if (!prNode) {
    failWith(`Node not found: ${prNodeId} (apply the PR intent proposal first).`, json);
    return;
  }
  const state = loadState(cwd);
  const idx = buildNodeByFileIndex(cwd);
  const existing = new Set<string>();
  for (const e of loadEdges(cwd)) existing.add(`${e.from}|${e.to}|${e.type}`);

  const created: Array<{ proposalId: string; to: string }> = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  for (const f of files) {
    const target = idx.get(f.path) ?? idx.get(computeCwdRelative(f.path));
    if (!target) { skipped.push({ file: f.path, reason: "to_node_missing" }); continue; }
    if (target.coordinates.branch !== prNode.coordinates.branch) { skipped.push({ file: f.path, reason: "cross_branch" }); continue; }
    const key = `${prNode.id}|${target.id}|documents`;
    if (existing.has(key)) { skipped.push({ file: f.path, reason: "edge_already_exists" }); continue; }
    try {
      const { proposal } = createProposal({
        mutation: {
          kind: "edge_create",
          payload: { from: prNode.id, to: target.id, type: "documents", branch: state.activeBranch },
          fromHash: prNode.integrity.hash,
          toHash: target.integrity.hash,
        },
        source: null,
        validation: null,
        provenance: {
          derivedFrom: [prNode.id, target.id],
          rationale: JSON.stringify({ inferredBy: "pr-changed-files", file: f.path }, null, 2),
        },
        cwd,
      });
      created.push({ proposalId: proposal.id, to: target.id });
      existing.add(key);
    } catch (err: unknown) {
      skipped.push({ file: f.path, reason: `proposal_failed: ${errorMessage(err)}` });
    }
  }

  if (json) {
    console.log(JSON.stringify({ ok: true, prNodeId, created, skipped }, null, 2));
    return;
  }
  console.log(`✓ ${created.length} edge proposal(s) from ${prNodeId} (documents → code nodes).`);
  for (const c of created) console.log(`    ${c.proposalId}: ${prNodeId} →(documents)→ ${c.to}`);
  if (skipped.length) {
    console.log(`  ${skipped.length} skipped:`);
    for (const s of skipped) console.log(`    ${s.file}: ${s.reason}`);
  }
}

// Parse a positive-integer flag value (PR / issue number). Fails loud.
function parsePositiveIntFlag(raw: string, flag: string, json?: boolean): number | undefined {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    failWith(`${flag} must be a positive integer (got "${raw}").`, json);
    return undefined;
  }
  return n;
}

// CLI-facing: fetch the PR/issue via gh, then dispatch to the prose flow
// (or the post-apply edge resolver). The gh I/O is isolated here so
// ingestFromIntentSource stays network-free and testable.
// ── Intent-narration flow (the WHY-as-prompt lift) ──────────────────────────
//
// Reads the positional file paths as ONE neighbourhood, narrates the composed
// intent via INTENT_NARRATION_PROMPT, validates the IntentNarration shape, and
// (unless --dry-run) creates a single manifestation=intent node_create
// proposal whose `rules` carry the behaviour oracle (acceptanceCriteria).
// Deliberately distinct from the contract extractor: lossy, why-not-what.

async function runIntentNarrationIngest(
  pathArgs: string[],
  options: IngestCommandOptions,
): Promise<void> {
  const provider = resolveProvider(options);
  if (provider === undefined) return; // resolveProvider already failed.

  // Stat + expand inputs into a flat file list (a dir is walked by --include).
  const inputs: Array<{ path: string; stat: fs.Stats }> = [];
  for (const p of pathArgs) {
    try {
      inputs.push({ path: p, stat: fs.statSync(p) });
    } catch (err: unknown) {
      failWith(`Could not stat "${p}": ${errorMessage(err)}`, options.json);
      return;
    }
  }
  const filePaths = collectAllInputFiles(inputs, parseIncludeFlag(options.include));
  if (filePaths.length === 0) {
    failWith("No files matched for intent narration.", options.json);
    return;
  }

  // Read each file into the neighbourhood; skip binary/empty with a note.
  const files: NeighborhoodFile[] = [];
  const skipped: string[] = [];
  for (const fp of filePaths) {
    let content: string;
    try {
      content = fs.readFileSync(fp, "utf-8");
    } catch (err: unknown) {
      failWith(`Could not read "${fp}": ${errorMessage(err)}`, options.json);
      return;
    }
    if (content.includes("\u0000") || content.trim().length === 0) {
      skipped.push(computeCwdRelative(fp) || fp);
      continue;
    }
    files.push({ path: computeCwdRelative(fp) || fp, content });
  }
  if (files.length === 0) {
    failWith("All candidate files were empty or binary; nothing to narrate.", options.json);
    return;
  }

  // Dispatch the narration. semantic_parse task reuses the existing budget +
  // transient-retry machinery; only the system prompt and schema differ.
  const userPrompt = buildIntentNeighborhoodPrompt(files);
  const contentChars = files.reduce((n, f) => n + f.content.length, 0);
  const budget = computeAdaptiveBudget(INTENT_NARRATION_PROMPT.length, contentChars);

  let response: LlmResponse;
  try {
    response = await dispatchWithRetry(
      {
        task: "semantic_parse",
        prompt: userPrompt,
        system: INTENT_NARRATION_PROMPT,
        json: true,
        contextWindow: budget.contextWindow,
        maxTokens: budget.maxTokens,
      },
      { provider, defaultModel: options.model, ollamaHost: options.ollamaHost },
      dispatchLlmRequest,
    );
  } catch (err: unknown) {
    failWith(`Intent narration dispatch failed: ${errorMessage(err)}`, options.json);
    return;
  }

  const candidate =
    response.json !== undefined ? response.json : tryParseJsonFromText(response.text);
  if (candidate === undefined) {
    failWith(
      `The narrator did not return valid JSON. Raw response:\n${response.text.slice(0, 500)}`,
      options.json,
    );
    return;
  }
  const parsed = IntentNarrationSchema.safeParse(candidate);
  if (!parsed.success) {
    failWith(
      `Intent narration failed schema validation: ${formatZodIssues(parsed.error.issues)}`,
      options.json,
    );
    return;
  }
  const narration = parsed.data;
  // Anchor sourceFiles to what we actually fed — the model may omit or guess.
  narration.sourceFiles = files.map((f) => f.path);

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, dryRun: true, narration, model: response.model, provider: response.provider }, null, 2));
    } else {
      printIntentNarration(narration, { provider: response.provider, model: response.model, committed: false, skipped });
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
  const proposalResult = createIntentNodeProposal(narration, parentNodeId, parentNode.integrity.hash, response);
  if (!proposalResult.ok) {
    failWith(proposalResult.message, options.json);
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: false,
          proposal: { id: proposalResult.proposalId, status: "pending", mutationKind: "node_create", hash: proposalResult.proposalHash },
          event: { eventId: proposalResult.eventId, eventType: "proposal_created" },
          narration,
          model: response.model,
          provider: response.provider,
        },
        null,
        2,
      ),
    );
    return;
  }
  printIntentNarration(narration, {
    provider: response.provider,
    model: response.model,
    committed: true,
    proposalId: proposalResult.proposalId,
    skipped,
  });
}

function printIntentNarration(
  narration: IntentNarration,
  meta: { provider: string; model: string; committed: boolean; proposalId?: string; skipped?: string[] },
): void {
  console.log(`\nINTENT NARRATION  (${meta.provider}/${meta.model})`);
  console.log(`  source: ${narration.sourceFiles.join(", ")}`);
  if (meta.skipped && meta.skipped.length > 0) {
    console.log(`  skipped (empty/binary): ${meta.skipped.join(", ")}`);
  }
  console.log(`\n  ${narration.label}  [${narration.level}]`);
  console.log(`\n  Problem:    ${narration.problem}`);
  console.log(`  Decision:   ${narration.decision}`);
  console.log(`  Parent goal:${narration.parentGoal}`);
  if (narration.constraints.length > 0) {
    console.log(`\n  Constraints:`);
    for (const c of narration.constraints) console.log(`    - ${c}`);
  }
  console.log(`\n  Intent prompt (the WHY-as-prompt):`);
  console.log(indent(narration.intentPrompt, "    "));
  console.log(`\n  Acceptance criteria (behaviour oracle):`);
  for (const a of narration.acceptanceCriteria) console.log(`    - ${a}`);
  if (meta.committed) {
    console.log(`\n  ✔ intent node proposal created: ${meta.proposalId} (manifestation=intent, pending)`);
  } else {
    console.log(`\n  (dry-run — no proposal created)`);
  }
}

// Map a validated IntentNarration into a manifestation=intent node_create
// proposal. Unlike createNodeProposalForExtraction, there is NO code-path
// manifestation override — an intent node stays intent even when lifted from
// a `.ts` file. The behaviour oracle (acceptanceCriteria) is persisted as the
// node's REQUIRE: rules.
function createIntentNodeProposal(
  narration: IntentNarration,
  parentNodeId: string,
  parentHash: string,
  response: LlmResponse,
  cwd?: string,
): ProposalCreateOk | ProposalCreateErr {
  const rules = narration.acceptanceCriteria.map((c) => `REQUIRE: ${c}`);
  const rationalePayload = {
    extractedFrom: narration.sourceFiles,
    extractorModel: response.model,
    extractorProvider: response.provider,
    mode: "intent-narration",
    problem: narration.problem,
    decision: narration.decision,
    parentGoal: narration.parentGoal,
  };
  try {
    const { proposal, event } = createProposal({
      mutation: {
        kind: "node_create",
        payload: {
          level: narration.level,
          kind: "definition",
          prompt: narration.intentPrompt,
          label: narration.label,
          parentNodeId,
          manifestation: "intent",
          ...(rules.length > 0 ? { rules } : {}),
          sourceFiles: narration.sourceFiles,
        },
        parentHash,
      },
      source: null,
      validation: null,
      provenance: {
        derivedFrom: [parentNodeId],
        rationale: JSON.stringify(rationalePayload, null, 2),
      },
      cwd,
    });
    return { ok: true, proposalId: proposal.id, proposalHash: proposal.hash, eventId: event.eventId };
  } catch (err: unknown) {
    return { ok: false, message: `Failed to create intent proposal: ${errorMessage(err)}` };
  }
}

async function runIntentSourceIngest(options: IngestCommandOptions): Promise<void> {
  const provider = resolveProvider(options);
  if (provider === undefined) return; // resolveProvider already failed.

  // Post-apply edge mode (PR only): re-fetch changed files, link to nodes.
  if (options.resolveEdges !== undefined) {
    const prNum = parsePositiveIntFlag(options.fromPr!, "--from-pr", options.json);
    if (prNum === undefined) return;
    let source: IntentSource;
    try {
      source = fetchPullRequest(prNum, options.repo);
    } catch (err: unknown) {
      failWith(errorMessage(err), options.json);
      return;
    }
    resolvePrEdges(options.resolveEdges, source.files ?? [], !!options.json);
    return;
  }

  // Fetch the source.
  let source: IntentSource;
  try {
    if (options.fromPr !== undefined) {
      const n = parsePositiveIntFlag(options.fromPr, "--from-pr", options.json);
      if (n === undefined) return;
      source = fetchPullRequest(n, options.repo);
    } else {
      const n = parsePositiveIntFlag(options.fromIssue!, "--from-issue", options.json);
      if (n === undefined) return;
      source = fetchIssue(n, options.repo);
    }
  } catch (err: unknown) {
    failWith(errorMessage(err), options.json);
    return;
  }

  const state = loadState();
  const parentNodeId = options.parent ?? state.rootNodeId;
  const parentNode = loadNodeById(parentNodeId);
  if (!parentNode) {
    failWith(`Parent node not found: ${parentNodeId}`, options.json);
    return;
  }

  await ingestFromIntentSource({
    source,
    provider,
    model: options.model,
    ollamaHost: options.ollamaHost,
    parentNodeId,
    parentHash: parentNode.integrity.hash,
    dryRun: !!options.dryRun,
    json: !!options.json,
  });
}

function createNodeProposalForExtraction(
  filePathRelative: string,
  extracted: ExtractionResult,
  response: LlmResponse,
  parentNodeId: string,
  parentHash: string,
  cwd?: string,
): ProposalCreateOk | ProposalCreateErr {
  // provenance.rationale carries the extractor metadata only; the
  // rich extracted fields live on the payload directly (γ-3).
  // sourceFiles tracks the file path so γ-6 can resolve file-path
  // edges back to node IDs after apply.
  // Guard: when the extractor omits manifestation (schema default
  // → "intent") or explicitly says "intent" for a file whose path
  // implies code/test/build, override. Without this, a code module
  // is silently excluded from `verify-homeomorphism --all-artifacts`
  // (its candidate resolver filters by manifestation === "code"),
  // shrinking the verified perimeter without warning — the
  // node_0094 failure mode caught post-Arm-A.
  const inferredManifestation = inferManifestationFromSourcePath(filePathRelative);
  const effectiveManifestation =
    inferredManifestation !== undefined &&
    (extracted.manifestation === undefined || extracted.manifestation === "intent")
      ? inferredManifestation
      : extracted.manifestation;
  const rationalePayload = {
    extractedFrom: filePathRelative,
    extractorModel: response.model,
    extractorProvider: response.provider,
    ...(inferredManifestation !== undefined &&
    extracted.manifestation !== inferredManifestation
      ? {
          manifestationOverride: {
            extractorSaid: extracted.manifestation ?? null,
            pathImplies: inferredManifestation,
          },
        }
      : {}),
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
          ...(effectiveManifestation !== undefined ? { manifestation: effectiveManifestation } : {}),
          ...(extracted.language !== undefined ? { language: extracted.language } : {}),
          ...(extracted.requires !== undefined ? { requires: extracted.requires } : {}),
          ...(extracted.provides !== undefined ? { provides: extracted.provides } : {}),
          ...(extracted.provideSignatures !== undefined ? { provideSignatures: extracted.provideSignatures } : {}),
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
      cwd,
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
