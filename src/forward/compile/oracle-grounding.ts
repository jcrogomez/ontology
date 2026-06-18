import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";

// Oracle grounding for code_sketch system prompts — the
// "oracle-into-generation" lever (REGEN_INTENT_CONSUMPTION_2026-06-17,
// §"WHAT TO BUILD" #1).
//
// The behaviour fixture at tests/behavior-fixtures/<nodeId>.fixture.ts is
// the trustworthy oracle the F∘G round-trip is JUDGED against. Until now
// it was used ONLY as a post-hoc gate: regenerate.ts loads the fixture,
// compiles the node BLIND, and runs the behaviour check AFTER. The
// acceptance criteria are available at generation time and were not given
// to the generator — a textbook case of the regenerator under-consuming
// the intent it already has.
//
// This module closes that gap. It turns the fixture's per-case contract
// (the `name` + the optional contract-level `description` on each
// BehaviorCase) into a deterministic system-prompt section that states the
// criteria as MUST-PASS constraints. The generator gets to SEE the spec it
// will be executed against — the dual, for the BEHAVIOUR axis, of what
// ast-grounding.ts does for the EXPORT-SURFACE axis.
//
// What it is NOT: it never echoes the source implementation, the fixture's
// setup/invoke/assert function bodies, or any mechanism. Only the
// black-box behavioural contract (names + prose descriptions the fixture
// author wrote) is surfaced. "ZERO implementation hardcoded into the
// prompt" (the mission's hard constraint) is preserved structurally:
// OracleConstraint carries no code, only contract prose.
//
// Backward compatibility (mirrors hashAstGrounding): when there are no
// constraints — no fixture, or a fixture whose cases carry neither a
// usable name nor a description — buildSection and hash both return null,
// the system prompt and the run-cache contextHash are byte-identical to
// the pre-oracle path, and existing run caches stay valid.

/**
 * One behavioural acceptance criterion lifted from a BehaviorCase. `name`
 * is the case label; `description` is the optional contract-level prose
 * (see BehaviorCase.description). Deliberately code-free: this is the only
 * shape that crosses into the prompt, so it cannot carry implementation.
 */
export interface OracleConstraint {
  name: string;
  description?: string;
}

// Normalise the raw cases into constraints worth surfacing: a constraint
// must have a non-empty name. Order is preserved (fixture/source order) so
// the section and its hash are deterministic across runs.
function normaliseConstraints(
  constraints: readonly OracleConstraint[],
): OracleConstraint[] {
  const out: OracleConstraint[] = [];
  for (const c of constraints) {
    const name = (c.name ?? "").trim();
    if (name.length === 0) continue;
    const description = c.description?.trim();
    out.push(description ? { name, description } : { name });
  }
  return out;
}

/**
 * Build the BEHAVIOURAL ACCEPTANCE CRITERIA section appended to the
 * code_sketch system prompt. Returns null when there is nothing to say
 * (no usable constraints) so the grounding-enabled-but-no-oracle prompt is
 * indistinguishable from the legacy path.
 */
export function buildOracleGroundingSystemSection(
  constraints: readonly OracleConstraint[],
): string | null {
  const norm = normaliseConstraints(constraints);
  if (norm.length === 0) return null;
  const lines: string[] = [];
  lines.push(
    "BEHAVIOURAL ACCEPTANCE CRITERIA (executable oracle — your output WILL be run against these):",
  );
  lines.push("");
  lines.push(
    "The regenerated module will be loaded and exercised by an automated " +
      "behaviour checker. Each criterion below is a BLACK-BOX test of " +
      "observable behaviour at the module's public surface. You MUST " +
      "implement the module so that EVERY one of them holds. They describe " +
      "WHAT must be true, not HOW — you choose the implementation, but you " +
      "must not omit any behaviour described here.",
  );
  lines.push("");
  norm.forEach((c, i) => {
    lines.push(`  ${i + 1}. ${c.name}`);
    if (c.description) lines.push(`     ${c.description}`);
  });
  lines.push("");
  lines.push(
    "Where a criterion names a specific error kind, thrown-value shape, " +
      "idempotency property, ownership/identity check, or on-disk / " +
      "side-effect outcome, that detail is part of the contract and must be " +
      "reproduced exactly — a structurally smaller file that drops these " +
      "behaviours will FAIL the oracle.",
  );
  return lines.join("\n");
}

/**
 * Hash the oracle constraints into the `oracle:hash:` namespace. Returns
 * null when there are no usable constraints — mirroring hashAstGrounding /
 * hashRepCacheBypass so the caller can fold a null hash into the canonical
 * contextHash composition without branching. The distinct prefix prevents
 * collision with the `grounding:hash:` and `rep:hash:` namespaces.
 *
 * The digest takes the normalised constraints in order (order matters —
 * the fixture's case order is a stable property of the oracle), so the same
 * fixture produces the same hash on every run, and an edited criterion
 * cleanly separates the cache.
 */
export function hashOracleGrounding(
  constraints: readonly OracleConstraint[],
): string | null {
  const norm = normaliseConstraints(constraints);
  if (norm.length === 0) return null;
  const digest = createHash("sha256")
    .update(stringify({ oracle: norm }))
    .digest("hex");
  return `oracle:hash:${digest}`;
}
