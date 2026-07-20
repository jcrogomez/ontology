import { describe, it, expect } from "vitest";
import {
  computeRoutingSignature,
  ROUTING_THRESHOLDS,
} from "../src/inverse/routing-signature.js";
import { classifySourceFile } from "../src/inverse/structural-classifier.js";

// s(c) — the cheap static router that conditions intent extraction (P7,
// docs/design/proposals/STOCHASTIC_FUNCTORS.md). Pure-function tests: no
// IO, no LLM. These pin the routing CONTRACT (which mode/prompt/model a
// shape maps to), not tuned thresholds — the numbers are pre-calibration
// and the P3 experiment fits them against the labelled collapse-22.

describe("computeRoutingSignature — determinism (P1: pure kernel read)", () => {
  it("is referentially transparent on the same (path, content)", () => {
    const input = {
      path: "/proj/src/lib/util.ts",
      content: `export function add(a: number, b: number): number { return a + b; }`,
    };
    const a = computeRoutingSignature({ ...input });
    const b = computeRoutingSignature({ ...input });
    expect(a).toEqual(b);
  });

  it("accepting a precomputed classification yields the same signature", () => {
    const path = "/proj/src/lib/util.ts";
    const content = `export function add(a: number, b: number): number { return a + b; }`;
    const classification = classifySourceFile({ path, content });
    const fresh = computeRoutingSignature({ path, content });
    const reused = computeRoutingSignature({ path, content, classification });
    expect(reused).toEqual(fresh);
  });
});

describe("computeRoutingSignature — re-expression family routes the PROMPT", () => {
  it("a barrel → reexpression_risk, barrel_reexport profile, economy model", () => {
    const s = computeRoutingSignature({
      path: "/proj/src/runtime/effects/index.ts",
      content: `
export * from "./result.js";
export * from "./io.js";
export { type Effect, pureEffect } from "./effect.js";
      `.trim(),
    });
    expect(s.structuralShape).toBe("barrel");
    expect(s.predictedMode).toBe("reexpression_risk");
    expect(s.promptProfile).toBe("barrel_reexport");
    // The empirical lever: NOT capacity — keep the model cheap.
    expect(s.modelTier).toBe("economy");
    // A barrel's identity IS its re-exports → inheriting neighbourhood helps.
    expect(s.inheritContext).toBe(true);
  });

  it("a type-only declaration file → reexpression_risk, type_surface profile", () => {
    const s = computeRoutingSignature({
      path: "/proj/src/runtime/context/types.ts",
      content: `
export interface ContextNode { id: string; label: string }
export type ContextEdge = { from: string; to: string };
export type ContextKind = "a" | "b" | "c";
      `.trim(),
    });
    expect(s.structuralShape).toBe("declaration_only");
    expect(s.predictedMode).toBe("reexpression_risk");
    expect(s.promptProfile).toBe("type_surface");
    expect(s.modelTier).toBe("economy");
    expect(s.typeExportRatio).toBeGreaterThanOrEqual(
      ROUTING_THRESHOLDS.typeSurfaceRatio,
    );
  });
});

describe("computeRoutingSignature — truncation family routes the MODEL", () => {
  it("a large multi-export executable → truncation_risk, frontier model", () => {
    const fns = Array.from(
      { length: 10 },
      (_, i) =>
        `export function fn${i}(x: number): number {\n  let acc = x;\n  acc += ${i};\n  return acc;\n}`,
    ).join("\n\n");
    // Pad past the "large" token threshold with an inert comment (does not
    // change the AST shape — still an executable multi-export module).
    const content = `${fns}\n// ${"x".repeat(12000)}`;
    const s = computeRoutingSignature({
      path: "/proj/src/big/many-exports.ts",
      content,
    });
    expect(s.exportCount).toBeGreaterThanOrEqual(
      ROUTING_THRESHOLDS.exportManyForTruncation,
    );
    expect(s.tokenEstimate).toBeGreaterThanOrEqual(
      ROUTING_THRESHOLDS.tokenLargeForTruncation,
    );
    expect(s.predictedMode).toBe("truncation_risk");
    expect(s.modelTier).toBe("frontier");
    expect(s.promptProfile).toBe("code_generic");
  });
});

describe("computeRoutingSignature — the safe core", () => {
  it("a small plain-function module → core, economy, generic prompt", () => {
    const s = computeRoutingSignature({
      path: "/proj/src/lib/small.ts",
      content: `
export function add(a: number, b: number): number { return a + b; }
export function mul(a: number, b: number): number { return a * b; }
      `.trim(),
    });
    expect(s.predictedMode).toBe("core");
    expect(s.modelTier).toBe("economy");
    expect(s.promptProfile).toBe("code_generic");
  });
});

describe("computeRoutingSignature — feature surface is populated", () => {
  it("exposes the cheap features and a non-negative complexity", () => {
    const s = computeRoutingSignature({
      path: "/proj/src/lib/small.ts",
      content: `export function add(a: number, b: number): number { return a + b; }`,
    });
    expect(s.exportCount).toBe(1);
    expect(s.tokenEstimate).toBeGreaterThan(0);
    expect(s.complexity).toBeGreaterThanOrEqual(0);
    expect(s.typeExportRatio).toBe(0);
    expect(s.rationale.length).toBeGreaterThan(0);
  });
});
