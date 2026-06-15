import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Advisory lock for the .ontology/ directory.
//
// Two cooperating Ontology processes (e.g. an interactive
// `verify-homeomorphism --all-artifacts --apply` and a scheduled
// cron job hitting the same project) can otherwise interleave
// writes to state.json, events.jsonl, or worse: overwrite each
// other's `--target` artifacts mid-flight. Crash-atomic writes
// (writeJson, the writeArtifact temp+rename) protect against
// truncation under SIGKILL, but they do NOT protect against two
// processes both succeeding to write conflicting snapshots in
// alternation. The advisory lock is what makes the multi-process
// case safe.
//
// Design choices:
//   1. **File-based** (not OS-level flock) so the contract is
//      portable across platforms and observable from a shell
//      (`cat .ontology/.lock` shows the holder).
//   2. **Atomic creation** via `fs.openSync(path, "wx")` — the SDK
//      flag set translates to O_CREAT|O_EXCL, which kernels guarantee
//      to be atomic-or-fail. No "check then write" race window.
//   3. **PID + hostname recorded** in the lock body. Stale-lock
//      detection walks: if the recorded PID is no longer alive on
//      the same hostname, the lock is treated as stale and acquired.
//      Cross-host: we refuse to break the lock — we cannot probe
//      another machine's PID, so the safe default is to back off.
//   4. **Cleanup hooks** on process.exit / SIGINT / SIGTERM /
//      uncaught exceptions. Best-effort: a SIGKILL still strands
//      the file (the next process recovers via stale detection).
//   5. **`--no-lock` opt-out** is exposed as a CLI flag on
//      mutating commands. Useful for tests that intentionally run
//      many cooperators in parallel without locking, and for the
//      rare debug session where the user knows what they're doing.
//
// Spec reference: POST_GAMMA_PLAN.md §5.1.

export interface LockBody {
  pid: number;
  hostname: string;
  acquiredAt: string;
  command?: string;
}

export interface Lock {
  lockPath: string;
  body: LockBody;
  /** Release the lock by unlinking the file. Idempotent. */
  release(): void;
}

export type AcquireLockError =
  | { kind: "held"; holder: LockBody; lockPath: string }
  | { kind: "cross_host_held"; holder: LockBody; lockPath: string }
  | { kind: "io_error"; message: string; lockPath: string };

export interface AcquireLockOptions {
  /** Override the lock file name. Default: `.ontology/.lock`. */
  lockName?: string;
  /** Free-form label for the holder (e.g. "verify-homeomorphism --all-artifacts"). */
  command?: string;
}

const LOCK_FILE_DEFAULT = ".lock";

/**
 * Attempts to acquire the advisory lock for the .ontology directory
 * rooted at `repoRoot`. Returns the acquired Lock handle, or throws a
 * `LockHeldError` carrying the current holder body and lockPath so
 * the caller can surface a friendly message.
 *
 * If the lock file exists but the recorded PID is no longer alive on
 * the same hostname, the lock is taken (stale-lock recovery). If the
 * PID lives on a different host, the function refuses (we cannot
 * verify liveness across hosts).
 */
export function acquireLock(
  repoRoot: string,
  options: AcquireLockOptions = {},
): Lock {
  const lockPath = path.join(repoRoot, ".ontology", options.lockName ?? LOCK_FILE_DEFAULT);
  const body: LockBody = {
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
    ...(options.command ? { command: options.command } : {}),
  };

  // First attempt: atomic create.
  if (tryWriteLock(lockPath, body)) {
    return makeLock(lockPath, body);
  }

  // Existing file — read the holder body and decide.
  const existing = readLockBody(lockPath);
  if (!existing) {
    // Either we can't read the holder (corrupted file) or the file
    // disappeared in the race window. Treat as stale and try once
    // more after unlinking. Surface IO errors after that.
    safeUnlink(lockPath);
    if (tryWriteLock(lockPath, body)) {
      return makeLock(lockPath, body);
    }
    throw new LockAcquireError({
      kind: "io_error",
      message: "Lock file exists but cannot be read or overwritten",
      lockPath,
    });
  }

  // Same host: probe the recorded PID with signal 0.
  if (existing.hostname === os.hostname()) {
    if (!isPidAlive(existing.pid)) {
      // Stale lock — recover.
      safeUnlink(lockPath);
      if (tryWriteLock(lockPath, body)) {
        return makeLock(lockPath, body);
      }
      throw new LockAcquireError({
        kind: "io_error",
        message: "Lock was stale but could not be re-acquired (raced another cooperator?)",
        lockPath,
      });
    }
    throw new LockAcquireError({
      kind: "held",
      holder: existing,
      lockPath,
    });
  }

  // Different host — refuse to break.
  throw new LockAcquireError({
    kind: "cross_host_held",
    holder: existing,
    lockPath,
  });
}

