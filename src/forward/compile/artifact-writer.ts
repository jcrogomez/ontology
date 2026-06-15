import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { ensureDir } from "../../kernel/core/fs/json.js";
import { resolveArtifactExtension } from "./manifestation-mapper.js";
import type { OntologyNode } from "../../kernel/schemas/ontology.js";

// Writes a compiled artifact to .ontology/artifacts/generated/<nodeId>.<ext>
// or, when `targetPath` is set, to the user-pinned absolute path.
//
// Two-phase commit (Project Legend calibration finding §0). The
// staging phase writes content to `<finalPath>.tmp.<pid>` next to the
// target. The commit phase renames it onto the final path. Validators
// (parse-check, intent gate, runtime-check) operate on the *staging
// path* — they don't know it's a tmp file because the parent directory
// is identical to the final's, so relative imports resolve the same.
// Only if every validator passes does the caller call `pending.commit()`
// and the user's source path receive the new bytes. Any failure between
// stage and commit triggers `pending.rollback()`, which unlinks the
// staged tmp; the user's pre-existing file (if any) survives untouched.
//
// `writeArtifact` is the convenience wrapper that stages + commits in
// one call — the same shape as before this refactor, kept for callers
// that don't need to validate between stage and commit. Internally it
// calls writeArtifactPending and then commits; failure to commit
// rolls back automatically.
//
// Read-only on the graph: never mutates events.jsonl, edges.jsonl, state.json,
// or the node files. The compile-node helper (src/runtime/compile/compile-node.ts)
// is responsible for emitting the compilation_run event AFTER the artifact
// is on disk AND every validator has accepted it.

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

// A pending artifact: bytes are staged on disk at `stagingPath` next to
// `finalPath` but the user's eventual target has not been touched yet.
// Validators read from `stagingPath`. The caller commits or rolls back
// based on whether every validator accepted the bytes.
export interface PendingArtifact {
  // The disk path validators read from while the write is staged. This
  // is `<finalPath>.tmp.<pid>` — a sibling of the final path so any
  // language tooling that resolves relative imports sees the same
  // ambient directory it would see post-commit.
  stagingPath: string;
  // Where the artifact will live after commit succeeds. The compile
  // event records THIS path (after commit), never the staging path.
  finalPath: string;
  // cwd-relative form of finalPath.
  relativePath: string;
  extension: string;
  bytesWritten: number;
  targeted: boolean;
  // Atomic rename from stagingPath → finalPath. Returns the committed
  // result with the user-facing absolute path. Throws on a rename
  // failure (rare; ENOSPC, EACCES); the caller is responsible for
  // calling rollback() in that case to remove the leftover staging
  // file.
  commit(): WriteArtifactResult;
  // Remove the staging file. Best-effort: never throws. Safe to call
  // multiple times. Safe to call after a successful commit (no-op).
  rollback(): void;
}

// Two-phase commit entry point. Stages the artifact at a sibling tmp
// path; returns a PendingArtifact whose `commit` / `rollback` methods
// drive the final disposition. The caller MUST eventually call one of
// the two — leaving a PendingArtifact uncommitted is a leak.
export function writeArtifactPending(options: WriteArtifactOptions): PendingArtifact {
  const cwd = options.cwd ?? process.cwd();

  let finalAbsolutePath: string;
  let extension: string;
  let targeted: boolean;
  if (options.targetPath !== undefined) {
    finalAbsolutePath = path.isAbsolute(options.targetPath)
      ? options.targetPath
      : path.resolve(cwd, options.targetPath);
    if (!options.force && fs.existsSync(finalAbsolutePath)) {
      throw new TargetExistsError(path.relative(cwd, finalAbsolutePath));
    }
    const ext = path.extname(finalAbsolutePath);
    extension = ext.startsWith(".") ? ext.slice(1) : ext;
    targeted = true;
  } else {
    const paths = getOntologyPaths(cwd);
    extension = resolveArtifactExtension({
      manifestation: options.node.coordinates.manifestation,
      language: options.node.technical.language,
    });
    const filename = `${options.node.id}.${extension}`;
    finalAbsolutePath = path.join(paths.generatedArtifactsDir, filename);
    targeted = false;
  }

  ensureDir(path.dirname(finalAbsolutePath));
  const stagingPath = `${finalAbsolutePath}.tmp.${process.pid}`;
  fs.writeFileSync(stagingPath, options.content, "utf-8");

  const relativePath = path.relative(cwd, finalAbsolutePath);
  const bytesWritten = Buffer.byteLength(options.content, "utf-8");
  let committed = false;
  let rolledBack = false;

  return {
    stagingPath,
    finalPath: finalAbsolutePath,
    relativePath,
    extension,
    bytesWritten,
    targeted,
    commit(): WriteArtifactResult {
      if (committed) {
        throw new Error(`PendingArtifact.commit: already committed (${finalAbsolutePath})`);
      }
      if (rolledBack) {
        throw new Error(`PendingArtifact.commit: already rolled back (${finalAbsolutePath})`);
      }
      fs.renameSync(stagingPath, finalAbsolutePath);
      committed = true;
      return {
        absolutePath: finalAbsolutePath,
        relativePath,
        extension,
        bytesWritten,
        targeted,
      };
    },
    rollback(): void {
      if (committed || rolledBack) return;
      try {
        fs.unlinkSync(stagingPath);
      } catch {
        // best-effort cleanup; ignore if the staging file is already
        // gone (concurrent removal, prior partial unlink).
      }
      rolledBack = true;
    },
  };
}

// One-shot convenience wrapper. Stages, then immediately commits. The
// callers that don't need to interleave validation between stage and
// commit (the artifact-writer's direct unit tests, simple test
// fixtures) keep the original API. compile-node uses
// writeArtifactPending directly so it can validate against the
// staging path.
export function writeArtifact(options: WriteArtifactOptions): WriteArtifactResult {
  const pending = writeArtifactPending(options);
  try {
    return pending.commit();
  } catch (err) {
    pending.rollback();
    throw err;
  }
}
