import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

// Static analysis for TypeScript source files (Project Legend γ-4).
//
// Reads a single file (or walks a directory) and emits the imports +
// exports it declares, without ever calling an LLM. The output is
// the structural graph of "who imports from whom" — used by γ-5's
// `onto ingest <directory>` to seed `depends_on` / `uses_token`
// edges between the proposals the LLM produces for each file.
//
// Why static, not LLM:
//   - cheap: zero token spend, runs in milliseconds per file.
//   - precise: the TS compiler API knows the language really has
//     that import; an LLM would have to be trusted on syntactic
//     facts that are already mechanically decidable.
//   - composable: the same parser can feed token-vocabulary
//     normalisation (path fibration, β-3) and the verify-homeomorphism
//     diff downstream.
//
// Scope of γ-4 v0:
//   - Named imports (`import { a, b } from "./x.js"`)
//   - Default imports (`import x from "./x.js"`)
//   - Namespace imports (`import * as ns from "./x.js"`)
//   - Type-only imports (`import type { T } from "./x.js"`)
//   - Named exports (`export { a, b }`, `export const a = …`)
//   - Default exports (`export default …`)
//   - Re-exports (`export { a } from "./x.js"`)
// Out of scope for now (TBD if needed):
//   - Dynamic imports (`import("./x.js")`) — runtime patterns, harder
//     to map to a static graph
//   - `require()` calls — CommonJS interop; TS uses ESM in this
//     codebase
//   - Triple-slash references — ambient declarations; not load-bearing
//     for ingest

/**
 * One side of an import declaration. `modulePath` is the raw text
 * from the source (e.g. `"./hash.js"`); `resolvedPath` is the
 * cwd-relative resolved path if the import is local, or `null` for
 * external module specifiers (`"node:crypto"`, `"react"`, …).
 */
export interface ImportRef {
  modulePath: string;
  resolvedPath: string | null;
  // `"value"` = runtime import. `"type"` = compile-time-only (`import
  // type { T } from …`). `"namespace"` = `import * as ns from …`,
  // a value import that grabs every export.
  kind: "value" | "type" | "namespace";
  // Each entry is one symbol surfaced by this import. For `import
  // { a, b as c } from "./x.js"` we emit `["a", "c"]` (the local
  // alias is what the source file actually uses).
  imports: string[];
  // Set only when the import binds a default-export to a local
  // name (`import x from "./x.js"` → `defaultImport: "x"`).
  defaultImport?: string;
  // Set only when the import binds the whole module to a local
  // namespace (`import * as ns from "./x.js"` → `namespace: "ns"`).
  namespace?: string;
}

/**
 * One exported binding. `name` is the public name the importer
 * sees; `localName` (when different) is the implementation name
 * inside this file. `reExportedFrom` is set when the export is a
 * pass-through (`export { a } from "./x.js"`), in which case the
 * import edge to the upstream module is also emitted under
 * `imports[]`.
 */
export interface ExportRef {
  name: string;
  localName?: string;
  kind: "value" | "type";
  isDefault: boolean;
  reExportedFrom?: string;
}

export interface ParsedTSFile {
  filePath: string;
  imports: ImportRef[];
  exports: ExportRef[];
}

/**
 * One inferred edge between two files. Mirrors the Ontology edge
 * shape so γ-5 can lift these into typed graph edges with minimal
 * translation:
 *   - `depends_on` when the consumer references a value (function,
 *     class, runtime constant) from the producer.
 *   - `uses_token` when the consumer references only a type (`import
 *     type`) — the dependency is structural / contractual, not
 *     runtime.
 *
 * `tokens` lists the specific symbols crossing the boundary, so
 * downstream consumers (the validator, verify-homeomorphism) can
 * narrow their reasoning to the import surface.
 */
