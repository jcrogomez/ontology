import { describe, it, expect } from "vitest";
import {
  scanTopLevelDecls,
  planDecomposition,
  buildSliceInstruction,
  assembleSlices,
  hasSyntaxErrors,
} from "../src/forward/compile/decompose-plan.js";

// Tests for the decomposition planner + assembler
// (REGEN_INTENT_CONSUMPTION_2026-06-17 #4). Pure functions — no LLM/IO.

const LOCKISH = `
import * as fs from "node:fs";
import * as os from "node:os";

export interface LockBody { pid: number; hostname: string; }
export interface Lock { lockPath: string; body: LockBody; release(): void; }
export class LockAcquireError extends Error { detail: unknown; }

function isPidAlive(pid: number): boolean { return true; }
function makeLock(p: string, b: LockBody): Lock { return { lockPath: p, body: b, release() {} }; }

export function acquireLock(repoRoot: string): Lock { return makeLock(repoRoot, {} as LockBody); }
export async function withLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> { return fn(); }
`;

describe("scanTopLevelDecls", () => {
  it("lists exported and private top-level declarations with kinds", () => {
    const decls = scanTopLevelDecls(LOCKISH);
    const byName = Object.fromEntries(decls.map((d) => [d.name, d]));
    expect(byName["LockBody"]).toMatchObject({ kind: "interface", isExported: true });
    expect(byName["Lock"]).toMatchObject({ kind: "interface", isExported: true });
    expect(byName["LockAcquireError"]).toMatchObject({ kind: "class", isExported: true });
    expect(byName["isPidAlive"]).toMatchObject({ kind: "function", isExported: false });
    expect(byName["makeLock"]).toMatchObject({ kind: "function", isExported: false });
    expect(byName["acquireLock"]).toMatchObject({ kind: "function", isExported: true });
    expect(byName["withLock"]).toMatchObject({ kind: "function", isExported: true });
  });

  it("captures function signatures (params + return), no bodies", () => {
    const decls = scanTopLevelDecls(LOCKISH);
    const acquire = decls.find((d) => d.name === "acquireLock");
    expect(acquire?.signature).toBe("(repoRoot: string): Lock");
    expect(acquire?.signature).not.toMatch(/return|makeLock/); // no body
  });

  it("returns [] on unparseable input", () => {
    expect(scanTopLevelDecls("")).toEqual([]);
  });

  it("captures a determining literal const value (richer-extraction lever #3)", () => {
    const decls = scanTopLevelDecls(`const LOCK_FILE_DEFAULT = ".lock";\nconst N = 3;\nlet mutable = "x";`);
    const lock = decls.find((d) => d.name === "LOCK_FILE_DEFAULT");
    expect(lock).toMatchObject({ kind: "const", literal: '".lock"' });
    expect(decls.find((d) => d.name === "N")?.literal).toBe("3");
    // `let` is not a const → no determining-literal capture.
    expect(decls.find((d) => d.name === "mutable")?.literal).toBeUndefined();
  });
});

describe("buildSliceInstruction — determining literals", () => {
  it("pins the exact value of a captured const literal", () => {
    const decls = scanTopLevelDecls(`const LOCK_FILE_DEFAULT = ".lock";\nexport function f() { return 1; }`);
    const slices = planDecomposition(decls);
    const scaffold = slices[0]; // owns the const
    const out = buildSliceInstruction(scaffold, "");
    expect(out).toMatch(/LOCK_FILE_DEFAULT = "\.lock"\s+\(use EXACTLY this value\)/);
  });
});

