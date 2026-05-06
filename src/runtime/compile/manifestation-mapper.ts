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

import type { ManifestationSchema } from "../../schemas/ontology.js";
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
