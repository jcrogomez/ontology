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
