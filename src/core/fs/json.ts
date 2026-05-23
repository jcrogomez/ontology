import * as fs from "node:fs";
import * as path from "node:path";

// JSONL files are append-oriented logs. They let Ontology record time and topology without rewriting history.

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * fsync a directory so that recent name-changes (creates, renames,
 * unlinks) inside it are durable across a power loss / kernel panic.
 * POSIX guarantees `rename(2)` is atomic but does NOT guarantee the
 * rename is durable — only that the directory inode reflects the
 * change in memory. Without fsync on the parent directory, a power
 * cut between `rename` and the next inode flush can resurrect the
 * old name. For an audit-chain system whose value-prop is provenance,
 * that loss is the failure mode worth defending against. Best-effort:
 * filesystems that reject fsync on a directory (some virtual mounts)
 * are tolerated silently — the file-level fsync we did earlier still
 * caught the data bytes.
 */
function fsyncDir(dir: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch {
    // Some filesystems (e.g. certain virtual / network mounts) reject
    // directory fsync with EINVAL. Best-effort: the file-level fsync
    // is the primary defence; the directory fsync is the belt to its
    // suspenders.
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close errors
      }
    }
  }
}

/**
 * Crash-atomic AND durable JSON write. Three guarantees, in order:
 *
 *   1. **Atomicity** — serialize to a sibling temp file, then
 *      `rename(2)` into place. POSIX rename is atomic when source +
 *      destination live on the same filesystem (guaranteed here:
 *      tmp is `${filePath}.tmp.${pid}` in the parent dir). A SIGKILL
 *      or out-of-disk mid-write leaves the original target intact
 *      rather than truncating it.
 *
 *   2. **Data durability** — fsync the temp file descriptor before
 *      the rename so the bytes are committed to disk, not just the
 *      OS page cache. Without this, a power loss between the
 *      `writeFile` return and the next flush could lose the new
 *      content even though the rename had already completed.
 *
 *   3. **Rename durability** — fsync the parent directory after the
 *      rename so the directory entry change (the new name pointing
 *      at the new inode) is itself durable. Without this, a power
 *      cut between rename and the next directory-inode flush can
 *      resurrect the old name even though the new file's data is
 *      already on disk.
 *
 * The orphan temp is unlinked on rename failure so a crashed run
 * doesn't litter the directory.
 *
 * Cost: ~one extra syscall + one fsync. Negligible for the verify /
 * compile path's IO volume; significant insurance for an audit-chain
 * system where losing state.json mid-run loses hours.
 */
export function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = `${filePath}.tmp.${process.pid}`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, "w");
    fs.writeSync(fd, JSON.stringify(value, null, 2) + "\n", null, "utf-8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
    fsyncDir(dir);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close errors on cleanup path
      }
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best-effort cleanup; ignore if the tmp wasn't created
    }
    throw err;
  }
}

export function readJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Durable JSONL append. POSIX `O_APPEND` plus a single-buffer write
 * gives append atomicity at the kernel level for buffers small
 * enough to fit one `write(2)` (typical event payloads, ≪ 4 KB). On
 * top of that, this helper:
 *
 *   - opens with `O_APPEND` explicitly via `fs.openSync("a")`,
 *   - serialises the value into ONE buffer (line + terminator) so
 *     the kernel sees a single write() call,
 *   - **fsyncs the file descriptor** before close so the bytes are
 *     committed to disk before the function returns.
 *
 * Without the fsync, an event log entry could be "appended"
 * (visible to a same-process re-read) yet vanish on power loss —
 * the kernel's page cache hadn't flushed. For the events.jsonl
 * audit chain, that is the exact failure mode the design refuses
 * to accept. The cost is one fsync per event (~ms order on SSD,
 * negligible vs the LLM dispatch the event is recording).
 */
export function appendJsonl(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const line = JSON.stringify(value) + "\n";
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "a");
    fs.writeSync(fd, line, null, "utf-8");
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close errors
      }
    }
  }
}

export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => JSON.parse(line) as T);
}