describe("planDecomposition", () => {
  it("produces a scaffold slice (types + helpers) then one slice per exported function", () => {
    const slices = planDecomposition(scanTopLevelDecls(LOCKISH));
    expect(slices.map((s) => s.label)).toEqual([
      "scaffold (types + private helpers)",
      "acquireLock",
      "withLock",
    ]);
    // Scaffold holds the types, the class, and the private helpers.
    const scaffoldNames = slices[0].targets.map((t) => t.name).sort();
    expect(scaffoldNames).toEqual(["Lock", "LockAcquireError", "LockBody", "isPidAlive", "makeLock"]);
    // Only the last slice is final (the assembly is gated after it).
    expect(slices.map((s) => s.isFinal)).toEqual([false, false, true]);
  });

  it("when there are no exported functions, the scaffold is the only/final slice", () => {
    const slices = planDecomposition(scanTopLevelDecls(`export interface A { x: number; }`));
    expect(slices).toHaveLength(1);
    expect(slices[0].isFinal).toBe(true);
  });
});

describe("buildSliceInstruction", () => {
  it("scopes the slice to its targets and includes prior code as fixed context", () => {
    const slices = planDecomposition(scanTopLevelDecls(LOCKISH));
    const acquireSlice = slices.find((s) => s.label === "acquireLock")!;
    const out = buildSliceInstruction(acquireSlice, "function makeLock() {}");
    expect(out).toMatch(/slice "acquireLock"/);
    expect(out).toMatch(/EXISTING CODE/);
    expect(out).toMatch(/function makeLock/);
    expect(out).toMatch(/do NOT add `async`\/`Promise` unless the signature shows it/);
    expect(out).toMatch(/- exported function acquireLock: \(repoRoot: string\): Lock/);
  });

  it("omits the EXISTING CODE block when there is no prior code (first slice)", () => {
    const slices = planDecomposition(scanTopLevelDecls(LOCKISH));
    const out = buildSliceInstruction(slices[0], "");
    expect(out).not.toMatch(/EXISTING CODE/);
  });
});

