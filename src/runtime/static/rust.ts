import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import type { InferredEdge } from "./typescript.js";
import { collectSourceFiles } from "./typescript.js";

// γ-4-rust — static import surface for Rust via tree-sitter (WASM).
//
// This is the tree-sitter backend python.ts:58 promised ("a future γ-4-v2
// can swap to tree-sitter behind the same signature"): a real grammar
// instead of a hand-rolled parser, behind the SAME two-function contract
// every language backend satisfies (parse one file / infer edges for a
// directory, producing the shared `InferredEdge` shape).
//
// Packaging: web-tree-sitter (+ the prebuilt grammars in tree-sitter-wasms)
// are intentionally NOT runtime dependencies — they are lazy-imported on
// first use so the published CLI stays lean (the same zero-dependency ethos
// that kept python.ts on regex). In this repo they are devDependencies, so
// tests exercise the real grammar; a consumer enabling Rust ingest gets a
// clear install hint. NOTE the version pin: tree-sitter-wasms ships
// 0.20-era grammar ABIs, which web-tree-sitter 0.23+ refuses to dylink —
// stay on web-tree-sitter 0.22.x until the grammars are rebuilt.
//
// v0 scope (deliberately the structural import surface, like python.ts):
//   - `mod foo;` declarations (file-relative: foo.rs or foo/mod.rs, with
//     the mod.rs/lib.rs/main.rs vs sibling-dir rule of Rust 2018).
//   - `use` declarations whose first segment is crate / self / super —
//     resolved along the module tree; grouped lists (`use a::{b, c}`)
//     are flattened; `as` aliases keep the ORIGINAL name as the token
//     (the symbol crossing the boundary, not its local rename).
//   - `use std::...` / external crates → no resolved path, no edge.
// Out of scope for v0: #[path] attributes, macro-generated modules,
// conditional cfg modules, re-export chains (pub use), workspace-relative
// crate names. All imports map to `depends_on` (Rust has no syntactic
// type-only import distinction at this layer).

export interface RustImportRef {
  /** The raw module path text, e.g. "crate::config::Settings". */
  modulePath: string;
  /** Absolute path of the resolved module file, or null (external/unresolved). */
  resolvedPath: string | null;
  /** Symbols crossing the boundary (leaf names; the module name for `mod`). */
  imports: string[];
  form: "mod" | "use";
}

export interface ParsedRustFile {
  filePath: string;
  imports: RustImportRef[];
}

// ── lazy tree-sitter runtime ─────────────────────────────────────────────────

interface TreeSitterNode {
  type: string;
  text: string;
  childCount: number;
  child(i: number): TreeSitterNode | null;
  childForFieldName(name: string): TreeSitterNode | null;
}

interface TreeSitterParser {
  parse(source: string): { rootNode: TreeSitterNode };
}

let parserPromise: Promise<TreeSitterParser> | null = null;

function loadRustParser(): Promise<TreeSitterParser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      let ParserModule: any;
      try {
        ParserModule = await import("web-tree-sitter");
      } catch {
        throw new Error(
          "Rust static analysis needs the optional tree-sitter backend. Install it with:\n" +
            "  npm install --save-dev web-tree-sitter@0.22 tree-sitter-wasms",
        );
      }
      const Parser = ParserModule.default ?? ParserModule;
      await Parser.init();
      const require = createRequire(import.meta.url);
      const wasmsRoot = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
      const grammarPath = path.join(wasmsRoot, "out", "tree-sitter-rust.wasm");
      const language = await Parser.Language.load(grammarPath);
      const parser = new Parser();
      parser.setLanguage(language);
      return parser as TreeSitterParser;
    })();
  }
  return parserPromise;
}

/** True when the optional tree-sitter backend can be loaded. */
export async function rustBackendAvailable(): Promise<boolean> {
  try {
    await loadRustParser();
    return true;
  } catch {
    return false;
  }
}

// ── module-tree resolution ───────────────────────────────────────────────────

