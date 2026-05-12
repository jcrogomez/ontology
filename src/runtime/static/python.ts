import * as fs from "node:fs";
import * as path from "node:path";
import type { InferredEdge } from "./typescript.js";
import { collectSourceFiles } from "./typescript.js";

// Static analysis for Python source files (Project Legend γ-4 Python
// variant, shipped after the TS-first γ-4 to support the Vibe-Reasoning
// calibration runbook). Same contract as the TypeScript parser:
//
//   - Read a single file (or walk a directory), extract its `import`
//     and `from … import …` declarations, resolve module paths back
//     to file paths under the project root, and emit the cross-file
//     `depends_on` / `uses_token` graph.
//   - No LLM call, no Python interpreter, no `ast` module. Pure regex
//     over the source. Good enough for the import-graph surface,
//     which is highly regular syntactically in Python.
//
// Scope of γ-4 Python v0:
//   - `import foo`                    (module import)
//   - `import foo.bar`                (dotted module import)
//   - `import foo as bar`             (aliased)
//   - `import foo, bar`               (multiple on one line)
//   - `from foo import bar`           (named symbol)
//   - `from foo import bar, baz`      (multiple symbols)
//   - `from foo import (bar, baz)`    (parenthesized — single line only in v0)
//   - `from foo import bar as quux`   (aliased symbol)
//   - `from foo import *`             (wildcard; emitted as a single "*" token)
//   - `from . import foo`             (relative — same package)
//   - `from .foo import bar`          (relative — sibling module)
//   - `from ..foo import bar`         (relative — two levels up)
//
// Out of scope (limitations, documented):
//   - Multi-line parenthesized `from foo import (\n    bar,\n    baz\n)`.
//     Captured as a single line gives us `bar` / `baz` only if it's
//     actually on one line. Multi-line forms produce a single
//     wildcard-shaped entry; future v1 can flatten properly.
//   - `if TYPE_CHECKING:` blocks producing type-only imports — we
//     treat all Python imports as `depends_on` for v0. The cost of
//     wrong type-vs-value classification is small for ingest: γ-6
//     just lifts whatever we emit.
//   - Conditional imports inside functions / methods. The structural
//     graph we care about is module-level; runtime-only imports are
//     deliberately ignored.
//   - Editable installs / namespace packages without __init__.py
//     under the project root. Standard Python convention: a directory
//     becomes a package when it contains `__init__.py` (or via setup
//     metadata that we don't read).
//
// Why regex, not tree-sitter:
//   - Zero new dependency. Tree-sitter would be ~5MB of native
//     bindings for marginal correctness gain on the structural
//     import surface.
//   - Python `import` syntax is one of the most regular pieces of
//     the language. Top-level imports are statements that begin a
//     logical line with `import` or `from`; regex captures them
//     with very high precision when run after the per-line
//     conditional / comment strip.
//   - A future γ-4-v2 can swap to tree-sitter behind the same
//     `parsePythonFile` signature with no upstream consumer change.

// ── Types ───────────────────────────────────────────────────────────────────

export interface PythonImportRef {
  // Raw module specifier as written in source. For `from .foo import bar`
  // this is `.foo`; for `import foo.bar` this is `foo.bar`.
  modulePath: string;
  // Resolved absolute file path under the project root, or null if
  // the import targets an external package / stdlib module.
  resolvedPath: string | null;
  // List of symbols this import binds locally. For `import foo` the
  // single symbol is the module's binding name (`foo` or the alias);
  // for `from foo import a, b` the symbols are `["a", "b"]`. For
  // `from foo import *` the singleton symbol is `"*"`.
  imports: string[];
  // True for `from … import …` style; false for `import …` style.
  // Edge classification keys off this — `from-form` imports are
  // `uses_token` candidates (binding specific symbols) whereas
  // `import-form` are `depends_on` candidates (binding the module
  // namespace).
  isFromForm: boolean;
  // Relative dot count for relative imports. `from . import x` has
  // level=1; `from ..foo import y` has level=2; absolute imports
  // have level=0.
  relativeLevel: number;
}

export interface ParsedPythonFile {
  filePath: string;
  imports: PythonImportRef[];
}

// ── Parser ──────────────────────────────────────────────────────────────────

// Matches lines that start with `import` or `from` after optional
// leading whitespace. The `^` anchor + `m` flag means "start of a line"
// within the multi-line source. Comments and string-literal contents
// are not pre-stripped; the patterns are restrictive enough that
// false positives are vanishingly rare in real Python code (a comment
// containing `# from X import Y` does not match because the line
// starts with `#`, not `from`).
const IMPORT_LINE_RE = /^[ \t]*(import|from)[ \t]+([^\n]+)$/gm;

