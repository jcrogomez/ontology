// §3.10 — verdict-map variance measurement core (the quantitative ε).
//
// This pins the deterministic measurement core that turns the §3.10 adjoint
// claim from "is the verdict map deterministic? (binary, unprovable on a real
// LLM)" into "how concentrated is the verdict distribution? (measured)". The
// core is pure; the real N-run sample generation is budget/frontier-gated and
// deferred. These tests prove: (1) identical samples → zero variance (the mock
// provider / deterministic-plumbing case), and (2) the spread statistics are
// computed correctly when samples disagree.

import { describe, it, expect } from "vitest";
import { measureNodeVariance, aggregateVariance } from "../src/runtime/legend/verdict-variance.js";

// Fixtures (python hint → regex declaration parser, fully deterministic).
const ORIGINAL = ["def foo():", "    return 1", "", "def bar():", "    return 2"].join("\n");

// Same declarations {bar, foo}, same line count → ε-equivalent.
const EPS = ORIGINAL;

// Same line count, different declarations {alpha, beta} → divergent_structural.
const DIV_STRUCTURAL = ["def alpha():", "    return 1", "", "def beta():", "    return 2"].join("\n");

// Same declarations {bar, foo}, much larger line count → divergent_loc.
const DIV_LOC = [
  "def foo():",
  "    a = 1",
  "    b = 2",
  "    c = 3",
  "    return a",
  "",
  "def bar():",
  "    d = 4",
  "    return d",
].join("\n");

describe("§3.10 verdict-map variance — measurement core", () => {
  it("identical samples → zero variance (deterministic-plumbing / mock-provider case)", () => {
    const r = measureNodeVariance("n1", ORIGINAL, [EPS, EPS, EPS], "python");
    expect(r.n).toBe(3);
    expect(r.modalVerdict).toBe("epsilon_equivalent");
    expect(r.verdictCounts.epsilon_equivalent).toBe(3);
    expect(r.agreementRate).toBe(1); // verdict map reproduced deterministically
    expect(r.verdictEntropyBits).toBe(0);
    expect(r.jaccardStdev).toBe(0);
    expect(r.locStdev).toBe(0);
    expect(r.recoverable).toBe(3);
  });

  it("disagreeing samples → measured spread (agreement < 1, entropy > 0)", () => {
    // 3 ε-equivalent + 1 divergent_structural.
    const r = measureNodeVariance("n2", ORIGINAL, [EPS, EPS, EPS, DIV_STRUCTURAL], "python");
    expect(r.verdictCounts.epsilon_equivalent).toBe(3);
    expect(r.verdictCounts.divergent_structural).toBe(1);
    expect(r.modalVerdict).toBe("epsilon_equivalent");
    expect(r.agreementRate).toBeCloseTo(0.75, 10);
    // H = -(0.75 log2 0.75 + 0.25 log2 0.25) ≈ 0.8113 bits
    expect(r.verdictEntropyBits).toBeCloseTo(0.8112781, 5);
    expect(r.jaccardStdev).toBeGreaterThan(0);
  });

  it("classifies the loc / structural / equivalent fixtures distinctly (sanity of the fold)", () => {
    expect(measureNodeVariance("e", ORIGINAL, [EPS], "python").modalVerdict).toBe("epsilon_equivalent");
    expect(measureNodeVariance("s", ORIGINAL, [DIV_STRUCTURAL], "python").modalVerdict).toBe("divergent_structural");
    expect(measureNodeVariance("l", ORIGINAL, [DIV_LOC], "python").modalVerdict).toBe("divergent_loc");
  });

  it("counts compile-back failures (null samples) as unrecoverable, excluded from metric stats", () => {
    const r = measureNodeVariance("n3", ORIGINAL, [EPS, null, DIV_LOC], "python");
    expect(r.n).toBe(3);
    expect(r.verdictCounts.unrecoverable).toBe(1);
    expect(r.verdictCounts.epsilon_equivalent).toBe(1);
    expect(r.verdictCounts.divergent_loc).toBe(1);
    expect(r.recoverable).toBe(2); // metric stats over the 2 non-null samples
    expect(r.agreementRate).toBeCloseTo(1 / 3, 10);
  });

  it("aggregate summarises adjoint stability across nodes", () => {
    const deterministic = measureNodeVariance("a", ORIGINAL, [EPS, EPS], "python");
    const noisy = measureNodeVariance("b", ORIGINAL, [EPS, DIV_STRUCTURAL], "python");
    const agg = aggregateVariance([deterministic, noisy]);
    expect(agg.nodeCount).toBe(2);
    expect(agg.fullyDeterministicFraction).toBe(0.5); // one node never varied
    expect(agg.meanAgreementRate).toBeCloseTo((1 + 0.5) / 2, 10);
    expect(agg.meanVerdictEntropyBits).toBeCloseTo((0 + 1) / 2, 10); // noisy node = 1 bit
  });

  it("empty input is handled without NaN", () => {
    const agg = aggregateVariance([]);
    expect(agg.nodeCount).toBe(0);
    expect(agg.meanAgreementRate).toBe(0);
    expect(agg.meanVerdictEntropyBits).toBe(0);
  });
});
