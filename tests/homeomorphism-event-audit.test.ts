import { describe, it, expect } from "vitest";
import {
  dominantDispatchModel,
  computePerimeterHash,
} from "../src/surfaces/commands/verify/homeomorphism.js";
import type {
  HomeomorphismVerdict,
  VerificationResult,
} from "../src/runtime/legend/verify-homeomorphism.js";

// Coverage for the `homeomorphism_verified` event audit fields
// (milestone review §3.2 + design item §4.4): the actually-dispatched
// model and the perimeter hash that make the event log replayable on
// its own.

function res(
  sourceFile: string,
  dispatchModel?: { provider: string; model: string },
): VerificationResult {
  const verdict: HomeomorphismVerdict = "epsilon_equivalent";
  return {
    nodeId: `node:${sourceFile}`,
    sourceFile,
    ok: true,
    verdict,
    thresholds: { loc: 0.3, jaccard: 0.5 },
    ...(dispatchModel ? { dispatchModel } : {}),
  };
}

describe("dominantDispatchModel", () => {
  it("picks the most frequent actually-dispatched identity", () => {
    const results = [
      res("a.ts", { provider: "ollama", model: "qwen2.5-coder:7b" }),
      res("b.ts", { provider: "ollama", model: "qwen2.5-coder:7b" }),
      res("c.ts", { provider: "ollama", model: "granite4.1:8b" }),
    ];
    expect(dominantDispatchModel(results, undefined, undefined)).toEqual({
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });
  });

  it("falls back to the caller overrides when no run was persisted", () => {
    const results = [res("a.ts"), res("b.ts")];
    expect(dominantDispatchModel(results, "anthropic", "claude-opus-4-7")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-7",
    });
  });

  it("falls back to 'unknown' when neither dispatch record nor override exists", () => {
    expect(dominantDispatchModel([res("a.ts")], undefined, undefined)).toEqual({
      provider: "unknown",
      model: "unknown",
    });
  });
});

describe("computePerimeterHash", () => {
  it("is stable and independent of result ordering", () => {
    const a = [res("src/a.ts"), res("src/b.ts"), res("src/c.ts")];
    const shuffled = [res("src/c.ts"), res("src/a.ts"), res("src/b.ts")];
    expect(computePerimeterHash(a)).toBe(computePerimeterHash(shuffled));
  });

  it("changes when the perimeter changes", () => {
    const base = [res("src/a.ts"), res("src/b.ts")];
    const extended = [res("src/a.ts"), res("src/b.ts"), res("src/c.ts")];
    expect(computePerimeterHash(base)).not.toBe(computePerimeterHash(extended));
  });

  it("produces a 64-char hex sha256 digest", () => {
    const h = computePerimeterHash([res("src/a.ts")]);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
