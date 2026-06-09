import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  extractResolvedSignatures,
  RESOLVED_SIGNATURE_PREFIX,
} from "../src/runtime/static/typescript-resolved.js";
import { parseTypeScriptFile } from "../src/runtime/static/typescript.js";

// Path-to-T1 gate #1 — resolved-type signatures via the TypeChecker.
// The compelling proof: resolved extraction captures what the syntactic
// (O1) extractor structurally cannot — inferred return types and inferred
// const types — so it is a strictly finer interface-identity, and it is
// tier-tagged so it can never be confused with a syntactic signature.

describe("extractResolvedSignatures (TypeChecker)", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function write(source: string): string {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-resolved-"));
    const file = path.join(dir, "mod.ts");
    fs.writeFileSync(file, source);
    return file;
  }

  it("resolves an INFERRED return type that the syntactic extractor cannot see", () => {
    const source = `export function double(a: number) { return a * 2; }`;
    const file = write(source);

    // Syntactic (O1): no written return annotation → return is invisible.
    const syntactic = parseTypeScriptFile(file, source).exports.find(
      (e) => e.name === "double",
    );
    expect(syntactic?.signature).toBe("(a: number)"); // no `: number` return

    // Resolved: the TypeChecker materialises the inferred `=> number`.
    const resolved = extractResolvedSignatures([file]).get(path.resolve(file))!;
    const dbl = resolved.find((e) => e.name === "double")!;
    expect(dbl.signature.startsWith(RESOLVED_SIGNATURE_PREFIX)).toBe(true);
    expect(dbl.signature).toContain("=> number");
  });

  it("resolves an inferred const type the syntactic extractor leaves undefined", () => {
    const source = `export const PI = 3.14159;`;
    const file = write(source);

    const syntactic = parseTypeScriptFile(file, source).exports.find(
      (e) => e.name === "PI",
    );
    expect(syntactic?.signature).toBeUndefined(); // no annotation → unknown

    const resolved = extractResolvedSignatures([file]).get(path.resolve(file))!;
    const pi = resolved.find((e) => e.name === "PI")!;
    // Resolved to the literal/number type — concrete, comparable.
    expect(pi.signature.startsWith(RESOLVED_SIGNATURE_PREFIX)).toBe(true);
    expect(pi.signature.length).toBeGreaterThan(RESOLVED_SIGNATURE_PREFIX.length);
  });

  it("is tier-tagged so a resolved signature never string-equals its syntactic form", () => {
    const source = `export function add(a: number, b: number): number { return a + b; }`;
    const file = write(source);

    const syntactic = parseTypeScriptFile(file, source).exports.find(
      (e) => e.name === "add",
    )!.signature!;
    const resolved = extractResolvedSignatures([file])
      .get(path.resolve(file))!
      .find((e) => e.name === "add")!.signature;

    // Same capability, two tiers — must NOT be equal (so glueFragments stays
    // conservative across tiers).
    expect(resolved).not.toBe(syntactic);
    expect(resolved.startsWith(RESOLVED_SIGNATURE_PREFIX)).toBe(true);
  });

  it("emits NO signature for type-only exports (interface / type alias) — never `resolved:any`", () => {
    // A type-only export has no value side; the checker's value-type query
    // yields the error type, which stringifies as `any`. Emitting that would
    // collapse structurally different interfaces to one constant signature —
    // a false-merge hazard under identify-if-equal. The conservative law:
    // no value declaration → no resolved signature (missing ⇒ conflict).
    const source = `
      export interface Config { host: string; port: number }
      export type Mode = "fast" | "safe";
      export const REAL = 42;
    `;
    const file = write(source);
    const resolved = extractResolvedSignatures([file]).get(path.resolve(file))!;
    const names = resolved.map((e) => e.name);
    expect(names).toEqual(["REAL"]); // Config and Mode emit nothing
    expect(resolved.every((e) => e.signature !== `${RESOLVED_SIGNATURE_PREFIX}any`)).toBe(
      true,
    );
  });

  it("emits NO signature for `any`-typed values (zero discriminating power)", () => {
    const source = `export const loose: any = JSON.parse("{}");`;
    const file = write(source);
    const resolved = extractResolvedSignatures([file]).get(path.resolve(file))!;
    expect(resolved.find((e) => e.name === "loose")).toBeUndefined();
  });

  it("two same-named but different interfaces never gain string-equal resolved signatures", () => {
    // Regression for the 2026-06-09 false-merge finding: before the
    // value-declaration guard, BOTH of these resolved to `resolved:any` and
    // glueFragments would have identified incompatible providers.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-resolved-"));
    const fileA = path.join(dir, "a.ts");
    const fileB = path.join(dir, "b.ts");
    fs.writeFileSync(fileA, `export interface Config { host: string; port: number }`);
    fs.writeFileSync(fileB, `export interface Config { totallyDifferent: boolean[] }`);
    const map = extractResolvedSignatures([fileA, fileB]);
    expect(map.get(path.resolve(fileA))).toEqual([]); // no signature at all
    expect(map.get(path.resolve(fileB))).toEqual([]);
  });

  function writeTwo(srcA: string, srcB: string): [string, string] {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-resolved-"));
    const fileA = path.join(dir, "a.ts");
    const fileB = path.join(dir, "b.ts");
    fs.writeFileSync(fileA, srcA);
    fs.writeFileSync(fileB, srcB);
    return [fileA, fileB];
  }

  function sigOf(map: Map<string, { name: string; signature: string }[]>, file: string, name: string): string {
    return map.get(path.resolve(file))!.find((e) => e.name === name)!.signature;
  }

  // ── Nominal-type content hashing (the structural-faithfulness law) ────────

  it("VALUE exports over same-named but structurally different nominals get DIFFERENT signatures", () => {
    // The residual false-merge: `(c: Config) => string` rendered identically
    // from both files even though the two Configs are disjoint. The nominal
    // hash suffix breaks the tie → conflict (conservative), never a merge.
    const [fileA, fileB] = writeTwo(
      `export interface Config { host: string; port: number }
       export function fn(c: Config): string { return c.host; }`,
      `export interface Config { totallyDifferent: boolean[] }
       export function fn(c: Config): string { return String(c.totallyDifferent.length); }`,
    );
    const map = extractResolvedSignatures([fileA, fileB]);
    const a = sigOf(map, fileA, "fn");
    const b = sigOf(map, fileB, "fn");
    expect(a).toMatch(/\[Config#[0-9a-f]{8}\]/);
    expect(b).toMatch(/\[Config#[0-9a-f]{8}\]/);
    expect(a).not.toBe(b);
  });

  it("textually IDENTICAL nominals in different files keep string-equal signatures (the legitimate identification survives)", () => {
    const decl = `export interface Config { host: string; port: number }`;
    const fn = `export function fn(c: Config): string { return c.host; }`;
    const [fileA, fileB] = writeTwo(`${decl}\n${fn}`, `${decl}\n${fn}`);
    const map = extractResolvedSignatures([fileA, fileB]);
    expect(sigOf(map, fileA, "fn")).toBe(sigOf(map, fileB, "fn"));
  });

  it("NESTED drift is caught: identical Config text over divergent Inner types differs (transitive closure)", () => {
    const fn = `export function fn(c: Config): number { return 0; }`;
    const config = `export interface Config { inner: Inner }`;
    const [fileA, fileB] = writeTwo(
      `interface Inner { a: string }\n${config}\n${fn}`,
      `interface Inner { b: number[] }\n${config}\n${fn}`,
    );
    const map = extractResolvedSignatures([fileA, fileB]);
    const a = sigOf(map, fileA, "fn");
    const b = sigOf(map, fileB, "fn");
    expect(a).toContain("Inner#"); // Inner dragged in by the closure
    expect(a).not.toBe(b);
  });

  it("lib types (Date, Promise) are NOT hashed — globally identical by construction", () => {
    const src = `export function stamp(d: Date): Promise<string> { return Promise.resolve(d.toISOString()); }`;
    const [fileA, fileB] = writeTwo(src, src);
    const map = extractResolvedSignatures([fileA, fileB]);
    const a = sigOf(map, fileA, "stamp");
    expect(a).toBe(sigOf(map, fileB, "stamp"));
    expect(a).not.toContain("Date#");
    expect(a).not.toContain("["); // no project-local nominals → no suffix
  });

  it("self-referential nominals terminate (cycle-safe) and still discriminate", () => {
    const [fileA, fileB] = writeTwo(
      `export interface Node2 { value: string; next: Node2 | null }
       export function head(n: Node2): string { return n.value; }`,
      `export interface Node2 { value: number; next: Node2 | null }
       export function head(n: Node2): string { return String(n.value); }`,
    );
    const map = extractResolvedSignatures([fileA, fileB]);
    const a = sigOf(map, fileA, "head");
    const b = sigOf(map, fileB, "head");
    expect(a).toContain("Node2#");
    expect(a).not.toBe(b);
  });

  it("type ALIASES used in value positions are hashed too", () => {
    const fn = `export function pick(m: Mode): Mode { return m; }`;
    const [fileA, fileB] = writeTwo(
      `export type Mode = "fast" | "safe";\n${fn}`,
      `export type Mode = "slow" | "unsafe";\n${fn}`,
    );
    const map = extractResolvedSignatures([fileA, fileB]);
    const a = sigOf(map, fileA, "pick");
    const b = sigOf(map, fileB, "pick");
    expect(a).toContain("Mode#");
    expect(a).not.toBe(b);
  });

  it("excludes default exports and is deterministic by name", () => {
    const source = `
      export function zeta() { return 1; }
      export function alpha() { return 2; }
      export default function () { return 0; }
    `;
    const file = write(source);
    const resolved = extractResolvedSignatures([file]).get(path.resolve(file))!;
    const names = resolved.map((e) => e.name);
    expect(names).toEqual(["alpha", "zeta"]); // sorted, no "default"
  });
});
