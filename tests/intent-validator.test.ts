import { describe, it, expect } from "vitest";
import {
  buildEvaluationContext,
  compileValidationPredicate,
  validateIntent,
} from "../src/forward/context/intent-validator.js";
import type { ContextAssemblyOutput } from "../src/forward/context/types.js";
import { glueFragments, type GluingResult } from "../src/forward/context/gluing.js";
import type { ContextFragment } from "../src/forward/context/presheaf.js";
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
      // verdict === "unknown" by default, even though the algebra supports
      // it. The open-world flag below explicitly opts into the "unknown"
      // path for forbid rules.
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

  describe("§3.9 parity guard — gluing_ok token tracks glued.ok under every gluing policy", () => {
    const GLUING_OK = "__validator__:gluing_ok";
    const frag = (nodeId: string, sig?: string): ContextFragment => ({
      nodeId,
      branch: "main",
      provides: ["A"],
      requires: [],
      forbids: [],
      optional: [],
      rules: [],
      ...(sig ? { provideSignatures: { A: sig } } : {}),
    });

    it("closed-world: gluing_ok is provided iff glued.ok — whether ok comes from conflict OR identify-if-equal (O2)", () => {
      // Same fragments, two policies: under the default the duplicate provider
      // conflicts (ok=false); under identify-if-equal the equal signatures
      // glue (ok=true). The closed-world parity result (§3.9) rests on the
      // validator's synthetic gluing_ok token mirroring glued.ok EXACTLY — so
      // changing the gluing policy can never silently desync the ground truth
      // the Boolean oracle is checked against. This guard pins that coupling.
      const fragments = [frag("n1", "(): number"), frag("n2", "(): number")];
      const conflictGlue = glueFragments(fragments);
      const identifyGlue = glueFragments(fragments, {
        onDuplicateProvider: "identify-if-equal",
      });
      expect(conflictGlue.ok).toBe(false);
      expect(identifyGlue.ok).toBe(true);

      const ctxOf = (glued: GluingResult) =>
        buildEvaluationContext({
          assembled: baseAssembled,
          glued,
          candidate: baseCandidate,
        });

      expect(ctxOf(conflictGlue).providedTokens.has(GLUING_OK)).toBe(false);
      expect(ctxOf(conflictGlue).deniedTokens.has(GLUING_OK)).toBe(true);
      expect(ctxOf(identifyGlue).providedTokens.has(GLUING_OK)).toBe(true);
      expect(ctxOf(identifyGlue).deniedTokens.has(GLUING_OK)).toBe(false);
    });
  });

  describe("open-world mode (openWorld: true)", () => {
    it("a forbid phrase that does not appear in the candidate yields verdict 'unknown' (not 'true')", () => {
      // Closed-world: phrase absent → forbid rule passes → verdict 'true'.
      // Open-world: phrase absent → forbid token is unclassified → atom is
      // 'unknown' → conjunction is 'unknown'. The whole point of the flag
      // is to distinguish "syntactically absent" from "semantically safe".
      const input = {
        assembled: {
          ...baseAssembled,
          constraints: ["FORBID: mutate .ontology"],
        },
        glued: baseGlued,
        candidate: { ...baseCandidate, text: "totally clean prose, no forbidden phrase here" },
        openWorld: true,
      };
      const result = validateIntent(input);
      expect(result.verdict).toBe("unknown");
      // ok stays the deterministic two-valued projection — callers that
      // never read `verdict` see "not OK" rather than a silent pass.
      expect(result.ok).toBe(false);
      // No violations: nothing is decisively wrong. Score is unchanged.
      expect(result.violations).toEqual([]);
      expect(result.score).toBe(1.0);
      // The undecided rule surfaces as a warning so the caller can render
      // an "uncertain" marker next to it.
      expect(result.warnings.some((w) => w.includes("Undecided validator rule: forbid:mutate .ontology"))).toBe(true);
    });

    it("a forbid phrase that DOES appear is still a decisive 'false' in open-world mode", () => {
      // Open-world doesn't downgrade decisive failures — only absences.
      const input = {
        assembled: {
          ...baseAssembled,
          constraints: ["FORBID: mutate .ontology"],
        },
        glued: baseGlued,
        candidate: { ...baseCandidate, text: "I will mutate .ontology now" },
        openWorld: true,
      };
      const result = validateIntent(input);
      expect(result.verdict).toBe("false");
      expect(result.ok).toBe(false);
      expect(result.violations).toContain("Forbidden phrase found: mutate .ontology");
    });

    it("gluing failure is still a decisive 'false' (structural rules stay classified)", () => {
      // Open-world only relaxes the closed-world default for forbid phrases.
      // Decidable structural rules (gluing, non-empty candidate) keep their
      // two-valued behaviour regardless of the flag.
      const result = validateIntent({
        assembled: baseAssembled,
        glued: { ...baseGlued, ok: false, conflicts: [{ type: "branch", message: "x" }] },
        candidate: baseCandidate,
        openWorld: true,
      });
      expect(result.verdict).toBe("false");
      expect(result.ok).toBe(false);
    });

    it("opt-out by default — omitting openWorld preserves the closed-world contract", () => {
      // Same input as the first open-world case but without the flag. The
      // verdict must collapse back to 'true' under the legacy semantics.
      const input = {
        assembled: {
          ...baseAssembled,
          constraints: ["FORBID: mutate .ontology"],
        },
        glued: baseGlued,
        candidate: { ...baseCandidate, text: "totally clean prose, no forbidden phrase here" },
      };
      const result = validateIntent(input);
      expect(result.verdict).toBe("true");
      expect(result.ok).toBe(true);
      expect(result.warnings.every((w) => !w.includes("Undecided"))).toBe(true);
    });

    it("the open-world EvaluationContext leaves absent-forbid tokens unclassified", () => {
      // Direct inspection of the context's two sets. The structural tokens
      // remain decidable; only the forbid token whose phrase is absent
      // disappears from both sets.
      const input = {
        assembled: {
          ...baseAssembled,
          constraints: ["FORBID: alpha", "FORBID: beta"],
        },
        glued: baseGlued,
        candidate: { ...baseCandidate, text: "contains alpha but not the other" },
        openWorld: true,
      };
      const ctx = buildEvaluationContext(input);
      // alpha appears → provided.
      expect(ctx.providedTokens.has("__validator__:forbid_phrase:alpha")).toBe(true);
      // beta is absent → in open-world mode, neither provided nor denied.
      expect(ctx.providedTokens.has("__validator__:forbid_phrase:beta")).toBe(false);
      expect(ctx.deniedTokens.has("__validator__:forbid_phrase:beta")).toBe(false);
    });
  });
});
