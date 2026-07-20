import ts from "typescript";

// Decomposition planner + assembler — the "decomposition" lever
// (REGEN_INTENT_CONSUMPTION_2026-06-17 §"WHAT TO BUILD" #4, prioritised by
// REGEN_ORACLE_REFINE_2026-06-17: the residual neck is a 7B capacity limit on
// holding a whole side-effectful module coherently in ONE generation).
//
// Instead of regenerating a whole file in a single dispatch, decomposition
// generates it in ordered SLICES — first a scaffold (types + private helpers),
// then one slice per exported function — each slice seeing the previously
// generated code as fixed context. Every slice is small enough for the model
// to hold coherently; the slices are then assembled into one module and gated
// by the SAME structural + behaviour checks as a whole-file regen.
//
// This module is pure (text in, plan/text out): no LLM, no IO, no pipeline
// coupling. The grounding it emits is AST-derived structural truth about the
// source (which declarations exist, with which signatures) — the same tier as
// ast-grounding's export list, extended to the private declaration skeleton so
// each slice knows what to produce and what already exists. It never copies a
// declaration's BODY: the model regenerates every implementation.

export interface TopLevelDecl {
  name: string;
  /** value-runtime classification used for slicing: a `function`/`const` that
   *  is exported becomes its own entry-point slice; everything else
   *  (types, interfaces, enums, classes, and non-exported values) is scaffold. */
  kind: "type" | "interface" | "enum" | "class" | "function" | "const";
  isExported: boolean;
  /** Syntactic signature surface (no body): `(params): ret` for functions,
   *  the member/RHS shape for types, the annotation for typed consts. */
  signature?: string;
  /** For a `const` whose initializer is a determining LITERAL (string /
   *  number / boolean), the literal's source text — e.g. `".lock"`. This is
   *  the richer-extraction lever (REGEN_ORACLE_REFINE addendum #3): a
   *  determining constant the regenerator otherwise guesses (it invented
   *  `.lock.json` for the lock filename). AST-derived, no body. */
  literal?: string;
}

export interface DecompositionSlice {
  /** Human label, e.g. "scaffold (types + helpers)" or "acquireLock". */
  label: string;
  /** Declarations this slice must produce (with signatures for grounding). */
  targets: TopLevelDecl[];
  /** True for the last slice — the assembled module is gated after it. */
  isFinal: boolean;
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

// A determining literal initializer: a string / number / boolean / template
// literal we can safely surface verbatim as ground truth (no expression
// evaluation, no body).
function isLiteralInitializer(node: ts.Expression): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) // -1
  );
}

/**
 * Scan a TypeScript source's TOP-LEVEL declarations (exported and private),
 * with syntactic signatures and no bodies. Returns [] on parse failure.
 */
export function scanTopLevelDecls(sourceText: string): TopLevelDecl[] {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("decl.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return [];
  }
  const exported = (node: ts.HasModifiers): boolean => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
  };
  const out: TopLevelDecl[] = [];
  ts.forEachChild(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const tp = node.typeParameters?.length ? `<${node.typeParameters.map((t) => t.getText()).join(", ")}>` : "";
      const params = node.parameters.map((p) => p.getText()).join(", ");
      const ret = node.type ? `: ${node.type.getText()}` : "";
      out.push({ name: node.name.text, kind: "function", isExported: exported(node), signature: collapse(`${tp}(${params})${ret}`) });
    } else if (ts.isClassDeclaration(node) && node.name) {
      const heritage = node.heritageClauses?.map((h) => h.getText()).join(" ") ?? "";
      out.push({ name: node.name.text, kind: "class", isExported: exported(node), signature: collapse(heritage) || undefined });
    } else if (ts.isInterfaceDeclaration(node)) {
      out.push({ name: node.name.text, kind: "interface", isExported: exported(node), signature: collapse(node.members.map((m) => m.getText()).join(" ")) });
    } else if (ts.isTypeAliasDeclaration(node)) {
      out.push({ name: node.name.text, kind: "type", isExported: exported(node), signature: collapse(node.type.getText()) });
    } else if (ts.isEnumDeclaration(node)) {
      out.push({ name: node.name.text, kind: "enum", isExported: exported(node) });
    } else if (ts.isVariableStatement(node)) {
      const isExp = exported(node);
      const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const init = decl.initializer;
          const isFn = init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
          // Capture a determining literal initializer (string / number /
          // boolean) on a const — the value the regenerator must reproduce.
          const literal =
            isConst && init !== undefined && isLiteralInitializer(init)
              ? collapse(init.getText())
              : undefined;
          out.push({
            name: decl.name.text,
            kind: isFn ? "function" : "const",
            isExported: isExp,
            signature: decl.type ? collapse(decl.type.getText()) : undefined,
            ...(literal !== undefined ? { literal } : {}),
          });
        }
      }
    }
  });
  return out;
}

