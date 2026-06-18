import { describe, it, expect } from "vitest";
import {
  classifyConfidence,
  deriveNextActions,
} from "../src/surfaces/walker/actions/node-health-from-walker.js";

// Walker v2 node-health dashboard — the load-bearing logic is the confidence
// classification and the ranked "next safe action". Both are pure; pin them
// exhaustively here. The data composition (reading shadow/ficha/rules off the
// live graph) is plumbing over already-tested primitives.

describe("classifyConfidence", () => {
  it("no shadow → no-shadow (nothing to sync)", () => {
    expect(classifyConfidence("no_shadow", false, 0)).toBe("no-shadow");
  });
  it("rule violation → blocked (even with a fixture and clean shadow)", () => {
    expect(classifyConfidence("clean", true, 1)).toBe("blocked");
  });
  it("no fixture (but shadow + clean rules) → lower confidence", () => {
    expect(classifyConfidence("clean", false, 0)).toBe("lower");
  });
  it("shadow + fixture + clean rules → syncable", () => {
    expect(classifyConfidence("clean", true, 0)).toBe("syncable");
  });
  it("drift does not by itself drop below syncable (it is a sync trigger, not a blocker)", () => {
    expect(classifyConfidence("drifted", true, 0)).toBe("syncable");
  });
});

describe("deriveNextActions — ranked governed-loop recommendation", () => {
  const base = { nodeId: "node_0001", shadow: "clean" as const, hasFixture: true, violations: 0, missing: 0, phantom: 0 };

  it("no shadow short-circuits to a single explanation", () => {
    const a = deriveNextActions({ ...base, shadow: "no_shadow" });
    expect(a).toHaveLength(1);
    expect(a[0].label).toMatch(/no code shadow/);
  });

  it("ficha gaps surface a cleanup command", () => {
    const a = deriveNextActions({ ...base, missing: 2, phantom: 3 });
    expect(a[0].command).toBe("onto ficha cleanup node_0001 --apply --prune");
    expect(a[0].label).toMatch(/2 missing \/ 3 phantom/);
  });

  it("a rule violation is named as a hard blocker", () => {
    const a = deriveNextActions({ ...base, violations: 1 });
    expect(a.some((x) => /1 static rule violation/.test(x.label))).toBe(true);
  });

  it("missing fixture recommends probe (lower confidence)", () => {
    const a = deriveNextActions({ ...base, hasFixture: false });
    expect(a.some((x) => x.command === "onto probe node_0001")).toBe(true);
  });

  it("drift recommends sync (regenerate + re-anchor)", () => {
    const a = deriveNextActions({ ...base, shadow: "drifted" });
    expect(a.some((x) => x.command === "onto sync node_0001")).toBe(true);
  });

  it("a fully-syncable node names the close-the-loop actions (sync + execute)", () => {
    const a = deriveNextActions(base);
    const cmds = a.map((x) => x.command);
    expect(cmds).toContain("onto sync node_0001");
    expect(cmds).toContain("onto execute node_0001");
  });

  it("a dependency-plan problem is surfaced first", () => {
    const a = deriveNextActions({ ...base, planProblem: "cycle" });
    expect(a[0].label).toMatch(/dependency plan cycle/);
  });
});