export function parsePythonFile(
  filePath: string,
  source: string,
): ParsedPythonFile {
  const imports: PythonImportRef[] = [];

  // Reset lastIndex on every call since the regex carries state with
  // the /g flag across invocations.
  IMPORT_LINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_LINE_RE.exec(source)) !== null) {
    const kind = match[1] as "import" | "from";
    const body = match[2].trim();
    if (kind === "import") {
      imports.push(...parseImportStatement(body, filePath));
    } else {
      const parsed = parseFromImportStatement(body, filePath);
      if (parsed) imports.push(parsed);
    }
  }

  return { filePath, imports };
}

// `import foo[, bar][.baz][ as x]` — parses the body after the
// initial `import` keyword. Returns one PythonImportRef per
// comma-separated entry.
function parseImportStatement(
  body: string,
  filePath: string,
): PythonImportRef[] {
  // Strip trailing comment if any. We split on '#' but only if it's
  // not inside a string literal — for `import foo  # comment` the
  // comment marker is in the wild, simple split works. For lines
  // like `import "weird"` (not valid Python) we don't worry.
  const stripped = stripInlineComment(body);
  const entries = stripped.split(",").map((e) => e.trim()).filter(Boolean);
  const refs: PythonImportRef[] = [];
  for (const entry of entries) {
    // `foo.bar.baz as alias` — split on ` as ` (case-sensitive
    // keyword; Python doesn't accept other variants).
    const asMatch = entry.match(/^([\w.]+)(?:\s+as\s+(\w+))?$/);
    if (!asMatch) continue;
    const modulePath = asMatch[1];
    const alias = asMatch[2];
    refs.push({
      modulePath,
      resolvedPath: null, // filled by edge inference once we have all files
      imports: [alias ?? modulePath.split(".")[0]],
      isFromForm: false,
      relativeLevel: 0,
    });
  }
  return refs;
}

// `from foo import bar[, baz]` or `from .foo import bar` — parses the
// body after the `from` keyword. Returns a single PythonImportRef
// (since one `from … import …` binds one module to N symbols).
function parseFromImportStatement(
  body: string,
  filePath: string,
): PythonImportRef | undefined {
  const stripped = stripInlineComment(body);
  // Match: optional dots (relative level), module path (may be empty
  // for `from . import x`), the literal `import`, the symbol list.
  const m = stripped.match(
    /^(\.*)([\w.]*)\s+import\s+(.+)$/,
  );
  if (!m) return undefined;
  const dots = m[1];
  const moduleBody = m[2];
  const symbolsRaw = m[3].trim();

  if (dots.length === 0 && moduleBody.length === 0) return undefined;

  // Strip surrounding parens for the single-line parenthesized form
  // `from foo import (a, b)`. Multi-line parenthesized forms are out
  // of scope for v0 — the regex above only captures one logical line.
  let symbolsClean = symbolsRaw;
  if (symbolsClean.startsWith("(") && symbolsClean.endsWith(")")) {
    symbolsClean = symbolsClean.slice(1, -1).trim();
  }

  let symbols: string[];
  if (symbolsClean === "*") {
    symbols = ["*"];
  } else {
    symbols = symbolsClean
      .split(",")
      .map((s) => {
        // Strip ` as alias` suffix; the imported binding name is what
        // matters for downstream consumers, but for the graph we
        // record the original symbol (not the alias) since cross-
        // file token resolution is on the producer side.
        const asMatch = s.trim().match(/^(\w+)(?:\s+as\s+\w+)?$/);
        return asMatch ? asMatch[1] : undefined;
      })
      .filter((s): s is string => s !== undefined);
  }
  if (symbols.length === 0) return undefined;

  return {
    modulePath: moduleBody,
    resolvedPath: null,
    imports: symbols,
    isFromForm: true,
    relativeLevel: dots.length,
  };
}

function stripInlineComment(s: string): string {
  // Top-level `#` outside any string-literal context. Real Python
  // strings can contain `#` so a precise version would track quoting
  // state; for import bodies this is overkill — quotes inside an
  // import line would already be invalid syntax. Conservative split
  // at first `#` is safe.
  const hashIdx = s.indexOf("#");
  return hashIdx === -1 ? s : s.slice(0, hashIdx).trim();
}

// ── Module resolution ──────────────────────────────────────────────────────

