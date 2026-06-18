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

/**
 * Plan the slices: a single scaffold slice (every type/interface/enum/class +
 * every NON-exported value declaration), then one slice per EXPORTED function.
 * Exported non-function values fold into the scaffold (they are usually
 * constants, not the hard generation target). When there are no exported
 * functions, the scaffold is the only — and final — slice.
 */
export function planDecomposition(decls: readonly TopLevelDecl[]): DecompositionSlice[] {
  const isScaffold = (d: TopLevelDecl): boolean =>
    d.kind === "type" || d.kind === "interface" || d.kind === "enum" || d.kind === "class" ||
    !d.isExported || d.kind === "const";
  const scaffold = decls.filter(isScaffold);
  const entrypoints = decls.filter((d) => d.isExported && d.kind === "function");

  const slices: DecompositionSlice[] = [];
  if (scaffold.length > 0) {
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

/**
 * Assemble per-slice outputs into one module. Robust to overlap:
 *   - imports are collected and DEDUPLICATED;
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
        if (named.isExported) exportedNames.add(named.name);
        // Strip an inline `export`/`export default` modifier; the single
        // trailing export block owns the export surface.
        keptDecls.push(stmt.getText(sf).replace(/^export\s+(default\s+)?/, "").trim());
        continue;
      }
      // Any other top-level statement (rare) — keep verbatim.
      keptDecls.push(stmt.getText(sf).trim());
    }
  });

  const head = importLines.join("\n");
  const exportBlock =
    exportedNames.size > 0 ? `export {\n  ${[...exportedNames].sort().join(",\n  ")},\n};` : "";
  return [head, keptDecls.join("\n\n"), exportBlock]
    .filter((s) => s.length > 0)
    .join("\n\n") + "\n";
}
