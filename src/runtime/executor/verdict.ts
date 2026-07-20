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

// Draw-vs-draw agreement evidence, present only when the attempt drew more
// than once (the probe lever / --draws N). Carried through the anti-corruption
// layer because it is the ONLY signal that can separate "the ficha is
// ambiguous" (draws disagree with each other) from "the models are the limit"
// (draws agree yet fail) at plateau time — the lint proxy cannot.
export interface DrawAgreement {
  zone: "unanimous" | "majority" | "gray" | "no-signal";
  disagreementRate: number;
  clusterCount: number;
  compiledDraws: number;
  behaviorSplit: boolean;
}

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
  // Gray-zone fold over the attempt's draws; undefined on single-draw attempts.
  grayZone?: DrawAgreement;
  // Human-readable one-liner for the per-node report.
  detail: string;
}

// "compile-back failed" / "could not read source" mean the model produced an
// artifact that does not build — a draft-quality failure (broken), not a
// machine failure. Everything else under !ok (node not found, unsupported
// provider, missing shadow, lock contention) is infra.
const BROKEN_FAILURE = /compile-back failed|could not read source/i;

// …EXCEPT when the root cause buried in the failure string is a dead or
// exhausted provider. A "compile-back failed: … connect ECONNREFUSED" (no
// draft was ever produced) or "… you have reached your session usage limit"
// (provider quota, not model capability) is NOT a draft-quality result.
// Without this precedence the policy burns the whole ladder against an
// unusable provider and mis-reports capacity-ceiling — observed TWICE on
// 2026-07-07: the Ollama-down sweep (6 false ceilings, 1.3s wall-clock) and
// the cloud-quota-exhausted re-run (5 attempts in 4.8s, same false verdict).
// Infra wins over the compile-back prefix.
const INFRA_FAILURE =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|usage limit|rate limit|too many requests|quota|status code 429/i;

export function normalize(r: RegenerateResult): GateVerdict {
  // Prefer the unambiguous fixturePresent signal; fall back to the behaviorVerdict
  // heuristic only for results that predate that field.
  const hasFixture =
    r.fixturePresent ?? (r.behaviorVerdict !== undefined && r.behaviorVerdict !== "no_fixture");
  const lintClean = r.lintIssueCount === undefined ? undefined : r.lintIssueCount === 0;
  // Multi-draw attempts carry the gray-zone fold; single-draw leave it absent.
  const grayZone: DrawAgreement | undefined = r.grayZone
    ? {
        zone: r.grayZone.zone,
        disagreementRate: r.grayZone.disagreementRate,
        clusterCount: r.grayZone.clusterCount,
        compiledDraws: r.grayZone.compiledDraws,
        behaviorSplit: r.grayZone.behaviorSplit,
      }
    : undefined;

  if (!r.ok) {
    const failure = r.failure ?? "unknown failure";
    const outcome = INFRA_FAILURE.test(failure)
      ? "infra-error"
      : BROKEN_FAILURE.test(failure)
        ? "broken"
        : "infra-error";
    return {
      outcome,
      lintClean,
      hasFixture,
      grayZone,
      detail: failure,
    };
  }

  if (r.verdict === "unrecoverable") {
    return { outcome: "broken", lintClean, hasFixture, grayZone, detail: "unrecoverable structural verdict" };
  }

  // A rule violation blocks the write even when behaviour passes, so it is not a
  // green outcome — it ranks as a concrete, refinable failure.
  if ((r.ruleViolations ?? 0) > 0) {
    return {
      outcome: "rule-violation",
      lintClean,
      hasFixture,
      grayZone,
      detail: `${r.ruleViolations} declared rule(s) violated`,
    };
  }

  if (r.behaviorVerdict === "pass") {
    return { outcome: "pass", lintClean, hasFixture, grayZone, detail: "behaviour pass" };
  }
  if (r.behaviorVerdict === "fail") {
    return { outcome: "behavior-fail", lintClean, hasFixture, grayZone, detail: "behaviour fail" };
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
      grayZone,
      detail: `draft not behaviourally evaluable (${r.behaviorVerdict ?? "unevaluable"}, fixture present)`,
    };
  }
  return { outcome: "untested", lintClean, hasFixture: false, grayZone, detail: "no fixture" };
}
