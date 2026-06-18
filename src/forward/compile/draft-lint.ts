import ts from "typescript";

// Static self-containment + signature-shape lint for a regenerated draft —
// the "draft self-containment lint → refine" lever
// (REGEN_ORACLE_REFINE_2026-06-17 §"Proposed next levers" #1).
//
// REGEN_ORACLE_REFINE measured the oracle + verify-refine levers driving a
// glue node's structural fidelity to jaccard 1.000 while the BEHAVIOUR gate
// still failed — and reading the final draft pinned exactly two recurring,
// statically-detectable defects, with the full correct contract in the prompt:
//
//   1. the draft CALLS a helper it never declares or imports
//      (`registerExitHook(...)`) → a ReferenceError at run time;
//   2. the draft declares an exported function `async` / returning `Promise`
//      when the grounded signature is SYNCHRONOUS (`acquireLock(): Lock`) →
//      synchronous callers see a Promise, and `.body` / `.release` are
//      undefined.
//
// Both are decidable from the CANDIDATE ALONE — no access to the source
// implementation — so feeding them into the next refine round is leak-free:
// the messages describe the draft's own mistakes, exactly the signal a
// compiler/linter would give a developer. The grounded signatures used by the
// async/sync check are already in the system prompt (ast-grounding), so the
// check restates ground truth the generator already received, sharpened to
// "you violated it here."
//
// Deliberately conservative to avoid MISLEADING the refine loop:
//   - "defined names" are collected from EVERY binding anywhere in the draft
//     (module + nested scopes, params, imports), treated as one set. This
//     over-accepts (a name used outside its block scope is not flagged) so a
//     genuinely-defined helper is never falsely called "undefined."
//   - only BARE-identifier callees are checked (`foo()`, `new Foo()`), never
//     member calls (`x.foo()`); a long denylist of JS/Node globals is excluded.
//   - the async/sync check fires only when the grounded signature is clearly a
//     synchronous function signature (has a parameter list, no `Promise`, not
//     itself async) and the draft's own declaration is clearly async/Promise.

export interface DraftLintIssue {
  kind: "undefined_reference" | "async_when_sync";
  symbol: string;
  /** Leak-free message about the DRAFT's own mistake, for the refine prompt. */
  message: string;
}

// Bare-callable globals/builtins that are legitimately referenced without a
// local declaration or import. Anything bare-called and absent from both the
// draft's declarations and this set is reported.
const GLOBALS = new Set<string>([
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate",
  "clearImmediate", "queueMicrotask", "require", "structuredClone", "fetch",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
  "decodeURIComponent", "encodeURI", "decodeURI", "btoa", "atob",
  "String", "Number", "Boolean", "BigInt", "Symbol", "Array", "Object",
  "Map", "Set", "WeakMap", "WeakSet", "Promise", "Date", "RegExp", "Proxy",
  "Reflect", "JSON", "Math", "Error", "TypeError", "RangeError",
  "ReferenceError", "SyntaxError", "EvalError", "URIError", "AggregateError",
  "Function", "Buffer", "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
  "AbortController", "Promise", "console", "process", "globalThis",
]);

/**
 * Lint a regenerated draft. `signatures` is the grounded export→signature map
 * (from the AST scanner) used to decide which exports must be synchronous.
 * Returns [] on a parse failure — the lint is best-effort and must never throw
 * into the refine loop.
 */
