import * as path from "node:path";
import { z } from "zod";
import {
  AbstractionLevelSchema,
  ManifestationSchema,
  NodeKindSchema,
} from "../../kernel/schemas/ontology.js";
import type {
  ClassificationVocabulary,
  StructuralClassification,
} from "./structural-classifier.js";

// Static-summary extraction — Project Legend Phase ε prework C.
//
// Pure, deterministic substitute for an LLM extraction. Consumed by
// `onto ingest --static-classifier enabled` whenever the structural
// classifier confidently identifies a shape whose intent the
// extraction prompt would produce verbatim anyway — barrels and
// declaration-only modules in this conservative v0.
//
// The output mirrors the ExtractionResultSchema contract from
// commands/ingest/index.ts so the downstream proposal flow,
// γ-6 edge resolution, and γ-7 compile-back gate consume static
// summaries indistinguishably from LLM extractions.
//
// Phase ε β-self-ingest finding (2026-05-16): the previous version
// of this builder emitted `provides: []` and `requires: []` for
// every shape it covered, leaving compile-back with no vocabulary
// to anchor regen. Barrels and declaration-only modules — whose
// semantic identity IS their export list — round-tripped to
// Jaccard 0. This version threads the classifier's parsed-AST
// vocabulary (StructuralClassification.vocabulary) into the
// extraction so the contract carries the actual symbol names.
// See docs/legend/calibrations/SELF_INGEST_BETA_2026-05-16_SYNTHESIS.md.
//
// Design principle (unchanged): a static summary is ALWAYS valid
// and intent-faithful for the shapes it covers. Never speculative —
// every name in provides/requires is AST-derived from the file
// itself; nothing is invented. Shapes whose intent depends on file-
// specific semantics still keep going through the LLM (the routing
// adapter lives in commands/ingest/static-classifier-policy.ts).

// Mirror of ExtractionResult from src/commands/ingest/index.ts.
// Duplicated locally to keep this module free of cyclic imports with
// the command layer. If you change one, change the other.
type AbstractionLevel = z.infer<typeof AbstractionLevelSchema>;
type Manifestation = z.infer<typeof ManifestationSchema>;
type NodeKind = z.infer<typeof NodeKindSchema>;

export interface StaticExtractionResult {
  label: string;
  level: AbstractionLevel;
  kind: NodeKind;
  manifestation?: Manifestation;
  language?: string;
  prompt: string;
  requires?: string[];
  provides?: string[];
  forbids?: string[];
  rules?: string[];
  // O1: per-provides syntactic signature (key → signature), parallel to
  // `provides`. Only the subset of provided symbols the TS parser could read
  // a signature for appears here; the rest are simply absent. Carried to the
  // proposal payload's `provideSignatures` side channel.
  provideSignatures?: Record<string, string>;
}

// The conservative v0 shape set this builder supports. Routing must
// never send any other shape here; passing one throws loudly.
export type StaticSummaryShape = "barrel" | "declaration_only";

function normalisedLanguage(classification: StructuralClassification): string {
  switch (classification.language) {
    case "typescript":
    case "tsx":
      return "typescript";
    case "javascript":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "markdown":
      return "markdown";
    default:
      return "unknown";
  }
}

/**
 * Build a deterministic ExtractionResult for a file whose shape the
 * classifier resolved to one of the static_summary-eligible kinds
 * (barrel, declaration_only).
 *
 * Contract: this function is total over the eligible shapes only.
 * Callers MUST gate via the ingest-policy adapter first
 * (decideStaticClassifierIngestAction). Calling with any other shape
 * throws — better a loud crash than a silent semantic drift.
 *
 * Determinism: identical (filePath, classification) inputs produce
 * identical output. All vocabulary comes from parsed AST data the
 * classifier already captured; nothing is invented.
 */
export function buildStaticSummary(input: {
  filePath: string;
  classification: StructuralClassification;
}): StaticExtractionResult {
  const { classification } = input;
  const base = path.basename(input.filePath);
  const language = normalisedLanguage(classification);

  switch (classification.structuralShape) {
    case "barrel":
      return buildBarrelSummary(base, language, classification.vocabulary);
    case "declaration_only":
      return buildDeclarationOnlySummary(
        base,
        language,
        classification.vocabulary,
      );
    default:
      throw new Error(
        `buildStaticSummary called with unsupported shape '${classification.structuralShape}'. ` +
          `Route via decideStaticClassifierIngestAction first; only 'barrel' and 'declaration_only' are eligible.`,
      );
  }
}

// ── Barrel ───────────────────────────────────────────────────────────────────

