import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../../core/project/paths.js";
import { ensureDir } from "../../core/fs/json.js";
import { resolveArtifactExtension } from "./manifestation-mapper.js";
import type { OntologyNode } from "../../schemas/ontology.js";

// Writes a compiled artifact to .ontology/artifacts/generated/<nodeId>.<ext>
// or, when `targetPath` is set, to the user-pinned absolute path.
//
// The extension is derived from the node's manifestation (and language tag,
// if applicable) for the default path. For the targeted path, the extension
// comes from the override so a `.py` target stays `.py` even if the node's
// manifestation maps to something else.
//
// The write is **crash-atomic**: content lands in a sibling
// `<absolutePath>.tmp.<pid>` file first, then `fs.renameSync` swaps it
// onto the final path. POSIX rename is atomic when source and destination
// live on the same filesystem (guaranteed because the temp is in the
// target's parent directory). A SIGKILL, out-of-disk, or unexpected
// throw mid-write leaves the pre-existing target intact rather than
// truncating it. This matters most for `--target` — Legend's
// verify-homeomorphism flow writes onto user source files, so a partial
// write would silently destroy code.
//
// Read-only on the graph: never mutates events.jsonl, edges.jsonl, state.json,
// or the node files. The compile-node helper (src/runtime/compile/compile-node.ts)
// is responsible for emitting the compilation_run event AFTER the artifact
// is on disk.

export interface WriteArtifactOptions {
  node: OntologyNode;
  content: string;
  cwd?: string;
  // Optional override: write the artifact to this path instead of the
  // default `.ontology/artifacts/generated/<nodeId>.<ext>`. The path may
  // be absolute or relative to `cwd`; missing parent directories are
  // created. The extension is taken from the override (so a target
  // ending in `.py` keeps `.py` regardless of the manifestation mapping)
  // — Legend's verify-homeomorphism flow needs to land artifacts at the
  // real source path, byte-for-byte comparable to the file on disk.
  targetPath?: string;
  // Required when `targetPath` points at an already-existing file.
  // Default-deny: a target write is refused with TargetExistsError
  // unless `force: true` is set. Without the gate an interactive
  // `onto compile run --target src/main.py` would silently overwrite
  // the user's work. Legend's `verify-homeomorphism` knows it wants
  // overwrite and passes the flag explicitly. Has no effect on the
  // default generated/<nodeId>.<ext> path, which is owned by Ontology.
  force?: boolean;
}

// Thrown when `targetPath` already exists and `force` is not set.
// Carries the offending path so callers (CLI, walker) can render a
// user-actionable message without re-parsing the error string.
export class TargetExistsError extends Error {
  readonly target: string;
  constructor(target: string) {
    super(
      `Target file already exists: ${target}. Pass --force to overwrite, or remove the file first.`,
    );
    this.name = "TargetExistsError";
    this.target = target;
  }
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
  // True when the artifact was written to an explicit target path rather
  // than the default generated directory. Lets downstream observers
  // (events, batch report) flag overridden writes.
  targeted: boolean;
}

export function writeArtifact(options: WriteArtifactOptions): WriteArtifactResult {
  const cwd = options.cwd ?? process.cwd();

  if (options.targetPath !== undefined) {
    const absolutePath = path.isAbsolute(options.targetPath)
      ? options.targetPath
      : path.resolve(cwd, options.targetPath);
    if (!options.force && fs.existsSync(absolutePath)) {
      throw new TargetExistsError(path.relative(cwd, absolutePath));
    }
    ensureDir(path.dirname(absolutePath));
    atomicWrite(absolutePath, options.content);
    const ext = path.extname(absolutePath);
    return {
      absolutePath,
      relativePath: path.relative(cwd, absolutePath),
      extension: ext.startsWith(".") ? ext.slice(1) : ext,
      bytesWritten: Buffer.byteLength(options.content, "utf-8"),
      targeted: true,
    };
  }

  const paths = getOntologyPaths(cwd);

  const extension = resolveArtifactExtension({
    manifestation: options.node.coordinates.manifestation,
    language: options.node.technical.language,
  });

  ensureDir(paths.generatedArtifactsDir);
  const filename = `${options.node.id}.${extension}`;
  const absolutePath = path.join(paths.generatedArtifactsDir, filename);
  atomicWrite(absolutePath, options.content);

  const relativePath = path.relative(cwd, absolutePath);

  return {
    absolutePath,
    relativePath,
    extension,
    bytesWritten: Buffer.byteLength(options.content, "utf-8"),
    targeted: false,
  };
}

// Crash-atomic write: serialize to a sibling temp file, then rename
// into place. Same pattern as `writeJson` in `core/fs/json.ts`. The
// orphan temp is unlinked on rename failure so a crashed run does
// not litter the directory.
function atomicWrite(absolutePath: string, content: string): void {
  const tmp = `${absolutePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, content, "utf-8");
    fs.renameSync(tmp, absolutePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best-effort cleanup; ignore if the tmp wasn't created
    }
    throw err;
  }
}
