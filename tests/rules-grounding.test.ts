import { describe, it, expect } from "vitest";
import {
  renderRulesBlock,
  extractRulesBlock,
  groundArtifactWithRules,
  commentStyle,
} from "../src/runtime/compile/rules-grounding.js";

// Rules-grounding: the deterministic dual of ast-grounding that round-trips a
// node's `rules` through compile→code→ingest (closes the LENS_LAWS_2026-06-13
// E2 gap). These pin the pure render/extract round-trip across comment styles
// and the idempotent artifact prepend.

describe("rules-grounding — render/extract round-trip", () => {
  const RULES = [
    "REQUIRE: createSequentialNodeId is a pure function with no side effects.",
    "FORBID: console.log",
    "REQUIRE: throws on a negative count",
  ];

  it("renders a recoverable block in a C-family (block-comment) language", () => {
    const block = renderRulesBlock(RULES, "typescript");
    expect(block).not.toBeNull();
    expect(block).toContain("@ontology:rules");
    expect(block).toContain("@ontology:end-rules");
    expect(block!.startsWith("/*")).toBe(true);
    expect(extractRulesBlock(block!)).toEqual(RULES);
  });

  it("renders a recoverable block in a line-comment language (python)", () => {
    const block = renderRulesBlock(RULES, "python");
    expect(block).not.toBeNull();
    expect(block!.split("\n").every((l) => l.startsWith("#"))).toBe(true);
    expect(extractRulesBlock(block!)).toEqual(RULES);
  });

  it("recovers rules embedded in a full source file (TS), ignoring surrounding code", () => {
    const block = renderRulesBlock(RULES, "typescript");
    const source = `${block}\nexport function foo(): number {\n  return 1;\n}\n`;
    expect(extractRulesBlock(source)).toEqual(RULES);
  });

  it("returns [] for sources with no rules block (harmless on ungrounded code)", () => {
    expect(extractRulesBlock("export const x = 1;\n// just a comment\n")).toEqual([]);
  });

  it("renders null for an empty/whitespace-only rule set", () => {
    expect(renderRulesBlock([], "typescript")).toBeNull();
    expect(renderRulesBlock(["   ", ""], "typescript")).toBeNull();
  });

  it("collapses newlines within a rule to keep one-rule-per-line recoverability", () => {
    const block = renderRulesBlock(["REQUIRE: a\nmultiline\nrule"], "typescript");
    expect(extractRulesBlock(block!)).toEqual(["REQUIRE: a multiline rule"]);
  });

  it("commentStyle picks line vs block comments by language", () => {
    expect(commentStyle("python").blockOpen).toBeNull();
    expect(commentStyle("typescript").blockOpen).toBe("/*");
    expect(commentStyle("rust").blockOpen).toBe("/*");
    expect(commentStyle("yaml").blockOpen).toBeNull();
  });
});

describe("rules-grounding — groundArtifactWithRules is idempotent", () => {
  const RULES = ["REQUIRE: pure", "FORBID: io"];

  it("prepends the block and survives a re-ground without stacking", () => {
    const code = "export const x = 1;\n";
    const once = groundArtifactWithRules(code, RULES, "typescript");
    expect(extractRulesBlock(once)).toEqual(RULES);
    expect(once).toContain("export const x = 1;");

    const twice = groundArtifactWithRules(once, RULES, "typescript");
    // Exactly one block — recompiling does not stack blocks.
    const beginCount = (twice.match(/@ontology:rules/g) ?? []).length;
    expect(beginCount).toBe(1);
    expect(extractRulesBlock(twice)).toEqual(RULES);
    expect(twice).toContain("export const x = 1;");
  });

  it("replacing the rule set updates the head block in place", () => {
    const code = "x = 1\n";
    const a = groundArtifactWithRules(code, ["REQUIRE: a"], "python");
    const b = groundArtifactWithRules(a, ["REQUIRE: b", "FORBID: c"], "python");
    expect(extractRulesBlock(b)).toEqual(["REQUIRE: b", "FORBID: c"]);
    expect((b.match(/@ontology:rules/g) ?? []).length).toBe(1);
  });
});
