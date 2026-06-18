import { describe, it, expect } from "vitest";
import {
  buildRefineFeedbackSection,
  hashRefineFeedback,
  type RefineFeedback,
} from "../src/forward/compile/refine-feedback.js";
import { composeContextHash } from "../src/forward/compile/ast-grounding.js";

// Tests for the verify-refine feedback lever
// (REGEN_INTENT_CONSUMPTION_2026-06-17 §"WHAT TO BUILD" #2). The
// section/hash backward-compat contract mirrors ast-grounding.ts and
// oracle-grounding.ts.

const EMPTY: RefineFeedback = {
  round: 2,
  failedCriteria: [],
  extraExports: [],
  missingExports: [],
};

const FULL: RefineFeedback = {
  round: 2,
  failedCriteria: [
    {
      name: "cross-host held lock → refuses with kind cross_host_held",
      diagnostic: "threw: Cannot read properties of undefined (reading 'pid')",
    },
  ],
  extraExports: ["isPidAlive", "makeLock"],
  missingExports: ["withLock"],
};

describe("buildRefineFeedbackSection", () => {
  it("returns null when there is nothing to fix (empty feedback ≡ no-refine path)", () => {
    expect(buildRefineFeedbackSection(EMPTY)).toBeNull();
  });

  it("renders the round and a REVISE header", () => {
    const out = buildRefineFeedbackSection(FULL) ?? "";
    expect(out).toMatch(/REVISE \(refinement round 2\)/);
    expect(out).toMatch(/FAILED THE GATES/);
  });

  it("lists failed behavioural criteria by name (pointing back at the oracle)", () => {
    const out = buildRefineFeedbackSection(FULL) ?? "";
    expect(out).toMatch(/Behavioural criteria your previous output did NOT satisfy/);
    expect(out).toMatch(/- cross-host held lock/);
  });

  it("surfaces the draft-side diagnostic beneath the criterion when present", () => {
    const out = buildRefineFeedbackSection(FULL) ?? "";
    expect(out).toMatch(/observed on your output: threw: Cannot read properties of undefined/);
    expect(out).toMatch(/it is the error the checker observed running YOUR previous/);
  });

  it("renders a criterion with no diagnostic as name-only", () => {
    const fb: RefineFeedback = {
      ...EMPTY,
      failedCriteria: [{ name: "acquire on a fresh repo" }],
    };
    const out = buildRefineFeedbackSection(fb) ?? "";
    expect(out).toMatch(/- acquire on a fresh repo/);
    expect(out).not.toMatch(/observed on your output/);
  });

  it("tells the model to keep over-exported names as INTERNAL helpers", () => {
    const out = buildRefineFeedbackSection(FULL) ?? "";
    expect(out).toMatch(/NOT part of the contract/);
    expect(out).toMatch(/- isPidAlive/);
    expect(out).toMatch(/- makeLock/);
  });

  it("asks for omitted required exports back", () => {
    const out = buildRefineFeedbackSection(FULL) ?? "";
    expect(out).toMatch(/omitted these REQUIRED exports/);
    expect(out).toMatch(/- withLock/);
  });

  it("renders static-lint findings as defects to fix", () => {
    const fb: RefineFeedback = {
      ...EMPTY,
      lintIssues: [
        { symbol: "registerExitHook", message: "your output calls `registerExitHook(...)` but never declares or imports it" },
        { symbol: "acquireLock", message: "`acquireLock` must be SYNCHRONOUS — remove `async`" },
      ],
    };
    const out = buildRefineFeedbackSection(fb) ?? "";
    expect(out).toMatch(/Static checks FAILED/);
    expect(out).toMatch(/never declares or imports/);
    expect(out).toMatch(/must be SYNCHRONOUS/);
  });

  it("lint findings alone are enough content to produce a section + hash", () => {
    const fb: RefineFeedback = { ...EMPTY, lintIssues: [{ symbol: "x", message: "calls x but never defines it" }] };
    expect(buildRefineFeedbackSection(fb)).not.toBeNull();
    expect(hashRefineFeedback(fb)).toMatch(/^refine:hash:/);
  });

  it("renders with only one of the three signals present", () => {
    const onlyExtra: RefineFeedback = { ...EMPTY, extraExports: ["helper"] };
    const out = buildRefineFeedbackSection(onlyExtra) ?? "";
    expect(out).toMatch(/- helper/);
    expect(out).not.toMatch(/REQUIRED exports/);
    expect(out).not.toMatch(/did NOT satisfy/);
  });

  it("carries no implementation code (criterion names + identifiers only)", () => {
    const out = buildRefineFeedbackSection(FULL) ?? "";
    expect(out).not.toMatch(/=>/);
    expect(out).not.toMatch(/fs\.|openSync|function\s/);
  });
});

describe("hashRefineFeedback", () => {
  it("returns null for empty feedback (legacy/no-refine path)", () => {
    expect(hashRefineFeedback(EMPTY)).toBeNull();
  });

  it("returns a refine:hash: prefixed digest for actionable feedback", () => {
    const h = hashRefineFeedback(FULL);
    expect(h).not.toBeNull();
    expect(h).toMatch(/^refine:hash:[a-f0-9]+$/);
  });

  it("is deterministic and order-insensitive within a signal (sets are normalised)", () => {
    const a = hashRefineFeedback({ ...FULL, extraExports: ["isPidAlive", "makeLock"] });
    const b = hashRefineFeedback({ ...FULL, extraExports: ["makeLock", "isPidAlive"] });
    expect(a).toBe(b);
  });

  it("changes when the round changes (a guard against a refine loop cache-hitting itself)", () => {
    const r2 = hashRefineFeedback({ ...FULL, round: 2 });
    const r3 = hashRefineFeedback({ ...FULL, round: 3 });
    expect(r2).not.toBe(r3);
  });

  it("changes when the failure set changes", () => {
    const a = hashRefineFeedback(FULL);
    const b = hashRefineFeedback({ ...FULL, missingExports: ["withLock", "acquireLock"] });
    expect(a).not.toBe(b);
  });

  it("uses a distinct namespace (refine:hash:, not grounding/oracle/rep)", () => {
    const h = hashRefineFeedback(FULL) ?? "";
    expect(h).toMatch(/^refine:hash:/);
  });
});

describe("composeContextHash + refine hash — backward-compat fold", () => {
  it("a null refine hash preserves the prior contextHash byte-for-byte", () => {
    const prior = composeContextHash("ctx:hash:upstream", "grounding:hash:x");
    expect(composeContextHash(prior, hashRefineFeedback(EMPTY))).toBe(prior);
  });

  it("a present refine hash changes the contextHash (each round dispatches fresh)", () => {
    const prior = composeContextHash("ctx:hash:upstream", "grounding:hash:x");
    const withRefine = composeContextHash(prior, hashRefineFeedback(FULL));
    expect(withRefine).not.toBeNull();
    expect(withRefine).toMatch(/^ctx:hash:/);
    expect(withRefine).not.toBe(prior);
  });
});