// The directory in which a file's `mod foo;` children live. mod.rs / lib.rs /
// main.rs own their containing directory; any other bar.rs owns bar/.
function ownModuleDir(filePath: string): string {
  const base = path.basename(filePath);
  const dir = path.dirname(filePath);
  if (base === "mod.rs" || base === "lib.rs" || base === "main.rs") return dir;
  return path.join(dir, base.replace(/\.rs$/, ""));
}

// Resolve one module segment from a directory: dir/seg.rs, else dir/seg/mod.rs.
function resolveSegment(dir: string, segment: string): string | null {
  const asFile = path.join(dir, `${segment}.rs`);
  if (fs.existsSync(asFile)) return asFile;
  const asDir = path.join(dir, segment, "mod.rs");
  if (fs.existsSync(asDir)) return asDir;
  return null;
}

// The crate root directory for a file: the nearest ancestor directory (up to
// and including stopDir) containing lib.rs or main.rs; falls back to stopDir.
function crateRootDir(filePath: string, stopDir: string): string {
  let dir = path.dirname(filePath);
  const stop = path.resolve(stopDir);
  for (;;) {
    if (
      fs.existsSync(path.join(dir, "lib.rs")) ||
      fs.existsSync(path.join(dir, "main.rs"))
    ) {
      return dir;
    }
    if (path.resolve(dir) === stop) return stop;
    const parent = path.dirname(dir);
    if (parent === dir) return stop;
    dir = parent;
  }
}

// Walk `use` path segments from a base directory, descending while module
// files exist. Returns the DEEPEST module file reached, plus how many
// segments it consumed — the remainder (if exactly one) is the leaf symbol.
function walkUsePath(baseDir: string, segments: string[]): string | null {
  let dir = baseDir;
  let resolved: string | null = null;
  for (const segment of segments) {
    const hit = resolveSegment(dir, segment);
    if (!hit) break;
    resolved = hit;
    dir = ownModuleDir(hit);
  }
  return resolved;
}

// ── use-tree extraction ──────────────────────────────────────────────────────

interface UseEntry {
  segments: string[]; // path segments, e.g. ["crate", "helpers", "util"]
  leaf: string; // the imported symbol (original name, not the alias)
}

// Flatten a use_declaration's argument into (segments, leaf) entries.
// Handles scoped_identifier chains, use_list groups (recursively), aliases
// (use_as_clause → original name), and wildcard (`*` → leaf "*").
function flattenUseTree(node: TreeSitterNode, prefix: string[]): UseEntry[] {
  switch (node.type) {
    case "identifier":
    case "crate":
    case "super":
    case "self":
      return [{ segments: prefix, leaf: node.text }];
    case "scoped_identifier": {
      const pathNode = node.childForFieldName("path");
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return [];
      const basePrefix = pathNode ? segmentsOf(pathNode, prefix) : prefix;
      return [{ segments: basePrefix, leaf: nameNode.text }];
    }
    case "scoped_use_list": {
      const pathNode = node.childForFieldName("path");
      const listNode = node.childForFieldName("list");
      const basePrefix = pathNode ? segmentsOf(pathNode, prefix) : prefix;
      return listNode ? flattenUseTree(listNode, basePrefix) : [];
    }
    case "use_list": {
      const out: UseEntry[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        if ([",", "{", "}"].includes(child.type)) continue;
        out.push(...flattenUseTree(child, prefix));
      }
      return out;
    }
    case "use_as_clause": {
      // `original as alias` — the boundary-crossing symbol is the original.
      const original = node.childForFieldName("path");
      return original ? flattenUseTree(original, prefix) : [];
    }
    case "use_wildcard": {
      const pathNode = node.child(0);
      const basePrefix = pathNode ? segmentsOf(pathNode, prefix) : prefix;
      return [{ segments: basePrefix, leaf: "*" }];
    }
    default:
      return [];
  }
}

