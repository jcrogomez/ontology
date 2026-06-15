import { describe, it, expect } from "vitest";
import {
  computeDistanceMetrics,
  classifyVerdict,
  extractTopLevelDeclarations,
  inferLanguageHint,
  DEFAULT_THRESHOLDS,
  emptyVerdictCounts,
} from "../../../src/laws/verify-homeomorphism.js";

// Coverage for the pure δ-2 (verify-homeomorphism) comparison library.
// Three groups:
//   1. Top-level declaration extraction (Python regex + TS via the
//      γ-4 parser).
//   2. Distance metric math — LoC and Jaccard, including edge cases
//      (empty files, identical files, fully disjoint sets).
//   3. Verdict folder — the 2D threshold table.
//
// IO and compile-back integration are tested at the CLI level; this
// file pins the math the entire δ-2 stack relies on.

describe("extractTopLevelDeclarations — Python", () => {
  it("captures top-level def and class", () => {
    const src = `
def foo():
    pass

class Bar:
    pass

def baz(x, y):
    return x + y
`;
    expect(extractTopLevelDeclarations(src, "python")).toEqual(["Bar", "baz", "foo"]);
  });

  it("ignores nested def inside a function", () => {
    const src = `
def outer():
    def inner():
        return 1
    return inner

class Cls:
    def method(self):
        pass
`;
    // outer + Cls only — inner and method are indented, regex demands col 0.
    expect(extractTopLevelDeclarations(src, "python")).toEqual(["Cls", "outer"]);
  });

  it("deduplicates name collisions (def then class with same name)", () => {
    const src = `
def foo():
    pass

class foo:
    pass
`;
    expect(extractTopLevelDeclarations(src, "python")).toEqual(["foo"]);
  });

  it("returns empty for a file with no top-level defs", () => {
    const src = `
import os
x = 1
y = 2
print(x + y)
`;
    expect(extractTopLevelDeclarations(src, "python")).toEqual([]);
  });

  it("handles class with no parentheses (class Bar: pass)", () => {
    const src = `class Bar:\n    pass\n`;
    expect(extractTopLevelDeclarations(src, "python")).toEqual(["Bar"]);
  });
});

describe("extractTopLevelDeclarations — TypeScript", () => {
  it("captures named exports", () => {
    const src = `
export const foo = 1;
export function bar() {}
export class Baz {}
const private_x = 1;
`;
    const decls = extractTopLevelDeclarations(src, "typescript");
    expect(decls.sort()).toEqual(["Baz", "bar", "foo"]);
  });

  it("ignores 'default' export name", () => {
    const src = `
export default function foo() {}
export const bar = 1;
`;
    const decls = extractTopLevelDeclarations(src, "typescript");
    // 'default' is filtered; foo's local name is not surfaced (it's
    // the default export, surfaced as 'default' and stripped).
    expect(decls).toEqual(["bar"]);
  });

  it("returns empty for a file with no exports", () => {
    const src = `const x = 1;\nfunction y() {}\n`;
    expect(extractTopLevelDeclarations(src, "typescript")).toEqual([]);
  });
});

describe("extractTopLevelDeclarations — unknown language", () => {
  it("returns empty", () => {
    expect(extractTopLevelDeclarations("anything", "unknown")).toEqual([]);
  });
});

describe("inferLanguageHint", () => {
  it("classifies common extensions", () => {
    expect(inferLanguageHint("/a/b/c.ts")).toBe("typescript");
    expect(inferLanguageHint("/a/b/c.tsx")).toBe("typescript");
    expect(inferLanguageHint("/a/b/c.py")).toBe("python");
    expect(inferLanguageHint("/a/b/c.rs")).toBe("unknown");
    expect(inferLanguageHint("/a/b/c")).toBe("unknown");
  });
});

