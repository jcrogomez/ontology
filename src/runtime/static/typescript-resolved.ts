import * as crypto from "node:crypto";
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
// materialises inferred types.
//
// Nominal faithfulness: `typeToString` prints nominal types (interfaces,
// classes, enums, aliases) by NAME, unqualified — two same-named but
// structurally different types in different files would render string-equal,
// a false-merge hazard under identify-if-equal. To close it, every signature
// carries a suffix of content hashes for the project-local nominal types it
// (transitively) references: `resolved:(c: Config) => string [Config#a1b2c3d4]`.
// Equal name + equal declaration text (incl. everything it references) →
// equal hash → identification stands; same name, different structure →
// different hash → conflict (conservative). Lib / node_modules types (`Date`,
// `Promise`) stay by name — they are globally identical by construction.
// Hashes are over declaration TEXT only (whitespace-normalised, no file
// paths), so signatures stay deterministic across machines and checkouts.
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
  // Nominal hashes are pure functions of declaration text — memoise per sweep.
  const hashCache = new Map<ts.Symbol, string>();

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
      const nominalSuffix = renderNominalHashes(type, checker, program, hashCache);
      exports.push({
        name,
        signature: `${RESOLVED_SIGNATURE_PREFIX}${resolved}${nominalSuffix}`,
      });
    }
    // Deterministic order by name so re-runs and diffs are stable.
    exports.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    out.set(filePath, exports);
  }
  return out;
}

// ── Nominal-type content hashing ─────────────────────────────────────────────
//
// The suffix that makes same-NAME ≠ same-TYPE: collect every project-local
// nominal type the export's type references (type-walk for the top level,
// then a transitive closure over the collected declarations' ASTs — the AST
// is exactly what the hash covers, so closure and hash agree on what
// "structure" means), hash each declaration's normalised text, and render a
// sorted `Name#hash8` list.

const NOMINAL_FLAGS =
  ts.SymbolFlags.Interface |
  ts.SymbolFlags.Class |
  ts.SymbolFlags.Enum |
  ts.SymbolFlags.TypeAlias;

const TYPE_WALK_MAX_DEPTH = 8;

function renderNominalHashes(
  type: ts.Type,
  checker: ts.TypeChecker,
  program: ts.Program,
  hashCache: Map<ts.Symbol, string>,
): string {
  const roots = new Set<ts.Symbol>();
  collectTypeNominals(type, checker, program, roots, new Set(), 0);
  if (roots.size === 0) return "";
  const closed = transitiveNominalClosure(roots, checker, program);
  const entries = closed
    .map((s) => `${s.getName()}#${nominalHash(s, hashCache)}`)
    .sort();
  return ` [${entries.join(", ")}]`;
}

function isProjectLocal(sym: ts.Symbol, program: ts.Program): boolean {
  const decls = sym.declarations ?? [];
  return decls.some((d) => {
    const sf = d.getSourceFile();
    return (
      !program.isSourceFileDefaultLibrary(sf) &&
      !sf.fileName.includes("node_modules")
    );
  });
}

