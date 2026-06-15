import { describe, it, expect } from "vitest";
import {
  tagFailureModes,
  aggregateFailureModes,
} from "../src/laws/failure-mode-tagger.js";
import { computeExportRecovery } from "../src/laws/export-recovery.js";

const emptyRecovery = computeExportRecovery([], []);

describe("tagFailureModes", () => {
  it("returns empty when regen is perfect and compile-back ok", () => {
    const modes = tagFailureModes({
      ok: true,
      failure: undefined,
      recovery: computeExportRecovery(["A", "B"], ["A", "B"]),
    });
    expect(modes).toEqual([]);
  });

  it("flags compile_back_failed when ok=false and skips recovery-derived modes", () => {
    const modes = tagFailureModes({
      ok: false,
      failure: "dispatch_failed: timeout",
      recovery: emptyRecovery,
    });
    expect(modes).toEqual(["compile_back_failed"]);
  });

  it("flags missing_exports when regen drops some but not all mandatory", () => {
    const modes = tagFailureModes({
      ok: true,
      failure: undefined,
      recovery: computeExportRecovery(["A", "B", "C"], ["A"]),
    });
    expect(modes).toEqual(["missing_exports"]);
  });

  it("flags empty_regen (not missing_exports) when regen drops ALL mandatory", () => {
    const modes = tagFailureModes({
      ok: true,
      failure: undefined,
      recovery: computeExportRecovery(["A", "B"], []),
    });
    expect(modes).toEqual(["empty_regen"]);
  });

  it("can flag missing_exports AND hallucinated_exports simultaneously", () => {
    const modes = tagFailureModes({
      ok: true,
      failure: undefined,
      recovery: computeExportRecovery(["A", "B"], ["A", "Invented"]),
    });
    expect(modes).toEqual(["missing_exports", "hallucinated_exports"]);
  });

  it("does not fire recovery-derived modes when AST had no exports (vacuous)", () => {
    const modes = tagFailureModes({
      ok: true,
      failure: undefined,
      recovery: computeExportRecovery([], ["someExport"]),
    });
    expect(modes).toEqual([]);
  });

  it("flags gluing_rejected from a gluing failure message", () => {
    const modes = tagFailureModes({
      ok: false,
      failure: "intent_failed: gluing check: missing requirement OntologyNode",
      recovery: emptyRecovery,
    });
    expect(modes).toContain("compile_back_failed");
    expect(modes).toContain("gluing_rejected");
  });

  it("flags schema_invalid from parse-related failure text", () => {
    const modes = tagFailureModes({
      ok: false,
      failure: "validate_failed: TypeScript parser rejected the regenerated file",
      recovery: emptyRecovery,
    });
    expect(modes).toContain("schema_invalid");
  });

  it("does not double-tag schema_invalid when gluing_rejected already fired", () => {
    const modes = tagFailureModes({
      ok: false,
      failure: "gluing check rejected: schema check passed but missing requirement",
      recovery: emptyRecovery,
    });
    // Both keywords present — gluing_rejected wins, schema_invalid skipped.
    expect(modes).toContain("gluing_rejected");
    expect(modes).not.toContain("schema_invalid");
  });
});

describe("aggregateFailureModes", () => {
  it("counts every mode key explicitly (no implicit drops)", () => {
    const a = aggregateFailureModes([
      { nodeId: "n1", modes: ["missing_exports"] },
      { nodeId: "n2", modes: ["missing_exports", "hallucinated_exports"] },
      { nodeId: "n3", modes: [] },
    ]);
    expect(a.totalInspected).toBe(3);
    expect(a.affectedNodes).toBe(2);
    expect(a.counts.missing_exports).toBe(2);
    expect(a.counts.hallucinated_exports).toBe(1);
    expect(a.counts.empty_regen).toBe(0);
    expect(a.counts.compile_back_failed).toBe(0);
    expect(a.counts.gluing_rejected).toBe(0);
    expect(a.counts.schema_invalid).toBe(0);
  });

  it("preserves perNode breakdowns including empty modes (for 3γ cartography join)", () => {
    const a = aggregateFailureModes([
      { nodeId: "n1", modes: ["empty_regen"] },
      { nodeId: "n2", modes: [] },
    ]);
    expect(a.perNode).toEqual([
      { nodeId: "n1", modes: ["empty_regen"] },
      { nodeId: "n2", modes: [] },
    ]);
  });

  it("returns zeros across the board for an empty input", () => {
    const a = aggregateFailureModes([]);
    expect(a.affectedNodes).toBe(0);
    expect(a.totalInspected).toBe(0);
    expect(a.counts.missing_exports).toBe(0);
    expect(a.perNode).toEqual([]);
  });
});