export interface InferredEdge {
  fromFile: string;
  toFile: string;
  type: "depends_on" | "uses_token";
  tokens: string[];
}

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a TypeScript source file and return its import / export
 * surface. The `filePath` is used for module resolution; the
 * `source` is the file content (read by the caller so this function
 * stays pure-functional and unit-testable).
 */
export function parseTypeScriptFile(
  filePath: string,
  source: string,
): ParsedTSFile {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    inferScriptKind(filePath),
  );

  const imports: ImportRef[] = [];
  const exports: ExportRef[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const ref = readImport(node, filePath);
      if (ref) imports.push(ref);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      const { exportEntries, reExportImport } = readExportDeclaration(
        node,
        filePath,
      );
      exports.push(...exportEntries);
      if (reExportImport) imports.push(reExportImport);
      return;
    }
    if (ts.isVariableStatement(node)) {
      readExportedVariables(node, exports);
      return;
    }
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      readExportedDeclaration(node, exports);
      return;
    }
    if (
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      readExportedTypeDeclaration(node, exports);
      return;
    }
    if (ts.isExportAssignment(node)) {
      // `export default <expr>` (without an identifier the import
      // would bind a runtime value; we cannot statically extract the
      // local name, so leave localName undefined).
      exports.push({
        name: "default",
        kind: "value",
        isDefault: true,
      });
      return;
    }
  });

  return { filePath, imports, exports };
}

// ── Edge inference ──────────────────────────────────────────────────────────

/**
 * Walk a directory and parse every `.ts` / `.tsx` file (skipping
 * `node_modules`, `dist`, `.ontology`, and any directory named
 * `__tests__` to keep the structural graph focused on production
 * code). Returns the inferred edges across the collected files.
 *
 * Imports whose `resolvedPath` falls outside `rootDir` (or resolves
 * to a non-`.ts` file) are dropped — they are external dependencies
 * (`node:crypto`, npm packages, generated `.js` files) that do not
 * belong in the cross-file graph. Phase γ-5 will surface external
 * imports separately as `requires` tokens on the consumer node.
 */
export function inferEdgesFromDirectory(rootDir: string): InferredEdge[] {
  const files = collectTypeScriptFiles(rootDir);
  const parsed = new Map<string, ParsedTSFile>();
  for (const filePath of files) {
    try {
      const source = fs.readFileSync(filePath, "utf-8");
      parsed.set(filePath, parseTypeScriptFile(filePath, source));
    } catch {
      // skip unreadable / non-utf8 files; never break the sweep
      // because of one malformed source
    }
  }

  const edges: InferredEdge[] = [];
  for (const [fromFile, file] of parsed) {
    // Group imports by (resolvedPath, kind) so all symbols sharing
    // the same edge land in one tokens[] array. Two imports of the
    // same module — one type-only and one value — produce two
    // edges (one uses_token, one depends_on).
    type Bucket = { type: InferredEdge["type"]; tokens: Set<string> };
    const buckets = new Map<string, Bucket>();
    for (const imp of file.imports) {
      if (!imp.resolvedPath) continue; // external (node: / package)
      if (!parsed.has(imp.resolvedPath)) continue; // not in scanned set
      const edgeType: InferredEdge["type"] =
        imp.kind === "type" ? "uses_token" : "depends_on";
      const key = `${imp.resolvedPath}|${edgeType}`;
      const bucket = buckets.get(key) ?? { type: edgeType, tokens: new Set<string>() };
      for (const t of imp.imports) bucket.tokens.add(t);
      if (imp.defaultImport) bucket.tokens.add(imp.defaultImport);
      if (imp.namespace) bucket.tokens.add(`* as ${imp.namespace}`);
      buckets.set(key, bucket);
    }
    for (const [key, bucket] of buckets) {
      const toFile = key.slice(0, key.lastIndexOf("|"));
      edges.push({
        fromFile,
        toFile,
        type: bucket.type,
        tokens: Array.from(bucket.tokens).sort(),
      });
    }
  }
  // Deterministic order: by (fromFile, toFile, type). Test fixtures
  // and verify-homeomorphism diffs both benefit from stability.
  edges.sort((a, b) => {
    if (a.fromFile !== b.fromFile) return a.fromFile < b.fromFile ? -1 : 1;
    if (a.toFile !== b.toFile) return a.toFile < b.toFile ? -1 : 1;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });
  return edges;
}

