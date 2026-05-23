import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";

// AST grounding section for code_sketch system prompts (Phase ε Move 3α).
//
// The δ' synthesis established that the descriptive→prescriptive
// extraction prompt rewrite moved Jaccard 7× off the floor but only
// −12% on the vocab gap (488/558 missing exports remained, 97/125
// nodes still landed Jaccard < 0.1). The synthesis line:
//
//   > "the compile-back model still drops 488 of them across the
//   >  perimeter. The model is acknowledging the contract structurally
//   >  and ignoring it semantically."
//
// δ' fixed the EXTRACTION side. Move 3α addresses the CODE_SKETCH
// side: re-state the MANDATORY exports — as the AST sees them — at
// compile-back time, in the system prompt, so the regenerator has a
// deterministic ground truth alongside the (possibly partial) LLM-
// extracted contract.
//
// The section is intentionally narrow:
//   - lists ONLY mandatoryExports, never imports or implementation
//     details (the extracted contract carries those);
//   - uses prescriptive MUST voice — the same shift that worked for
//     extraction in δ';
//   - does not echo the source file content (the prompt body already
//     carries the contractual intent).
//
// Backward compatibility: when the caller invokes the compile pipeline
// without AST grounding (the legacy path, every run prior to 3α), this
// module is not called, the contextHash is unchanged, and existing run
// caches remain valid. When grounding IS enabled, the hash includes
// the mandatoryExports list so the cache key cleanly separates ε-pre
// and ε-post runs.

/**
 * Build the MANDATORY EXPORTS section appended to the code_sketch
 * system prompt. Returns null when there are no mandatoryExports
 * (callers should omit the section entirely in that case so the
 * system prompt for grounding-enabled-but-no-exports files is
 * indistinguishable from the legacy no-grounding path).
 */
export function buildAstGroundingSystemSection(
  mandatoryExports: readonly string[],
): string | null {
  if (mandatoryExports.length === 0) return null;
  const lines: string[] = [];
  lines.push("MANDATORY EXPORTS (AST-derived, deterministic ground truth):");
  lines.push("");
  lines.push(
    "The following identifiers were extracted directly from the source AST. " +
      "You MUST emit each of them as an exported binding in the regenerated " +
      "file, with EXACTLY this spelling. You MUST NOT introduce additional " +
      "exports not in this list. You MUST NOT paraphrase, pluralise, or " +
      "abbreviate these names.",
  );
  lines.push("");
  for (const name of mandatoryExports) {
    lines.push(`  - ${name}`);
  }
  lines.push("");
  lines.push(
    "If the extracted contract above conflicts with this list, the AST " +
      "list wins — the source file's actual export surface is the truth.",
  );
  return lines.join("\n");
}

/**
 * Join multiple optional system-prompt sections with blank-line
 * separators, returning null when every section is absent. Used by
 * compile-node to compose upstream-context + AST-grounding into a
 * single `system` payload for the dispatcher, while preserving the
 * "null when nothing to say" contract that keeps cache keys
 * indistinguishable from pre-grounding runs.
 */
export function joinSystemSections(
  sections: ReadonlyArray<string | null>,
): string | null {
  const populated = sections.filter((s): s is string => s !== null && s.length > 0);
  if (populated.length === 0) return null;
  return populated.join("\n\n");
}

/**
 * Hash the AST grounding inputs into the `grounding:hash:` namespace.
 * Returns null when there are no mandatoryExports — mirroring the
 * `hashUpstreamContext` semantics so the caller can fold a null
 * grounding hash into the canonical contextHash composition without
 * branching.
 *
 * The hash takes the list as-given (order matters). The AST scanner
 * emits exports in source-file order, so the same file produces the
 * same hash on every scan. Files whose declarations get re-ordered
 * produce different hashes — desirable, because re-ordering is a real
 * source change.
 */
export function hashAstGrounding(
  mandatoryExports: readonly string[],
): string | null {
  if (mandatoryExports.length === 0) return null;
  const canonical = { mandatoryExports: [...mandatoryExports] };
  const digest = createHash("sha256").update(stringify(canonical)).digest("hex");
  return `grounding:hash:${digest}`;
}

/**
 * Hash a per-rep cache-bypass token so distinct reps produce distinct
 * run-cache identities (design item §4.2). Returns null when the token
 * is undefined / empty — preserving the byte-identical single-draw
 * runId. The distinct `rep:hash:` prefix prevents collision with the
 * `grounding:hash:` namespace.
 *
 * Mirrors `hashAstGrounding`'s "fold an explicit knob into contextHash
 * via composeContextHash" pattern: a non-null return changes the runId,
 * forcing checkCacheE to miss and dispatch the next rep fresh. The
 * underlying provider's non-zero sampling temperature is what surfaces
 * draw-to-draw variance once the cache no longer collapses them.
 */
export function hashRepCacheBypass(
  token: string | undefined,
): string | null {
  if (token === undefined || token.length === 0) return null;
  const digest = createHash("sha256")
    .update(stringify({ repToken: token }))
    .digest("hex");
  return `rep:hash:${digest}`;
}

/**
 * Compose the run-cache contextHash from the upstream-context hash and
 * the AST-grounding hash, mirroring the `null when nothing to say`
 * contract of both inputs. The output always carries the `ctx:hash:`
 * prefix expected by `PersistedRunInputSchema.contextHash` — when
 * grounding is the only present input, its bytes fold into the
 * `ctx:hash:` namespace so the schema's prefix invariant holds without
 * introducing a separate schema field.
 *
 * Backward-compatibility contract: when groundingHash is null (the
 * legacy path, every run prior to Move 3α), this function returns
 * upstreamHash unchanged. Existing run cache keys are preserved
 * exactly.
 */
export function composeContextHash(
  upstreamHash: string | null,
  groundingHash: string | null,
): string | null {
  if (upstreamHash === null && groundingHash === null) return null;
  if (groundingHash === null) return upstreamHash;
  if (upstreamHash === null) {
    // Grounding-only: re-emit under the ctx:hash: prefix so the
    // PersistedRunInput schema's startsWith("ctx:hash:") invariant
    // holds. The grounding bytes are included verbatim so the cache
    // key is faithful to the grounding contribution.
    const digest = createHash("sha256")
      .update(stringify({ grounding: groundingHash }))
      .digest("hex");
    return `ctx:hash:${digest}`;
  }
  // Both present — combine deterministically.
  const digest = createHash("sha256")
    .update(stringify({ upstream: upstreamHash, grounding: groundingHash }))
    .digest("hex");
  return `ctx:hash:${digest}`;
}
