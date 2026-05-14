import { z } from "zod";

// Vocab-gap detector — Phase ε prework J.
//
// G (the ingest pipeline) populates `node.context.provides[].key` with
// conceptual tokens (e.g. "user_authentication", "hash_canonical").
// F (the compile-back) regenerates an artifact whose surface is a
// concrete export list (e.g. `authenticateUser`, `hashCanonical`).
// These vocabularies are semantically different: a provide-key is a
// concept, an export is an identifier. They rarely coincide
// character-for-character.
//
// The "gap" — the asymmetry between what G said it provides and what
// F produces — is the operational signal that the intent layer is
// either lossy (G could not articulate the export) or noisy (G
// fabricated a concept the artifact does not deliver). PR conversation
// in the previous step framed this as "G∘F asymmetric": measuring it
// per-node tells you whether the intent vocabulary needs an extension
// or whether the regen drifted.
//
// v0 is intentionally heuristic. The match rule is word-token overlap
// after camelCase + non-alphanumeric splitting; v1 will swap in
// embedding-based similarity once the prework data justifies the
// dependency. The report makes the heuristic explicit; readers can
// audit edges and filter false positives.

/**
 * Split a string into word tokens by camelCase boundary and any
 * non-alphanumeric separator. Lowercased, deduplicated.
 *
 * Examples:
 *   - "userAuthentication" → {"user","authentication"}
 *   - "USER_AUTH"           → {"user","auth"}
 *   - "hash-canonical-v2"   → {"hash","canonical","v2"}
 */
export function wordTokens(s: string): Set<string> {
  const split = s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase boundary
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  return new Set(split);
}

/**
 * Loose match: two strings match iff their word-token sets share at
 * least one element. This is intentionally permissive — the gap
 * detector is meant to surface NON-matches, so false-negative cost
 * (unmatched true correspondence) > false-positive cost (paired
 * unrelated words). A pair that overlaps on a common stopword like
 * "type" or "value" is technically a match here; v0 accepts that.
 */
export function looselyMatches(a: string, b: string): boolean {
  const ta = wordTokens(a);
  const tb = wordTokens(b);
  for (const w of ta) {
    if (tb.has(w)) return true;
  }
  return false;
}

export interface VocabGapReport {
  /**
   * Provides keys declared by G that no actual export loosely matches.
   * Concept names without an artifact-side counterpart — candidates
   * for either pruning the provides list or sharpening the regen
   * prompt to surface them.
   */
  missingExports: string[];
  /**
   * Actual exports produced by F that no provides key loosely matches.
   * Artifact surface that G did not declare — candidates for either
   * extending the provides vocabulary or refactoring the regen to drop
   * surface that wasn't asked for.
   */
  unexpectedExports: string[];
}

/**
 * Detect vocabulary gaps between a node's declared `provides` keys
 * and a regenerated artifact's actual top-level exports.
 *
 * Both inputs are treated as plain string lists — the caller is
 * responsible for extracting them from `node.context.provides[].key`
 * and the regen file (the verify-homeomorphism path already calls
 * `extractTopLevelDeclarations`, so its output plugs in directly).
 *
 * v0 match rule: loose word-token overlap (see `looselyMatches`).
 * Empty inputs collapse cleanly — empty `provides` yields zero
 * missingExports; empty `exports` yields zero unexpectedExports.
 */
export function detectVocabGaps(
  providedKeys: readonly string[],
  exportNames: readonly string[],
): VocabGapReport {
  const missingExports: string[] = [];
  for (const key of providedKeys) {
    let matched = false;
    for (const exp of exportNames) {
      if (looselyMatches(key, exp)) {
        matched = true;
        break;
      }
    }
    if (!matched) missingExports.push(key);
  }
  const unexpectedExports: string[] = [];
  for (const exp of exportNames) {
    let matched = false;
    for (const key of providedKeys) {
      if (looselyMatches(key, exp)) {
        matched = true;
        break;
      }
    }
    if (!matched) unexpectedExports.push(exp);
  }
  return { missingExports, unexpectedExports };
}

/**
 * True when the report contains any gap on either side. Equivalent
 * to `r.missingExports.length > 0 || r.unexpectedExports.length > 0`;
 * provided as a convenience for the frontier-tag emitter so call
 * sites read like English.
 */
export function hasVocabGap(report: VocabGapReport): boolean {
  return report.missingExports.length > 0 || report.unexpectedExports.length > 0;
}

// ── Aggregate across many nodes ─────────────────────────────────────────────

export interface VocabGapAggregate {
  /** Number of nodes inspected. */
  nodesInspected: number;
  /** Nodes where at least one gap was found (either side). */
  nodesWithAnyGap: number;
  /** Total missing-export gap count across nodes (sum, not unique). */
  totalMissingExports: number;
  /** Total unexpected-export gap count across nodes. */
  totalUnexpectedExports: number;
  /**
   * Provides keys that turned up in the missing-side gap at least
   * once, with a count of how many nodes each appeared in. Sorted
   * descending by count.
   */
  topMissingKeys: Array<{ key: string; nodes: number }>;
  /**
   * Exports that turned up unexpected (no matching provides) at
   * least once. Sorted descending by count.
   */
  topUnexpectedExports: Array<{ name: string; nodes: number }>;
}

/**
 * Roll per-node gap reports into an aggregate. The top-K lists are
 * not truncated by this function — callers slice if they want a
 * shorter cap.
 */
export function aggregateVocabGaps(
  reports: ReadonlyArray<{ nodeId: string; gap: VocabGapReport }>,
): VocabGapAggregate {
  const missingCounts = new Map<string, number>();
  const unexpectedCounts = new Map<string, number>();
  let nodesWithAnyGap = 0;
  let totalMissingExports = 0;
  let totalUnexpectedExports = 0;
  for (const r of reports) {
    const g = r.gap;
    if (hasVocabGap(g)) nodesWithAnyGap += 1;
    for (const k of g.missingExports) {
      missingCounts.set(k, (missingCounts.get(k) ?? 0) + 1);
      totalMissingExports += 1;
    }
    for (const e of g.unexpectedExports) {
      unexpectedCounts.set(e, (unexpectedCounts.get(e) ?? 0) + 1);
      totalUnexpectedExports += 1;
    }
  }
  const topMissingKeys = Array.from(missingCounts.entries())
    .map(([key, nodes]) => ({ key, nodes }))
    .sort((a, b) => b.nodes - a.nodes);
  const topUnexpectedExports = Array.from(unexpectedCounts.entries())
    .map(([name, nodes]) => ({ name, nodes }))
    .sort((a, b) => b.nodes - a.nodes);
  return {
    nodesInspected: reports.length,
    nodesWithAnyGap,
    totalMissingExports,
    totalUnexpectedExports,
    topMissingKeys,
    topUnexpectedExports,
  };
}

// ── Zod schema ──────────────────────────────────────────────────────────────

export const VocabGapReportSchema = z.object({
  missingExports: z.array(z.string()),
  unexpectedExports: z.array(z.string()),
});

export const VocabGapAggregateSchema = z.object({
  nodesInspected: z.number().int().nonnegative(),
  nodesWithAnyGap: z.number().int().nonnegative(),
  totalMissingExports: z.number().int().nonnegative(),
  totalUnexpectedExports: z.number().int().nonnegative(),
  topMissingKeys: z.array(
    z.object({ key: z.string(), nodes: z.number().int().nonnegative() }),
  ),
  topUnexpectedExports: z.array(
    z.object({ name: z.string(), nodes: z.number().int().nonnegative() }),
  ),
});
