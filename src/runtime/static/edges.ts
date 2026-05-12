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
// Unknown extensions (e.g. `--include rs`) are silently ignored
// here — a future γ-4-rust would slot in by adding a new branch.
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

  // Restore the deterministic order the per-language parsers each
  // produce on their own — concatenating two pre-sorted lists is
  // not sorted globally, so re-sort.
  all.sort((a, b) => {
    if (a.fromFile !== b.fromFile) return a.fromFile < b.fromFile ? -1 : 1;
    if (a.toFile !== b.toFile) return a.toFile < b.toFile ? -1 : 1;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });
  return all;
}

export { inferEdgesFromDirectory, inferPythonEdgesFromDirectory };
export type { InferredEdge };
