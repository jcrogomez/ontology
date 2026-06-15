import { describe, it, expect } from "vitest";
import { checkContract } from "../src/runtime/legend/contract-checker.js";
import { RESOLVED_SIGNATURE_PREFIX } from "../src/inverse/static/typescript-resolved.js";
import {
  verdictToMatrixCell,
  honestyForCell,
  buildMatrixCost,
  verdictDerivedTags,
} from "../src/runtime/legend/matrix.js";

// Contract-axis checker v0 — the spec §5 scenario table, pinned 1:1
// (docs/legend/CONTRACT_AXIS_CHECKER_SPEC.md). The conservative law
// under test: an incomparable signature must NEVER produce a `fail`
// (unknown ⇒ do-not-accuse — the reverse of gluing's unknown ⇒ conflict).

const cost = buildMatrixCost({ provider: "mock", model: "mock", task: "code_sketch" });

describe("checkContract (spec §5 scenarios)", () => {
  it("(a) no regen text → not-measured", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [{ key: "fn" }],
      regenText: undefined,
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("not-measured");
    expect(r.reason).toBe("no_regen");
  });

  it("(b) empty declared contract → unknown (contract-missing)", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [],
      regenText: "export const x = 1;",
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("unknown");
    expect(r.reason).toBe("no_declared_contract");
  });

  it("(c) all keys exported with string-equal signatures → pass", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [
        { key: "add", signature: "(a: number, b: number): number" },
        { key: "name" }, // presence-only declaration
      ],
      regenText: `
        export function add(a: number, b: number): number { return a + b; }
        export const name = "x";
      `,
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("pass");
    expect(r.reason).toBe("satisfied");
    expect(r.missingKeys).toEqual([]);
    expect(r.driftedKeys).toEqual([]);
  });

  it("(d) a declared key absent from the regen → fail with missingKeys", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [{ key: "add" }, { key: "vanished" }],
      regenText: `export function add(a: number, b: number) { return a + b; }`,
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("fail");
    expect(r.reason).toBe("missing_keys");
    expect(r.missingKeys).toEqual(["vanished"]);
  });

  it("(e) comparable signature drift → fail with driftedKeys", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [{ key: "add", signature: "(a: number, b: number): number" }],
      regenText: `export function add(a: string): string { return a; }`,
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("fail");
    expect(r.reason).toBe("signature_drift");
    expect(r.driftedKeys).toHaveLength(1);
    expect(r.driftedKeys[0].key).toBe("add");
    expect(r.driftedKeys[0].declared).toBe("(a: number, b: number): number");
  });

  it("(f) resolved-tier declared signature → presence-only pass, counted incomparable", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [
        { key: "add", signature: `${RESOLVED_SIGNATURE_PREFIX}(a: number, b: number) => number` },
      ],
      // Written signature differs wildly — must NOT fail (tiers never compare).
      regenText: `export function add(x: string) { return x; }`,
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("pass");
    expect(r.incomparableKeys).toEqual(["add"]);
    expect(r.driftedKeys).toEqual([]);
  });

  it("(g) unannotated regen export vs declared signature → presence-only pass, incomparable", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [{ key: "PI", signature: "number" }],
      regenText: `export const PI = 3.14;`, // no written annotation
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("pass");
    expect(r.incomparableKeys).toEqual(["PI"]);
  });

  it("(h) non-TS/JS regen → unknown (unparseable_language)", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [{ key: "main" }],
      regenText: `def main():\n    pass\n`,
      regenFileName: "regen.py",
    });
    expect(r.state).toBe("unknown");
    expect(r.reason).toBe("unparseable_language");
  });

  it("(i) over-delivery is not a violation → pass", () => {
    const r = checkContract({
      nodeId: "node_0001",
      declared: [{ key: "add" }],
      regenText: `
        export function add(a: number, b: number) { return a + b; }
        export function bonus() { return 42; }
        export const extra = true;
      `,
      regenFileName: "regen.ts",
    });
    expect(r.state).toBe("pass");
  });
});

describe("contract override on the matrix cell", () => {
  it("a measured state replaces the not-measured default and feeds honesty + frontier tags", () => {
    const passCell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: false,
      cost,
      contractOverride: "pass",
    });
    expect(passCell.contract).toBe("pass");
    expect(honestyForCell(passCell, undefined).contract).toBe(1);

    const failCell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: false,
      cost,
      contractOverride: "fail",
    });
    expect(failCell.contract).toBe("fail");
    expect(honestyForCell(failCell, undefined).contract).toBe(0);
    expect(verdictDerivedTags(failCell)).toContain("contract-missing");
  });

  it("the unrecoverable guard keeps not-measured regardless of override (no regen exists)", () => {
    const cell = verdictToMatrixCell({
      verdict: "unrecoverable",
      literal: false,
      cost,
      contractOverride: "pass",
    });
    expect(cell.contract).toBe("not-measured");
    expect(honestyForCell(cell, undefined).contract).toBeNull();
  });

  it("without an override the default stays not-measured (legacy --matrix calls unchanged)", () => {
    const cell = verdictToMatrixCell({
      verdict: "epsilon_equivalent",
      literal: false,
      cost,
    });
    expect(cell.contract).toBe("not-measured");
  });
});