describe("assembleSlices", () => {
  const decl = (name: string, isExported = false) =>
    ({ name, kind: "function" as const, isExported });

  it("deduplicates imports across slices and concatenates owned declarations", () => {
    const scaffold = {
      code: `import * as fs from "node:fs";\nfunction helper() { return 1; }`,
      owned: [decl("helper")],
    };
    const entry = {
      code: `import * as fs from "node:fs";\nexport function f() { return helper(); }`,
      owned: [decl("f", true)],
    };
    const out = assembleSlices([scaffold, entry]);
    expect(out.match(/import \* as fs from "node:fs";/g)).toHaveLength(1); // deduped
    expect(out).toMatch(/function helper/);
    expect(out).toMatch(/function f\(/);
    expect(out.indexOf("function helper")).toBeLessThan(out.indexOf("function f("));
    // Single coherent trailing export of the exported owned name.
    expect(out).toMatch(/export \{[\s\S]*\bf\b[\s\S]*\};/);
  });

  it("keeps each declaration ONLY from its owning slice (drops duplicates a model re-emits)", () => {
    // Both slices re-emit `helper` (the 7B-ignores-scope failure mode), but
    // only the scaffold owns it → exactly one copy survives.
    const scaffold = {
      code: `function helper() { return 1; }\nfunction other() { return 2; }`,
      owned: [decl("helper"), decl("other")],
    };
    const entry = {
      code: `function helper() { return 999; }\nexport function f() { return helper(); }`,
      owned: [decl("f", true)],
    };
    const out = assembleSlices([scaffold, entry]);
    expect(out.match(/function helper/g)).toHaveLength(1); // de-duplicated by ownership
    expect(out).toMatch(/return 1;/); // scaffold's version kept
    expect(out).not.toMatch(/return 999;/); // entry's duplicate dropped
  });

  it("strips inline export / standalone export blocks and re-emits one export", () => {
    const a = {
      code: `export function f() {}\nexport { f };\nfunction g() {}`,
      owned: [decl("f", true), decl("g")],
    };
    const out = assembleSlices([a]);
    // No inline `export function`, no standalone duplicate block — one export.
    expect(out).not.toMatch(/export function f/);
    expect(out.match(/export \{/g)).toHaveLength(1);
    expect(out).toMatch(/\bf\b/);
  });

  it("strips import bindings that collide with assembly-declared names (node_0032 failure mode)", () => {
    // A later chunk re-imports earlier chunks' declarations from an invented
    // module instead of reusing them — the assembled module would declare AND
    // import the same names and never load. The assembler must resolve it.
    const chunk1 = {
      code: `import { z } from "zod";\nconst AlphaSchema = z.enum(["a"]);`,
      owned: [{ name: "AlphaSchema", kind: "const" as const, isExported: true }],
    };
    const chunk2 = {
      code:
        `import { z } from "zod";\n` +
        `import { AlphaSchema } from "./types";\n` +
        `const BetaSchema = z.object({ a: AlphaSchema });`,
      owned: [{ name: "BetaSchema", kind: "const" as const, isExported: true }],
    };
    const out = assembleSlices([chunk1, chunk2]);
    expect(out).not.toMatch(/from ["']\.\/types["']/); // colliding import dropped entirely
    expect(out.match(/import \{ z \} from "zod";/g)).toHaveLength(1); // legit import kept, deduped
    expect(out.match(/const AlphaSchema/g)).toHaveLength(1);
  });

  it("keeps non-colliding bindings of a mixed import and drops only the colliders", () => {
    const a = {
      code: `const Alpha = 1;`,
      owned: [{ name: "Alpha", kind: "const" as const, isExported: true }],
    };
    const b = {
      code: `import { Alpha, external } from "some-lib";\nconst Beta = external(Alpha);`,
      owned: [{ name: "Beta", kind: "const" as const, isExported: true }],
    };
    const out = assembleSlices([a, b]);
    expect(out).toMatch(/import \{ external \} from ["']some-lib["'];/); // collider stripped, rest kept
    expect(out).not.toMatch(/import \{ Alpha/);
  });

  it("hasSyntaxErrors: detects a truncated declaration; passes clean code", () => {
    // The 2026-07-07 7B truncation shape: generation cut mid-expression.
    const truncated = `const A = z.object({\n  previousEventId: z.string().nullable\n\n();\n`;
    expect(hasSyntaxErrors(truncated)).toBe(true);
    expect(hasSyntaxErrors(`const A = 1;\nexport function f(): number { return A; }`)).toBe(false);
    expect(hasSyntaxErrors("")).toBe(false);
  });

  it("an invented inline-exported declaration stays internal (never extra-export drift)", () => {
    const a = {
      code: `export function f() { return helper(); }\nexport const ApiKey = "invented";\nfunction helper() { return ApiKey; }`,
      owned: [decl("f", true), decl("helper")],
    };
    const out = assembleSlices([a]);
    expect(out).toMatch(/const ApiKey/); // kept as internal helper…
    expect(out).not.toMatch(/export \{[\s\S]*ApiKey[\s\S]*\};/); // …but not exported
    expect(out).toMatch(/export \{[\s\S]*\bf\b[\s\S]*\};/);
  });

  it("keeps side-effect imports verbatim", () => {
    const a = { code: `import "./polyfill.js";\nconst x = 1;`, owned: [decl("x")] };
    const out = assembleSlices([a]);
    expect(out).toMatch(/import ["']\.\/polyfill\.js["'];/);
  });

  it("keeps distinct imports from different slices", () => {
    const a = { code: `import * as fs from "node:fs";\nconst x = 1;`, owned: [decl("x")] };
    const b = { code: `import * as os from "node:os";\nconst y = 2;`, owned: [decl("y")] };
    const out = assembleSlices([a, b]);
    expect(out).toMatch(/import \* as fs from "node:fs";/);
    expect(out).toMatch(/import \* as os from "node:os";/);
  });

  it("skips empty slices and still assembles", () => {
    const out = assembleSlices([
      { code: "", owned: [] },
      { code: "const a = 1;", owned: [decl("a")] },
      { code: "  ", owned: [] },
    ]);
    expect(out).toMatch(/const a = 1;/);
  });
});
