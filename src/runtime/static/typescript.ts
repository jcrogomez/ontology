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
  // Normalised *syntactic* interface signature — the WRITTEN type surface
  // of the export (param + annotation + return for functions; the RHS for
  // type aliases; the public member shape for interfaces/classes/enums; the
  // annotation for typed consts). This is the syntactic tier (O1 of
  // docs/legend/CONTEXT_GLUING_REGIMES.md): it reads source text, it does
  // NOT resolve types (no TypeChecker), so inferred returns, un-annotated
  // consts, cross-file re-exports and aliased types yield `undefined`
  // ("unknown" — downstream gluing must fall back to the conservative path,
  // never a false identification). Whitespace is collapsed so formatting
  // differences do not change the signature.
  signature?: string;
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
      // A typed const carries its annotation as the signature; an
      // un-annotated const has an inferred type we cannot read without a
      // TypeChecker, so leave the signature undefined.
      const signature = decl.type
        ? normaliseSignature(decl.type.getText())
        : undefined;
      exports.push({
        name: decl.name.text,
        kind: "value",
        isDefault: false,
        ...(signature ? { signature } : {}),
      });
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
  const signature = ts.isFunctionDeclaration(node)
    ? functionSignature(node)
    : classSignature(node);
  if (hasDefaultModifier(node)) {
    exports.push({
      name: "default",
      localName: node.name.text,
      kind: "value",
      isDefault: true,
      ...(signature ? { signature } : {}),
    });
  } else {
    exports.push({
      name: node.name.text,
      kind: "value",
      isDefault: false,
      ...(signature ? { signature } : {}),
    });
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
  const signature = typeDeclSignature(node);
  exports.push({
    name: node.name.text,
    kind,
    isDefault: false,
    ...(signature ? { signature } : {}),
  });
}

function hasExportModifier(node: ts.HasModifiers): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function hasDefaultModifier(node: ts.HasModifiers): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) === true;
}

// ── Syntactic signature extraction (O1, CONTEXT_GLUING_REGIMES.md) ─────────────
//
// These read the *written* type surface of an export from the AST source
// text (parent pointers are set, so `node.getText()` resolves to the root
// SourceFile). They never resolve types — a value whose type is inferred,
// or a type alias referencing another alias, is reported verbatim, not
// expanded. Whitespace is collapsed so re-formatting a file does not churn
// the signature.

