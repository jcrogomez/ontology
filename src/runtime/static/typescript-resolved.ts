import * as path from "node:path";
import ts from "typescript";

// Resolved-type signature extraction (Path to T1, gate #1 of
// docs/legend/CONTEXT_GLUING_REGIMES.md / MATHEMATICAL_CLAIMS.md §Axiom 5).
//
// O1's `parseTypeScriptFile` reads the *written* signature of an export with
// `ts.createSourceFile` — a single-file, syntactic view: `a: Foo` stays
// `a: Foo` (alias unexpanded), an inferred return is invisible. That is a
// SOUND but coarse proxy for "same capability": it never false-merges, but it
// misses legitimate matches whose written forms differ.
//
// This module upgrades the discriminator to a RESOLVED view: it builds a real
// `ts.Program` (so module resolution + lib are in scope) and asks the
// TypeChecker for each export's type, which follows re-export aliases and
// materialises inferred types. Honest scope: `typeToString` still prints
// *nominal* types (interfaces, classes) by NAME, unqualified — so two
// same-named but structurally different types in different files can produce
// string-equal resolved signatures. The resolved tier is a finer proxy than
// the syntactic one for inferred/re-exported values, not a full structural
// identity; that residual false-merge hazard is why `--resolved-signatures`
// stays opt-in (see MATHEMATICAL_CLAIMS.md §Axiom 5 honest-scope).
//
// Tier safety: a resolved signature and a syntactic one are NOT comparable by
// string equality (different normal forms). Callers MUST keep the two tiers
// from being compared as if equal — see `RESOLVED_SIGNATURE_PREFIX` and the
// wiring in static-summary. Resolved signatures carry the prefix so plain
// string-equality in `glueFragments` only ever glues resolved-with-resolved
// or syntactic-with-syntactic, never across tiers (conservative).
//
// Cost / scope: `createProgram` is heavy (loads lib.d.ts, walks the import
// graph) and needs the files to live in a resolvable project. It fits the
// INGEST path (real source tree). It does NOT fit an isolated artefact string
// (no project) — that path keeps the syntactic tier.

/** Marks a signature as resolved-tier so it never string-equals a syntactic one. */
export const RESOLVED_SIGNATURE_PREFIX = "resolved:";

export interface ResolvedExport {
  name: string;
  /** Resolved type, prefixed with `RESOLVED_SIGNATURE_PREFIX`. */
  signature: string;
}

// Compiler options mirroring tsconfig.json (NodeNext, strict, ES2022) so
// module resolution matches the repo's `.js`-import convention, plus
// noEmit + skipLibCheck for a read-only, faster pass. Pinned so `typeToString`
// output is stable across environments.
const PROGRAM_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  declaration: false,
  // Ingest accepts .js/.jsx inputs; without these the program silently
  // drops them (zero exports) and the node keeps its syntactic tier.
  allowJs: true,
  jsx: ts.JsxEmit.Preserve,
};

const TYPE_FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType;

/**
 * Build one `ts.Program` over `filePaths` (absolute) and return, per file, the
 * resolved type signature of every exported symbol. Default exports are
 * excluded (they have no stable matchable name, matching O1). Files the
 * program cannot load yield an empty array rather than throwing, so one bad
 * file never breaks an ingest sweep.
 */
export function extractResolvedSignatures(
  filePaths: string[],
): Map<string, ResolvedExport[]> {
  const abs = filePaths.map((f) => path.resolve(f));
  const program = ts.createProgram(abs, PROGRAM_OPTIONS);
  const checker = program.getTypeChecker();
  const out = new Map<string, ResolvedExport[]>();

  for (const filePath of abs) {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      out.set(filePath, []);
      continue;
    }
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {
      out.set(filePath, []);
      continue;
    }
    const exports: ResolvedExport[] = [];
    for (const sym of checker.getExportsOfModule(moduleSymbol)) {
      const name = sym.getName();
      if (name === "default" || name === "export=") continue;
      const decl =
        sym.valueDeclaration ?? sym.declarations?.[0];
      if (!decl) continue;
      // Resolve the symbol's type at its declaration and stringify it. For an
      // alias re-export, follow the alias to the aliased symbol first.
      const target =
        sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      const targetDecl = target.valueDeclaration ?? target.declarations?.[0] ?? decl;
      // Type-only exports (interface / type alias) have no value side, so
      // asking the checker for a value type yields the error type, which
      // stringifies as `any`. Emitting that would REPLACE a discriminating
      // syntactic signature with a constant — a false-merge hazard under
      // identify-if-equal. Emit nothing instead: a missing signature means
      // conflict, never identification (conservative).
      if (!target.valueDeclaration) continue;
      const type = checker.getTypeOfSymbolAtLocation(target, targetDecl);
      // Same guard for values whose type resolves to `any` (error type, bare
      // `any` annotations, degraded JSX): zero discriminating power.
      if (type.flags & ts.TypeFlags.Any) continue;
      const resolved = checker.typeToString(type, targetDecl, TYPE_FORMAT_FLAGS);
      exports.push({
        name,
        signature: `${RESOLVED_SIGNATURE_PREFIX}${resolved}`,
      });
    }
    // Deterministic order by name so re-runs and diffs are stable.
    exports.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    out.set(filePath, exports);
  }
  return out;
}