/** Above this many scaffold declarations, the scaffold is CHUNKED into
 *  ordered slices of at most this size. Measured motivation (Gap-2 sweep,
 *  2026-07-07): a declaration-only module like the Zod schema core
 *  (`node_0032`, 60+ exported consts) has NO exported functions, so the
 *  whole module folded into ONE scaffold slice — decomposition degenerated
 *  to a whole-file regen and the lever bought nothing. Chunking preserves
 *  source order, which in a declaration module is the dependency order
 *  (later schemas reference earlier ones through the priorCode chain). */
export const SCAFFOLD_CHUNK_SIZE = 8;

/**
 * Plan the slices: the scaffold (every type/interface/enum/class + every
 * NON-exported value declaration + exported consts) in SOURCE ORDER — chunked
 * into slices of at most SCAFFOLD_CHUNK_SIZE when large — then one slice per
 * EXPORTED function. When there are no exported functions, the (last)
 * scaffold chunk is the final slice.
 */
export function planDecomposition(decls: readonly TopLevelDecl[]): DecompositionSlice[] {
  const isScaffold = (d: TopLevelDecl): boolean =>
    d.kind === "type" || d.kind === "interface" || d.kind === "enum" || d.kind === "class" ||
    !d.isExported || d.kind === "const";
  const scaffold = decls.filter(isScaffold);
  const entrypoints = decls.filter((d) => d.isExported && d.kind === "function");

  const slices: DecompositionSlice[] = [];
  if (scaffold.length > SCAFFOLD_CHUNK_SIZE) {
    // Chunk in source order (dependency order for declaration modules).
    const chunks: TopLevelDecl[][] = [];
    for (let i = 0; i < scaffold.length; i += SCAFFOLD_CHUNK_SIZE) {
      chunks.push(scaffold.slice(i, i + SCAFFOLD_CHUNK_SIZE));
    }
    chunks.forEach((c, i) => {
      slices.push({
        label: `scaffold ${i + 1}/${chunks.length} (${c[0].name}…)`,
        targets: c,
        isFinal: false,
      });
    });
  } else if (scaffold.length > 0) {
    slices.push({ label: "scaffold (types + private helpers)", targets: scaffold, isFinal: entrypoints.length === 0 });
  }
  entrypoints.forEach((e, i) => {
    slices.push({ label: e.name, targets: [e], isFinal: i === entrypoints.length - 1 });
  });
  // Degenerate: no decls at all → one empty final slice so the caller still
  // produces (and gates) something rather than nothing.
  if (slices.length === 0) slices.push({ label: "whole", targets: [], isFinal: true });
  else slices[slices.length - 1].isFinal = true;
  return slices;
}

/**
 * Build the slice-scoped instruction appended to the compile-back system
 * prompt: the exact declarations this slice must emit (names + signatures) and
 * the code already written by earlier slices (so this slice reuses it and does
 * not redefine it). Contract-/structure-level only — never a declaration body.
 */
export function buildSliceInstruction(slice: DecompositionSlice, priorCode: string): string {
  const lines: string[] = [];
  lines.push(
    `DECOMPOSED REGENERATION — slice "${slice.label}". You are building ONE module in slices.`,
  );
  lines.push("");
  if (priorCode.trim().length > 0) {
    lines.push(
      "EXISTING CODE already written for this module by earlier slices. REUSE these " +
        "declarations (call them, build on them); do NOT redefine, re-import, or re-export them:",
    );
    lines.push("```typescript");
    lines.push(priorCode.trim());
    lines.push("```");
    lines.push("");
  }
  lines.push(
    "In THIS slice, emit ONLY the following declaration(s), fully implemented, with " +
      "EXACTLY these names and — where a signature is given — matching it exactly " +
      "(including whether it is synchronous: do NOT add `async`/`Promise` unless the " +
      "signature shows it). Add any imports this slice needs. Do not emit anything else:",
  );
  for (const t of slice.targets) {
    const kw =
      t.kind === "function" ? "function" :
      t.kind === "const" ? "const" :
      t.kind === "class" ? "class" :
      t.kind === "enum" ? "enum" :
      t.kind === "interface" ? "interface" : "type";
    const exp = t.isExported ? "exported " : "internal (not exported) ";
    if (t.literal !== undefined) {
      // Determining constant — pin the exact value (richer-extraction lever).
      lines.push(`  - ${exp}${kw} ${t.name} = ${t.literal}  (use EXACTLY this value)`);
    } else if (t.signature) {
      lines.push(`  - ${exp}${kw} ${t.name}: ${t.signature}`);
    } else {
      lines.push(`  - ${exp}${kw} ${t.name}`);
    }
  }
  return lines.join("\n");
}