describe("computeDistanceMetrics — LoC distance", () => {
  it("is 0 for identical files", () => {
    const a = "line1\nline2\nline3\n";
    const m = computeDistanceMetrics(a, a, "python");
    expect(m.locDistance).toBe(0);
    expect(m.originalLineCount).toBe(3);
    expect(m.regenLineCount).toBe(3);
  });

  it("strips a single trailing newline before counting", () => {
    // "a\nb" (2 lines) vs "a\nb\n" (still 2 once trailing newline
    // stripped) — should read identical.
    const m = computeDistanceMetrics("a\nb", "a\nb\n", "python");
    expect(m.originalLineCount).toBe(2);
    expect(m.regenLineCount).toBe(2);
    expect(m.locDistance).toBe(0);
  });

  it("scales symmetrically with line-count delta", () => {
    // 10 vs 13 lines → |3| / 13 ≈ 0.231
    const a = "x\n".repeat(10).trimEnd() + "\n";
    const b = "x\n".repeat(13).trimEnd() + "\n";
    const m = computeDistanceMetrics(a, b, "python");
    expect(m.locDistance).toBeCloseTo(3 / 13, 4);
  });

  it("returns 1 when one file is empty", () => {
    const m = computeDistanceMetrics("", "line1\nline2\n", "python");
    expect(m.locDistance).toBe(1);
    expect(m.originalLineCount).toBe(0);
    expect(m.regenLineCount).toBe(2);
  });

  it("handles both files empty as 0", () => {
    const m = computeDistanceMetrics("", "", "python");
    expect(m.locDistance).toBe(0);
  });
});

describe("computeDistanceMetrics — structural Jaccard", () => {
  it("is 1 for identical declaration sets", () => {
    const a = `def foo(): pass\ndef bar(): pass\n`;
    const b = `def bar(): pass\ndef foo(): pass\n`; // reordered
    const m = computeDistanceMetrics(a, b, "python");
    expect(m.structuralJaccard).toBe(1);
  });

  it("is 0 when sets are fully disjoint", () => {
    const a = `def foo(): pass\n`;
    const b = `def bar(): pass\n`;
    const m = computeDistanceMetrics(a, b, "python");
    expect(m.structuralJaccard).toBe(0);
  });

  it("computes |A∩B|/|A∪B| for partial overlap", () => {
    const a = `def a(): pass\ndef b(): pass\ndef c(): pass\n`;
    const b = `def b(): pass\ndef c(): pass\ndef d(): pass\n`;
    // A∩B = {b, c} (size 2); A∪B = {a, b, c, d} (size 4) → 0.5
    const m = computeDistanceMetrics(a, b, "python");
    expect(m.structuralJaccard).toBe(0.5);
  });

  it("returns 1 when both declaration sets are empty (vacuous)", () => {
    const m = computeDistanceMetrics("x = 1\n", "y = 2\n", "python");
    expect(m.structuralJaccard).toBe(1);
  });

  it("captures the Vibe-Reasoning rename pattern (solve_max_fooling_set → max_fooling_set)", () => {
    const a = `def solve_max_fooling_set(n): pass\n`;
    const b = `def max_fooling_set(n): pass\n`;
    const m = computeDistanceMetrics(a, b, "python");
    expect(m.structuralJaccard).toBe(0);
    // LoC distance is small (both are one-liners) — the verdict
    // folder will mark this divergent_structural.
    expect(m.locDistance).toBe(0);
  });
});

describe("classifyVerdict", () => {
  it("epsilon_equivalent when both metrics pass", () => {
    const m = {
      locDistance: 0.1,
      structuralJaccard: 0.9,
      originalLineCount: 50,
      regenLineCount: 55,
      originalDeclarations: ["foo", "bar"],
      regenDeclarations: ["foo", "bar"],
    };
    expect(classifyVerdict(m)).toBe("epsilon_equivalent");
  });

  it("divergent_loc when LoC over but structure ok", () => {
    const m = {
      locDistance: 0.5,
      structuralJaccard: 0.9,
      originalLineCount: 20,
      regenLineCount: 40,
      originalDeclarations: ["foo"],
      regenDeclarations: ["foo"],
    };
    expect(classifyVerdict(m)).toBe("divergent_loc");
  });

  it("divergent_structural when LoC ok but structure fails", () => {
    const m = {
      locDistance: 0.1,
      structuralJaccard: 0.2,
      originalLineCount: 50,
      regenLineCount: 55,
      originalDeclarations: ["foo", "bar"],
      regenDeclarations: ["baz", "qux"],
    };
    expect(classifyVerdict(m)).toBe("divergent_structural");
  });

  it("divergent_both when neither passes", () => {
    const m = {
      locDistance: 0.6,
      structuralJaccard: 0.2,
      originalLineCount: 20,
      regenLineCount: 50,
      originalDeclarations: ["foo"],
      regenDeclarations: ["bar"],
    };
    expect(classifyVerdict(m)).toBe("divergent_both");
  });

  it("honors custom thresholds (strict — Jaccard 0.9, LoC 0.1)", () => {
    const m = {
      locDistance: 0.15,
      structuralJaccard: 0.85,
      originalLineCount: 100,
      regenLineCount: 117,
      originalDeclarations: ["foo"],
      regenDeclarations: ["foo"],
    };
    // Default thresholds: both pass → ε-equiv. Strict: both fail.
    expect(classifyVerdict(m)).toBe("epsilon_equivalent");
    expect(classifyVerdict(m, { loc: 0.1, jaccard: 0.9 })).toBe("divergent_both");
  });
});

