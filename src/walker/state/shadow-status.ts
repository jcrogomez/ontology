import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../../core/project/paths.js";
import { hashFileContent, normalizeLeafPath } from "../../core/integrity/merkle.js";
import type { OntologyNode } from "../../schemas/ontology.js";

// Shadow status of a focal node — the walker-side consumer of `onto drift`.
// "Shadow" = the file(s) in node.outputs.files, per the thesis (code is the
// compiled shadow of the intent graph). The walker surfaces whether the
// focal's shadow still matches the last drift anchor, so the operator edits
// intentions with the artifact's freshness in sight and recompiles when THEY
// decide (no auto-recompile — governance stays manual).

export type ShadowStatus =
  | "no_shadow" // node has no outputs.files — nothing compiled yet
  | "no_anchor" // no drift snapshot exists — run `onto drift --update`
  | "clean" // every shadow file matches the anchor
  | "drifted" // at least one shadow file's content differs from the anchor
  | "missing"; // at least one referenced shadow file is absent on disk

interface DriftSnapshotLite {
  leaves?: Array<{ path: string; hash: string }>;
}

export interface ShadowReport {
  status: ShadowStatus;
  /** cwd-relative shadow files, normalized. */
  files: string[];
  /** Subset of files that diverge from the anchor (content or absence). */
  driftedFiles: string[];
}

export function shadowReport(node: OntologyNode, cwd: string = process.cwd()): ShadowReport {
  const files = node.outputs.files
    .map((f) => normalizeLeafPath(f))
    .filter((f) => f.length > 0);
  if (files.length === 0) {
    return { status: "no_shadow", files: [], driftedFiles: [] };
  }

  const snapshotPath = getOntologyPaths(cwd).driftSnapshotPath;
  let anchor: Map<string, string> | null = null;
  if (fs.existsSync(snapshotPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as DriftSnapshotLite;
      anchor = new Map((parsed.leaves ?? []).map((l) => [l.path, l.hash]));
    } catch {
      anchor = null; // unreadable snapshot behaves like no anchor
    }
  }

  let missing = false;
  let drifted = false;
  const driftedFiles: string[] = [];
  for (const file of files) {
    const abs = path.resolve(cwd, file);
    if (!fs.existsSync(abs)) {
      missing = true;
      driftedFiles.push(file);
      continue;
    }
    if (anchor) {
      const anchored = anchor.get(file);
      const current = hashFileContent(fs.readFileSync(abs));
      // A file the anchor never saw counts as drifted (it post-dates the
      // anchor); same for a content mismatch.
      if (anchored !== current) {
        drifted = true;
        driftedFiles.push(file);
      }
    }
  }

  if (missing) return { status: "missing", files, driftedFiles };
  if (anchor === null) return { status: "no_anchor", files, driftedFiles: [] };
  if (drifted) return { status: "drifted", files, driftedFiles };
  return { status: "clean", files, driftedFiles: [] };
}

export interface ArtifactPreview {
  file: string | null;
  lines: string[];
  totalLines: number;
  truncated: boolean;
  error?: string;
}

/** First `maxLines` lines of the focal's primary shadow (outputs.files[0]). */
export function readArtifactPreview(
  node: OntologyNode,
  cwd: string = process.cwd(),
  maxLines = 18,
): ArtifactPreview {
  const file = node.outputs.files.map((f) => normalizeLeafPath(f)).find((f) => f.length > 0);
  if (!file) {
    return { file: null, lines: [], totalLines: 0, truncated: false };
  }
  const abs = path.resolve(cwd, file);
  if (!fs.existsSync(abs)) {
    return { file, lines: [], totalLines: 0, truncated: false, error: "file missing on disk" };
  }
  try {
    const all = fs.readFileSync(abs, "utf-8").split("\n");
    // Drop a single trailing empty line from the final newline.
    if (all.length > 0 && all[all.length - 1] === "") all.pop();
    return {
      file,
      lines: all.slice(0, maxLines),
      totalLines: all.length,
      truncated: all.length > maxLines,
    };
  } catch (err) {
    return {
      file,
      lines: [],
      totalLines: 0,
      truncated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Inverse traceability — `:which <file>`: the node(s) whose shadow contains
 * the given path. Accepts absolute or cwd-relative input.
 */
export function nodesOwningFile(
  nodes: ReadonlyArray<OntologyNode>,
  fileArg: string,
  cwd: string = process.cwd(),
): OntologyNode[] {
  const target = normalizeLeafPath(
    path.isAbsolute(fileArg) ? path.relative(cwd, fileArg) : fileArg,
  );
  if (target.length === 0) return [];
  return nodes.filter((n) =>
    n.outputs.files.some((f) => normalizeLeafPath(f) === target),
  );
}
