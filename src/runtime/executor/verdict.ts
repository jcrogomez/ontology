// Anti-corruption layer: collapse the 20-plus-field RegenerateResult into the
// small, stable signal the executor policy reasons over. The policy must never
// see the fat result type — that coupling is what keeps it pure and the report
// honest.

import type { RegenerateResult } from "../../surfaces/commands/regenerate.js";

export type GateOutcome =
  | "pass" // behaviour pass AND no rule violations → write-acceptable
  | "behavior-fail" // a fixture ran and a case failed
  | "untested" // fixture absent, or regen failed to load / oracle threw
  | "broken" // did not compile back, or unrecoverable structural verdict
  | "rule-violation" // a statically-decidable declared rule was violated
  | "infra-error"; // machine failure, not a draft-quality result

export interface GateVerdict {
  outcome: GateOutcome;
  // Static-lint cleanliness of the chosen candidate, when known. undefined =
  // not computed (the policy then stays conservative — it will not flag an
  // extraction-gap on unknown lint, since that would blame the intention
  // without evidence). true = clean; false = undefined-refs / async-sync drift.
  lintClean: boolean | undefined;
  // Did a behaviour fixture run at all? Without one, "pass" is unreachable and
  // the executor refuses to write (untested does not count as green).
  hasFixture: boolean;
  // Human-readable one-liner for the per-node report.
  detail: string;
}

// "compile-back failed" / "could not read source" mean the model produced an
// artifact that does not build — a draft-quality failure (broken), not a
// machine failure. Everything else under !ok (node not found, unsupported
// provider, missing shadow, lock contention) is infra.
const BROKEN_FAILURE = /compile-back failed|could not read source/i;

export function normalize(r: RegenerateResult): GateVerdict {
  // Prefer the unambiguous fixturePresent signal; fall back to the behaviorVerdict
  // heuristic only for results that predate that field.
  const hasFixture =
    r.fixturePresent ?? (r.behaviorVerdict !== undefined && r.behaviorVerdict !== "no_fixture");
  const lintClean = r.lintIssueCount === undefined ? undefined : r.lintIssueCount === 0;

  if (!r.ok) {
    const failure = r.failure ?? "unknown failure";
    return {
      outcome: BROKEN_FAILURE.test(failure) ? "broken" : "infra-error",
      lintClean,
      hasFixture,
      detail: failure,
    };
  }

  if (r.verdict === "unrecoverable") {
    return { outcome: "broken", lintClean, hasFixture, detail: "unrecoverable structural verdict" };
  }

  // A rule violation blocks the write even when behaviour passes, so it is not a
  // green outcome — it ranks as a concrete, refinable failure.
  if ((r.ruleViolations ?? 0) > 0) {
    return {
      outcome: "rule-violation",
      lintClean,
      hasFixture,
      detail: `${r.ruleViolations} declared rule(s) violated`,
    };
  }

  if (r.behaviorVerdict === "pass") {
    return { outcome: "pass", lintClean, hasFixture, detail: "behaviour pass" };
  }
  if (r.behaviorVerdict === "fail") {
    return { outcome: "behavior-fail", lintClean, hasFixture, detail: "behaviour fail" };
  }
  // behaviorVerdict is "untested" or "no_fixture" here. The meaning depends on
  // whether a fixture actually exists:
  //   - fixture present → the draft could not be evaluated against it (did not
  //     compile / oracle threw / not comparable). That is a bad draw to refine
  //     or escalate, NOT a genuinely unverifiable node → "broken".
  //   - no fixture → the node cannot be behaviour-gated at all → "untested",
  //     which the policy terminates as unverified-no-fixture.
  if (hasFixture) {
    return {
      outcome: "broken",
      lintClean,
      hasFixture,
      detail: `draft not behaviourally evaluable (${r.behaviorVerdict ?? "unevaluable"}, fixture present)`,
    };
  }
  return { outcome: "untested", lintClean, hasFixture: false, detail: "no fixture" };
}
