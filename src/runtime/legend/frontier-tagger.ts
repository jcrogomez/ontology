import * as fs from "node:fs";

// Pure tagger for Project Legend Phase ε prework B.
//
// Maps a source file path (and optionally its bytes) to the multi-label
// set of frontier attributes declared in
// `docs/POSITIONING.md` §4 and pre-registered in
// `docs/legend/calibrations/SELF_INGEST_HYPOTHESIS_2026-05-13.md` §6.
//
// The tagger answers two questions about a single file:
//   1. Which intent-faithful or intent-resistant region does the
//      Phase ε hypothesis place it in?
//   2. Are there content-level signals (literal preservation marker,
//      explicit @human-authored tag, prompt-template body) that
//      further constrain its classification?
//
// What the tagger does NOT do:
//   - Compute verdict-derived attributes (`contract-missing`,
//     `structural-drift`, `behavior-drift`, `not-reviewed`). Those
//     come from the matrix aggregator (prework C) after a
//     verify-homeomorphism run produces per-axis verdicts.
//   - Call an LLM. The whole module is path + content regex, fully
//     deterministic, $0 to run on a 100 000-file repo.
//
// Tag overlaps are *intentional*. A node in `src/runtime/topos/` that
// is also `rule-compiler.ts` carries both the broader region's tags
// (`algebraic-lawful`, `pure-transform`) and its specific tags
// (`declarative-validator`, `schema-driven`). The set-union semantics
// preserve all signal.
//
// If no rule fires for a file, the tagger returns `["operational-glue"]`
// as the honest fallback: "this is internal code we did not specifically
// predict; treat it as glue until a more specific rule or human review
// classifies it differently." That keeps the acceptance contract
// "every file in the perimeter has at least one attribute" true without
// inventing classifications the hypothesis did not pre-register.

// ── Canonical attribute vocabulary ──────────────────────────────────────────

// All 16 frontier attributes from POSITIONING.md §4. The tagger emits
// only the subset that path/content evidence can support; verdict-derived
// attributes come from prework C.
export type FrontierAttribute =
  | "pure-transform"
  | "schema-driven"
  | "algebraic-lawful"
  | "declarative-validator"
  | "cli-parsing"
  | "io-bound"
  | "adapter-boundary"
  | "prompt-sensitive"
  | "literal-required"
  | "operational-glue"
  | "tui-rendering"
  | "human-authored"
  | "contract-missing"
  | "structural-drift"
  | "behavior-drift"
  | "not-reviewed"
  | "vocab-gap";

// The subset of attributes the path/content tagger may emit. The
// remaining four (`contract-missing`, `structural-drift`,
// `behavior-drift`, `not-reviewed`) and the prework-J `vocab-gap`
// are verdict-derived.
export type TaggerAttribute = Exclude<
  FrontierAttribute,
  | "contract-missing"
  | "structural-drift"
  | "behavior-drift"
  | "not-reviewed"
  | "vocab-gap"
>;

export const ALL_FRONTIER_ATTRIBUTES: readonly FrontierAttribute[] = [
  "pure-transform",
  "schema-driven",
  "algebraic-lawful",
  "declarative-validator",
  "cli-parsing",
  "io-bound",
  "adapter-boundary",
  "prompt-sensitive",
  "literal-required",
  "operational-glue",
  "tui-rendering",
  "human-authored",
  "contract-missing",
  "structural-drift",
  "behavior-drift",
  "not-reviewed",
  "vocab-gap",
] as const;

// ── Path rules ──────────────────────────────────────────────────────────────

interface PathRule {
  readonly match: RegExp;
  readonly attrs: readonly TaggerAttribute[];
  readonly why: string;
}