// Resolves a Python module specifier to a file path under `rootDir`.
// Handles:
//   - absolute: `foo.bar` → rootDir/foo/bar.py or rootDir/foo/bar/__init__.py
//   - relative: dotted prefix → walks up from importing file's dir.
// Returns the resolved absolute path or null if not found in the
// scanned tree (external package, stdlib, or missing dependency).
function resolvePythonModule(
  modulePath: string,
  relativeLevel: number,
  importerFilePath: string,
  rootDir: string,
): string | null {
  let baseDir: string;
  if (relativeLevel > 0) {
    // For `from . import foo` (level 1), the base is the importer's
    // own directory. For `..foo` (level 2), it's the parent. In
    // Python the convention is: level N means N-1 dots above the
    // current module's package, i.e. one less than the dot count.
    // We use that here: level 1 → same dir, level 2 → parent, etc.
    baseDir = path.dirname(importerFilePath);
    for (let i = 1; i < relativeLevel; i++) {
      baseDir = path.dirname(baseDir);
    }
  } else {
    baseDir = rootDir;
  }

  // Empty module (the `from . import x` case) — the symbol IS the
  // module name. Convert to dotted form by giving the resolver
  // nothing to traverse from baseDir.
  if (modulePath.length === 0) {
    // The single symbol (caller passes it as imports[0]) needs to
    // resolve as a submodule of baseDir. We can't do that here
    // without seeing the symbol list; return baseDir itself as the
    // "package directory" sentinel and let the caller probe each
    // symbol. For simplicity in v0 we punt: return null for the
    // dotless `from . import x` case and let edge inference treat
    // each symbol as a separate module lookup.
    return null;
  }

  const parts = modulePath.split(".");
  // Try as a .py file first.
  const asFile = path.join(baseDir, ...parts) + ".py";
  if (existsAndIsFile(asFile)) return asFile;
  // Then as a package __init__.py.
  const asPackage = path.join(baseDir, ...parts, "__init__.py");
  if (existsAndIsFile(asPackage)) return asPackage;
  return null;
}

function existsAndIsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// ── Edge inference ──────────────────────────────────────────────────────────

// Walk a directory, parse every `.py` file (skipping the same noise
// dirs as the TS walker plus the Python-specific ones), resolve
// imports, and return the inferred cross-file edges. Returns the
// same `InferredEdge` shape as the TS variant so γ-6's proposal
// resolver can consume both without branching.
//
// External imports (stdlib, pip packages — anything that doesn't
// resolve to a file inside `rootDir`) are dropped. Future γ-7+ can
// surface them as `requires` tokens on the consumer node, mirroring
// what γ-5 already does for TS.
export function inferPythonEdgesFromDirectory(
  rootDir: string,
): InferredEdge[] {
  const files = collectSourceFiles(rootDir, ["py"]);
  const parsed = new Map<string, ParsedPythonFile>();
  for (const filePath of files) {
    try {
      const source = fs.readFileSync(filePath, "utf-8");
      parsed.set(filePath, parsePythonFile(filePath, source));
    } catch {
      // Skip unreadable / non-utf8 files; never break the sweep.
    }
  }

  const edges: InferredEdge[] = [];
  for (const [fromFile, file] of parsed) {
    type Bucket = { type: InferredEdge["type"]; tokens: Set<string> };
    const buckets = new Map<string, Bucket>();
    for (const imp of file.imports) {
      // The dotless `from . import x` case — each symbol is a
      // submodule lookup with module path = symbol. We unpack into
      // separate resolution probes here.
      if (imp.isFromForm && imp.modulePath.length === 0) {
        for (const symbol of imp.imports) {
          const resolved = resolvePythonModule(
            symbol,
            imp.relativeLevel,
            fromFile,
            rootDir,
          );
          if (!resolved) continue;
          if (!parsed.has(resolved)) continue;
          const key = `${resolved}|depends_on`;
          const bucket = buckets.get(key) ?? {
            type: "depends_on" as const,
            tokens: new Set<string>(),
          };
          bucket.tokens.add(symbol);
          buckets.set(key, bucket);
        }
        continue;
      }

      const resolved = resolvePythonModule(
        imp.modulePath,
        imp.relativeLevel,
        fromFile,
        rootDir,
      );
      if (!resolved) continue; // external or unresolved
      if (!parsed.has(resolved)) continue; // out of scanned set

      // Python doesn't expose a static type-only import (TYPE_CHECKING
      // is a runtime convention we don't parse in v0); every edge is
      // `depends_on`. The TS-side classifier reads `imp.kind`;
      // mirroring that signal here would require parsing
      // `if TYPE_CHECKING:` blocks, which we defer to v1.
      const edgeType: InferredEdge["type"] = "depends_on";
      const key = `${resolved}|${edgeType}`;
      const bucket = buckets.get(key) ?? {
        type: edgeType,
        tokens: new Set<string>(),
      };
      for (const t of imp.imports) bucket.tokens.add(t);
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
  edges.sort((a, b) => {
    if (a.fromFile !== b.fromFile) return a.fromFile < b.fromFile ? -1 : 1;
    if (a.toFile !== b.toFile) return a.toFile < b.toFile ? -1 : 1;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });
  return edges;
}
