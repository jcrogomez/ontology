import { describe, it, expect } from "vitest";
import {
  computeNodeLoss,
  aggregateLoss,
  lossFromResults,
} from "../src/runtime/legend/loss-breakdown.js";

describe("loss-breakdown / computeNodeLoss", () => {
  it("perfect round trip → jaccard/recall/precision all 1, nothing lost", () => {
    const l = computeNodeLoss("n", ["add", "K"], ["K", "add"]);
    expect(l.jaccard).toBe(1);
    expect(l.recall).toBe(1);
    expect(l.precision).toBe(1);
    expect(l.dropped).toEqual([]);
    expect(l.overEmitted).toEqual([]);
    expect(l.preserved).toEqual(["K", "add"]);
  });

  it("pure recall loss (regen dropped a declaration)", () => {
    const l = computeNodeLoss("n", ["a", "b", "c"], ["a", "b"]);
    expect(l.recall).toBeCloseTo(2 / 3);
    expect(l.precision).toBe(1); // everything emitted was legitimate
    expect(l.dropped).toEqual(["c"]);
    expect(l.overEmitted).toEqual([]);
  });

  it("pure precision loss (regen over-emitted = the over-stuffing mode)", () => {
    const l = computeNodeLoss("n", ["a"], ["a", "x", "y", "z"]);
    expect(l.recall).toBe(1); // nothing original was dropped
    expect(l.precision).toBeCloseTo(1 / 4);
    expect(l.overEmitted).toEqual(["x", "y", "z"]);
    expect(l.dropped).toEqual([]);
  });

  it("mixed (a rename drops one and over-emits one)", () => {
    const l = computeNodeLoss("n", ["add", "K"], ["plus", "K"]);
    expect(l.dropped).toEqual(["add"]);
    expect(l.overEmitted).toEqual(["plus"]);
    expect(l.jaccard).toBeCloseTo(1 / 3); // ∩={K}, ∪={add,plus,K}
  });

  it("both empty → vacuously perfect", () => {
    const l = computeNodeLoss("n", [], []);
    expect(l.jaccard).toBe(1);
    expect(l.recall).toBe(1);
    expect(l.precision).toBe(1);
  });

  it("dedupes repeated declarations", () => {
    const l = computeNodeLoss("n", ["a", "a", "b"], ["a", "a"]);
    expect(l.originalCount).toBe(2);
    expect(l.regenCount).toBe(1);
    expect(l.dropped).toEqual(["b"]);
  });
});

describe("loss-breakdown / aggregateLoss", () => {
  const losses = [
    computeNodeLoss("perfect", ["a", "b"], ["a", "b"]),
    computeNodeLoss("dropper", ["a", "b", "c", "d"], ["a"]), // 3 dropped
    computeNodeLoss("overemit", ["a"], ["a", "x", "y"]), // 2 over-emitted
  ];

  it("counts perfect nodes and totals each direction", () => {
    const agg = aggregateLoss(losses);
    expect(agg.nodeCount).toBe(3);
    expect(agg.perfectCount).toBe(1);
    expect(agg.totalDropped).toBe(3);
    expect(agg.totalOverEmitted).toBe(2);
  });

  it("ranks worst droppers and worst over-emitters separately", () => {
    const agg = aggregateLoss(losses);
    expect(agg.worstDroppers[0].nodeId).toBe("dropper");
    expect(agg.worstOverEmitters[0].nodeId).toBe("overemit");
  });

  it("labels the dominant failure direction", () => {
    // recall hurt more (a 4→1 drop) than precision (a 1→3 over-emit)
    const agg = aggregateLoss(losses);
    expect(["recall-bound", "precision-bound", "balanced"]).toContain(
      agg.dominantFailure,
    );
  });
});

describe("loss-breakdown / lossFromResults", () => {
  it("reads verify-report-shaped results and skips nodes without metrics", () => {
    const losses = lossFromResults([
      { nodeId: "n1", metrics: { originalDeclarations: ["a", "b"], regenDeclarations: ["a"] } },
      { nodeId: "n2", metrics: null }, // unrecoverable / cache hit — skipped
      { nodeId: "n3", metrics: { originalDeclarations: ["x"], regenDeclarations: ["x"] } },
    ]);
    expect(losses.map((l) => l.nodeId)).toEqual(["n1", "n3"]);
    expect(losses[0].dropped).toEqual(["b"]);
  });
});
