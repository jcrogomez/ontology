import { describe, it, expect } from "vitest";
import { normalize } from "../src/runtime/executor/verdict.js";
import type { RegenerateResult } from "../src/surfaces/commands/regenerate.js";

function result(over: Partial<RegenerateResult>): RegenerateResult {
  return { ok: true, nodeId: "node_0001", written: false, ...over } as RegenerateResult;
}

describe("normalize — gate verdict anti-corruption", () => {
  it("behaviour pass → pass", () => {
    const v = normalize(result({ behaviorVerdict: "pass", fixturePresent: true, lintIssueCount: 0 }));
    expect(v.outcome).toBe("pass");
    expect(v.hasFixture).toBe(true);
    expect(v.lintClean).toBe(true);
  });

  it("behaviour fail → behavior-fail", () => {
    expect(normalize(result({ behaviorVerdict: "fail", fixturePresent: true })).outcome).toBe("behavior-fail");
  });

  it("rule violation overrides a behaviour pass (not write-acceptable)", () => {
    expect(normalize(result({ behaviorVerdict: "pass", ruleViolations: 2, fixturePresent: true })).outcome).toBe(
      "rule-violation",
    );
  });

  it("no_fixture WITH a fixture present → broken (refinable bad draw), not unverifiable", () => {
    const v = normalize(result({ behaviorVerdict: "no_fixture", fixturePresent: true, lintIssueCount: 3 }));
    expect(v.outcome).toBe("broken");
    expect(v.hasFixture).toBe(true); // the key fix: a stochastic non-compiling draw is not "no fixture"
    expect(v.lintClean).toBe(false);
  });

  it("no_fixture with NO fixture → untested (genuinely unverifiable)", () => {
    const v = normalize(result({ behaviorVerdict: "no_fixture", fixturePresent: false }));
    expect(v.outcome).toBe("untested");
    expect(v.hasFixture).toBe(false);
  });

  it("compile-back failure → broken; other !ok failures → infra-error", () => {
    expect(normalize(result({ ok: false, failure: "compile-back failed: no draft compiled" })).outcome).toBe("broken");
    expect(normalize(result({ ok: false, failure: "node not found: node_0001" })).outcome).toBe("infra-error");
  });

  it("unknown lint stays undefined (policy then never flags an extraction-gap)", () => {
    expect(normalize(result({ behaviorVerdict: "fail", fixturePresent: true })).lintClean).toBeUndefined();
  });
});

// Infra-vs-broken precedence — found on the first instrumented Gap-2 sweep
// attempt (2026-07-07): Ollama was down, every regenerate came back
// "compile-back failed: … connect ECONNREFUSED 127.0.0.1:11434", the
// BROKEN_FAILURE prefix matched, the policy burned the full ladder against a
// dead provider, and 6 nodes were mis-reported capacity-ceiling (30 attempts,
// 1.3 s total wall-clock — the economics line is what exposed it). The
// taxonomy's promise ("infra-error: provider down") must win: no draft was
// ever produced, so this is not a draft-quality result.
describe("normalize — infra beats broken", () => {
  it("a dead provider buried in a compile-back failure → infra-error", () => {
    const v = normalize(
      result({
        ok: false,
        failure:
          'compile-back failed: decomposition slice "errorMessage" failed: Compile failed at step node_0011: connect ECONNREFUSED 127.0.0.1:11434',
      }),
    );
    expect(v.outcome).toBe("infra-error");
  });

  it("covers the other connection-failure shapes", () => {
    for (const sig of ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "socket hang up"]) {
      expect(normalize(result({ ok: false, failure: `compile-back failed: ${sig}` })).outcome).toBe(
        "infra-error",
      );
    }
  });

  it("classifies provider quota/rate-limit exhaustion as infra-error (2026-07-07 second misreport)", () => {
    const quota =
      'compile-back failed: decomposition slice "scaffold 5/9" failed: Compile failed at step node_0032: you (user) have reached your session usage limit, upgrade for higher limits';
    expect(normalize(result({ ok: false, failure: quota })).outcome).toBe("infra-error");
    for (const sig of ["rate limit exceeded", "Too Many Requests", "quota exceeded", "status code 429"]) {
      expect(normalize(result({ ok: false, failure: `compile-back failed: ${sig}` })).outcome).toBe(
        "infra-error",
      );
    }
  });

  it("a genuine compile-back failure stays broken (draft-quality)", () => {
    expect(
      normalize(result({ ok: false, failure: "compile-back failed: candidate did not parse" })).outcome,
    ).toBe("broken");
  });
});