// Walk the resolved type structurally and collect project-local nominal
// symbols it references. Members of a collected nominal are NOT walked here —
// the declaration-AST closure covers them (and only them: lib types are
// stable by construction and stay un-hashed).
function collectTypeNominals(
  type: ts.Type,
  checker: ts.TypeChecker,
  program: ts.Program,
  out: Set<ts.Symbol>,
  seen: Set<ts.Type>,
  depth: number,
): void {
  if (depth > TYPE_WALK_MAX_DEPTH || seen.has(type)) return;
  seen.add(type);

  // `type Mode = ...` used in a value position prints as `Mode` via the alias
  // symbol — capture it (and its type arguments) before anything else.
  const alias = type.aliasSymbol;
  if (alias && alias.flags & NOMINAL_FLAGS && isProjectLocal(alias, program)) {
    out.add(alias);
  }
  for (const ta of type.aliasTypeArguments ?? []) {
    collectTypeNominals(ta, checker, program, out, seen, depth + 1);
  }

  if (type.isUnionOrIntersection()) {
    for (const t of type.types) {
      collectTypeNominals(t, checker, program, out, seen, depth + 1);
    }
    return;
  }

  const sym = type.getSymbol();
  const isNominal = sym !== undefined && (sym.flags & NOMINAL_FLAGS) !== 0;
  if (isNominal && isProjectLocal(sym!, program)) {
    out.add(sym!);
  }

  if (type.flags & ts.TypeFlags.Object) {
    // Type arguments of references (Array<Config>, Promise<Config>, Box<T>)
    // are walked even when the reference target itself is a lib type.
    if ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) {
      for (const ta of checker.getTypeArguments(type as ts.TypeReference)) {
        collectTypeNominals(ta, checker, program, out, seen, depth + 1);
      }
    }
    // Anonymous shapes (function types, object literals) have no declaration
    // to hash — walk into their structure instead.
    if (!isNominal) {
      const callLike = [
        ...type.getCallSignatures(),
        ...type.getConstructSignatures(),
      ];
      for (const sig of callLike) {
        for (const p of sig.getParameters()) {
          const pd = p.valueDeclaration ?? p.declarations?.[0];
          if (pd) {
            collectTypeNominals(
              checker.getTypeOfSymbolAtLocation(p, pd),
              checker, program, out, seen, depth + 1,
            );
          }
        }
        collectTypeNominals(sig.getReturnType(), checker, program, out, seen, depth + 1);
      }
      for (const prop of type.getProperties()) {
        const pd = prop.valueDeclaration ?? prop.declarations?.[0];
        if (pd) {
          collectTypeNominals(
            checker.getTypeOfSymbolAtLocation(prop, pd),
            checker, program, out, seen, depth + 1,
          );
        }
      }
      for (const info of checker.getIndexInfosOfType(type)) {
        collectTypeNominals(info.type, checker, program, out, seen, depth + 1);
      }
    }
  }
}

// Close over what the collected declarations themselves reference: a Config
// whose text mentions Inner must drag Inner's hash along, or two textually
// identical Configs over divergent Inners would falsely match. Termination:
// the symbol set is finite and `closed` only grows.
function transitiveNominalClosure(
  roots: Set<ts.Symbol>,
  checker: ts.TypeChecker,
  program: ts.Program,
): ts.Symbol[] {
  const closed = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const sym = queue.pop()!;
    for (const decl of sym.declarations ?? []) {
      collectAstTypeRefs(decl, checker, program, (found) => {
        if (!closed.has(found)) {
          closed.add(found);
          queue.push(found);
        }
      });
    }
  }
  return [...closed];
}

function collectAstTypeRefs(
  node: ts.Node,
  checker: ts.TypeChecker,
  program: ts.Program,
  onFound: (sym: ts.Symbol) => void,
): void {
  const visit = (n: ts.Node): void => {
    let nameNode: ts.Node | undefined;
    if (ts.isTypeReferenceNode(n)) nameNode = n.typeName;
    else if (ts.isExpressionWithTypeArguments(n) && ts.isIdentifier(n.expression)) {
      nameNode = n.expression; // heritage: `extends Base`
    }
    if (nameNode) {
      let sym = checker.getSymbolAtLocation(nameNode);
      if (sym && sym.flags & ts.SymbolFlags.Alias) {
        sym = checker.getAliasedSymbol(sym);
      }
      if (sym && sym.flags & NOMINAL_FLAGS && isProjectLocal(sym, program)) {
        onFound(sym);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
}

// Hash of the declaration TEXT (whitespace-normalised, comments excluded by
// `getText()`'s span) — no file paths, so equal-by-text types hash equal
// across machines, checkouts, and files.
function nominalHash(sym: ts.Symbol, cache: Map<ts.Symbol, string>): string {
  const hit = cache.get(sym);
  if (hit !== undefined) return hit;
  const text = (sym.declarations ?? [])
    .map((d) => d.getText().replace(/\s+/g, " ").trim())
    .sort()
    .join("\n");
  const h = crypto.createHash("sha256").update(text).digest("hex").slice(0, 8);
  cache.set(sym, h);
  return h;
}
