import { describe, it, expect } from "vitest";
import { classifyRule, extractStaticSymbol, checkRules } from "../src/inverse/rule-checker.js";

// Rule enforcement: classify a node's rules and statically check the decidable
// ones. The live graph has ~0 statically-decidable rules (they're behavioural
// prose), so these pin the static path on CLEAN synthetic rules — the capability
// the corpus doesn't exercise — plus the honest triage of the messy classes.

describe("rule-checker — classification", () => {
  it("forbid of a clean identifier is static; a forbidden CONDITION is behavioural", () => {
    expect(classifyRule("FORBID: console.log")).toEqual({ ruleClass: "forbid_static", symbol: "console.log" });
    expect(classifyRule("FORBID: eval")).toEqual({ ruleClass: "forbid_static", symbol: "eval" });
    // A phrase, not a symbol → not statically checkable.
    expect(classifyRule("FORBID: combining --literal and --clear-literal").ruleClass).toBe("behavioural");
    expect(classifyRule("FORBID: verdicts other than pass/fail/untested").ruleClass).toBe("behavioural");
  });

  it("require of a named export is static; a behavioural REQUIRE is not", () => {
    expect(classifyRule("MUST export createNode")).toEqual({ ruleClass: "require_static", symbol: "createNode" });
    expect(classifyRule("REQUIRE: selectBestByScore returns undefined when candidates is empty").ruleClass).toBe("behavioural");
  });

  it("meta properties and prose are distinguished", () => {
    expect(classifyRule("REQUIRE: foo is a pure function with no side effects").ruleClass).toBe("meta");
    expect(classifyRule("REQUIRE: the result is idempotent").ruleClass).toBe("meta");
    // No imperative marker → prose / canon axiom / extraction noise.
    expect(classifyRule("Ontology is a typed, temporal, directed graph").ruleClass).toBe("prose");
    expect(classifyRule("reading the current state from the file system").ruleClass).toBe("prose");
  });

  it("extractStaticSymbol only fires on a whole-remainder identifier", () => {
    expect(extractStaticSymbol("FORBID: console.log", "forbid")).toBe("console.log");
    expect(extractStaticSymbol("FORBID: console.log()", "forbid")).toBe("console.log");
    expect(extractStaticSymbol("FORBID: network access", "forbid")).toBeNull();
    expect(extractStaticSymbol("MUST export createNode", "require")).toBe("createNode");
  });
});

describe("rule-checker — static enforcement against an artifact", () => {
  it("FAILS a FORBID rule when the symbol is present in real code (not a comment)", () => {
    const code = `export function f(x: number) {\n  console.log(x);\n  return x;\n}\n`;
    const r = checkRules({ nodeId: "node_0001", rules: ["FORBID: console.log"], artifactText: code });
    expect(r.violations).toBe(1);
    expect(r.checks[0].verdict).toBe("fail");
  });

  it("PASSES a FORBID rule when the symbol appears only in a comment", () => {
    const code = `export function f(x: number) {\n  // never call console.log here\n  return x;\n}\n`;
    const r = checkRules({ nodeId: "node_0001", rules: ["FORBID: console.log"], artifactText: code });
    expect(r.violations).toBe(0);
    expect(r.checks[0].verdict).toBe("pass");
  });

  it("does not self-violate on the rule's own grounding-block annotation", () => {
    const code = `/*\n * @ontology:rules v1\n * - FORBID: console.log\n * @ontology:end-rules */\nexport const x = 1;\n`;
    const r = checkRules({ nodeId: "node_0001", rules: ["FORBID: console.log"], artifactText: code });
    expect(r.checks[0].verdict).toBe("pass");
  });

  it("checks a REQUIRE-symbol rule: present → pass, missing → fail", () => {
    const present = checkRules({ nodeId: "n", rules: ["MUST export createNode"], artifactText: "export function createNode(){}\n" });
    expect(present.checks[0].verdict).toBe("pass");
    const missing = checkRules({ nodeId: "n", rules: ["MUST export createNode"], artifactText: "export function other(){}\n" });
    expect(missing.checks[0].verdict).toBe("fail");
  });

  it("triages a mixed rule set without false-accusing prose", () => {
    const r = checkRules({
      nodeId: "n",
      artifactText: "export function f(){ return 1 }\n",
      rules: [
        "FORBID: console.log", // static pass (absent)
        "REQUIRE: f returns a number when called", // behavioural
        "REQUIRE: f is pure", // meta
        "Ontology is a graph", // prose
      ],
    });
    expect(r.staticChecked).toBe(1);
    expect(r.violations).toBe(0);
    expect(r.behavioural).toBe(1);
    expect(r.meta).toBe(1);
    expect(r.prose).toBe(1);
  });
});
