import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0053 — src/runtime/static/typescript.ts
// Tested entry: parseTypeScriptFile(filePath, source) — the pure
// string→{imports,exports} scanner that feeds contract measurement.
// Cases use only external module specifiers so resolveLocalImport's
// fs.existsSync path is never reached. A regen that mislabels import
// kinds (type vs namespace), drops signature extraction, or flips the
// enum value/type classification would diverge here.

type Parsed = {
  filePath: string;
  imports: Array<Record<string, unknown>>;
  exports: Array<Record<string, unknown>>;
};
type Api = { parseTypeScriptFile: (filePath: string, source: string) => Parsed };

export const cases: BehaviorCase[] = [
  {
    name: "parseTypeScriptFile — import kinds: named, default, namespace, type-only",
    setup: () => ({
      filePath: "virtual/imports.ts",
      source: [
        `import { readFileSync, statSync as st } from "node:fs";`,
        `import ts from "typescript";`,
        `import * as path from "node:path";`,
        `import type { Dirent } from "node:fs";`,
      ].join("\n"),
    }),
    invoke: (api, ctx) => {
      const { filePath, source } = ctx as { filePath: string; source: string };
      return (api as Api).parseTypeScriptFile(filePath, source).imports;
    },
    assert: (r) =>
      Array.isArray(r) &&
      r.length === 4 &&
      (r[1] as { defaultImport?: string }).defaultImport === "ts" &&
      (r[2] as { kind: string }).kind === "namespace" &&
      (r[3] as { kind: string }).kind === "type",
  },
  {
    name: "parseTypeScriptFile — function signature is extracted and whitespace-collapsed",
    setup: () => ({
      filePath: "virtual/fn.ts",
      source: [
        `export function clamp(`,
        `  n: number,`,
        `  lo: number,`,
        `  hi: number,`,
        `): number {`,
        `  return Math.max(lo, Math.min(hi, n));`,
        `}`,
      ].join("\n"),
    }),
    invoke: (api, ctx) => {
      const { filePath, source } = ctx as { filePath: string; source: string };
      return (api as Api).parseTypeScriptFile(filePath, source).exports;
    },
    assert: (r) =>
      Array.isArray(r) &&
      r.length === 1 &&
      (r[0] as { name: string }).name === "clamp" &&
      (r[0] as { signature?: string }).signature ===
        "(n: number, lo: number, hi: number): number",
  },
  {
    name: "parseTypeScriptFile — interface/alias are type-kind, enum is value-kind",
    setup: () => ({
      filePath: "virtual/types.ts",
      source: [
        `export interface Point { x: number; y: number }`,
        `export type Pair = [number, number];`,
        `export enum Mode { On = 1, Off = 0 }`,
      ].join("\n"),
    }),
    invoke: (api, ctx) => {
      const { filePath, source } = ctx as { filePath: string; source: string };
      return (api as Api)
        .parseTypeScriptFile(filePath, source)
        .exports.map((e) => ({ name: e.name, kind: e.kind, signature: e.signature }));
    },
    assert: (r) =>
      Array.isArray(r) &&
      r.length === 3 &&
      (r[0] as { kind: string }).kind === "type" &&
      (r[1] as { kind: string }).kind === "type" &&
      (r[2] as { kind: string }).kind === "value",
  },
  {
    name: "parseTypeScriptFile — typed const carries signature, bare const and default export do not",
    setup: () => ({
      filePath: "virtual/consts.ts",
      source: [
        `export const LIMIT: number = 10;`,
        `export const inferred = "abc";`,
        `export default LIMIT;`,
      ].join("\n"),
    }),
    invoke: (api, ctx) => {
      const { filePath, source } = ctx as { filePath: string; source: string };
      return (api as Api).parseTypeScriptFile(filePath, source).exports;
    },
    assert: (r) =>
      Array.isArray(r) &&
      r.length === 3 &&
      (r[0] as { signature?: string }).signature === "number" &&
      (r[1] as { signature?: string }).signature === undefined &&
      (r[2] as { isDefault: boolean }).isDefault === true,
  },
];