/** Thrown by acquireLock when the lock could not be obtained. */
export class LockAcquireError extends Error {
  public readonly detail: AcquireLockError;
  constructor(detail: AcquireLockError) {
    super(formatLockError(detail));
    this.name = "LockAcquireError";
    this.detail = detail;
  }
}

function formatLockError(d: AcquireLockError): string {
  if (d.kind === "held") {
    const age = new Date(Date.now() - Date.parse(d.holder.acquiredAt));
    const ageSec = Math.round(age.getTime() / 1000);
    const cmd = d.holder.command ? ` (${d.holder.command})` : "";
    return `Another Ontology process holds the lock at ${d.lockPath}: pid=${d.holder.pid} on ${d.holder.hostname}${cmd}, acquired ${ageSec}s ago. Wait for it to finish, or pass --no-lock if you know the other process is gone.`;
  }
  if (d.kind === "cross_host_held") {
    return `Lock at ${d.lockPath} is held by pid=${d.holder.pid} on host ${d.holder.hostname}, which is not this machine (${os.hostname()}). Cross-host lock breaking is disabled; manually remove the file only after confirming the other host is finished.`;
  }
  return `Failed to acquire lock at ${d.lockPath}: ${d.message}`;
}

/** Best-effort: write the lock atomically. Returns true on success, false if EEXIST. */
function tryWriteLock(lockPath: string, body: LockBody): boolean {
  try {
    const fd = fs.openSync(lockPath, "wx"); // O_CREAT|O_EXCL — fails if exists
    try {
      fs.writeSync(fd, JSON.stringify(body, null, 2) + "\n");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === "EEXIST") {
      return false;
    }
    throw new LockAcquireError({
      kind: "io_error",
      message: err instanceof Error ? err.message : String(err),
      lockPath,
    });
  }
}

/** Read the body of an existing lock file. Returns null on parse errors / missing file. */
function readLockBody(lockPath: string): LockBody | null {
  try {
    const raw = fs.readFileSync(lockPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LockBody>;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.hostname === "string" &&
      typeof parsed.acquiredAt === "string"
    ) {
      return parsed as LockBody;
    }
    return null;
  } catch {
    return null;
  }
}

/** Probe whether `pid` is alive. process.kill(pid, 0) throws ESRCH when the process is gone. */
function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (isErrnoException(err)) {
      // EPERM: the process exists but we lack permission to signal it
      // (e.g. a root process from another user). Conservatively treat
      // as alive — we shouldn't kill a lock held by a real process we
      // can't even introspect.
      if (err.code === "EPERM") return true;
    }
    return false;
  }
}

function safeUnlink(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    /* nothing to do — caller will retry or surface IO error */
  }
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === "string";
}

function makeLock(lockPath: string, body: LockBody): Lock {
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    // Verify this process still owns the lock before unlinking.
    // Otherwise a stale-detection elsewhere could have already
    // replaced our file, and unlinking would steal someone else's
    // lock.
    const current = readLockBody(lockPath);
    if (current && current.pid === body.pid && current.acquiredAt === body.acquiredAt) {
      safeUnlink(lockPath);
    }
  };

  // Register cleanup hooks. These fire on graceful exit, SIGINT,
  // SIGTERM, and uncaught exceptions. SIGKILL bypasses everything,
  // but stale-lock detection covers that.
  registerExitHook(release);

  return { lockPath, body, release };
}

const exitHandlers: Array<() => void> = [];
let hooksInstalled = false;

function registerExitHook(handler: () => void): void {
  exitHandlers.push(handler);
  if (hooksInstalled) return;
  hooksInstalled = true;
  const runAll = (): void => {
    while (exitHandlers.length > 0) {
      const h = exitHandlers.shift()!;
      try {
        h();
      } catch {
        /* swallow — best-effort */
      }
    }
  };
  process.on("exit", runAll);
  // For signals we still need to actually exit after handlers run.
  const onSignal = (signal: NodeJS.Signals): void => {
    runAll();
    // Re-raise the signal with the default handler so the parent
    // shell sees the right exit code (128 + signum).
    process.kill(process.pid, signal);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

/**
 * Run `fn` while holding the .ontology/ advisory lock. The lock is
 * released after `fn` resolves or throws.
 *
 * Pass `skipLock: true` to bypass entirely — used by `--no-lock`
 * CLI flags and by tests that want intentional concurrency.
 */
export async function withLock<T>(
  repoRoot: string,
  fn: () => Promise<T>,
  options: AcquireLockOptions & { skipLock?: boolean } = {},
): Promise<T> {
  if (options.skipLock) {
    return fn();
  }
  const lock = acquireLock(repoRoot, options);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
