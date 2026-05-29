import { describe, it, expect } from "vitest";
import {
  computeDistanceMetrics,
  classifyVerdict,
  type DistanceMetrics,
  type HomeomorphismVerdict,
} from "../src/runtime/legend/verify-homeomorphism.js";

// Verdict-map determinism evidence — MATHEMATICAL_CLAIMS.md §3.10 (T2).
//
// §3.10's named T1 gate is "verify-homeomorphism returns the same
// verdict map deterministically across runs at temperature = 0". The
// end-to-end version of that is bounded by the LLM provider's own
// temp-0 determinism, which for real models is empirically partial —
// so it is NOT pinned here and §3.10 stays T2.
//
// What IS pinnable, and what these tests pin, is the half of the
// property that is OURS: the verdict map is a deterministic,
// order-independent FUNCTION of the model outputs. The comparison
// pipeline (computeDistanceMetrics → classifyVerdict) is pure — no
// LLM, no clock, no randomness — so given fixed (original, regen)
// pairs the per-node verdict and the whole verdict map reproduce
// exactly. This is T2 strengthening evidence (our pipeline injects no
// nondeterminism: no Set/Map iteration-order leak, no Date/random),
// not a T1 claim about the adjoint.

const ORIGINAL = `export function add(a: number, b: number) {\n  return a + b;\n}\nexport const K = 1;\n`;
// Identical regen → ε-equivalent (loc 0, jaccard 1).
const REGEN_SAME = ORIGINAL;
// Renamed export → structurally divergent (jaccard 1/3 < 0.5, loc 0).
const REGEN_RENAMED = `export function plus(a: number, b: number) {\n  return a + b;\n}\nexport const K = 1;\n`;
// Same declarations, padded with comments → divergent_loc (loc 0.71, jaccard 1).
const REGEN_BLOATED =
  ORIGINAL + Array.from({ length: 10 }, () => "// pad").join("\n") + "\n";

describe("§3.10 evidence / computeDistanceMetrics is referentially transparent", () => {
  it("returns deep-equal metrics across repeated calls on the same inputs", () => {
    const runs: DistanceMetrics[] = Array.from({ length: 5 }, () =>
      computeDistanceMetrics(ORIGINAL, REGEN_RENAMED, "typescript", "x.ts"),
    );
    for (const r of runs) expect(r).toEqual(runs[0]);
  });

  it("returns declaration lists in a stable (sorted) order", () => {
    const m = computeDistanceMetrics(ORIGINAL, REGEN_RENAMED, "typescript", "x.ts");
    expect(m.originalDeclarations).toEqual([...m.originalDeclarations].sort());
    expect(m.regenDeclarations).toEqual([...m.regenDeclarations].sort());
  });
});

describe("§3.10 evidence / classifyVerdict is a deterministic, total fold", () => {
  it("maps the three representative inputs to stable labels", () => {
    const cases: [string, HomeomorphismVerdict][] = [
      [REGEN_SAME, "epsilon_equivalent"],
      [REGEN_RENAMED, "divergent_structural"],
      [REGEN_BLOATED, "divergent_loc"],
    ];
    for (const [regen, expected] of cases) {
      const m = computeDistanceMetrics(ORIGINAL, regen, "typescript", "x.ts");
      // Repeated folds of the same metrics agree, and match the label.
      const v1 = classifyVerdict(m);
      const v2 = classifyVerdict(m);
      expect(v1).toBe(expected);
      expect(v2).toBe(v1);
    }
  });
});

describe("§3.10 evidence / verdict map is deterministic and order-independent", () => {
  // A "verdict map" is {nodeId -> verdict} folded over a set of
  // (original, regen) pairs. Determinism of the map reduces to
  // determinism of the per-pair fold (pinned above); here we also pin
  // that the map does not depend on the order nodes are processed.
  type Pair = { nodeId: string; original: string; regen: string };
  const pairs: Pair[] = [
    { nodeId: "n_same", original: ORIGINAL, regen: REGEN_SAME },
    { nodeId: "n_renamed", original: ORIGINAL, regen: REGEN_RENAMED },
    { nodeId: "n_bloated", original: ORIGINAL, regen: REGEN_BLOATED },
  ];

  function buildVerdictMap(input: Pair[]): Record<string, HomeomorphismVerdict> {
    const map: Record<string, HomeomorphismVerdict> = {};
    for (const p of input) {
      const m = computeDistanceMetrics(p.original, p.regen, "typescript", `${p.nodeId}.ts`);
      map[p.nodeId] = classifyVerdict(m);
    }
    return map;
  }

  it("produces the same map across two runs", () => {
    expect(buildVerdictMap(pairs)).toEqual(buildVerdictMap(pairs));
  });

  it("produces the same map regardless of node processing order", () => {
    const forward = buildVerdictMap(pairs);
    const reversed = buildVerdictMap([...pairs].reverse());
    expect(reversed).toEqual(forward);
    expect(forward).toEqual({
      n_same: "epsilon_equivalent",
      n_renamed: "divergent_structural",
      n_bloated: "divergent_loc",
    });
  });
});