describe("emptyVerdictCounts", () => {
  it("returns a zero-initialised tally for every verdict label", () => {
    const c = emptyVerdictCounts();
    expect(c.epsilon_equivalent).toBe(0);
    expect(c.divergent_loc).toBe(0);
    expect(c.divergent_structural).toBe(0);
    expect(c.divergent_both).toBe(0);
    expect(c.unrecoverable).toBe(0);
  });
});

describe("integration — Vibe-Reasoning calibration shapes", () => {
  // Synthetic recreations of the four divergence patterns observed in
  // the live test (n=4 successful compile-backs). The thresholds are
  // the defaults; these pin the per-file verdicts the live run
  // produced.

  it("node_0006 (check_all_right): docstring drift only → ε-equivalent", () => {
    // Real ratio observed in the live calibration: 49 → 55 lines,
    // ~11% LoC delta — well under the 30% default threshold. Build
    // synthetic strings that match the ratio so the verdict folder
    // is exercised the same way.
    const original = [
      "import random",
      ...Array.from({ length: 46 }, (_, i) => `# original body line ${i + 1}`),
      "def is_conflict(p1, p2, holes): return True",
      "def get_adjacent_neighbors(p): return {}",
      "def check_all_right(n, perm, holes_set): return True, None",
    ].join("\n") + "\n";
    const regen = [
      "import random",
      ...Array.from({ length: 50 }, (_, i) => `# regen body line ${i + 1}`),
      "def is_conflict(p1, p2, holes): return True",
      "def get_adjacent_neighbors(p): return {}",
      "def check_all_right(n, perm, holes_set): return True, None",
      "if __name__ == '__main__': pass",
    ].join("\n") + "\n";
    const m = computeDistanceMetrics(original, regen, "python");
    // Same three declarations preserved.
    expect(m.structuralJaccard).toBe(1);
    // LoC delta ~11% (49→55). Under the 30% default threshold.
    expect(m.locDistance).toBeLessThan(DEFAULT_THRESHOLDS.loc);
    expect(classifyVerdict(m)).toBe("epsilon_equivalent");
  });

  it("node_0011 (check_fooling_set): rename → divergent_structural", () => {
    const original = `def solve_max_fooling_set(n):
    return []
`;
    const regen = `def max_fooling_set(n):
    return []
`;
    const m = computeDistanceMetrics(original, regen, "python");
    expect(m.structuralJaccard).toBe(0);
    expect(classifyVerdict(m)).toBe("divergent_structural");
  });

  it("node_0020 (verify_general_bound): decomposition change → divergent_both", () => {
    // Original: 4 small funcs, ~100 lines.
    const original = `${"x\n".repeat(100)}def get_holes(): pass
def is_conflict(): pass
def check_clique(): pass
def solve_n(): pass
`;
    // Regen: 2 funcs, ~60 lines.
    const regen = `${"x\n".repeat(57)}def max_clique(): pass
def worst_case_max_clique(): pass
`;
    const m = computeDistanceMetrics(original, regen, "python");
    expect(m.structuralJaccard).toBe(0);
    expect(m.locDistance).toBeGreaterThan(DEFAULT_THRESHOLDS.loc);
    expect(classifyVerdict(m)).toBe("divergent_both");
  });
});