function buildBarrelSummary(
  base: string,
  language: string,
  vocabulary: ClassificationVocabulary | undefined,
): StaticExtractionResult {
  // Named re-exports (`export { Foo } from "./foo.js"`) — the file's
  // public surface. Each appears in vocabulary.exports with a
  // reExportedFrom field set.
  const namedReExports = (vocabulary?.exports ?? []).filter(
    (e) => e.reExportedFrom !== undefined,
  );
  // Wildcard re-exports (`export * from "./foo.js"`) — at the AST
  // level the parser surfaces them only as synthetic imports with
  // EMPTY `symbols` arrays. We dedupe against the modules already
  // covered by named re-exports so we don't double-count when both
  // forms target the same upstream module.
  const namedSources = new Set(
    namedReExports.map((e) => e.reExportedFrom).filter(Boolean) as string[],
  );
  const wildcardReExports = (vocabulary?.imports ?? []).filter(
    (i) => i.symbols.length === 0 && !namedSources.has(i.modulePath),
  );

  // provides — every NAMED symbol this barrel re-exports. Deterministic
  // source-file order preserved; no dedupe (a barrel that exports
  // the same name twice would be a bug we want to surface, not hide).
  const provides = namedReExports.map((e) => e.name);
  const provideSignatures = collectSignatures(namedReExports);

  // requires — every imported SYMBOL NAME this barrel pulls in from
  // upstream modules. Phase ε β′ (2026-05-16) revealed that emitting
  // module specifiers here causes the intent-validator's gluing check
  // to silently reject — upstream nodes' `provides` carry symbol
  // names (e.g. `createNodeProposalForExtraction`), not module paths
  // (e.g. `./io.js`). The vocabulary-domain mismatch turned
  // successful extractions into `unrecoverable` verdicts. Move 1b
  // (Phase ε 2026-05-18) restored symbol-domain consistency by
  // pulling from `i.symbols` instead of `i.modulePath`. Wildcard
  // re-exports (`export * from "..."`) have no symbols visible at
  // the AST layer and contribute zero entries; the prompt surfaces
  // them separately so compile-back still sees them. Source-file
  // order preserved; deduped (a module hosting multiple named
  // re-exports surfaces each symbol once).
  const requires = uniqueInOrder(
    (vocabulary?.imports ?? []).flatMap((i) => i.symbols),
  );

  // The prompt is the load-bearing field for compile-back. It MUST
  // mention specific upstream module specifiers and the named
  // re-exports — without them, generation has no vocabulary to
  // anchor on. β-self-ingest taught us that the previous "no
  // runtime declarations" prose alone gave the model nothing to
  // reproduce structurally.
  const promptLines: string[] = [];
  promptLines.push(
    `Barrel module: re-exports public symbols from sibling modules and exposes a stable module boundary. ` +
      `The file has no runtime declarations of its own (no local functions, classes, or const declarations).`,
  );
  if (wildcardReExports.length > 0) {
    const wildcardModules = wildcardReExports.map((i) => i.modulePath);
    promptLines.push(
      `Wildcard re-exports (\`export * from "<module>"\`): ${formatList(wildcardModules)}.`,
    );
  }
  if (namedReExports.length > 0) {
    const grouped = groupNamedReExportsByModule(namedReExports);
    const moduleLines = Array.from(grouped.entries()).map(
      ([module, names]) =>
        `  - from \`${module}\`: ${formatNameList(names)}`,
    );
    promptLines.push(
      `Named re-exports (\`export { … } from "<module>"\`):\n${moduleLines.join("\n")}`,
    );
  }
  if (wildcardReExports.length === 0 && namedReExports.length === 0) {
    // Edge case: classified as barrel but the parser surfaced no
    // re-export targets. Fall back to a more generic prompt; provides
    // and requires stay empty.
    promptLines.push(
      `The file's sole responsibility is to decouple importers from the internal layout of the directory.`,
    );
  }

  return {
    label: truncateLabel(`barrel: ${base}`),
    level: "artifact",
    kind: "artifact",
    manifestation: "code",
    language,
    prompt: promptLines.join("\n\n"),
    requires,
    provides,
    ...(provideSignatures ? { provideSignatures } : {}),
    forbids: ["runtime side effects in the barrel itself"],
    rules: [
      "REQUIRE: every export is a re-export from a sibling file; no local declarations",
    ],
  };
}

