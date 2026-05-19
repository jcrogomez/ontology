import { describe, it, expect } from "vitest";
import {
  buildAstGroundingSystemSection,
  joinSystemSections,
  hashAstGrounding,
  composeContextHash,
} from "../src/runtime/compile/ast-grounding.js";

describe("buildAstGroundingSystemSection", () => {
  it("returns null when no exports are provided", () => {
    expect(buildAstGroundingSystemSection([])).toBeNull();
  });

  it("renders a prescriptive MUST block with each export bulleted", () => {
    const out = buildAstGroundingSystemSection(["Foo", "Bar"]);
    expect(out).not.toBeNull();
    expect(out).toMatch(/MANDATORY EXPORTS/);
    expect(out).toMatch(/MUST emit each of them/);
    expect(out).toMatch(/- Foo/);
    expect(out).toMatch(/- Bar/);
    expect(out).toMatch(/AST list wins/);
  });

  it("forbids inventing additional exports", () => {
    const out = buildAstGroundingSystemSection(["A"]) ?? "";
    expect(out).toMatch(/MUST NOT introduce additional exports/);
  });
});

describe("joinSystemSections", () => {
  it("returns null when all sections are null", () => {
    expect(joinSystemSections([null, null])).toBeNull();
  });

  it("returns the single populated section unchanged", () => {
    expect(joinSystemSections([null, "hello", null])).toBe("hello");
  });

  it("joins multiple sections with blank-line separators", () => {
    const joined = joinSystemSections(["first", null, "second"]);
    expect(joined).toBe("first\n\nsecond");
  });

  it("treats empty strings as absent", () => {
    expect(joinSystemSections(["", null])).toBeNull();
  });
});

describe("hashAstGrounding", () => {
  it("returns null for empty exports", () => {
    expect(hashAstGrounding([])).toBeNull();
  });

  it("returns a grounding:hash: prefixed digest for non-empty input", () => {
    const h = hashAstGrounding(["X"]);
    expect(h).not.toBeNull();
    expect(h).toMatch(/^grounding:hash:[a-f0-9]+$/);
  });

  it("is order-sensitive (re-ordering exports changes the hash)", () => {
    const a = hashAstGrounding(["A", "B"]);
    const b = hashAstGrounding(["B", "A"]);
    expect(a).not.toBe(b);
  });

  it("is deterministic across calls with the same input", () => {
    const a = hashAstGrounding(["Foo", "Bar"]);
    const b = hashAstGrounding(["Foo", "Bar"]);
    expect(a).toBe(b);
  });
});

describe("composeContextHash (backward compat)", () => {
  it("returns null when both inputs are null", () => {
    expect(composeContextHash(null, null)).toBeNull();
  });

  it("preserves upstream hash bit-for-bit when grounding is null (legacy path)", () => {
    const upstream = "ctx:hash:abc123";
    expect(composeContextHash(upstream, null)).toBe(upstream);
  });

  it("re-emits grounding-only under ctx:hash: prefix (schema invariant)", () => {
    const out = composeContextHash(null, "grounding:hash:xyz");
    expect(out).not.toBeNull();
    expect(out).toMatch(/^ctx:hash:/);
  });

  it("combines both inputs into a single ctx:hash: digest", () => {
    const out = composeContextHash("ctx:hash:up", "grounding:hash:gr");
    expect(out).not.toBeNull();
    expect(out).toMatch(/^ctx:hash:/);
    // Combined hash distinct from either input
    expect(out).not.toBe("ctx:hash:up");
  });

  it("changes the cache key when grounding bytes change", () => {
    const a = composeContextHash("ctx:hash:up", "grounding:hash:gr1");
    const b = composeContextHash("ctx:hash:up", "grounding:hash:gr2");
    expect(a).not.toBe(b);
  });

  it("changes the cache key when upstream bytes change", () => {
    const a = composeContextHash("ctx:hash:up1", "grounding:hash:gr");
    const b = composeContextHash("ctx:hash:up2", "grounding:hash:gr");
    expect(a).not.toBe(b);
  });
});
