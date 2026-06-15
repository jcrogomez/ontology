import { createHash } from "node:crypto";
import type { OntologyNode } from "../kernel/schemas/ontology.js";

// Project Legend δ-1 — the Inspector / Lupa primitive.
//
// Each node carries a structured intent (prompt + context contract +
// rules) that compiles forward into code, and that δ-2 verifies via
// round-trip. The Inspector is the inverse-direction READER for a
// human: given the same structured intent, produce a 3-5 sentence
// developer-facing summary that a reviewer can read in 30 seconds to
// answer "what does this node do, and what invariants must any
// implementation preserve?".
//
// Cached because the summary is stable for a given (prompt, rules,
// contract) tuple. The first inspect runs the LLM; subsequent
// inspects return the cached text from `node.translator.text` —
// hence "one LLM call per node lifetime". A `--regenerate` flag on
// the CLI forces a fresh dispatch, useful when the user has just
// updated the node's prompt / rules.
//
// This module owns the *pure* parts: the inspection-prompt builder,
// the sourceHash computation, and the cache-validity check. The
// LLM dispatch + node mutation live in the CLI command so this
// library stays unit-testable without IO.

// ── Inspector prompt ────────────────────────────────────────────────────────

/**
 * The system prompt for the Inspector. Tagged with prompt caching by
 * the Anthropic adapter (same `cache_control: ephemeral` mechanism
 * as the ingest extractor), so successive `onto node inspect` calls
 * within a session reuse the cached prefix once the prompt grows
 * past the 4096-token cache minimum.
 */
export const INSPECTOR_SYSTEM_PROMPT = `You are the Inspector component of Ontology — the human-facing reader for a structured intent node.

You receive one node from the typed intent graph: its label, kind, the assembled prompt that drives its forward compile, its declared contract (requires / provides / forbids tokens), and any prose REQUIRE/FORBID rules. Your job is to produce a 3-5 sentence developer-facing summary that lets a reviewer answer two questions in 30 seconds:

  1. What does this node DO? (operational behaviour, not project framing)
  2. What invariants MUST any implementation preserve? (the non-negotiables)

Constraints on your output:

- Plain prose. No bullet points, no headers, no markdown decoration.
- 3-5 sentences. Tight prose, no padding. A reviewer reads this between meetings.
- Reference specific contract tokens by name when they're load-bearing (e.g. "preserves the requires/foo invariant", "must expose 'bar' and 'baz'").
- Surface the load-bearing forbids — if a rule says FORBID: console.log, mention that the implementation must not log to stdout.
- Do NOT restate the node's id, label, or kind verbatim; the reader already has those.
- Do NOT speculate about anything not in the provided contract. Stick to what the node declares.

Your output is plain text — no JSON, no fences, no preamble.`;

// ── sourceHash — used for cache invalidation ────────────────────────────────

/**
 * Computes the hash of the inputs that produced a translator. When
 * the node's prompt / rules / contract / literal change, this hash
 * changes, which lets a future invalidation pass detect a stale
 * cache.
 *
 * Includes: prompt.raw, rules[], the focal's provides/requires/forbids
 * (the parts the inspector reads) AND node.literal (β-2 escape hatch:
 * a literal-pinned artifact IS the load-bearing content the inspector
 * describes; mutating it must invalidate the cached prose). Does NOT
 * include node.label or coordinates — those are framing metadata,
 * not semantic content.
 *
 * Stable / canonical: arrays are sorted, JSON is fast-stringified
 * via stable JSON to make the hash deterministic across runs.
 */
export function computeTranslatorSourceHash(node: OntologyNode): string {
  const provides = (node.context?.provides ?? []).map((p) => p.key).sort();
  const requires = (node.context?.requires ?? []).map((r) => r.source).sort();
  const forbids = (node.context?.forbids ?? []).map((f) => f.source).sort();
  const rules = [...(node.rules ?? [])].sort();
  const payload = {
    prompt: node.prompt?.raw ?? "",
    rules,
    provides,
    requires,
    forbids,
    literal: node.literal ?? null,
  };
  const text = JSON.stringify(payload);
  return createHash("sha256").update(text).digest("hex");
}

// ── Cache validity check ────────────────────────────────────────────────────

export type CacheStatus =
  | { hit: true; text: string; model: string; provider: string; generatedAt: string }
  | { hit: false; reason: "no_translator" | "source_changed"; staleHash?: string };

/**
 * Returns whether the node's cached translator is fresh for the
 * current state. The cache is fresh when the recomputed sourceHash
 * matches the stored one. Otherwise the caller dispatches a fresh
 * inspect and overwrites.
 */
export function checkTranslatorCache(node: OntologyNode): CacheStatus {
  if (!node.translator) {
    return { hit: false, reason: "no_translator" };
  }
  const currentHash = computeTranslatorSourceHash(node);
  if (node.translator.sourceHash !== currentHash) {
    return {
      hit: false,
      reason: "source_changed",
      staleHash: node.translator.sourceHash,
    };
  }
  return {
    hit: true,
    text: node.translator.text,
    model: node.translator.model,
    provider: node.translator.provider,
    generatedAt: node.translator.generatedAt,
  };
}

// ── Inspector user prompt ──────────────────────────────────────────────────

/**
 * Builds the user-side prompt for one inspect call. Layered for
 * legibility — the inspector reads top-to-bottom and the layout
 * matters for the LLM's structural perception.
 */
export function buildInspectorPrompt(node: OntologyNode): string {
  const lines: string[] = [];
  lines.push(`Node id:    ${node.id}`);
  lines.push(`Node label: ${node.label ?? "(unlabeled)"}`);
  lines.push(`Node kind:  ${node.kind ?? "(unspecified)"}`);
  lines.push(``);
  lines.push(`Assembled prompt:`);
  lines.push(node.prompt?.raw ?? "(empty prompt)");
  lines.push(``);

  const provides = (node.context?.provides ?? []).map((p) => p.key);
  const requires = (node.context?.requires ?? []).map((r) => r.source);
  const forbids = (node.context?.forbids ?? []).map((f) => f.source);
  const rules = node.rules ?? [];

  if (provides.length > 0 || requires.length > 0 || forbids.length > 0) {
    lines.push(`Contract:`);
    if (provides.length > 0) lines.push(`  provides: ${provides.join(", ")}`);
    if (requires.length > 0) lines.push(`  requires: ${requires.join(", ")}`);
    if (forbids.length > 0) lines.push(`  forbids:  ${forbids.join(", ")}`);
    lines.push(``);
  }
  if (rules.length > 0) {
    lines.push(`Rules:`);
    for (const r of rules) lines.push(`  - ${r}`);
    lines.push(``);
  }
  lines.push(
    `Produce the 3-5 sentence Inspector summary now. Plain prose only.`,
  );
  return lines.join("\n");
}
