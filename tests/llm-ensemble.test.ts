import { describe, it, expect } from "vitest";
import {
  ENSEMBLE_MODES,
  EnsembleMetadataSchema,
  EnsembleModeSchema,
  HIGH_CONFIDENCE_MODEL,
  HIGH_CONFIDENCE_REPS,
  selectBestByScore,
} from "../src/runtime/llm/ensemble.js";

describe("ensemble — calibrated constants", () => {
  it("HIGH_CONFIDENCE_MODEL is llama3.2:3b per bake-off calibration", () => {
    expect(HIGH_CONFIDENCE_MODEL).toBe("llama3.2:3b");
  });

  it("HIGH_CONFIDENCE_REPS is 3 (matches the bake-off design)", () => {
    expect(HIGH_CONFIDENCE_REPS).toBe(3);
  });

  it("ENSEMBLE_MODES covers exactly none + high-confidence", () => {
    expect([...ENSEMBLE_MODES].sort()).toEqual(["high-confidence", "none"]);
  });
});

describe("ensemble — EnsembleModeSchema", () => {
  it("accepts both legal values", () => {
    expect(EnsembleModeSchema.safeParse("none").success).toBe(true);
    expect(EnsembleModeSchema.safeParse("high-confidence").success).toBe(true);
  });

  it("rejects typos / unknown strings", () => {
    expect(EnsembleModeSchema.safeParse("high_confidence").success).toBe(false);
    expect(EnsembleModeSchema.safeParse("HIGH-CONFIDENCE").success).toBe(false);
    expect(EnsembleModeSchema.safeParse("").success).toBe(false);
    expect(EnsembleModeSchema.safeParse("ensemble").success).toBe(false);
  });
});

describe("ensemble — selectBestByScore", () => {
  it("returns undefined for an empty input", () => {
    expect(selectBestByScore([], () => 0)).toBeUndefined();
  });

  it("returns the only index for a singleton", () => {
    expect(selectBestByScore([42], () => 7)).toBe(0);
  });

  it("returns the index of the maximum score", () => {
    expect(selectBestByScore([1, 3, 2], (x) => x)).toBe(1);
  });

  it("breaks ties deterministically toward the earliest index", () => {
    // All three have the same score — index 0 wins.
    expect(selectBestByScore([10, 10, 10], (x) => x)).toBe(0);
    // Two have the same maximum score — earlier wins.
    expect(selectBestByScore([1, 5, 5, 3], (x) => x)).toBe(1);
  });

  it("supports complex scoring functions (count of fields)", () => {
    const candidates = [
      { a: 1, b: 2 },
      { a: 1, b: 2, c: 3 },
      { a: 1 },
    ];
    const idx = selectBestByScore(candidates, (c) => Object.keys(c).length);
    expect(idx).toBe(1);
  });

  it("handles negative scores", () => {
    expect(selectBestByScore([-3, -1, -2], (x) => x)).toBe(1);
  });
});

describe("ensemble — EnsembleMetadataSchema", () => {
  it("accepts a complete record with selected winner", () => {
    const ok = EnsembleMetadataSchema.safeParse({
      mode: "high-confidence",
      model: "llama3.2:3b",
      repetitions: 3,
      validCount: 2,
      failedCount: 1,
      selectedAttempt: 1,
    });
    expect(ok.success).toBe(true);
  });

  it("accepts a record without selectedAttempt (ensemble_failed case)", () => {
    const ok = EnsembleMetadataSchema.safeParse({
      mode: "high-confidence",
      model: "llama3.2:3b",
      repetitions: 3,
      validCount: 0,
      failedCount: 3,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects negative counts", () => {
    const bad = EnsembleMetadataSchema.safeParse({
      mode: "high-confidence",
      model: "llama3.2:3b",
      repetitions: 3,
      validCount: -1,
      failedCount: 4,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects mode other than high-confidence (none is not a metadata target)", () => {
    const bad = EnsembleMetadataSchema.safeParse({
      mode: "none",
      model: "llama3.2:3b",
      repetitions: 0,
      validCount: 0,
      failedCount: 0,
    });
    expect(bad.success).toBe(false);
  });
});
