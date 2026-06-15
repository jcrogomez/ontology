import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  tagFileFromDisk,
  type FrontierAttribute,
} from "../src/inverse/frontier-tagger.js";

const FIXTURE_ROOT = path.resolve(
  __dirname,
  "..",
  "examples",
  "legend-fixture",
);

interface FixtureCase {
  relativePath: string;
  /** Tags that MUST appear in the tagger output. */
  expectedTags: readonly FrontierAttribute[];
  /** Tags that MUST NOT appear. Used to assert the predicted bucket is exclusive (e.g. a CLI parser isn't algebraic-lawful). */
  forbiddenTags?: readonly FrontierAttribute[];
}

// 1:1 against the hypothesis predictions in README.md. Adding a row
// here without adding the file (or vice versa) is a deliberate
// failure: hypothesis ↔ fixture must stay in sync.
const FIXTURES: readonly FixtureCase[] = [
  {
    relativePath: "src/core/integrity/hash.ts",
    expectedTags: ["pure-transform"],
    forbiddenTags: ["io-bound", "cli-parsing", "adapter-boundary"],
  },
  {
    relativePath: "src/runtime/effects/result.ts",
    expectedTags: ["algebraic-lawful", "pure-transform"],
    forbiddenTags: ["io-bound", "cli-parsing"],
  },
  {
    relativePath: "src/schemas/user.ts",
    expectedTags: ["schema-driven"],
    forbiddenTags: ["cli-parsing", "io-bound", "adapter-boundary"],
  },
  {
    relativePath: "src/commands/greet/index.ts",
    expectedTags: ["cli-parsing", "operational-glue"],
    forbiddenTags: ["pure-transform", "algebraic-lawful", "schema-driven"],
  },
  {
    relativePath: "src/core/fs/cache.ts",
    expectedTags: ["io-bound", "operational-glue"],
    forbiddenTags: ["cli-parsing", "pure-transform"],
  },
  {
    relativePath: "src/runtime/prompt/literal-template.ts",
    expectedTags: ["schema-driven", "literal-required", "prompt-sensitive"],
    forbiddenTags: ["cli-parsing", "io-bound"],
  },
];

describe("legend-fixture — every file lands in its predicted bucket (hypothesis §8 sanity check)", () => {
  it("the fixture directory exists at the expected path", () => {
    expect(fs.existsSync(FIXTURE_ROOT)).toBe(true);
    expect(fs.statSync(FIXTURE_ROOT).isDirectory()).toBe(true);
  });

  it("README.md is present (the human-readable prediction record)", () => {
    expect(fs.existsSync(path.join(FIXTURE_ROOT, "README.md"))).toBe(true);
  });

  it("every fixture row in the test references a file that exists on disk", () => {
    for (const fc of FIXTURES) {
      const abs = path.join(FIXTURE_ROOT, fc.relativePath);
      expect(fs.existsSync(abs), `missing fixture file: ${fc.relativePath}`).toBe(true);
    }
  });

  for (const fc of FIXTURES) {
    it(`${fc.relativePath} → tags must contain ${fc.expectedTags.join(", ")}`, () => {
      const abs = path.join(FIXTURE_ROOT, fc.relativePath);
      const result = tagFileFromDisk(abs);
      for (const tag of fc.expectedTags) {
        expect(
          result.attrs.includes(tag),
          `expected ${tag} for ${fc.relativePath}; got [${result.attrs.join(", ")}]`,
        ).toBe(true);
      }
    });

    if (fc.forbiddenTags && fc.forbiddenTags.length > 0) {
      it(`${fc.relativePath} → tags must NOT contain ${fc.forbiddenTags.join(", ")}`, () => {
        const abs = path.join(FIXTURE_ROOT, fc.relativePath);
        const result = tagFileFromDisk(abs);
        for (const tag of fc.forbiddenTags ?? []) {
          expect(
            result.attrs.includes(tag),
            `unexpected ${tag} for ${fc.relativePath}; got [${result.attrs.join(", ")}]`,
          ).toBe(false);
        }
      });
    }
  }

  it("each fixture file gets at least one tag (no zero-tagged fixtures)", () => {
    for (const fc of FIXTURES) {
      const abs = path.join(FIXTURE_ROOT, fc.relativePath);
      const result = tagFileFromDisk(abs);
      expect(
        result.attrs.length,
        `${fc.relativePath} returned zero tags`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("legend-fixture — meta sanity", () => {
  it("the six-file taxonomy (2 pure / 1 schema / 1 CLI / 1 IO / 1 literal) is covered exactly", () => {
    // Count fixture rows in each predicted bucket. The hypothesis §8
    // specifies the shape; this assertion guards against silent drift.
    const buckets = {
      pure: 0,
      schema: 0,
      cli: 0,
      io: 0,
      literal: 0,
    };
    for (const fc of FIXTURES) {
      if (fc.expectedTags.includes("literal-required")) buckets.literal += 1;
      else if (fc.expectedTags.includes("cli-parsing")) buckets.cli += 1;
      else if (fc.expectedTags.includes("io-bound")) buckets.io += 1;
      else if (fc.expectedTags.includes("schema-driven")) buckets.schema += 1;
      else if (
        fc.expectedTags.includes("pure-transform") ||
        fc.expectedTags.includes("algebraic-lawful")
      ) {
        buckets.pure += 1;
      }
    }
    expect(buckets).toEqual({
      pure: 2,
      schema: 1,
      cli: 1,
      io: 1,
      literal: 1,
    });
  });
});
