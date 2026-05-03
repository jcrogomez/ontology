import { describe, it, expect } from "vitest";
import { validateIntent } from "../src/runtime/context/intent-validator.js";
import type { ContextAssemblyOutput } from "../src/runtime/context/types.js";
import type { GluingResult } from "../src/runtime/context/gluing.js";

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
});
