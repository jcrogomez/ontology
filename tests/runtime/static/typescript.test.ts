import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseTypeScriptFile,
  inferEdgesFromDirectory,
} from "../../../src/inverse/static/typescript.js";

// Coverage for Project Legend γ-4 — static-edge inference for
// TypeScript. Pure parsing, no network, no LLM. Fixtures live in
// per-test temp directories so file resolution can be exercised
// against the real disk.

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "static-ts-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe("parseTypeScriptFile — imports", () => {
  it("captures named imports with their local aliases", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `import { foo, bar as renamed } from "./x.js";`,
    );
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].kind).toBe("value");
    expect(result.imports[0].modulePath).toBe("./x.js");
    expect(result.imports[0].imports).toEqual(["foo", "renamed"]);
  });

  it("captures default imports", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `import stringify from "fast-json-stable-stringify";`,
    );
    expect(result.imports[0].defaultImport).toBe("stringify");
    expect(result.imports[0].imports).toEqual([]);
  });

  it("captures namespace imports and marks them kind=namespace", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `import * as ts from "typescript";`,
    );
    expect(result.imports[0].namespace).toBe("ts");
    expect(result.imports[0].kind).toBe("namespace");
  });

  it("marks type-only imports kind=type", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `import type { Foo, Bar } from "./types.js";`,
    );
    expect(result.imports[0].kind).toBe("type");
    expect(result.imports[0].imports).toEqual(["Foo", "Bar"]);
  });

  it("handles bare side-effect imports", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `import "./register.js";`,
    );
    expect(result.imports[0].imports).toEqual([]);
    expect(result.imports[0].defaultImport).toBeUndefined();
    expect(result.imports[0].kind).toBe("value");
  });

  it("collects multiple imports in declaration order", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      [
        `import { a } from "./a.js";`,
        `import type { B } from "./b.js";`,
        `import * as c from "./c.js";`,
      ].join("\n"),
    );
    expect(result.imports.map((i) => i.modulePath)).toEqual([
      "./a.js",
      "./b.js",
      "./c.js",
    ]);
    expect(result.imports.map((i) => i.kind)).toEqual([
      "value",
      "type",
      "namespace",
    ]);
  });
});

describe("parseTypeScriptFile — exports", () => {
  it("captures named function exports", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `export function foo(): void {}`,
    );
    expect(result.exports).toEqual([
      { name: "foo", kind: "value", isDefault: false, signature: "(): void" },
    ]);
  });

  it("captures named const exports", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `export const value = 42;
       export const a = 1, b = 2;`,
    );
    expect(result.exports.map((e) => e.name).sort()).toEqual(["a", "b", "value"]);
  });

  it("captures default exports of declared functions/classes", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `export default function compute(): void {}`,
    );
    expect(result.exports).toEqual([
      {
        name: "default",
        localName: "compute",
        kind: "value",
        isDefault: true,
        signature: "(): void",
      },
    ]);
  });

  it("captures type-only exports of interfaces and type aliases", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `export interface Foo { x: number }
       export type Bar = string | number;`,
    );
    const names = result.exports.map((e) => `${e.name}:${e.kind}`);
    expect(names).toContain("Foo:type");
    expect(names).toContain("Bar:type");
  });

  it("captures enum exports as kind=value (runtime objects)", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `export enum Color { Red, Green }`,
    );
    expect(result.exports).toEqual([
      {
        name: "Color",
        kind: "value",
        isDefault: false,
        signature: "{ Red, Green }",
      },
    ]);
  });

  it("captures re-exports and synthesises an import for the upstream module", () => {
    const result = parseTypeScriptFile(
      "/virtual/a.ts",
      `export { foo, bar as renamed } from "./upstream.js";`,
    );
    // Two ExportRefs surface (the names visible to consumers):
    expect(result.exports.map((e) => e.name).sort()).toEqual(["foo", "renamed"]);
    // The re-export also creates an import dependency (so γ-4 can
    // emit a depends_on edge from this file to upstream):
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].modulePath).toBe("./upstream.js");
  });
});

describe("parseTypeScriptFile — syntactic signatures (O1)", () => {
  const sigOf = (source: string, name: string): string | undefined =>
    parseTypeScriptFile("/virtual/a.ts", source).exports.find(
      (e) => e.name === name,
    )?.signature;

  it("captures a function's written param + return signature, normalising whitespace", () => {
    expect(
      sigOf(
        `export function add(
           a: number,
           b: number,
         ): number { return a + b; }`,
        "add",
      ),
    ).toBe("(a: number, b: number): number");
  });

  it("captures type parameters and defaulted params", () => {
    expect(
      sigOf(`export function wrap<T>(x: T, opts = {}): T[] { return [x]; }`, "wrap"),
    ).toBe("<T>(x: T, opts = {}): T[]");
  });

  it("captures a type alias RHS", () => {
    expect(sigOf(`export type Id = string | number;`, "Id")).toBe(
      "string | number",
    );
  });

  it("captures an interface member shape including heritage", () => {
    expect(
      sigOf(
        `export interface Box extends Base { x: number; label?: string }`,
        "Box",
      ),
    ).toBe("extends Base { x: number; label?: string }");
  });

  it("captures a typed const's annotation; leaves an inferred const undefined", () => {
    const src = `export const HOST: string = "localhost";
                 export const PORT = 8080;`;
    expect(sigOf(src, "HOST")).toBe("string");
    expect(sigOf(src, "PORT")).toBeUndefined();
  });

  it("captures a class's public member shape, excluding bodies and private members", () => {
    const sig = sigOf(
      `export class Svc {
         private secret = 1;
         protected helper(): void {}
         url: string = "";
         start(port: number): boolean { return true; }
       }`,
      "Svc",
    );
    // sorted public members; no bodies; private/protected dropped
    expect(sig).toBe("{ start(port: number): boolean; url: string }");
  });

  it("is identical across line-reflow reformatting (indentation / newlines / trailing comma)", () => {
    // Whitespace RUNS are collapsed, so a formatter reflowing the same
    // canonical tokens across lines yields an identical signature. (Token-
    // internal spacing like `a:number` vs `a: number` is NOT canonicalised —
    // that can yield a false non-match, which is safe: the conservative
    // fallback treats it as a conflict, never a false identification.)
    const a = sigOf(`export function f(a: number): void {}`, "f");
    const b = sigOf(`export function f(\n  a: number,\n): void {}`, "f");
    expect(a).toBe(b);
    expect(a).toBe("(a: number): void");
  });

  it("leaves cross-file re-exports without a signature (no TypeChecker)", () => {
    expect(
      sigOf(`export { Foo } from "./upstream.js";`, "Foo"),
    ).toBeUndefined();
  });
});

