// Manifestation → file extension mapping for compiled artifacts.
//
// The OntologyNode's coordinates.manifestation tells us what *kind* of artifact
// the node compiles into. The compiler uses this map to choose the file
// extension when writing the artifact to disk.
//
// Today's heuristic is simple and conservative:
//   intent  → .txt   (raw intention; uncompiled, kept as a sanity record)
//   ast     → .json  (structured tree)
//   osl     → .osl   (Ontology semantic language; future format)
//   code    → .txt   (no language inference yet — see below)
//   test    → .txt   (same caveat)
//   build   → .sh    (shell-runnable build glue)
//
// "code" / "test" without a language tag → .txt is intentional. A node with
// `manifestation: "code"` and `technical.language: "python"` should compile
// to `.py`. The language-aware override is handled by the artifact-writer,
// which consults `node.technical.language` first and falls back to this map.

import type { ManifestationSchema } from "../../kernel/schemas/ontology.js";
import type { z } from "zod";

export type Manifestation = z.infer<typeof ManifestationSchema>;

const BASE_MANIFESTATION_EXTENSION: Record<Manifestation, string> = {
  intent: "txt",
  ast: "json",
  osl: "osl",
  code: "txt",
  test: "txt",
  build: "sh",
};

// Language → extension override. Used when node.technical.language is set
// alongside manifestation:"code" or "test".
const LANGUAGE_EXTENSION: Record<string, string> = {
  python: "py",
  typescript: "ts",
  javascript: "js",
  rust: "rs",
  go: "go",
  ruby: "rb",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  shell: "sh",
  bash: "sh",
  sql: "sql",
  html: "html",
  css: "css",
  json: "json",
  yaml: "yaml",
  toml: "toml",
  markdown: "md",
};

export interface ResolveExtensionOptions {
  manifestation: Manifestation;
  // node.technical.language. Optional; takes precedence when manifestation is
  // code or test. Other manifestations ignore it.
  language?: string;
}

// Resolves the file extension for an artifact. No leading dot.
export function resolveArtifactExtension(options: ResolveExtensionOptions): string {
  const isLangAware = options.manifestation === "code" || options.manifestation === "test";
  if (isLangAware && options.language) {
    const key = options.language.toLowerCase();
    if (LANGUAGE_EXTENSION[key]) return LANGUAGE_EXTENSION[key];
  }
  return BASE_MANIFESTATION_EXTENSION[options.manifestation];
}

// Exposed for tests and tooling that wants to display "this manifestation
// usually compiles to X" without picking a specific node.
export function defaultExtensionForManifestation(m: Manifestation): string {
  return BASE_MANIFESTATION_EXTENSION[m];
}

// Reverse mapping: given a source-file path, infer the manifestation
// implied by its extension. Returns `undefined` when the extension is
// not a recognized code/test/build/structured-data file (e.g. `.md`,
// `.txt`, or no extension), so the caller can fall back to whatever
// the extractor said.
//
// Used as a guard at ingest time: when the LLM extractor labels a
// node `intent` but its only source file has a code extension, the
// guard overrides to the inferred manifestation. This is what
// prevents the `node_0094` failure mode where a code module gets
// silently excluded from `verify-homeomorphism --all-artifacts`
// because that command's candidate resolver filters by
// `manifestation === "code"`.
const CODE_EXTENSIONS = new Set<string>([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "rb",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cs",
  "swift",
  "kt",
  "kts",
  "scala",
  "php",
  "lua",
  "sh",
  "bash",
  "zsh",
]);
const TEST_EXTENSIONS_SUFFIX = [
  ".test.ts",
  ".test.tsx",
  ".test.js",
  ".test.jsx",
  ".spec.ts",
  ".spec.tsx",
  ".spec.js",
  ".spec.jsx",
  ".test.py",
];
const BUILD_FILE_BASENAMES = new Set<string>([
  "build.sh",
  "build.bash",
]);

export function inferManifestationFromSourcePath(
  filePath: string,
): Manifestation | undefined {
  if (!filePath) return undefined;
  const lower = filePath.toLowerCase();
  for (const suf of TEST_EXTENSIONS_SUFFIX) {
    if (lower.endsWith(suf)) return "test";
  }
  const base = lower.split("/").pop() ?? lower;
  if (BUILD_FILE_BASENAMES.has(base)) return "build";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return undefined;
  const ext = base.slice(dot + 1);
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return undefined;
}