// ── Internals ───────────────────────────────────────────────────────────────

function inferScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".js") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function readImport(
  node: ts.ImportDeclaration,
  filePath: string,
): ImportRef | undefined {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return undefined;
  const modulePath = node.moduleSpecifier.text;
  const resolvedPath = resolveLocalImport(modulePath, filePath);

  // `import "./side-effect.js"` (bare side-effect import). No
  // bindings to record, but the dependency edge is real.
  if (!node.importClause) {
    return {
      modulePath,
      resolvedPath,
      kind: "value",
      imports: [],
    };
  }
  const clause = node.importClause;
  // `import type { T } from …` — every binding is type-only.
  const isTypeOnly = clause.isTypeOnly === true;

  const ref: ImportRef = {
    modulePath,
    resolvedPath,
    kind: isTypeOnly ? "type" : "value",
    imports: [],
  };

  if (clause.name) {
    // Default import: `import x from "./x.js"`. Binds the default
    // export to a local name.
    ref.defaultImport = clause.name.text;
  }

  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      ref.namespace = clause.namedBindings.name.text;
      // Namespace imports are inherently value-kind even when nested
      // in an `import type * as …` (TS allows it for completeness
      // but the runtime semantics are the same: bind a module
      // namespace object).
      if (!isTypeOnly) ref.kind = "namespace";
    } else if (ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        // Local alias takes precedence: `import { a as b } from …`
        // means this file uses `b`, not `a`.
        ref.imports.push(el.name.text);
      }
    }
  }

  return ref;
}

function readExportDeclaration(
  node: ts.ExportDeclaration,
  filePath: string,
): { exportEntries: ExportRef[]; reExportImport?: ImportRef } {
  const exportEntries: ExportRef[] = [];
  let reExportImport: ImportRef | undefined;

  // `export { a, b }` or `export { a } from "./x.js"`
  const moduleSpec = node.moduleSpecifier;
  const fromModule =
    moduleSpec && ts.isStringLiteral(moduleSpec) ? moduleSpec.text : undefined;

  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const el of node.exportClause.elements) {
      const name = el.name.text;
      const localName = el.propertyName?.text;
      exportEntries.push({
        name,
        localName,
        kind: node.isTypeOnly || el.isTypeOnly ? "type" : "value",
        isDefault: false,
        reExportedFrom: fromModule,
      });
    }
  } else if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
    // `export * as ns from "./x.js"` — surface as a namespace export.
    exportEntries.push({
      name: node.exportClause.name.text,
      kind: node.isTypeOnly ? "type" : "value",
      isDefault: false,
      reExportedFrom: fromModule,
    });
  }

  // For re-exports (`export … from "./x.js"`), the upstream module
  // is also an import dependency. Synthesise an ImportRef so the
  // edge inference picks it up.
  if (fromModule) {
    const resolvedPath = resolveLocalImport(fromModule, filePath);
    reExportImport = {
      modulePath: fromModule,
      resolvedPath,
      kind: node.isTypeOnly ? "type" : "value",
      // For star re-exports (`export * from "./x.js"`) without a
      // clause, leave imports[] empty — the edge is the dependency,
      // not specific tokens.
      imports: exportEntries
        .filter((e) => e.localName ?? e.name)
        .map((e) => e.localName ?? e.name),
    };
  }

  return { exportEntries, reExportImport };
}

