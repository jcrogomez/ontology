import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../../core/project/paths.js";
import { ensureDir } from "../../core/fs/json.js";
import { resolveArtifactExtension } from "./manifestation-mapper.js";
import type { OntologyNode } from "../../schemas/ontology.js";

// Writes a compiled artifact to .ontology/artifacts/generated/<nodeId>.<ext>.
//
// The extension is derived from the node's manifestation (and language tag,
// if applicable). The function ensures the parent directory exists, writes
// the content as UTF-8, and returns the absolute path so the caller can
// surface it to the user and record it in the compilation_run event.
//
// Read-only on the graph: never mutates events.jsonl, edges.jsonl, state.json,
// or the node files. The compile-node helper (src/runtime/compile/compile-node.ts)
// is responsible for emitting the compilation_run event AFTER the artifact
// is on disk.

export interface WriteArtifactOptions {
  node: OntologyNode;
  content: string;
  cwd?: string;
}

export interface WriteArtifactResult {
  // Absolute path of the written artifact.
  absolutePath: string;
  // Path relative to the project root (.ontology/artifacts/generated/...).
  // This is the form persisted in the compilation_run event for portability
  // across machines.
  relativePath: string;
  extension: string;
  bytesWritten: number;
}

export function writeArtifact(options: WriteArtifactOptions): WriteArtifactResult {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);

  const extension = resolveArtifactExtension({
    manifestation: options.node.coordinates.manifestation,
    language: options.node.technical.language,
  });

  ensureDir(paths.generatedArtifactsDir);
  const filename = `${options.node.id}.${extension}`;
  const absolutePath = path.join(paths.generatedArtifactsDir, filename);
  fs.writeFileSync(absolutePath, options.content, "utf-8");

  const relativePath = path.relative(cwd, absolutePath);

  return {
    absolutePath,
    relativePath,
    extension,
    bytesWritten: Buffer.byteLength(options.content, "utf-8"),
  };
}
