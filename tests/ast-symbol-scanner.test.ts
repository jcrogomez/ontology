import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  scanFileSymbols,
  diffExportsAgainstAST,
  patchProvidesWithAST,
} from "../src/runtime/legend/ast-symbol-scanner.js";

function withTempFile(filename: string, source: string, fn: (filePath: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ast-scanner-"));
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, source, "utf-8");
  try {
    fn(filePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("scanFileSymbols", () => {
  it("captures named const, function, and class exports in source order", () => {
    const source = [
      "export const Alpha = 1;",
      "export function Beta() { return 2; }",
      "export class Gamma {}",
    ].join("\n");
    withTempFile("named.ts", source, (filePath) => {
      const r = scanFileSymbols(filePath);
      expect(r.ok).toBe(true);
      expect(r.mandatoryExports).toEqual(["Alpha", "Beta", "Gamma"]);
      expect(r.reExportedNames).toEqual([]);
    });
  });

  it("captures type aliases, interfaces, and enums", () => {
    const source = [
      "export type Foo = string;",
      "export interface Bar { x: number }",
      "export enum Baz { A, B }",
    ].join("\n");
    withTempFile("types.ts", source, (filePath) => {
      const r = scanFileSymbols(filePath);
      expect(r.ok).toBe(true);
      expect(r.mandatoryExports).toEqual(["Foo", "Bar", "Baz"]);
    });
  });

  it("captures named re-exports and surfaces them as reExportedNames", () => {
    const source = [
      "export { X, Y } from './other.js';",
      "export const Local = 1;",
    ].join("\n");
    withTempFile("reexports.ts", source, (filePath) => {
      const r = scanFileSymbols(filePath);
      expect(r.ok).toBe(true);
      expect(r.mandatoryExports).toEqual(["X", "Y", "Local"]);
      expect(r.reExportedNames).toEqual(["X", "Y"]);
    });
  });

  it("excludes default exports from mandatoryExports", () => {
    const source = [
      "export const Named = 1;",
      "export default function unnamedDefault() { return 0; }",
    ].join("\n");
    withTempFile("default.ts", source, (filePath) => {
      const r = scanFileSymbols(filePath);
      expect(r.ok).toBe(true);
      expect(r.mandatoryExports).toEqual(["Named"]);
    });
  });

  it("returns ok=false with empty exports for unreadable files", () => {
    const r = scanFileSymbols("/nonexistent/path/to/file.ts");
    expect(r.ok).toBe(false);
    expect(r.mandatoryExports).toEqual([]);
    expect(r.reExportedNames).toEqual([]);
  });

  it("captures the canonical schemas/ontology.ts surface (regression for Move 1c)", () => {
    // The straggler diagnosis: when LLM extraction emits provides=[]
    // for this file, downstream gluing fails because nothing matches
    // `OntologyNode` / `OntologyEdge` requires from context/types.ts
    // and fibration/types.ts. The scanner is the deterministic fallback.
    const repoRoot = path.resolve(__dirname, "..");
    const filePath = path.join(repoRoot, "src/schemas/ontology.ts");
    const r = scanFileSymbols(filePath);
    expect(r.ok).toBe(true);
    // Spot-check the type re-exports that the LLM dropped during δ'.
    expect(r.mandatoryExports).toContain("OntologyNode");
    expect(r.mandatoryExports).toContain("OntologyEdge");
    expect(r.mandatoryExports).toContain("OntologyNodeSchema");
    expect(r.mandatoryExports).toContain("OntologyEdgeSchema");
    // Sanity: the file has dozens of exports, not zero (the failure
    // mode this scanner is designed to detect and repair).
    expect(r.mandatoryExports.length).toBeGreaterThan(40);
  });
});

describe("diffExportsAgainstAST", () => {
  it("partitions cleanly when LLM provides exactly the AST surface", () => {
    const d = diffExportsAgainstAST(["A", "B", "C"], ["A", "B", "C"]);
    expect(d.recovered).toEqual(["A", "B", "C"]);
    expect(d.missing).toEqual([]);
    expect(d.hallucinated).toEqual([]);
  });

  it("detects the Move 1c failure mode (LLM dropped everything)", () => {
    const d = diffExportsAgainstAST([], ["OntologyNode", "OntologyEdge"]);
    expect(d.recovered).toEqual([]);
    expect(d.missing).toEqual(["OntologyNode", "OntologyEdge"]);
    expect(d.hallucinated).toEqual([]);
  });

  it("separates hallucinated provides from missing AST exports", () => {
    const d = diffExportsAgainstAST(["A", "Invented"], ["A", "B"]);
    expect(d.recovered).toEqual(["A"]);
    expect(d.missing).toEqual(["B"]);
    expect(d.hallucinated).toEqual(["Invented"]);
  });

  it("preserves AST source order in `recovered` and `missing`", () => {
    const d = diffExportsAgainstAST(["B", "A"], ["A", "B", "C"]);
    expect(d.recovered).toEqual(["A", "B"]);
    expect(d.missing).toEqual(["C"]);
  });
});

describe("patchProvidesWithAST (Move 1c safety net)", () => {
  it("fires when LLM provides is empty and AST has exports", () => {
    const p = patchProvidesWithAST([], ["OntologyNode", "OntologyEdge"]);
    expect(p.applied).toBe(true);
    expect(p.provides).toEqual(["OntologyNode", "OntologyEdge"]);
    expect(p.rescuedCount).toBe(2);
  });

  it("fires when LLM provides is undefined and AST has exports", () => {
    const p = patchProvidesWithAST(undefined, ["A", "B"]);
    expect(p.applied).toBe(true);
    expect(p.provides).toEqual(["A", "B"]);
    expect(p.rescuedCount).toBe(2);
  });

  it("does not fire when LLM produced any provides (partial extractions are not patched)", () => {
    const p = patchProvidesWithAST(["OnlyOne"], ["A", "B", "C"]);
    expect(p.applied).toBe(false);
    expect(p.provides).toEqual(["OnlyOne"]);
    expect(p.rescuedCount).toBe(0);
  });

  it("does not fire when AST has no exports (side-effect / config files)", () => {
    const p = patchProvidesWithAST([], []);
    expect(p.applied).toBe(false);
    expect(p.provides).toEqual([]);
    expect(p.rescuedCount).toBe(0);
  });

  it("returns a defensive copy so callers can mutate freely", () => {
    const ast = ["A", "B"];
    const p = patchProvidesWithAST([], ast);
    p.provides.push("C");
    expect(ast).toEqual(["A", "B"]);
  });

  it("regression: closes the context/types.ts straggler by rescuing schemas/ontology.ts provides", () => {
    // The straggler chain was: context/types.ts requires
    // ["OntologyNode", "OntologyEdge"]; upstream schemas/ontology.ts
    // emitted provides=[] from qwen 3b; gluing failed missing those
    // names; node became unrecoverable. With the safety net wired,
    // the rescue fires deterministically.
    const repoRoot = path.resolve(__dirname, "..");
    const schemasPath = path.join(repoRoot, "src/schemas/ontology.ts");
    const scan = scanFileSymbols(schemasPath);
    expect(scan.ok).toBe(true);
    const rescued = patchProvidesWithAST([], scan.mandatoryExports);
    expect(rescued.applied).toBe(true);
    expect(rescued.provides).toContain("OntologyNode");
    expect(rescued.provides).toContain("OntologyEdge");
    expect(rescued.rescuedCount).toBeGreaterThan(40);
  });
});