function readExportedVariables(
  node: ts.VariableStatement,
  exports: ExportRef[],
): void {
  if (!hasExportModifier(node)) return;
  const isType = false; // a `const` / `let` is always a value
  for (const decl of node.declarationList.declarations) {
    if (ts.isIdentifier(decl.name)) {
      exports.push({ name: decl.name.text, kind: "value", isDefault: false });
    } else {
      // Destructuring patterns are rare and complicated to surface
      // structurally; skip for v0.
    }
    void isType;
  }
}

function readExportedDeclaration(
  node: ts.FunctionDeclaration | ts.ClassDeclaration,
  exports: ExportRef[],
): void {
  if (!hasExportModifier(node)) return;
  if (!node.name) {
    // `export default function () {}` — no local name. Emit a
    // default export entry.
    if (hasDefaultModifier(node)) {
      exports.push({ name: "default", kind: "value", isDefault: true });
    }
    return;
  }
  if (hasDefaultModifier(node)) {
    exports.push({
      name: "default",
      localName: node.name.text,
      kind: "value",
      isDefault: true,
    });
  } else {
    exports.push({ name: node.name.text, kind: "value", isDefault: false });
  }
}

function readExportedTypeDeclaration(
  node:
    | ts.InterfaceDeclaration
    | ts.TypeAliasDeclaration
    | ts.EnumDeclaration,
  exports: ExportRef[],
): void {
  if (!hasExportModifier(node)) return;
  // Enums are runtime values (compiled to an object), so emit as
  // value. Interfaces and type aliases are erased at compile time.
  const kind: "value" | "type" = ts.isEnumDeclaration(node) ? "value" : "type";
  exports.push({ name: node.name.text, kind, isDefault: false });
}

function hasExportModifier(node: ts.HasModifiers): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function hasDefaultModifier(node: ts.HasModifiers): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) === true;
}

// Resolve `modulePath` relative to `fromFile`. Returns the absolute
// path on disk if the import is local AND we can find the file by
// trying `.ts` / `.tsx` extensions and the `.js` → `.ts` rewrite
// (the project's ESM convention is `import "./x.js"` while the
// source on disk is `x.ts`). Returns null for everything else
// (node: builtins, npm packages, unresolvable specifiers).
function resolveLocalImport(
  modulePath: string,
  fromFile: string,
): string | null {
  if (
    !modulePath.startsWith(".") &&
    !modulePath.startsWith("/")
  ) {
    return null;
  }
  const fromDir = path.dirname(fromFile);
  const candidates = expandResolutionCandidates(
    path.resolve(fromDir, modulePath),
  );
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function expandResolutionCandidates(absPath: string): string[] {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return [absPath];
  if (ext === ".js") {
    // The ESM convention in this codebase: imports are written
    // with `.js` but the file on disk is `.ts`. Try the `.ts`
    // rewrite first, then the `.tsx`, then the raw `.js` as a
    // fallback.
    const stem = absPath.slice(0, -3);
    return [stem + ".ts", stem + ".tsx", absPath];
  }
  if (ext === ".jsx") {
    const stem = absPath.slice(0, -4);
    return [stem + ".tsx", absPath];
  }
  // No extension — try `.ts`, `.tsx`, `index.ts`, `index.tsx`.
  return [
    absPath + ".ts",
    absPath + ".tsx",
    path.join(absPath, "index.ts"),
    path.join(absPath, "index.tsx"),
  ];
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".ontology",
  ".git",
  "__tests__",
  "coverage",
]);

// Walk `rootDir` recursively and return absolute paths to every
// `.ts` / `.tsx` file under it, skipping the conventional noise
// directories (`node_modules`, `dist`, `.ontology`, `__tests__`,
// `.git`, `coverage`). Exported so `onto ingest <directory>` (γ-5)
// can reuse the same traversal as `inferEdgesFromDirectory`. Sorted
// output ensures deterministic per-file proposal ordering across
// runs.
export function collectTypeScriptFiles(rootDir: string): string[] {
  const out: string[] = [];
  walk(rootDir);
  return out.sort();

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory; skip
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".ts" || ext === ".tsx") out.push(full);
      }
    }
  }
}