describe("parseTypeScriptFile — robustness", () => {
  it("does not throw on a syntactically invalid source", () => {
    expect(() =>
      parseTypeScriptFile("/virtual/a.ts", `import { from `),
    ).not.toThrow();
  });

  it("does not throw on an empty source", () => {
    const result = parseTypeScriptFile("/virtual/a.ts", "");
    expect(result.imports).toEqual([]);
    expect(result.exports).toEqual([]);
  });
});

describe("inferEdgesFromDirectory", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("emits a depends_on edge for a value import between two local files", () => {
    projectDir = makeProject({
      "src/a.ts": `import { foo } from "./b.js"; foo();`,
      "src/b.ts": `export function foo(): void {}`,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("depends_on");
    expect(edges[0].tokens).toEqual(["foo"]);
    expect(path.basename(edges[0].fromFile)).toBe("a.ts");
    expect(path.basename(edges[0].toFile)).toBe("b.ts");
  });

  it("emits a uses_token edge for a type-only import", () => {
    projectDir = makeProject({
      "src/a.ts": `import type { Foo } from "./b.js";`,
      "src/b.ts": `export interface Foo { x: number }`,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("uses_token");
    expect(edges[0].tokens).toEqual(["Foo"]);
  });

  it("emits two edges (one each kind) when the same module is imported both ways", () => {
    projectDir = makeProject({
      "src/a.ts": `
        import { runtimeValue } from "./b.js";
        import type { CompileType } from "./b.js";
      `,
      "src/b.ts": `
        export const runtimeValue = 1;
        export interface CompileType { x: number }
      `,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(2);
    const byType = Object.fromEntries(edges.map((e) => [e.type, e]));
    expect(byType.depends_on.tokens).toEqual(["runtimeValue"]);
    expect(byType.uses_token.tokens).toEqual(["CompileType"]);
  });

  it("skips imports that resolve outside the scanned root", () => {
    projectDir = makeProject({
      "src/a.ts": `
        import { foo } from "./b.js";       // local — kept
        import { createHash } from "node:crypto";   // builtin — skipped
        import stringify from "fast-json-stable-stringify"; // npm — skipped
      `,
      "src/b.ts": `export function foo(): void {}`,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].tokens).toEqual(["foo"]);
  });

  it("aggregates multiple imports from the same module into one edge", () => {
    projectDir = makeProject({
      "src/a.ts": `
        import { foo } from "./b.js";
        import { bar } from "./b.js";
      `,
      "src/b.ts": `
        export const foo = 1;
        export const bar = 2;
      `,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].tokens).toEqual(["bar", "foo"]); // sorted
  });

  it("resolves `.js` imports to neighboring `.ts` files (ESM-output convention)", () => {
    projectDir = makeProject({
      "src/a.ts": `import { foo } from "./nested/b.js";`,
      "src/nested/b.ts": `export const foo = 1;`,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].toFile.endsWith("nested/b.ts")).toBe(true);
  });

  it("resolves bare directory imports to `index.ts`", () => {
    projectDir = makeProject({
      "src/a.ts": `import { foo } from "./mod";`,
      "src/mod/index.ts": `export const foo = 1;`,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    expect(edges).toHaveLength(1);
    expect(edges[0].toFile.endsWith("mod/index.ts")).toBe(true);
  });

  it("returns deterministic edge order across runs", () => {
    projectDir = makeProject({
      "src/a.ts": `import { x } from "./z.js"; import { y } from "./y.js";`,
      "src/y.ts": `export const y = 1;`,
      "src/z.ts": `export const x = 1;`,
    });
    const first = inferEdgesFromDirectory(projectDir);
    const second = inferEdgesFromDirectory(projectDir);
    expect(first).toEqual(second);
    // Sorted by toFile within fromFile, so y comes before z.
    expect(first.map((e) => path.basename(e.toFile))).toEqual([
      "y.ts",
      "z.ts",
    ]);
  });

  it("skips node_modules / dist / .ontology / __tests__ / .git", () => {
    projectDir = makeProject({
      "src/a.ts": `import { foo } from "./b.js";`,
      "src/b.ts": `export const foo = 1;`,
      "node_modules/pkg/index.ts": `export const noise = 1;`,
      "dist/built.ts": `export const noise = 1;`,
      "__tests__/a.test.ts": `import { foo } from "../src/b.js";`,
      ".ontology/state.json": `{}`,
    });
    const edges = inferEdgesFromDirectory(projectDir);
    // Only the src/a.ts → src/b.ts edge survives.
    expect(edges).toHaveLength(1);
    expect(path.basename(edges[0].fromFile)).toBe("a.ts");
  });
});
