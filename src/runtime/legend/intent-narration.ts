// Intent narration — the WHY-as-prompt extractor (Project Legend, the lift G
// that actually targets *intent*, not *contract*).
//
// The existing `EXTRACTION_SYSTEM_PROMPT` (src/commands/ingest/index.ts) is a
// CONTRACT extractor: it specifies what a future implementation MUST recreate
// (exact symbols, signatures, re-export obligations), optimised for a
// round-trip measured by structural Jaccard. That is the WHAT, and it is
// genuinely useful for the structural cartography axis — but it is not intent.
// Restating `add(a,b)` as "MUST return the sum of a and b" is the code in
// imperative mood, not the reason the code exists.
//
// This module asks the *other* question — the one a senior engineer answers
// when you point at a file and say "why does this exist?". It narrates, as a
// generative prompt, the PROBLEM the code answers, the DECISION taken (and the
// alternative rejected), the CONSTRAINTS that govern it, and the LARGER GOAL it
// serves. Three design commitments distinguish it from the contract extractor:
//
//   1. Compression, not preservation. Intent is lossy by design: it discards
//      implementation detail that is merely one valid realisation among many.
//      The contract extractor's MANDATORY-EXPORTS anti-compression stance is
//      exactly wrong for intent.
//   2. Behaviour oracle, not symbol parity. Every narration carries
//      `acceptanceCriteria` — observable behaviours a faithful regeneration
//      must satisfy. This is the "test oracle" pattern (Anthropic, "Long-
//      running Claude"): the agent/judge knows it is faithful iff a
//      regeneration from `intentPrompt` satisfies these, NOT iff it re-emits
//      the same identifiers. The north star is F(G(code)) ⊨ acceptanceCriteria,
//      not F(G(code)) ≈ code.
//   3. Neighbourhoods, not files-in-isolation. Higher-level intent emerges only
//      from reading related files together (e.g. lock.ts + json.ts ⇒ "make the
//      kernel a durable, crash- and concurrency-safe audit substrate" — an
//      intent neither file states alone). So extraction operates over a
//      neighbourhood and yields *hierarchical* intent: per-file plus the
//      composed subsystem intent.

// ── Output shape ────────────────────────────────────────────────────────────

/**
 * Allowed abstraction levels for a narrated intent. A single concrete file is
 * usually `unit` / `artifact`; the composed intent of a multi-file
 * neighbourhood rises to `architecture` / `domain` / `workflow`. Mirrors the
 * kernel's abstraction poset (src/schemas/ontology.ts AbstractionLevelSchema).
 */
export type IntentLevel =
  | "canon"
  | "project"
  | "target"
  | "stack"
  | "architecture"
  | "domain"
  | "workflow"
  | "interface"
  | "unit"
  | "token"
  | "artifact";

export interface IntentNarration {
  /** Short noun phrase naming the intent (e.g. "Cooperative multi-process lock"). */
  label: string;
  /** Abstraction level — higher for composed/subsystem intent. */
  level: IntentLevel;
  /** (1) The need or question this code answers. */
  problem: string;
  /** (2) The design decision taken, the alternative rejected, and why. */
  decision: string;
  /** (3) Invariants / constraints / non-goals that govern it. */
  constraints: string[];
  /** (4) The larger goal this is part of (often the neighbourhood's intent). */
  parentGoal: string;
  /**
   * The narration proper, written as a generative prompt: the instruction you
   * would give a competent engineer to rebuild *something that serves the same
   * purpose* — not the same symbols. Implementation detail that is one valid
   * choice among many is deliberately omitted.
   */
  intentPrompt: string;
  /**
   * The behaviour oracle. Observable behaviours a faithful regeneration MUST
   * satisfy. A regeneration is faithful iff it satisfies these — judged by
   * behaviour, never by symbol parity. This is what makes the intent checkable
   * without rewarding the contract-tautology.
   */
  acceptanceCriteria: string[];
  /** Source file paths this narration was lifted from (≥ 1; > 1 ⇒ composed intent). */
  sourceFiles: string[];
}

// ── System prompt ────────────────────────────────────────────────────────────

