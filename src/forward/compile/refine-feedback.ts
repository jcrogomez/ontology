import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";

// Verify-refine feedback for code_sketch system prompts — the
// "verify-refine loop" lever (REGEN_INTENT_CONSUMPTION_2026-06-17 §"WHAT
// TO BUILD" #2).
//
// The ζ workflow runtime (src/runtime/workflow/executor.ts) threads a
// verifier's `${CRITIQUE}` back into the next generator draw. This module
// is the same pattern for the regenerate path, with one strengthening: the
// "verifier" is not an LLM but the project's DETERMINISTIC gates — the
// behaviour checker (a trustworthy oracle, behavior-checker.ts) and the
// structural declaration set (verify-homeomorphism.ts). So the critique fed
// back is FACT about the previous DRAFT's failure, never a hand-authored
// hint about the source.
//
// Leak discipline (the mission's "ZERO implementation hardcoded" rule):
// the section names only (a) which behavioural ACCEPTANCE CRITERIA failed —
// by the criterion's own name, which the oracle section already lists — and
// (b) the export-surface drift between the draft and the contract (extra /
// missing declared names). It deliberately does NOT echo the source's
// implementation, its literal error strings, or the fixture's
// setup/invoke/assert code. The model is pointed back at the oracle it
// already has, plus told which exports it over/under-produced.
//
// Backward compatibility: an empty feedback (no failing criteria, no drift)
// yields a null section and null hash, so a refine round that found nothing
// to fix is byte-identical to the no-refine path. The hash folds into the
// run-cache contextHash so each distinct round of feedback is a fresh
// dispatch rather than a cache hit on a prior round.

/**
 * Structured critique of a prior draft, assembled from the deterministic
 * gates. Code-free by construction: only criterion names and declared-name
 * sets cross into the prompt.
 */
export interface FailedCriterion {
  /** The behavioural acceptance criterion's name, verbatim from the oracle
   *  (so it points back at the spec the generator already has). */
  name: string;
  /** The gate's observed DIAGNOSTIC for this criterion on the prior draft —
   *  the DRAFT's own runtime error or a divergence note (e.g. "the returned
   *  value has no `release`", "threw: Cannot read properties of undefined
   *  (reading 'pid')"). This is feedback about the candidate's own behaviour,
   *  like a compiler/test error a developer would read — NOT the source's
   *  implementation, which never crosses into the prompt. Optional: omitted
   *  when the gate produced no draft-side diagnostic. */
  diagnostic?: string;
}

export interface RefineFeedback {
  /** 1-based refinement round this feedback will drive (round 2 is the
   *  first that carries feedback; round 1 is the initial blind+oracle draw). */
  round: number;
  /** Behavioural acceptance criteria the prior draft failed, each with the
   *  gate's draft-side diagnostic when available. */
  failedCriteria: FailedCriterion[];
  /** Identifiers the draft exported that the contract does not include
   *  (the observed over-export-internal-helpers failure mode). */
  extraExports: string[];
  /** Required exports the draft dropped (contract − draft). */
  missingExports: string[];
  /** Static-lint findings on the prior draft (undefined-reference calls,
   *  async-where-signature-is-sync) — see draft-lint.ts. Leak-free: each
   *  describes the candidate's own defect. Optional / may be empty. */
  lintIssues?: { symbol: string; message: string }[];
}

function dedupeSorted(xs: readonly string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter((x) => x.length > 0))].sort();
}

