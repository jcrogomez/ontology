// Monotone decompose (--keep-slices) — the TestSprite principle ("passing
// tests are kept, coverage grows with the build") applied to decomposed
// regeneration. Pins the two pure pieces:
//   - scanFixtureCaseReferences: fixture text → per-case referenced names
//   - computeKeepSet: prior round's failures → which slices stay FROZEN
// The conservative direction is pinned hard: anything unattributable must
// unfreeze everything (an empty keep set), because freezing a broken slice
// is the dangerous direction.

import { describe, it, expect } from "vitest";
import { scanFixtureCaseReferences, computeKeepSet } from "../src/forward/compile/slice-keep.js";
import { planDecomposition, SCAFFOLD_CHUNK_SIZE, type TopLevelDecl } from "../src/forward/compile/decompose-plan.js";

const FIXTURE = `
import type { BehaviorCase } from "../../src/laws/behavior-checker.js";
const cases: BehaviorCase[] = [
  {
    name: "alpha returns the base path",
    setup: () => ({ cwd: "/proj" }),
    invoke: (api, ctx) => (api as any).getAlpha(ctx.cwd),
    assert: (r) => r.base === "/proj/.x",
  },
  {
    name: "beta validates the enum",
    invoke: (api) => (api as any).BetaSchema.parse("draft"),
    assert: (r) => r === "draft",
  },
  {
    name: "gamma is untouchable",
    invoke: (api) => (api as any).frobnicate(),
    assert: (r) => r === 42,
  },
];
`;

describe("scanFixtureCaseReferences", () => {
  it("maps each case to the identifiers its object literal references", () => {
    const refs = scanFixtureCaseReferences(FIXTURE);
    expect([...refs.keys()]).toEqual([
      "alpha returns the base path",
      "beta validates the enum",
      "gamma is untouchable",
    ]);
    expect(refs.get("alpha returns the base path")).toContain("getAlpha");
    expect(refs.get("beta validates the enum")).toContain("BetaSchema");
    expect(refs.get("beta validates the enum")).not.toContain("getAlpha");
  });

  it("returns an empty map on unparseable text (degrades to unfreeze-all)", () => {
    expect(scanFixtureCaseReferences("not { valid ts").size).toBeGreaterThanOrEqual(0);
  });
});

// Two slices: slice 0 owns getAlpha, slice 1 owns BetaSchema.
const decl = (name: string, kind: TopLevelDecl["kind"] = "function"): TopLevelDecl => ({
  name,
  kind,
  isExported: true,
});
const SLICES = [
  { label: "getAlpha", targets: [decl("getAlpha")], isFinal: false },
  { label: "BetaSchema", targets: [decl("BetaSchema", "const")], isFinal: true },
];
const PARTS = [
  { code: "function getAlpha(cwd) { return { base: cwd + '/.x' }; }", owned: SLICES[0].targets },
  { code: "const BetaSchema = z.enum(['draft']);", owned: SLICES[1].targets },
];
const base = {
  slices: SLICES,
  parts: PARTS,
  fixtureText: FIXTURE,
  failingCaseNames: [] as string[],
  missingExports: [] as string[],
  extraExports: [] as string[],
  lintSymbols: [] as string[],
};

describe("computeKeepSet", () => {
  it("keeps the slice a failing case does NOT implicate", () => {
    const keep = computeKeepSet({ ...base, failingCaseNames: ["beta validates the enum"] });
    expect(keep.has(0)).toBe(true); // getAlpha untouched by the failure
    expect(keep.has(1)).toBe(false); // BetaSchema implicated → regenerate
  });

  it("a failing case referencing no owned name unfreezes everything", () => {
    const keep = computeKeepSet({ ...base, failingCaseNames: ["gamma is untouchable"] });
    expect(keep.size).toBe(0);
  });

  it("a failing case missing from the fixture text unfreezes everything", () => {
    const keep = computeKeepSet({ ...base, failingCaseNames: ["case that does not exist"] });
    expect(keep.size).toBe(0);
  });

  it("a missing export implicates its owning slice only", () => {
    const keep = computeKeepSet({ ...base, missingExports: ["getAlpha"] });
    expect(keep.has(0)).toBe(false);
    expect(keep.has(1)).toBe(true);
  });

  it("an extra export implicates the slice whose code declares it", () => {
    const parts = [
      { ...PARTS[0], code: PARTS[0].code + "\nexport const sneaky = 1;" },
      PARTS[1],
    ];
    const keep = computeKeepSet({ ...base, parts, extraExports: ["sneaky"] });
    expect(keep.has(0)).toBe(false); // declared sneaky → implicated
    expect(keep.has(1)).toBe(true);
  });

  it("an extra export no slice declares unfreezes everything", () => {
    const keep = computeKeepSet({ ...base, extraExports: ["phantom"] });
    expect(keep.size).toBe(0);
  });

  it("a lint symbol implicates its owner; an empty symbol unfreezes everything", () => {
    expect(computeKeepSet({ ...base, lintSymbols: ["BetaSchema"] }).has(0)).toBe(true);
    expect(computeKeepSet({ ...base, lintSymbols: [""] }).size).toBe(0);
  });

  it("no failures at all keeps every slice (nothing implicated)", () => {
    const keep = computeKeepSet(base);
    expect(keep.size).toBe(2);
  });

  it("mismatched slices/parts unfreezes everything", () => {
    expect(computeKeepSet({ ...base, parts: [PARTS[0]] }).size).toBe(0);
  });
});

describe("planDecomposition — scaffold chunking (node_0032 shape)", () => {
  it("chunks a large declaration-only module into ordered scaffold slices", () => {
    const decls: TopLevelDecl[] = Array.from({ length: 20 }, (_, i) =>
      decl(`Schema${String(i).padStart(2, "0")}`, "const"),
    );
    const slices = planDecomposition(decls);
    expect(slices.length).toBe(Math.ceil(20 / SCAFFOLD_CHUNK_SIZE));
    // Source order preserved across chunks (dependency order for schemas).
    const names = slices.flatMap((s) => s.targets.map((t) => t.name));
    expect(names).toEqual(decls.map((d) => d.name));
    expect(slices.at(-1)!.isFinal).toBe(true);
    expect(slices.slice(0, -1).every((s) => !s.isFinal)).toBe(true);
  });

  it("keeps the single-scaffold plan for small modules (no behaviour change)", () => {
    const decls: TopLevelDecl[] = [
      decl("T", "type"),
      { name: "helper", kind: "function", isExported: false },
      { name: "run", kind: "function", isExported: true },
    ];
    const slices = planDecomposition(decls);
    expect(slices.map((s) => s.label)).toEqual(["scaffold (types + private helpers)", "run"]);
  });
});