// Collapse all runs of whitespace to single spaces and trim, so two exports
// with the same canonical tokens but different indentation / line-breaks
// produce the same signature. NOTE: this does not *canonicalise* spacing —
// `a:number` and `a: number` remain distinct. That is deliberate: under-
// normalisation only ever yields a false NON-match (→ a conservative
// conflict downstream), never a false identification (the dangerous
// direction). True canonicalisation would need an AST printer; deferred.
function normaliseSignature(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// `<T>(a: X, b: Y): Z` for a function declaration. Bodies are never read —
// only type parameters, parameter declarations (name + annotation + default)
// and the return annotation.
function functionSignature(node: ts.FunctionDeclaration): string {
  const tp = node.typeParameters?.length
    ? `<${node.typeParameters.map((t) => t.getText()).join(", ")}>`
    : "";
  const params = node.parameters.map((p) => p.getText()).join(", ");
  const ret = node.type ? `: ${node.type.getText()}` : "";
  return normaliseSignature(`${tp}(${params})${ret}`);
}

// The RHS of a type alias, the member shape of an interface, or the member
// list of an enum. Implementation-free by construction.
function typeDeclSignature(
  node:
    | ts.InterfaceDeclaration
    | ts.TypeAliasDeclaration
    | ts.EnumDeclaration,
): string | undefined {
  if (ts.isTypeAliasDeclaration(node)) {
    return normaliseSignature(node.type.getText());
  }
  if (ts.isInterfaceDeclaration(node)) {
    const heritage = node.heritageClauses?.map((h) => h.getText()).join(" ") ?? "";
    const members = node.members.map((m) => m.getText()).join(" ");
    return normaliseSignature(`${heritage} { ${members} }`);
  }
  // Enum: member names + any initialisers, in source order.
  const members = node.members.map((m) => m.getText()).join(", ");
  return normaliseSignature(`{ ${members} }`);
}

// The public member shape of a class — never the method bodies. Private
// (`private` / `protected` / `#field`) members are excluded: they are not
// part of the contract a consumer can rely on. Members are sorted so member
// re-ordering does not change the signature.
function classSignature(node: ts.ClassDeclaration): string {
  const heritage = node.heritageClauses?.map((h) => h.getText()).join(" ") ?? "";
  const members = node.members
    .filter(isPublicClassMember)
    .map(classMemberSignature)
    .filter((s): s is string => s !== undefined)
    .sort();
  return normaliseSignature(`${heritage} { ${members.join("; ")} }`);
}

function isPublicClassMember(m: ts.ClassElement): boolean {
  if (m.name && ts.isPrivateIdentifier(m.name)) return false; // `#field`
  const mods = ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined;
  if (
    mods?.some(
      (x) =>
        x.kind === ts.SyntaxKind.PrivateKeyword ||
        x.kind === ts.SyntaxKind.ProtectedKeyword,
    )
  ) {
    return false;
  }
  return true;
}

// `name(a: X): Y` for a method/accessor, `name: T` for a property. Bodies
// are excluded — only the declared signature surface is read.
function classMemberSignature(m: ts.ClassElement): string | undefined {
  const name =
    m.name && ts.isIdentifier(m.name)
      ? m.name.text
      : m.name
        ? m.name.getText()
        : undefined;
  if (name === undefined) return undefined;
  if (
    ts.isMethodDeclaration(m) ||
    ts.isGetAccessorDeclaration(m) ||
    ts.isSetAccessorDeclaration(m)
  ) {
    const params = m.parameters.map((p) => p.getText()).join(", ");
    const ret = m.type ? `: ${m.type.getText()}` : "";
    return `${name}(${params})${ret}`;
  }
  if (ts.isPropertyDeclaration(m)) {
    const t = m.type ? `: ${m.type.getText()}` : "";
    return `${name}${t}`;
  }
  return undefined;
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
  // JS/TS / general noise
  "node_modules",
  "dist",
  "build",
  ".ontology",
  ".git",
  "__tests__",
  "coverage",
  // Python noise (added for γ-4 Python variant — these directories
  // never contain source we want to ingest, regardless of which
  // language the surrounding project is). Safe to include
  // unconditionally: none of these names collide with TS-project
  // conventions either.
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".pytest_cache",
  ".tox",
  ".mypy_cache",
  ".ruff_cache",
]);

// Walk `rootDir` recursively and return absolute paths to every
// `.ts` / `.tsx` file under it, skipping the conventional noise
// directories (`node_modules`, `dist`, `.ontology`, `__tests__`,
// `.git`, `coverage`). Used by γ-4's `inferEdgesFromDirectory` —
// the TS-specific import parser ONLY makes sense on TS files, so
// this helper is intentionally typed to that surface. For
// language-agnostic walks (e.g. γ-5's `onto ingest --include py`),
// use `collectSourceFiles` below.
export function collectTypeScriptFiles(rootDir: string): string[] {
  return collectSourceFiles(rootDir, ["ts", "tsx"]);
}

// Generalised walker — same skip rules and sorting, but accepts the
// list of file extensions to include. γ-5 uses this so `onto ingest
// <directory> --include py` (or `--include py,md`) can ingest a
// Python codebase or a mixed-language project; the per-file
// extraction is text-content-only and doesn't depend on the source
// language having a TS-style import parser.
//
// Extensions are matched case-insensitively, accept with or without
// the leading dot (".py" or "py" both work), and never include
// directories or files without an extension.
export function collectSourceFiles(
  rootDir: string,
  extensions: string[],
): string[] {
  // Normalise: lower-case, strip leading dot, ignore empties.
  const wanted = new Set(
    extensions
      .map((e) => e.toLowerCase().replace(/^\./, "").trim())
      .filter((e) => e.length > 0)
      .map((e) => `.${e}`),
  );
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
        if (wanted.has(ext)) out.push(full);
      }
    }
  }
}