// Linearise a path-like node (identifier / crate / super / self /
// scoped_identifier chain) into segments appended to `prefix`.
function segmentsOf(node: TreeSitterNode, prefix: string[]): string[] {
  if (node.type === "scoped_identifier") {
    const pathNode = node.childForFieldName("path");
    const nameNode = node.childForFieldName("name");
    const head = pathNode ? segmentsOf(pathNode, prefix) : prefix;
    return nameNode ? [...head, nameNode.text] : head;
  }
  return [...prefix, node.text];
}

// ── public surface ───────────────────────────────────────────────────────────

export async function parseRustFile(
  filePath: string,
  source: string,
  options: { crateRoot?: string } = {},
): Promise<ParsedRustFile> {
  const parser = await loadRustParser();
  const tree = parser.parse(source);
  const imports: RustImportRef[] = [];
  const absFile = path.resolve(filePath);
  const stopDir = options.crateRoot ?? path.dirname(absFile);

  const visit = (node: TreeSitterNode): void => {
    if (node.type === "mod_item") {
      // `mod foo;` only — an inline `mod foo { ... }` declares no file.
      const nameNode = node.childForFieldName("name");
      const hasBody = node.childForFieldName("body") !== null;
      if (nameNode && !hasBody) {
        const name = nameNode.text;
        const resolved = resolveSegment(ownModuleDir(absFile), name);
        imports.push({
          modulePath: name,
          resolvedPath: resolved,
          imports: [name],
          form: "mod",
        });
      }
      return; // do not descend into mod bodies in v0
    }
    if (node.type === "use_declaration") {
      const argument = node.childForFieldName("argument") ?? node.child(1);
      if (argument) {
        for (const entry of flattenUseTree(argument, [])) {
          const [head, ...rest] = entry.segments;
          let baseDir: string | null = null;
          let walkSegments = rest;
          if (head === "crate") {
            baseDir = crateRootDir(absFile, stopDir);
          } else if (head === "self") {
            baseDir = ownModuleDir(absFile);
          } else if (head === "super") {
            baseDir = path.dirname(ownModuleDir(absFile));
            while (walkSegments[0] === "super") {
              baseDir = path.dirname(baseDir);
              walkSegments = walkSegments.slice(1);
            }
          }
          // std / external crate first segments resolve to nothing — the
          // import is recorded with resolvedPath null (same contract as the
          // TS/Python backends use for node_modules / site-packages).
          const resolved =
            baseDir !== null ? walkUsePath(baseDir, walkSegments) : null;
          imports.push({
            modulePath: entry.segments.concat(entry.leaf).join("::"),
            resolvedPath: resolved,
            imports: [entry.leaf],
            form: "use",
          });
        }
      }
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(tree.rootNode);

  return { filePath: absFile, imports };
}

export async function inferRustEdgesFromDirectory(
  rootDir: string,
): Promise<InferredEdge[]> {
  const absRoot = path.resolve(rootDir);
  const files = collectSourceFiles(absRoot, ["rs"]);
  const buckets = new Map<string, { fromFile: string; toFile: string; tokens: Set<string> }>();

  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8");
    const parsed = await parseRustFile(file, source, { crateRoot: absRoot });
    for (const ref of parsed.imports) {
      if (!ref.resolvedPath) continue;
      if (path.resolve(ref.resolvedPath) === path.resolve(file)) continue;
      const key = `${file}→${ref.resolvedPath}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { fromFile: file, toFile: ref.resolvedPath, tokens: new Set() };
        buckets.set(key, bucket);
      }
      for (const token of ref.imports) bucket.tokens.add(token);
    }
  }

  const edges: InferredEdge[] = Array.from(buckets.values()).map((b) => ({
    fromFile: b.fromFile,
    toFile: b.toFile,
    type: "depends_on" as const,
    tokens: Array.from(b.tokens).sort(),
  }));
  edges.sort((a, b) => {
    if (a.fromFile !== b.fromFile) return a.fromFile < b.fromFile ? -1 : 1;
    if (a.toFile !== b.toFile) return a.toFile < b.toFile ? -1 : 1;
    return 0;
  });
  return edges;
}
