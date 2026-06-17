import { describe, it, expect } from "vitest";
import {
  buildAstGroundingSystemSection,
  joinSystemSections,
  hashAstGrounding,
  hashRepCacheBypass,
  composeContextHash,
} from "../src/forward/compile/ast-grounding.js";

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

  it("renders the type signature inline when one is provided (grounding the surface, not just the name)", () => {
    const out =
      buildAstGroundingSystemSection(["acquireLock", "Lock"], {
        acquireLock: "(repoRoot: string) => Lock",
      }) ?? "";
    expect(out).toMatch(/- acquireLock: \(repoRoot: string\) => Lock/);
    expect(out).toMatch(/- Lock$/m); // no signature → name-only, unchanged
    expect(out).toMatch(/match that exact signature/);
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

  it("folds signatures into the hash, but absent/empty signatures preserve the legacy digest", () => {
    const bare = hashAstGrounding(["A"]);
    expect(hashAstGrounding(["A"], {})).toBe(bare); // empty → byte-identical to legacy
    expect(hashAstGrounding(["A"], { A: "() => void" })).not.toBe(bare);
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

describe("hashRepCacheBypass — per-rep cache-bypass token (review §3 fix)", () => {
  it("returns null when the token is undefined (legacy single-draw path)", () => {
    expect(hashRepCacheBypass(undefined)).toBeNull();
  });

  it("returns null when the token is an empty string (no-op equivalent)", () => {
    expect(hashRepCacheBypass("")).toBeNull();
  });

  it("returns a `rep:hash:` prefixed digest for a non-empty token", () => {
    const h = hashRepCacheBypass("rep_0_of_3");
    expect(h).not.toBeNull();
    expect(h).toMatch(/^rep:hash:[0-9a-f]+$/);
  });

  it("is deterministic across calls with the same token", () => {
    expect(hashRepCacheBypass("rep_2_of_5")).toBe(hashRepCacheBypass("rep_2_of_5"));
  });

  it("distinct tokens produce distinct hashes — the heart of the cache-bypass fix", () => {
    const r0 = hashRepCacheBypass("rep_0_of_3");
    const r1 = hashRepCacheBypass("rep_1_of_3");
    const r2 = hashRepCacheBypass("rep_2_of_3");
    expect(r0).not.toBe(r1);
    expect(r1).not.toBe(r2);
    expect(r0).not.toBe(r2);
  });

  it("uses a distinct namespace from grounding (no `rep:hash:` collision)", () => {
    const grounding = hashAstGrounding(["Foo"]);
    const rep = hashRepCacheBypass("Foo");
    expect(grounding).toMatch(/^grounding:hash:/);
    expect(rep).toMatch(/^rep:hash:/);
    expect(grounding).not.toBe(rep);
  });
});

describe("composeContextHash + rep token — end-to-end cache-key behaviour", () => {
  // The fix wires `composeContextHash` a second time, layering the rep
  // hash over the upstream+grounding chain. Verifies that the
  // composition is sensitive to the rep token in the same way it's
  // sensitive to grounding.
  it("two reps with distinct tokens produce distinct contextHashes", () => {
    const upstreamPlusGrounding = composeContextHash(
      "ctx:hash:upstream",
      "grounding:hash:exports",
    );
    const rep0 = composeContextHash(
      upstreamPlusGrounding,
      hashRepCacheBypass("rep_0_of_3"),
    );
    const rep1 = composeContextHash(
      upstreamPlusGrounding,
      hashRepCacheBypass("rep_1_of_3"),
    );
    expect(rep0).not.toBeNull();
    expect(rep1).not.toBeNull();
    expect(rep0).not.toBe(rep1);
    // And both differ from the no-rep (single-draw legacy) contextHash:
    expect(rep0).not.toBe(upstreamPlusGrounding);
    expect(rep1).not.toBe(upstreamPlusGrounding);
  });

  it("undefined rep token preserves the legacy contextHash byte-for-byte", () => {
    const baseline = composeContextHash(
      "ctx:hash:upstream",
      "grounding:hash:exports",
    );
    const noRep = composeContextHash(baseline, hashRepCacheBypass(undefined));
    expect(noRep).toBe(baseline);
  });
});