// Dedupe criteria by name (keeping the first diagnostic seen), drop blanks,
// and sort by name so the section + hash are deterministic.
function normaliseCriteria(xs: readonly FailedCriterion[]): FailedCriterion[] {
  const byName = new Map<string, FailedCriterion>();
  for (const c of xs) {
    const name = (c.name ?? "").trim();
    if (name.length === 0) continue;
    if (!byName.has(name)) {
      const diagnostic = c.diagnostic?.trim();
      byName.set(name, diagnostic ? { name, diagnostic } : { name });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Dedupe lint issues by symbol+message, sorted, dropping blanks.
function normaliseLint(
  xs: readonly { symbol: string; message: string }[] | undefined,
): { symbol: string; message: string }[] {
  const seen = new Map<string, { symbol: string; message: string }>();
  for (const i of xs ?? []) {
    const symbol = (i.symbol ?? "").trim();
    const message = (i.message ?? "").trim();
    if (message.length === 0) continue;
    const key = `${symbol}␟${message}`;
    if (!seen.has(key)) seen.set(key, { symbol, message });
  }
  return [...seen.values()].sort((a, b) =>
    a.symbol === b.symbol ? a.message.localeCompare(b.message) : a.symbol.localeCompare(b.symbol),
  );
}

function normalise(fb: RefineFeedback): {
  round: number;
  failedCriteria: FailedCriterion[];
  extraExports: string[];
  missingExports: string[];
  lintIssues: { symbol: string; message: string }[];
} {
  return {
    round: fb.round,
    failedCriteria: normaliseCriteria(fb.failedCriteria),
    extraExports: dedupeSorted(fb.extraExports),
    missingExports: dedupeSorted(fb.missingExports),
    lintIssues: normaliseLint(fb.lintIssues),
  };
}

function hasContent(n: ReturnType<typeof normalise>): boolean {
  return (
    n.failedCriteria.length > 0 ||
    n.extraExports.length > 0 ||
    n.missingExports.length > 0 ||
    n.lintIssues.length > 0
  );
}

/**
 * Build the refinement-feedback section appended to the code_sketch system
 * prompt for a refine round. Returns null when there is nothing to fix
 * (no failing criteria, no export drift) — byte-identical to the no-refine
 * path.
 */
export function buildRefineFeedbackSection(fb: RefineFeedback): string | null {
  const n = normalise(fb);
  if (!hasContent(n)) return null;
  const lines: string[] = [];
  lines.push(
    `PREVIOUS ATTEMPT FAILED THE GATES — REVISE (refinement round ${n.round}):`,
  );
  lines.push("");
  lines.push(
    "Your previous regeneration was checked against the behavioural " +
      "acceptance criteria above and the contract's export surface. Keep " +
      "what was correct and FIX the following specific failures. Produce a " +
      "complete, corrected module — do not omit any required behaviour.",
  );
  if (n.failedCriteria.length > 0) {
    lines.push("");
    lines.push("Behavioural criteria your previous output did NOT satisfy:");
    for (const c of n.failedCriteria) {
      lines.push(`  - ${c.name}`);
      if (c.diagnostic) lines.push(`      observed on your output: ${c.diagnostic}`);
    }
    lines.push(
      "Re-read these criteria in the ACCEPTANCE CRITERIA section above and " +
        "implement the behaviour each one requires. Where a diagnostic is " +
        "shown, it is the error the checker observed running YOUR previous " +
        "output — fix that exact problem (e.g. return the declared object " +
        "shape, throw the declared error).",
    );
  }
  if (n.extraExports.length > 0) {
    lines.push("");
    lines.push(
      "You exported identifiers that are NOT part of the contract — keep " +
        "these as INTERNAL (unexported) helpers instead:",
    );
    for (const e of n.extraExports) lines.push(`  - ${e}`);
  }
  if (n.missingExports.length > 0) {
    lines.push("");
    lines.push("You omitted these REQUIRED exports — add them back:");
    for (const e of n.missingExports) lines.push(`  - ${e}`);
  }
  if (n.lintIssues.length > 0) {
    lines.push("");
    lines.push(
      "Static checks FAILED on your previous output — these are defects in " +
        "the code you produced; fix each one exactly:",
    );
    for (const i of n.lintIssues) lines.push(`  - ${i.message}`);
  }
  return lines.join("\n");
}

/**
 * Hash the refinement feedback into the `refine:hash:` namespace. Returns
 * null when there is nothing to fix — mirroring the other grounding hashes
 * so the caller folds it into contextHash without branching. The round
 * number is part of the digest so two rounds that happen to carry the same
 * failures still dispatch distinctly (a defensive guard against a refine
 * loop silently cache-hitting itself).
 */
export function hashRefineFeedback(fb: RefineFeedback): string | null {
  const n = normalise(fb);
  if (!hasContent(n)) return null;
  const digest = createHash("sha256")
    .update(stringify({ refine: n }))
    .digest("hex");
  return `refine:hash:${digest}`;
}
