import {
  inferEdgesFromDirectory,
  type InferredEdge,
} from "./typescript.js";
import { inferPythonEdgesFromDirectory } from "./python.js";

// Language-agnostic dispatcher over the per-language static-edge
// parsers. Project Legend γ-4 shipped TS-first; γ-4 Python followed
// after the Vibe-Reasoning runbook needed it. This dispatcher reads
// the extension list (the same list `onto ingest --include` consumes)
// and unions the edges across every language whose parser is
// available.
//
// For a mixed-language repo (e.g. `--include ts,py` for a project
// with both TS service code and Python tooling), both parsers run
// and their `InferredEdge[]` lists are concatenated. Edge keys are
// (fromFile, toFile, type) tuples; cross-language imports don't
// happen at the syntactic level, so there's no collision risk.
//
// Unknown extensions are silently ignored here — a new language slots
// in by adding a branch (γ-4-rust landed exactly that way, see below).
export function inferEdgesAutoFromDirectory(
  rootDir: string,
  extensions: string[],
): InferredEdge[] {
  const normalized = extensions.map((e) => e.toLowerCase().replace(/^\./, ""));
  const wantsTs = normalized.includes("ts") || normalized.includes("tsx");
  const wantsPy = normalized.includes("py");

  const all: InferredEdge[] = [];
  if (wantsTs) {
    all.push(...inferEdgesFromDirectory(rootDir));
  }
  if (wantsPy) {
    all.push(...inferPythonEdgesFromDirectory(rootDir));
  }

  sortEdges(all);
  return all;
}

// Async variant — REQUIRED for the tree-sitter-backed languages (the WASM
// grammar loads asynchronously). The sync function above stays for the
// TS/PY-only fast path and existing external callers; every CLI call site
// uses this one so `--include rs` works.
export async function inferEdgesAutoFromDirectoryAsync(
  rootDir: string,
  extensions: string[],
): Promise<InferredEdge[]> {
  const normalized = extensions.map((e) => e.toLowerCase().replace(/^\./, ""));
  const all = inferEdgesAutoFromDirectory(rootDir, extensions);
  if (normalized.includes("rs")) {
    // Lazy import keeps web-tree-sitter out of the require graph unless
    // Rust ingest is actually requested.
    const { inferRustEdgesFromDirectory } = await import("./rust.js");
    all.push(...(await inferRustEdgesFromDirectory(rootDir)));
    sortEdges(all);
  }
  return all;
}

// Restore the deterministic order the per-language parsers each produce on
// their own — concatenating pre-sorted lists is not sorted globally.
function sortEdges(all: InferredEdge[]): void {
  all.sort((a, b) => {
    if (a.fromFile !== b.fromFile) return a.fromFile < b.fromFile ? -1 : 1;
    if (a.toFile !== b.toFile) return a.toFile < b.toFile ? -1 : 1;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });
}

export { inferEdgesFromDirectory, inferPythonEdgesFromDirectory };
export type { InferredEdge };
