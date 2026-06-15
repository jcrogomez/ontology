import { describe, it, expect } from "vitest";
import {
  ensembleCountsOnFatal,
  scoreExtractionCompleteness,
} from "../src/surfaces/commands/ingest/index.js";

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

// ── ensembleCountsOnFatal — bug fix MR_2026-05-18 §4.3 ─────────────────────
//
// extractIntentEnsemble runs N reps; if one of {read_failed,
// binary_content, empty_file} fires, it short-circuits and tags the
// returned fatal result with ensemble metadata. The pre-fix path
// emitted validCount: 0 + failedCount: reps.length + 1 regardless of
// how many of the pre-fatal reps had actually succeeded — making the
// report telemetry undercount valid extractions and overcount
// failures whenever a fatal hit landed after at least one ok rep.

describe("ensembleCountsOnFatal", () => {
  it("rep-1-fatal: 0 reps before fatal → 0 valid + 1 failed (the fatal itself)", () => {
    expect(ensembleCountsOnFatal([])).toEqual({
      repetitions: 1,
      validCount: 0,
      failedCount: 1,
    });
  });

  it("rep-1-ok, rep-2-fatal → 1 valid + 1 failed (the fatal)", () => {
    expect(ensembleCountsOnFatal([{ ok: true }])).toEqual({
      repetitions: 2,
      validCount: 1,
      failedCount: 1,
    });
  });

  it("rep-1-ok, rep-2-ok, rep-3-fatal → 2 valid + 1 failed (the fatal)", () => {
    expect(ensembleCountsOnFatal([{ ok: true }, { ok: true }])).toEqual({
      repetitions: 3,
      validCount: 2,
      failedCount: 1,
    });
  });

  it("rep-1-failed, rep-2-fatal → 0 valid + 2 failed (pre + fatal)", () => {
    expect(ensembleCountsOnFatal([{ ok: false }])).toEqual({
      repetitions: 2,
      validCount: 0,
      failedCount: 2,
    });
  });

  it("rep-1-ok, rep-2-failed, rep-3-fatal → 1 valid + 2 failed", () => {
    expect(
      ensembleCountsOnFatal([{ ok: true }, { ok: false }]),
    ).toEqual({
      repetitions: 3,
      validCount: 1,
      failedCount: 2,
    });
  });

  it("validCount + failedCount always equals repetitions (accounting invariant)", () => {
    for (const reps of [
      [],
      [{ ok: true }],
      [{ ok: false }],
      [{ ok: true }, { ok: true }],
      [{ ok: true }, { ok: false }],
      [{ ok: false }, { ok: false }],
    ] as const) {
      const r = ensembleCountsOnFatal(reps);
      expect(r.validCount + r.failedCount).toBe(r.repetitions);
    }
  });
});
