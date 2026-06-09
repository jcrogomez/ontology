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