export const INTENT_NARRATION_PROMPT = `
You are the Ontology intent narrator.

You are given one source file, or several RELATED source files that form a
neighbourhood. Your job is NOT to specify what the code does, symbol by symbol —
another extractor does that. Your job is to recover and narrate the INTENT: the
reason this code exists, narrated as a generative prompt.

Think like a senior engineer who is asked, pointing at the code: "why does this
exist, and why is it built this way?" Answer the four questions:

  (1) PROBLEM  — what need or question does this code answer? What goes wrong
      without it?
  (2) DECISION — what design decision was taken, what alternative was rejected,
      and why? (Infer the rejected alternative from the shape of the code:
      a hand-rolled lock instead of OS flock, an append-only log instead of a
      mutable store, a three-valued logic instead of a boolean, etc.)
  (3) CONSTRAINTS — what invariants, non-goals, or hard limits govern it?
  (4) PARENT GOAL — what larger objective is this a part of? For a multi-file
      neighbourhood, this is usually the intent of the subsystem they compose.

Then write the load-bearing field, "intentPrompt": the instruction you would
give a competent engineer (or model) to build SOMETHING THAT SERVES THE SAME
PURPOSE. Three rules for it:

  - COMPRESS. Intent is lossy on purpose. Omit any implementation detail that is
    merely one valid way to achieve the purpose. If a different data structure,
    library, or symbol name would serve the same purpose equally well, do not
    name the one in the code. (This is the opposite of a contract spec — do not
    enumerate exports.)
  - NARRATE THE WHY. State the problem and the motivation, not the surface.
    "Build a cooperative mutual-exclusion for the project directory, because two
    processes can otherwise interleave conflicting writes" — not "export
    acquireLock and withLock".
  - BEHAVIOUR, NOT SYMBOLS. A reader of intentPrompt should be able to build a
    correct-but-differently-shaped implementation.

Then write "acceptanceCriteria": the BEHAVIOUR ORACLE. List the observable
behaviours a faithful regeneration must satisfy — the test by which we judge
whether a rebuild honoured the intent. These must be checkable by behaviour
(what happens when you run it / call it / crash it mid-write), NOT by which
identifiers were emitted. Example: "If the holder process dies, a later process
on the same host can acquire the lock" — not "exports a function named
acquireLock".

NEIGHBOURHOODS. If given several files, produce the per-neighbourhood COMPOSED
intent (the subsystem's reason for being) at the appropriate higher level, and
let "parentGoal" of each constituent point at it. Higher-level intent is the
point of reading files together — surface it, do not just concatenate per-file
intents.

OUTPUT. Return ONLY valid JSON. No markdown fence, no preamble.

Required fields:
- label: STRING — short noun phrase.
- level: STRING — one of: canon, project, target, stack, architecture, domain,
  workflow, interface, unit, token, artifact. A single concrete file is usually
  "unit" or "artifact"; a composed subsystem intent is "architecture", "domain",
  or "workflow".
- problem: STRING.
- decision: STRING.
- constraints: ARRAY OF STRINGS.
- parentGoal: STRING.
- intentPrompt: STRING (use \\n for line breaks; never an array or object).
- acceptanceCriteria: ARRAY OF STRINGS.
- sourceFiles: ARRAY OF STRINGS — the file paths you were given.

FORBIDDEN (these are contract-extractor outputs, not intent):
- Enumerating exported symbol names as the substance of intentPrompt.
- "MUST export ...", "provides utilities for ...", restating signatures.
- Any phrasing that would make intentPrompt regenerate the SAME code rather than
  code that serves the same PURPOSE.

Self-check before emitting:
1. Could a competent engineer build a differently-shaped but purpose-equivalent
   implementation from intentPrompt alone?
2. Did you omit implementation detail that is just one valid choice?
3. Are acceptanceCriteria checkable by behaviour, not by symbol names?
4. For multiple files, did you surface the COMPOSED intent, not just per-file?

Return JSON only.
`;

// ── Neighbourhood prompt builder ─────────────────────────────────────────────

export interface NeighborhoodFile {
  /** Path used for provenance/framing (cwd-relative preferred). */
  path: string;
  /** Full UTF-8 file content. */
  content: string;
}

const EXT_LANGUAGE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.(ts|tsx|mts|cts)$/, "typescript"],
  [/\.(js|jsx|mjs|cjs)$/, "javascript"],
  [/\.py$/, "python"],
  [/\.rs$/, "rust"],
  [/\.go$/, "go"],
  [/\.(md|mdx)$/, "markdown"],
];

function languageHint(path: string): string {
  for (const [re, lang] of EXT_LANGUAGE) if (re.test(path)) return lang;
  return "unknown";
}

function frameFile(file: NeighborhoodFile): string {
  return [
    `File: ${file.path}`,
    `Language hint (from extension): ${languageHint(file.path)}`,
    `--- BEGIN FILE ---`,
    file.content,
    `--- END FILE ---`,
  ].join("\n");
}

/**
 * Build the user turn for intent narration over one or several related files.
 *
 * One file → narrate that file's intent. Several files → narrate each file's
 * intent AND the composed intent of the neighbourhood they form (the higher-
 * level reason the subsystem exists). The system prompt is the cached prefix;
 * the file content sits here in the user turn.
 *
 * Throws on empty input — there is no intent to narrate for zero files.
 */
export function buildIntentNeighborhoodPrompt(files: NeighborhoodFile[]): string {
  if (files.length === 0) {
    throw new Error("buildIntentNeighborhoodPrompt: at least one file is required");
  }

  if (files.length === 1) {
    return [
      `Narrate the intent of this file — the reason it exists, as a generative prompt.`,
      ``,
      frameFile(files[0]),
      ``,
      `Output the IntentNarration JSON only.`,
    ].join("\n");
  }

  return [
    `These ${files.length} files form a related neighbourhood. Narrate the`,
    `COMPOSED intent of the subsystem they form together — the higher-level`,
    `reason the subsystem exists, which no single file states alone — as a`,
    `generative prompt. Set "level" to the subsystem's abstraction (architecture`,
    `/ domain / workflow), list every path in "sourceFiles", and let`,
    `"parentGoal" name the broadest goal the subsystem serves.`,
    ``,
    files.map(frameFile).join("\n\n"),
    ``,
    `Output a single IntentNarration JSON for the composed subsystem only.`,
  ].join("\n");
}
