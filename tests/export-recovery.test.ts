import { describe, it, expect } from "vitest";
import {
  computeExportRecovery,
  aggregateExportRecovery,
} from "../src/runtime/legend/export-recovery.js";

describe("computeExportRecovery", () => {
  it("returns 100% recovery when regen exactly matches AST", () => {
    const r = computeExportRecovery(["A", "B", "C"], ["A", "B", "C"]);
    expect(r.exportRecoveryRate).toBe(1.0);
    expect(r.hallucinationRate).toBe(0);
    expect(r.exactExportSetMatch).toBe(true);
    expect(r.missingMandatoryExports).toEqual([]);
    expect(r.hallucinatedExports).toEqual([]);
  });

  it("returns 0% recovery when the regen drops every mandatory (the δ' floor case)", () => {
    const r = computeExportRecovery(["OntologyNode", "OntologyEdge"], []);
    expect(r.exportRecoveryRate).toBe(0);
    expect(r.missingMandatoryExports).toEqual(["OntologyNode", "OntologyEdge"]);
    expect(r.exactExportSetMatch).toBe(false);
  });

  it("partials correctly when some are recovered and some dropped", () => {
    const r = computeExportRecovery(["A", "B", "C", "D"], ["A", "C"]);
    expect(r.recoveredMandatoryExports).toEqual(["A", "C"]);
    expect(r.missingMandatoryExports).toEqual(["B", "D"]);
    expect(r.exportRecoveryRate).toBe(0.5);
    expect(r.hallucinationRate).toBe(0);
    expect(r.exactExportSetMatch).toBe(false);
  });

  it("flags hallucinations separately from missing", () => {
    const r = computeExportRecovery(["A", "B"], ["A", "Invented"]);
    expect(r.recoveredMandatoryExports).toEqual(["A"]);
    expect(r.missingMandatoryExports).toEqual(["B"]);
    expect(r.hallucinatedExports).toEqual(["Invented"]);
    expect(r.exportRecoveryRate).toBe(0.5);
    expect(r.hallucinationRate).toBe(0.5);
    expect(r.exactExportSetMatch).toBe(false);
  });

  it("returns recoveryRate=1.0 (vacuously perfect) when AST has no exports", () => {
    const r = computeExportRecovery([], []);
    expect(r.exportRecoveryRate).toBe(1.0);
    expect(r.exactExportSetMatch).toBe(true);
  });

  it("returns hallucinationRate=0 when regen produced nothing", () => {
    const r = computeExportRecovery(["A"], []);
    expect(r.hallucinationRate).toBe(0);
    expect(r.regeneratedExportsCount).toBe(0);
  });

  it("preserves AST order in recovered / missing, regen order in hallucinated", () => {
    const r = computeExportRecovery(["A", "B", "C"], ["C", "X", "A"]);
    expect(r.recoveredMandatoryExports).toEqual(["A", "C"]);
    expect(r.missingMandatoryExports).toEqual(["B"]);
    expect(r.hallucinatedExports).toEqual(["X"]);
  });
});

describe("aggregateExportRecovery", () => {
  it("computes micro and macro across nodes, ignoring vacuous ones", () => {
    const reports = [
      { nodeId: "n1", recovery: computeExportRecovery(["A", "B"], ["A", "B"]) }, // 1.0 (2/2)
      { nodeId: "n2", recovery: computeExportRecovery(["A", "B", "C", "D"], ["A"]) }, // 0.25 (1/4)
      { nodeId: "n3", recovery: computeExportRecovery([], []) }, // vacuous — ignored
    ];
    const a = aggregateExportRecovery(reports);
    expect(a.nodesWithMandatory).toBe(2);
    expect(a.totalMandatory).toBe(6);
    expect(a.totalRecovered).toBe(3);
    expect(a.totalMissing).toBe(3);
    expect(a.microRecoveryRate).toBe(3 / 6);
    expect(a.macroRecoveryRate).toBe((1.0 + 0.25) / 2);
    expect(a.exactMatchCount).toBe(1);
  });

  it("returns zeros across the board for an empty input", () => {
    const a = aggregateExportRecovery([]);
    expect(a.nodesWithMandatory).toBe(0);
    expect(a.microRecoveryRate).toBe(0);
    expect(a.macroRecoveryRate).toBe(0);
    expect(a.exactMatchCount).toBe(0);
  });

  it("captures the δ' pattern (most nodes fail recovery, a few succeed)", () => {
    // 10 nodes: 8 with 0 recovery (each had 5 mandatory), 2 perfect (each had 5 mandatory)
    const reports = [];
    for (let i = 0; i < 8; i++) {
      reports.push({
        nodeId: `n${i}`,
        recovery: computeExportRecovery(["a", "b", "c", "d", "e"], []),
      });
    }
    for (let i = 8; i < 10; i++) {
      reports.push({
        nodeId: `n${i}`,
        recovery: computeExportRecovery(
          ["a", "b", "c", "d", "e"],
          ["a", "b", "c", "d", "e"],
        ),
      });
    }
    const a = aggregateExportRecovery(reports);
    expect(a.nodesWithMandatory).toBe(10);
    expect(a.totalMandatory).toBe(50);
    expect(a.totalRecovered).toBe(10);
    expect(a.microRecoveryRate).toBe(10 / 50); // 0.2
    expect(a.macroRecoveryRate).toBe((8 * 0 + 2 * 1.0) / 10); // 0.2 here, but micro/macro can diverge
    expect(a.exactMatchCount).toBe(2);
  });
});
