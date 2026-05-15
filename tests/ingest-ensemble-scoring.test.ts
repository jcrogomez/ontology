import { describe, it, expect } from "vitest";
import { scoreExtractionCompleteness } from "../src/commands/ingest/index.js";

// Phase ε E6 step 4 — score-by-completeness is the function that
// picks among multiple valid ensemble candidates. Required fields
// (label / level / kind / prompt) are guaranteed by the Zod schema in
// any valid candidate, so they're invariant and don't contribute. The
// score counts the OPTIONAL fields that the extractor populated.

// A minimal valid extraction (required-only). Score should be 0
// because no optional fields are populated.
const MINIMAL = {
  label: "L",
  level: "artifact" as const,
  kind: "artifact" as const,
  prompt: "p",
};

describe("scoreExtractionCompleteness", () => {
  it("scores a minimal extraction at 0 (no optional fields)", () => {
    expect(scoreExtractionCompleteness(MINIMAL)).toBe(0);
  });

  it("scores +1 for manifestation when present", () => {
    expect(
      scoreExtractionCompleteness({ ...MINIMAL, manifestation: "code" }),
    ).toBe(1);
  });

  it("scores +1 for language when non-empty", () => {
    expect(
      scoreExtractionCompleteness({ ...MINIMAL, language: "typescript" }),
    ).toBe(1);
  });

  it("does NOT score language if it is an empty string", () => {
    expect(scoreExtractionCompleteness({ ...MINIMAL, language: "" })).toBe(0);
  });

  it("scores +1 for non-empty requires / provides / forbids / rules each", () => {
    expect(
      scoreExtractionCompleteness({ ...MINIMAL, requires: ["a"] }),
    ).toBe(1);
    expect(
      scoreExtractionCompleteness({ ...MINIMAL, provides: ["a"] }),
    ).toBe(1);
    expect(
      scoreExtractionCompleteness({ ...MINIMAL, forbids: ["a"] }),
    ).toBe(1);
    expect(scoreExtractionCompleteness({ ...MINIMAL, rules: ["r"] })).toBe(1);
  });

  it("does NOT score empty arrays for requires / provides / forbids / rules", () => {
    expect(
      scoreExtractionCompleteness({
        ...MINIMAL,
        requires: [],
        provides: [],
        forbids: [],
        rules: [],
      }),
    ).toBe(0);
  });

  it("composite score: full extraction scores 6 (all six optional fields)", () => {
    expect(
      scoreExtractionCompleteness({
        ...MINIMAL,
        manifestation: "code",
        language: "typescript",
        requires: ["x"],
        provides: ["y"],
        forbids: ["z"],
        rules: ["FORBID: w"],
      }),
    ).toBe(6);
  });

  it("a richer extraction beats a sparser one (selection signal)", () => {
    const sparse = { ...MINIMAL, provides: ["a"] };
    const rich = {
      ...MINIMAL,
      provides: ["a", "b"],
      requires: ["c"],
      rules: ["FORBID: side_effects"],
    };
    expect(scoreExtractionCompleteness(rich)).toBeGreaterThan(
      scoreExtractionCompleteness(sparse),
    );
  });
});
