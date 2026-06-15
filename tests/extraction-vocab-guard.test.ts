import { describe, it, expect } from "vitest";
import {
  ExtractionResultSchema,
  SymbolNameSchema,
} from "../src/surfaces/commands/ingest/index.js";

// MR_2026-05-17 §6.2 / MR_2026-05-18 §6.2 — vocabulary contract guard.
//
// Phase ε β′ (2026-05-16): buildStaticSummary emitted MODULE PATHS
// into `requires` while the intent-validator's gluing check expected
// SYMBOL NAMES. The two vocabularies never matched → 6 of 7
// static-summary deflected files became `unrecoverable` despite
// being structurally valid. Move 1b (2026-05-18) fixed the producer;
// SymbolNameSchema is the regression net at the schema layer so any
// future caller (LLM extraction or otherwise) emitting a module-path-
// shape token into requires/provides hits a clear Zod rejection at
// extraction time instead of producing silent unrecoverables
// downstream.

describe("SymbolNameSchema — accepts plain symbol names", () => {
  it.each([
    "io",
    "result",
    "createNodeProposalForExtraction",
    "NodeID",
    "AbstractionLevel",
    "Z_INTERNAL_MARKER",
    "snake_case_ok",
    "kebab-ish-tolerated", // not a JS identifier but the schema is permissive
    "$dollarPrefixed",
  ])("accepts %s", (token) => {
    expect(SymbolNameSchema.safeParse(token).success).toBe(true);
  });
});

describe("SymbolNameSchema — rejects module-path and source-file shapes", () => {
  it.each([
    "./io.js",
    "../runtime/llm/types.js",
    "./gamma.ts",
    "./foo.tsx",
    "../helpers/util.jsx",
    "./esm-only.mjs",
    "./legacy.cjs",
    // Edge case: just a relative prefix with nothing after.
    "../",
    "./",
    // File extensions without the path prefix are still rejected —
    // a bare "foo.ts" is unambiguously a file specifier, not a symbol.
    "foo.ts",
    "bar.tsx",
  ])("rejects %s", (token) => {
    expect(SymbolNameSchema.safeParse(token).success).toBe(false);
  });

  it("rejects the empty string (covered by .min(1))", () => {
    expect(SymbolNameSchema.safeParse("").success).toBe(false);
  });

  it("rejection message names the regression that motivated the guard", () => {
    const result = SymbolNameSchema.safeParse("./io.js");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message.toLowerCase()).toContain("symbol name");
      expect(message).toContain("./foo.js");
    }
  });
});

describe("ExtractionResultSchema — vocabulary guard integrates with requires/provides", () => {
  const validBase = {
    label: "x",
    level: "artifact" as const,
    kind: "artifact" as const,
    prompt: "p",
  };

  it("accepts requires + provides of symbol names", () => {
    const result = ExtractionResultSchema.safeParse({
      ...validBase,
      requires: ["AbstractionLevel", "NodeKind"],
      provides: ["createNodeProposalForExtraction"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a requires entry shaped like a module path (β′ regression)", () => {
    const result = ExtractionResultSchema.safeParse({
      ...validBase,
      requires: ["./io.js"], // the exact β′ failure shape
    });
    expect(result.success).toBe(false);
  });

  it("rejects when one entry of many is a module path", () => {
    const result = ExtractionResultSchema.safeParse({
      ...validBase,
      provides: ["good_symbol", "../another.ts", "also_good"],
    });
    expect(result.success).toBe(false);
  });

  it("forbids array remains permissive (prose tokens are allowed)", () => {
    // Move 1's barrel emits `forbids: ["runtime side effects in the
    // barrel itself"]` — prose, not a symbol name. The guard applies
    // only to requires/provides, where the gluing check matches.
    const result = ExtractionResultSchema.safeParse({
      ...validBase,
      forbids: ["runtime side effects in the barrel itself"],
    });
    expect(result.success).toBe(true);
  });

  it("rules array remains permissive (prose REQUIRE/FORBID directives)", () => {
    const result = ExtractionResultSchema.safeParse({
      ...validBase,
      rules: ["REQUIRE: every export is a re-export from a sibling file"],
    });
    expect(result.success).toBe(true);
  });
});