/**
 * True when the text has TypeScript SYNTAX errors (parse diagnostics). Used
 * to keep a truncated slice OUT of the assembly: a generation cut mid-
 * declaration (observed 2026-07-07 on the 7B local run — context overflow,
 * `truncated=1` in the server log) otherwise poisons the whole assembled
 * module into `regen_load_failed`, discarding every healthy slice with it.
 * Excluding the broken slice instead yields missing-export feedback that
 * implicates EXACTLY that slice, so the keep-slices round re-dispatches it
 * while the healthy slices stay frozen — the monotone loop heals truncation.
 */
export function hasSyntaxErrors(code: string): boolean {
  try {
    const sf = ts.createSourceFile("s.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diags = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
    return Array.isArray(diags) && diags.length > 0;
  } catch {
    return true;
  }
}

/** One slice's generated code plus the declarations it OWNS (its plan
 *  targets). Ownership is what makes assembly robust to a model that — as
 *  measured on a 7B — ignores "reuse, don't redefine" and regenerates the
 *  whole module in every slice: each declared name is kept ONLY from the slice
 *  that owns it, so duplicates collapse instead of producing an unloadable
 *  module with N copies of every helper. */
export interface AssemblyPart {
  code: string;
  owned: readonly TopLevelDecl[];
}

const NAMED_DECL = (
  node: ts.Node,
): { name: string; isExported: boolean } | null => {
  const exported = (n: ts.HasModifiers): boolean => {
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
    return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
  };
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
    return { name: node.name.text, isExported: exported(node) };
  }
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
    return { name: node.name.text, isExported: exported(node) };
  }
  if (ts.isVariableStatement(node)) {
    const d = node.declarationList.declarations[0];
    if (d && ts.isIdentifier(d.name)) return { name: d.name.text, isExported: exported(node) };
  }
  return null;
};

// Re-render an import declaration with any binding whose LOCAL name collides
// with an assembly-declared name REMOVED. Returns null when nothing remains
// (the whole import should be dropped). Side-effect imports (no clause) are
// kept verbatim. Motivation (Gap-2 `node_0032`, 2026-07-07): slice models
// reliably ignore "REUSE, do not re-import" and import earlier chunks'
// declarations from an invented module (`from './types'`) — the assembled
// module then declares AND imports the same names, so it can never load.
// The collision is mechanically decidable, so the assembler resolves it.
function stripCollidingImport(
  stmt: ts.ImportDeclaration,
  sf: ts.SourceFile,
  declared: ReadonlySet<string>,
): string | null {
  const clause = stmt.importClause;
  if (!clause) return stmt.getText(sf).trim(); // side-effect import — keep
  const spec = stmt.moduleSpecifier.getText(sf);

  const defaultName = clause.name && !declared.has(clause.name.text) ? clause.name.text : undefined;
  let namespace: string | undefined;
  const named: string[] = [];
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      const n = clause.namedBindings.name.text;
      if (!declared.has(n)) namespace = n;
    } else if (ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        if (!declared.has(el.name.text)) named.push(el.getText(sf).trim());
      }
    }
  }
  if (!defaultName && !namespace && named.length === 0) return null; // fully colliding — drop

  const typeOnly = clause.isTypeOnly ? "type " : "";
  const pieces: string[] = [];
  if (defaultName) pieces.push(defaultName);
  if (namespace) pieces.push(`* as ${namespace}`);
  if (named.length > 0) pieces.push(`{ ${named.join(", ")} }`);
  return `import ${typeOnly}${pieces.join(", ")} from ${spec};`;
}

