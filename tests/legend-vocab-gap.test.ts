import { describe, it, expect } from "vitest";
import {
  aggregateVocabGaps,
  detectVocabGaps,
  hasVocabGap,
  looselyMatches,
  wordTokens,
  VocabGapAggregateSchema,
  VocabGapReportSchema,
} from "../src/laws/vocab-gap.js";

describe("vocab-gap — wordTokens", () => {
  it("splits camelCase boundaries", () => {
    expect(Array.from(wordTokens("authenticateUser")).sort()).toEqual([
      "authenticate",
      "user",
    ]);
  });

  it("splits snake_case and kebab-case", () => {
    expect(Array.from(wordTokens("user_authentication")).sort()).toEqual([
      "authentication",
      "user",
    ]);
    expect(Array.from(wordTokens("hash-canonical-v2")).sort()).toEqual([
      "canonical",
      "hash",
      "v2",
    ]);
  });

  it("lowercases ALL_CAPS tokens", () => {
    expect(Array.from(wordTokens("USER_AUTH")).sort()).toEqual([
      "auth",
      "user",
    ]);
  });

  it("deduplicates repeated words", () => {
    expect(wordTokens("foo_foo").size).toBe(1);
  });

  it("returns an empty set for an empty string", () => {
    expect(wordTokens("").size).toBe(0);
  });
});

describe("vocab-gap — looselyMatches", () => {
  it("matches on a single overlapping token", () => {
    expect(looselyMatches("user_authentication", "authenticateUser")).toBe(true);
  });

  it("returns false when the sets are disjoint", () => {
    expect(looselyMatches("user_auth", "validateInput")).toBe(false);
  });

  it("matches by case-insensitive token comparison", () => {
    expect(looselyMatches("HASH_VALUE", "hashThing")).toBe(true);
  });

  it("handles empty input by returning false", () => {
    expect(looselyMatches("", "foo")).toBe(false);
  });
});

describe("vocab-gap — detectVocabGaps", () => {
  it("returns empty gap for empty inputs", () => {
    const r = detectVocabGaps([], []);
    expect(r.missingExports).toEqual([]);
    expect(r.unexpectedExports).toEqual([]);
  });

  it("flags every provides key as missing when there are no exports", () => {
    const r = detectVocabGaps(["user_auth", "hash_canonical"], []);
    expect(r.missingExports).toEqual(["user_auth", "hash_canonical"]);
    expect(r.unexpectedExports).toEqual([]);
  });

  it("flags every export as unexpected when there are no provides keys", () => {
    const r = detectVocabGaps([], ["foo", "bar"]);
    expect(r.missingExports).toEqual([]);
    expect(r.unexpectedExports).toEqual(["foo", "bar"]);
  });

  it("pairs corresponding keys and exports via loose matching", () => {
    const r = detectVocabGaps(
      ["user_authentication", "hash_canonical"],
      ["authenticateUser", "hashCanonical"],
    );
    expect(r.missingExports).toEqual([]);
    expect(r.unexpectedExports).toEqual([]);
  });

  it("partial coverage — surfaces both sides of the asymmetry", () => {
    const r = detectVocabGaps(
      ["user_auth", "missing_concept"],
      ["userAuth", "extraExport"],
    );
    expect(r.missingExports).toEqual(["missing_concept"]);
    expect(r.unexpectedExports).toEqual(["extraExport"]);
  });
});

describe("vocab-gap — hasVocabGap", () => {
  it("returns true when either side is non-empty", () => {
    expect(hasVocabGap({ missingExports: ["a"], unexpectedExports: [] })).toBe(true);
    expect(hasVocabGap({ missingExports: [], unexpectedExports: ["x"] })).toBe(true);
  });

  it("returns false when both sides are empty", () => {
    expect(hasVocabGap({ missingExports: [], unexpectedExports: [] })).toBe(false);
  });
});

describe("vocab-gap — aggregateVocabGaps", () => {
  it("returns zeros for an empty input", () => {
    const a = aggregateVocabGaps([]);
    expect(a.nodesInspected).toBe(0);
    expect(a.nodesWithAnyGap).toBe(0);
    expect(a.totalMissingExports).toBe(0);
    expect(a.totalUnexpectedExports).toBe(0);
    expect(a.topMissingKeys).toEqual([]);
    expect(a.topUnexpectedExports).toEqual([]);
  });

  it("sums counts across nodes and ranks top keys descending", () => {
    const a = aggregateVocabGaps([
      {
        nodeId: "n1",
        gap: {
          missingExports: ["userAuth", "common"],
          unexpectedExports: [],
        },
      },
      {
        nodeId: "n2",
        gap: {
          missingExports: ["common"],
          unexpectedExports: ["dbg"],
        },
      },
      {
        nodeId: "n3",
        gap: { missingExports: [], unexpectedExports: [] },
      },
    ]);
    expect(a.nodesInspected).toBe(3);
    expect(a.nodesWithAnyGap).toBe(2);
    expect(a.totalMissingExports).toBe(3);
    expect(a.totalUnexpectedExports).toBe(1);
    // `common` appeared in two nodes, `userAuth` in one → common first.
    expect(a.topMissingKeys[0].key).toBe("common");
    expect(a.topMissingKeys[0].nodes).toBe(2);
    expect(a.topUnexpectedExports[0].name).toBe("dbg");
  });
});

describe("vocab-gap — Zod schemas", () => {
  it("VocabGapReportSchema accepts a well-formed report", () => {
    const ok = VocabGapReportSchema.safeParse({
      missingExports: ["a"],
      unexpectedExports: [],
    });
    expect(ok.success).toBe(true);
  });

  it("VocabGapAggregateSchema accepts a well-formed aggregate", () => {
    const ok = VocabGapAggregateSchema.safeParse({
      nodesInspected: 5,
      nodesWithAnyGap: 2,
      totalMissingExports: 3,
      totalUnexpectedExports: 1,
      topMissingKeys: [{ key: "x", nodes: 2 }],
      topUnexpectedExports: [{ name: "y", nodes: 1 }],
    });
    expect(ok.success).toBe(true);
  });
});