// Rule order is not load-bearing — the tagger unions every match. The
// regexes are anchored at `/src/<area>/` so callers may pass absolute,
// repo-relative, or sub-tree-relative paths; the substring is what
// matches.
const PATH_RULES: readonly PathRule[] = [
  // ── Faithful predictions (specific files first, then regions) ──
  {
    match: /\/src\/runtime\/context\/intent-validator\.ts$/,
    attrs: ["declarative-validator", "schema-driven"],
    why: "Explicit predicate evaluator on the topos Ω algebra; closest to schema-driven declarative validation in the codebase.",
  },
  {
    match: /\/src\/runtime\/topos\/rule-compiler\.ts$/,
    attrs: ["declarative-validator", "schema-driven"],
    why: "Compiles node `rules` into Ω predicates; declarative by construction.",
  },
  {
    match: /\/src\/schemas\//,
    attrs: ["schema-driven"],
    why: "Pure Zod schemas: the closest the codebase comes to a flat declarative surface.",
  },
  {
    match: /\/src\/runtime\/effects\//,
    attrs: ["algebraic-lawful", "pure-transform"],
    why: "Monad library with the three laws tested (T1 in MATHEMATICAL_CLAIMS §3.6).",
  },
  {
    match: /\/src\/runtime\/topos\//,
    attrs: ["algebraic-lawful", "pure-transform"],
    why: "Three-valued Ω algebra (truth tables, monotonicity, parity) — T1 in MATHEMATICAL_CLAIMS §3.9.",
  },
  {
    match: /\/src\/core\/integrity\//,
    attrs: ["pure-transform"],
    why: "Content-addressed hashing primitives over canonical JSON; the γ-2 calibration sample.",
  },
  {
    match: /\/src\/runtime\/graph\//,
    attrs: ["pure-transform"],
    why: "Compile-plan Kahn sort, poset enforcement, hard-dependency graph math — algorithmic, no IO.",
  },
  {
    match: /\/src\/runtime\/fibration\//,
    attrs: ["pure-transform"],
    why: "Branch-fiber computation and cartesian-lift description; structural graph operations.",
  },
  {
    match: /\/src\/runtime\/query\//,
    attrs: ["pure-transform"],
    why: "Representable functor / Yoneda search: pattern matching over node Hom-profiles.",
  },
  {
    match: /\/src\/runtime\/verify\//,
    attrs: ["pure-transform"],
    why: "Verify-homeomorphism distance helpers (LoC + structural Jaccard); pure math.",
  },
  {
    match: /\/src\/runtime\/legend\/verify-homeomorphism\.ts$/,
    attrs: ["pure-transform"],
    why: "δ-2 distance + verdict classifier; comparison library with no LLM, no IO beyond two file reads.",
  },
  {
    match: /\/src\/runtime\/static\//,
    attrs: ["pure-transform"],
    why: "TypeScript-compiler-API and regex-based static-edge inference; deterministic.",
  },
  {
    match: /\/src\/runtime\/prompt\//,
    attrs: ["schema-driven"],
    why: "Marker-anchored prompt parser (@requires:/@provides:/@expand:); structured AST extraction.",
  },
  {
    match: /\/src\/runtime\/legend\//,
    attrs: ["pure-transform"],
    why: "Algorithmic Legend helpers (distance metrics, frontier classification, structural comparison). Specific files inside legend/ may add more attributes via narrower rules.",
  },
  {
    match: /\/src\/core\/render\//,
    attrs: ["pure-transform"],
    why: "Pure text formatting (box, style, table) — no IO, no state.",
  },

  // ── Resistant predictions (specific files first, then regions) ──
  {
    match: /\/src\/runtime\/llm\/[^/]+\/adapter\.ts$/,
    attrs: ["adapter-boundary", "io-bound", "operational-glue"],
    why: "External LLM provider adapter: network call, retry semantics, cost telemetry, prompt caching.",
  },
  {
    match: /\/src\/runtime\/compile\/artifact-writer\.ts$/,
    attrs: ["io-bound", "operational-glue"],
    why: "Writes compiled artifacts to disk under .ontology; filesystem boundary.",
  },
  {
    match: /\/src\/core\/fs\/lock\.ts$/,
    attrs: ["operational-glue", "io-bound"],
    why: "Advisory lock under .ontology/.lock; locking + crash-recovery details that resist intent extraction.",
  },
  {
    match: /\/src\/core\/fs\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Filesystem primitives (atomic write, lock, JSON read/write).",
  },
  {
    match: /\/src\/core\/state\//,
    attrs: ["io-bound", "operational-glue"],
    why: "State-store: append-only event log, state.json persistence.",
  },
  {
    match: /\/src\/core\/proposals\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Proposal persistence under .ontology/proposals + event chain integration.",
  },
  {
    match: /\/src\/core\/project\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Project init + state loading; filesystem-driven bootstrap.",
  },
  {
    match: /\/src\/core\/runs\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Content-addressed run records under .ontology/runs; hashing + persistence.",
  },
  {
    match: /\/src\/core\/nodes\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Node CRUD against the .ontology/nodes store; touches state and integrity hashes.",
  },
  {
    match: /\/src\/core\/edges\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Edge CRUD against the .ontology/edges store; touches state and integrity hashes.",
  },
  {
    match: /\/src\/core\/drafts\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Draft persistence under .ontology/drafts.",
  },
  {
    match: /\/src\/core\/projects\//,
    attrs: ["io-bound", "operational-glue"],
    why: "Multi-project registry persistence.",
  },
  {
    match: /\/src\/(?:core|runtime)\/errors\.ts$/,
    attrs: ["operational-glue"],
    why: "Error-message helpers; small glue surface.",
  },
  {
    match: /\/src\/runtime\/llm\//,
    attrs: ["operational-glue"],
    why: "LLM dispatcher / registry / type wrappers; orchestration around providers.",
  },
  {
    match: /\/src\/runtime\/compile\//,
    attrs: ["operational-glue"],
    why: "Compile orchestration: plan runner, cache lookup, post-compile checks.",
  },
  {
    match: /\/src\/runtime\/context\//,
    attrs: ["operational-glue"],
    why: "Context assembler / presheaf glue; orchestrates schema-driven validators but is itself orchestration.",
  },
  {
    match: /\/src\/runtime\/legend\/translator\.ts$/,
    attrs: ["operational-glue", "prompt-sensitive"],
    why: "δ-1 Inspector translator: caches an LLM call per node; prompt template is load-bearing.",
  },
  {
    match: /\/src\/commands\/[^/]+\/.*\/index\.ts$/,
    attrs: ["cli-parsing", "operational-glue"],
    why: "CLI sub-command entry point: argument parsing + dispatch.",
  },
  {
    match: /\/src\/commands\/[^/]+\/index\.ts$/,
    attrs: ["cli-parsing", "operational-glue"],
    why: "CLI command entry point: argument parsing + dispatch.",
  },
  {
    match: /\/src\/commands\//,
    attrs: ["operational-glue"],
    why: "CLI command sub-module (helpers, types, cost-estimate, sub-handlers).",
  },
  {
    match: /\/src\/cli\.ts$/,
    attrs: ["cli-parsing", "operational-glue"],
    why: "Top-level CLI dispatcher built on commander.",
  },
  {
    match: /\/src\/walker\//,
    attrs: ["tui-rendering", "operational-glue"],
    why: "Terminal UI: rendering, key handling, focal-cell management. Out of perimeter for the 2026-05-13 run; tagger handles it for later sweeps.",
  },
];