/**
 * Assemble per-slice outputs into one module. Robust to overlap:
 *   - imports are collected and DEDUPLICATED, and any import BINDING whose
 *     local name collides with a declaration the assembly itself emits is
 *     stripped (the import is dropped entirely when nothing remains) — a
 *     slice that re-imports earlier slices' declarations from an invented
 *     module would otherwise make the whole module unloadable;
 *   - each top-level named declaration is kept ONLY from the slice that owns
 *     it (its plan target); duplicate copies from other slices are dropped.
 *     Names owned by no slice (model extras) are kept on first occurrence;
 *   - inline `export` modifiers and standalone `export { … }` blocks are
 *     stripped, and a SINGLE trailing `export { … }` re-declares every owned-
 *     and-exported name, so the assembly has one coherent, conflict-free
 *     export surface regardless of how each slice exported.
 * AST-based; a slice that fails to parse is appended verbatim (best-effort).
 */
export function assembleSlices(parts: readonly AssemblyPart[]): string {
  const ownerOf = new Map<string, number>();
  parts.forEach((p, i) => {
    for (const d of p.owned) if (!ownerOf.has(d.name)) ownerOf.set(d.name, i);
  });
  const exportedNames = new Set<string>();
  for (const p of parts) for (const d of p.owned) if (d.isExported) exportedNames.add(d.name);

  const seenImports = new Set<string>();
  const importLines: string[] = [];
  const keptDecls: string[] = [];
  // Every declared name is emitted AT MOST ONCE across the whole assembly —
  // guards against a slice that repeats a declaration internally as well as
  // across slices. The kept copy is the owner slice's (or the first seen for
  // unowned names).
  const emitted = new Set<string>();

  parts.forEach((part, idx) => {
    const code = part.code;
    if (!code || code.trim().length === 0) return;
    let sf: ts.SourceFile;
    try {
      sf = ts.createSourceFile("slice.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    } catch {
      keptDecls.push(code.trim());
      return;
    }
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt)) {
        const text = stmt.getText(sf).trim();
        const key = collapse(text);
        if (!seenImports.has(key)) {
          seenImports.add(key);
          importLines.push(text);
        }
        continue;
      }
      // Drop standalone `export { … }` / `export * …` — re-emitted once below.
      if (ts.isExportDeclaration(stmt) || ts.isExportAssignment(stmt)) continue;

      const named = NAMED_DECL(stmt);
      if (named) {
        const owner = ownerOf.get(named.name);
        if (owner !== undefined && owner !== idx) continue; // owned by another slice — drop
        if (emitted.has(named.name)) continue; // already emitted once — drop any repeat
        emitted.add(named.name);
        // Only CONTRACT (plan-owned) names reach the export surface. An
        // invented declaration a model exports inline (`export const ApiKey…`,
        // 31 observed on the 2026-07-07 7B run) stays as an internal helper —
        // it never becomes extra-export drift the structural gate rejects.
        if (named.isExported && ownerOf.has(named.name)) exportedNames.add(named.name);
        // Strip an inline `export`/`export default` modifier; the single
        // trailing export block owns the export surface.
        keptDecls.push(stmt.getText(sf).replace(/^export\s+(default\s+)?/, "").trim());
        continue;
      }
      // Any other top-level statement (rare) — keep verbatim.
      keptDecls.push(stmt.getText(sf).trim());
    }
  });

  // Post-pass: `emitted` is now the complete set of names the assembly
  // declares — strip any import binding that collides with one (and drop
  // imports left empty), then re-dedupe the rewritten lines.
  const finalImports: string[] = [];
  const seenFinal = new Set<string>();
  for (const line of importLines) {
    let rendered: string | null = line;
    try {
      const isf = ts.createSourceFile("imp.ts", line, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const stmt = isf.statements[0];
      if (stmt && ts.isImportDeclaration(stmt)) {
        rendered = stripCollidingImport(stmt, isf, emitted);
      }
    } catch {
      // unparseable line — keep verbatim (best-effort, matches the walk)
    }
    if (rendered === null) continue;
    const key = collapse(rendered);
    if (!seenFinal.has(key)) {
      seenFinal.add(key);
      finalImports.push(rendered);
    }
  }

  const head = finalImports.join("\n");
  const exportBlock =
    exportedNames.size > 0 ? `export {\n  ${[...exportedNames].sort().join(",\n  ")},\n};` : "";
  return [head, keptDecls.join("\n\n"), exportBlock]
    .filter((s) => s.length > 0)
    .join("\n\n") + "\n";
}
