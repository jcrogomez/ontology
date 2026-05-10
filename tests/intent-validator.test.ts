import { describe, it, expect } from "vitest";
import {
  buildEvaluationContext,
  compileValidationPredicate,
  validateIntent,
} from "../src/runtime/context/intent-validator.js";
import type { ContextAssemblyOutput } from "../src/runtime/context/types.js";
import type { GluingResult } from "../src/runtime/context/gluing.js";
import {
  type EvaluationContext,
  evaluatePredicate,
} from "../src/runtime/topos/index.js";

describe("Intent Validator", () => {
  const baseAssembled: ContextAssemblyOutput = {
    mode: "strict",
    targetNodeId: "target",
    branch: "main",
    nodes: [],
    canon: "Canon",
    constraints: [],
    prompt: "Prompt",
  };

  const baseGlued: GluingResult = {
    ok: true,
    merged: {
      nodeId: "merged",
      branch: "main",
      provides: [],
      requires: [],
      forbids: [],
      optional: [],
      rules: [],
    },
    conflicts: [],
    warnings: [],
  };

  const baseCandidate = {
    text: "Valid response text.",
    provider: "mock" as const,
    model: "mock-model",
  };

  it("accepts valid candidate with clean gluing", () => {
    const result = validateIntent({
      assembled: baseAssembled,
      glued: baseGlued,
      candidate: baseCandidate,
    });

    expect(result.ok).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects candidate when gluing has conflicts", () => {
    const result = validateIntent({
      assembled: baseAssembled,
      glued: {
        ...baseGlued,
        ok: false,
        conflicts: [
          {
            type: "missing_requirement",
            message: "Missing test",
            nodeIds: ["node1"],
          },
        ],
      },
      candidate: baseCandidate,
    });

    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.0);
    expect(result.violations).toContain("Gluing conflict: missing_requirement - Missing test");
  });

  it("rejects empty candidate", () => {
    const result = validateIntent({
      assembled: baseAssembled,
      glued: baseGlued,
      candidate: {
        ...baseCandidate,
        text: "   \n  ",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.25);
    expect(result.violations).toContain("empty_candidate");
  });

  it("rejects forbidden literal phrase from FORBID constraint", () => {
    const result = validateIntent({
      assembled: {
        ...baseAssembled,
        constraints: ["FORBID: mutate .ontology"],
      },
      glued: baseGlued,
      candidate: {
        ...baseCandidate,
        text: "We should mutate .ontology files directly.",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.5);
    expect(result.violations).toContain("Forbidden phrase found: mutate .ontology");
  });

  it("preserves glued warnings", () => {
    const result = validateIntent({
      assembled: baseAssembled,
      glued: {
        ...baseGlued,
        warnings: ["Some warning"],
      },
      candidate: baseCandidate,
    });

    expect(result.warnings).toContain("Some warning");
  });

  it("returns deterministic score", () => {
    // Tests multiple failures and ensures it takes the minimum score
    const result = validateIntent({
      assembled: {
        ...baseAssembled,
        constraints: ["FORBID: mutate .ontology"],
      },
      glued: {
        ...baseGlued,
        ok: false,
        conflicts: [
          {
            type: "missing_requirement",
            message: "Missing test",
            nodeIds: ["node1"],
          },
        ],
      },
      candidate: {
        ...baseCandidate,
        text: "mutate .ontology   ",
      },
    });

    // Score should be min(0.0, 0.5) -> 0.0
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.0);
    expect(result.violations.length).toBeGreaterThan(1);
  });

  // ── Three-valued (Ω) verdict tests ──────────────────────────────────────
  //
  // These exercise the underlying predicate algebra explicitly. The first
  // two confirm that the closed-world `validateIntent` API surfaces "true"
  // and "false" verdicts; the third constructs a partial context to show
  // that the algebra produces "unknown" exactly when the evidence is
  // insufficient. Together they pin the contract: the validator's two-
  // valued external behaviour is a closed-world reduction of a genuinely
  // three-valued evaluator, not an accident of the implementation.
  describe("three-valued verdicts (Ω = {true, false, unknown})", () => {
    it("verdict is 'true' on a clean run", () => {
      const result = validateIntent({
        assembled: baseAssembled,
        glued: baseGlued,
        candidate: baseCandidate,
      });
      expect(result.verdict).toBe("true");
      expect(result.ok).toBe(true);
    });

    it("verdict is 'false' when any rule decisively fails", () => {
      const result = validateIntent({
        assembled: {
          ...baseAssembled,
          constraints: ["FORBID: mutate .ontology"],
        },
        glued: baseGlued,
        candidate: { ...baseCandidate, text: "We mutate .ontology now." },
      });
      expect(result.verdict).toBe("false");
      expect(result.ok).toBe(false);
    });

    it("verdict is 'unknown' under a partially classified context", () => {
      // The high-level `validateIntent` always classifies tokens (closed
      // world), so to see "unknown" we evaluate the same compiled
      // predicate against a deliberately partial `EvaluationContext`.
      // This models a future open-world caller — e.g., one that has not
      // yet scanned the candidate text for forbidden phrases.
      const input = {
        assembled: {
          ...baseAssembled,
          constraints: ["FORBID: mutate .ontology"],
        },
        glued: baseGlued,
        candidate: baseCandidate,
      };
      const { predicate } = compileValidationPredicate(input);
      const partialCtx: EvaluationContext = {
        // Synthetic tokens are intentionally not classified here.
        providedTokens: new Set(),
        deniedTokens: new Set(),
      };
      expect(evaluatePredicate(predicate, partialCtx)).toBe("unknown");
    });

    it("closed-world `buildEvaluationContext` always classifies every synthetic token", () => {
      // Sanity check the closed-world reduction: under the standard build
      // every rule's predicate evaluates to a definite verdict. This is
      // what guarantees that `validateIntent` never returns
      // verdict === "unknown" today, even though the algebra supports it.
      const input = {
        assembled: {
          ...baseAssembled,
          constraints: ["FORBID: alpha", "FORBID: beta"],
        },
        glued: baseGlued,
        candidate: { ...baseCandidate, text: "alpha but not the other one" },
      };
      const ctx = buildEvaluationContext(input);
      const { rules } = compileValidationPredicate(input);
      for (const rule of rules) {
        const v = evaluatePredicate(rule.predicate, ctx);
        expect(v === "true" || v === "false").toBe(true);
      }
    });
  });
});