// Build a key → signature map from a list of exports, keeping the first
// signature seen per name and dropping names without a signature. Returns
// undefined when nothing carries a signature, so callers can omit the field.
function collectSignatures(
  exps: ReadonlyArray<{ name: string; signature?: string }>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const e of exps) {
    if (e.signature !== undefined && !(e.name in out)) out[e.name] = e.signature;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function groupNamedReExportsByModule(
  exports: ReadonlyArray<{ name: string; reExportedFrom?: string }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of exports) {
    if (e.reExportedFrom === undefined) continue;
    const arr = out.get(e.reExportedFrom);
    if (arr === undefined) out.set(e.reExportedFrom, [e.name]);
    else arr.push(e.name);
  }
  return out;
}

// ── Declaration-only ────────────────────────────────────────────────────────

function buildDeclarationOnlySummary(
  base: string,
  language: string,
  vocabulary: ClassificationVocabulary | undefined,
): StaticExtractionResult {
  // All exported type/interface/alias names. The classifier-level
  // rule `declaration_only` fires only when the file has type
  // declarations and NO runtime declarations, so every exported
  // name here is type-only.
  const exportedNames = (vocabulary?.exports ?? []).map((e) => e.name);
  const provideSignatures = collectSignatures(vocabulary?.exports ?? []);

  // requires — imported SYMBOL NAMES referenced by this file's
  // type declarations. Phase ε β′ (2026-05-16) Move 1b: same
  // vocabulary-domain fix as barrel — the gluing check needs
  // symbol names (which upstream `provides` arrays carry), not
  // module paths. Source order preserved; deduped.
  const requires = uniqueInOrder(
    (vocabulary?.imports ?? []).flatMap((i) => i.symbols),
  );

  // Imported symbols referenced inside the type declarations.
  // Surfaced in the prompt so compile-back has anchors for any
  // declared types that reference upstream tokens. Post-Move-1b
  // this computation coincides with `requires`; kept as a separate
  // local for prompt-render clarity (if `requires` semantics ever
  // diverge from "what the prompt cites", they will not need to
  // be re-aligned).
  const importedSymbols = uniqueInOrder(
    (vocabulary?.imports ?? []).flatMap((i) => i.symbols),
  );

  const promptLines: string[] = [];
  promptLines.push(
    `Type / interface declaration module. The file contains only type-level declarations ` +
      `(interfaces, type aliases) — no runtime functions, classes, or const declarations. ` +
      `Importers consume these declarations at compile time; the file emits no runtime code.`,
  );
  if (exportedNames.length > 0) {
    promptLines.push(
      `Declared types (exported): ${formatList(exportedNames)}.`,
    );
  }
  if (importedSymbols.length > 0) {
    promptLines.push(
      `Imported tokens referenced by these declarations: ${formatList(importedSymbols)}.`,
    );
  }

  return {
    label: truncateLabel(`types: ${base}`),
    level: "artifact",
    kind: "definition",
    manifestation: "code",
    language,
    prompt: promptLines.join("\n\n"),
    requires,
    provides: exportedNames,
    ...(provideSignatures ? { provideSignatures } : {}),
    forbids: ["runtime side effects", "value-level declarations"],
    rules: [
      "REQUIRE: file contains only type-level declarations (interface, type alias)",
    ],
  };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

// Dedupe while preserving first-seen order (the source-file order the
// classifier emits). Determinism here is load-bearing — two runs on
// the same file MUST yield byte-identical extractions.
function uniqueInOrder(items: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

// Format a small list inline; for very long lists, show the first N
// and a count tail so the prompt does not blow up on a 100-export
// barrel. Compile-back's prompt budget is bounded; an unbounded list
// could starve other context.
//
// Two flavours: formatList wraps each item in backticks (use for
// loose enumerations); formatNameList emits names bare (use inside
// the grouped barrel block where each line already says
// "from `<module>`: …" and double-backticking would be noisy).
function formatList(items: ReadonlyArray<string>): string {
  return formatListInternal(items, true);
}

function formatNameList(items: ReadonlyArray<string>): string {
  return formatListInternal(items, false);
}

function formatListInternal(
  items: ReadonlyArray<string>,
  quoteEach: boolean,
): string {
  const MAX_INLINE = 24;
  const render = quoteEach ? quote : (s: string) => s;
  if (items.length <= MAX_INLINE) return items.map(render).join(", ");
  const shown = items.slice(0, MAX_INLINE).map(render).join(", ");
  const remaining = items.length - MAX_INLINE;
  return `${shown}, and ${remaining} more`;
}

function quote(s: string): string {
  return `\`${s}\``;
}

// ExtractionResultSchema caps label at 256 chars. Filenames in the
// wild can exceed that (generated bundles, deeply mangled names).
// Truncate with an ellipsis marker so the proposal still validates.
function truncateLabel(raw: string): string {
  const MAX = 256;
  if (raw.length <= MAX) return raw;
  return raw.slice(0, MAX - 1) + "…";
}