export function lintDraft(
  draftText: string,
  signatures: Readonly<Record<string, string>> = {},
): DraftLintIssue[] {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("draft.ts", draftText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return [];
  }

  const defined = new Set<string>();
  const calledBare = new Map<string, true>(); // name → seen (preserve first only)

  const recordBinding = (name: ts.BindingName | undefined): void => {
    if (!name) return;
    if (ts.isIdentifier(name)) {
      defined.add(name.text);
    } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) recordBinding(el.name);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    // Declarations / bindings → defined set.
    if (ts.isFunctionDeclaration(node) && node.name) defined.add(node.name.text);
    else if (ts.isClassDeclaration(node) && node.name) defined.add(node.name.text);
    else if (ts.isInterfaceDeclaration(node)) defined.add(node.name.text);
    else if (ts.isTypeAliasDeclaration(node)) defined.add(node.name.text);
    else if (ts.isEnumDeclaration(node)) defined.add(node.name.text);
    else if (ts.isVariableDeclaration(node)) recordBinding(node.name);
    else if (ts.isParameter(node)) recordBinding(node.name);
    else if (ts.isBindingElement(node)) recordBinding(node.name);
    else if (ts.isCatchClause(node) && node.variableDeclaration) recordBinding(node.variableDeclaration.name);
    else if (ts.isImportClause(node)) {
      if (node.name) defined.add(node.name.text);
      const nb = node.namedBindings;
      if (nb) {
        if (ts.isNamespaceImport(nb)) defined.add(nb.name.text);
        else if (ts.isNamedImports(nb)) for (const e of nb.elements) defined.add(e.name.text);
      }
    } else if (
      (ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
      node.name
    ) {
      defined.add(node.name.text);
    }

    // Bare-identifier calls / new-expressions → candidate references.
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && !calledBare.has(callee.text)) {
        calledBare.set(callee.text, true);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  const issues: DraftLintIssue[] = [];

  // (1) Undefined references: bare-called names that are neither declared,
  // imported, nor a known global.
  for (const name of calledBare.keys()) {
    if (defined.has(name) || GLOBALS.has(name)) continue;
    issues.push({
      kind: "undefined_reference",
      symbol: name,
      message: `your output calls \`${name}(...)\` but never declares or imports \`${name}\` — define it (or remove the call). At run time this throws "ReferenceError: ${name} is not defined".`,
    });
  }

  // (2) async-when-sync: an exported function whose grounded signature is
  // synchronous, but the draft declares it async / Promise-returning.
  const syncExports = new Set<string>();
  for (const [name, sig] of Object.entries(signatures)) {
    if (isSynchronousFunctionSignature(sig)) syncExports.add(name);
  }
  if (syncExports.size > 0) {
    const asyncDecls = collectAsyncOrPromiseDecls(sf);
    for (const name of syncExports) {
      if (asyncDecls.has(name)) {
        issues.push({
          kind: "async_when_sync",
          symbol: name,
          message: `\`${name}\` must be SYNCHRONOUS — its signature returns a value directly, not a Promise. Your output declares it \`async\` / returning \`Promise\`, so synchronous callers receive a Promise instead of the value. Remove \`async\` and return the value directly.`,
        });
      }
    }
  }

  return issues;
}

// A grounded signature is a synchronous function signature when it has a
// parameter list, a return annotation, no `Promise` in it, and is not written
// as an async arrow. Non-function signatures (interfaces, type aliases) return
// false — the async/sync check does not apply to them.
function isSynchronousFunctionSignature(sig: string): boolean {
  const s = sig.trim();
  // A function signature starts with the parameter list `(` or a generic
  // `<...>(`. This rules out interface/object-type signatures like
  // `{ ...; release(): void; }` and heritage like `extends Error { ... }`,
  // which can contain method members that otherwise look callable.
  if (!(s.startsWith("(") || s.startsWith("<"))) return false;
  if (/\bPromise\b/.test(s)) return false; // already async by contract
  if (/^async\b/.test(s)) return false;
  // Must have a return annotation `): T` or be an arrow `=> T`.
  return /\)\s*:/.test(s) || /=>/.test(s);
}

// Names of top-level declarations in the draft that are async or annotated to
// return a Promise (function decls + `const x = async (…) =>` / function exprs).
function collectAsyncOrPromiseDecls(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const isAsync = (node: ts.HasModifiers): boolean => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true;
  };
  const returnsPromise = (
    node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  ): boolean => (node.type ? /\bPromise\b/.test(node.type.getText()) : false);

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (isAsync(node) || returnsPromise(node)) out.add(node.name.text);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
        (isAsync(init) || returnsPromise(init))
      ) {
        out.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