// ── Content rules ──────────────────────────────────────────────────────────

interface ContentRule {
  readonly pattern: RegExp;
  readonly attr: TaggerAttribute;
  readonly why: string;
}

const CONTENT_RULES: readonly ContentRule[] = [
  {
    // Explicit author marker any contributor can drop into a file to
    // pin its membership in the human-authored complement. Cheap,
    // deterministic, opt-in.
    pattern: /\/\/\s*@human-authored\b/,
    attr: "human-authored",
    why: "Explicit `// @human-authored` marker in the file body.",
  },
  {
    // The β-2 literal escape hatch surfaces as `literal: true` either
    // in node metadata or as a runtime flag. A file that has its own
    // intent flagged literal is, by construction, literal-required.
    pattern: /\bliteral\s*:\s*true\b/,
    attr: "literal-required",
    why: "Contains a `literal: true` marker — node.literal escape hatch in use.",
  },
  {
    // Prompt-sensitive heuristic: any long prompt-template-shaped
    // literal in the file body. The 256-char threshold rules out
    // short string constants but catches real system prompts and
    // extraction templates without over-eager false positives. The
    // optional `: \w+` between identifier and assignment accepts
    // type-annotated declarations (`const SYSTEM_PROMPT: string = ...`)
    // without losing the object-literal case (`{ prompt: ... }`).
    pattern:
      /(?:prompt|template|SYSTEM_PROMPT|systemPrompt|userPrompt)(?:\s*:\s*\w+)?\s*[=:]\s*[`'"`][\s\S]{256,}/,
    attr: "prompt-sensitive",
    why: "Contains a 256+ char prompt/template string literal.",
  },
];

// ── Public API ──────────────────────────────────────────────────────────────

export interface FrontierTagResult {
  readonly filePath: string;
  readonly attrs: readonly TaggerAttribute[];
  readonly reasons: readonly string[];
}

// Returns the deduped, sorted set of frontier attributes for `filePath`.
// When `contents` is provided, content rules also run; when omitted,
// only path rules contribute. Callers that want explanations should
// call `tagFile` instead.
export function frontierTagsForFile(
  filePath: string,
  contents?: string,
): TaggerAttribute[] {
  return tagFile(filePath, contents).attrs.slice();
}

// Returns both the attribute set and the human-readable reasons (one
// per rule that fired). Used by the snapshot reporter and the verify
// matrix aggregator in prework C.
export function tagFile(
  filePath: string,
  contents?: string,
): FrontierTagResult {
  const norm = filePath.replace(/\\/g, "/");
  const attrs = new Set<TaggerAttribute>();
  const reasons: string[] = [];

  for (const rule of PATH_RULES) {
    if (rule.match.test(norm)) {
      for (const a of rule.attrs) attrs.add(a);
      reasons.push(`path: ${rule.match.source} → ${rule.attrs.join(", ")} (${rule.why})`);
    }
  }

  if (contents !== undefined) {
    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(contents)) {
        attrs.add(rule.attr);
        reasons.push(`content: ${rule.pattern.source} → ${rule.attr} (${rule.why})`);
      }
    }
  }

  if (attrs.size === 0) {
    // Honest fallback. The pre-registration commits that every file
    // in the perimeter has at least one attribute, and the most
    // honest default for an internal Ontology file we did not
    // specifically classify is "glue" — explicit signal that the
    // hypothesis did not pre-register a prediction for this region.
    attrs.add("operational-glue");
    reasons.push("fallback: no specific rule matched → operational-glue");
  }

  return {
    filePath,
    attrs: Array.from(attrs).sort(),
    reasons,
  };
}

// Reads `filePath` from disk and runs both path and content rules.
// Useful for the perimeter-snapshot reporter; ingest itself passes
// contents explicitly to avoid double IO.
export function tagFileFromDisk(filePath: string): FrontierTagResult {
  let contents: string | undefined;
  try {
    contents = fs.readFileSync(filePath, "utf-8");
  } catch {
    contents = undefined;
  }
  return tagFile(filePath, contents);
}
