import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { acquireLock, withLock, LockAcquireError } from "../src/core/fs/lock.js";

// Advisory lock under `.ontology/.lock` — see POST_GAMMA_PLAN §5.1
// and src/core/fs/lock.ts for the spec.
//
// Cases:
//   - acquire on a clean directory succeeds; the file is created
//     with PID + hostname + timestamp.
//   - acquire while held throws LockAcquireError with kind="held".
//   - release removes the file; a subsequent acquire works.
//   - stale-lock recovery: a file pointing at a dead PID can be
//     taken by the next caller.
//   - cross-host lock: a file pointing at a foreign hostname is NOT
//     taken (refuse to break).
//   - withLock acquires + releases around an async function and
//     surfaces the underlying error correctly.
//   - withLock skipLock=true bypasses everything (the --no-lock
//     contract).

describe("advisory lock (acquireLock / withLock)", () => {
  let tempDir: string;
  let ontoDir: string;
  let lockPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-lock-test-"));
    ontoDir = path.join(tempDir, ".ontology");
    lockPath = path.join(ontoDir, ".lock");
    fs.mkdirSync(ontoDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("acquires on a clean directory and writes PID + hostname + timestamp", () => {
    const lock = acquireLock(tempDir, { command: "test-1" });
    expect(fs.existsSync(lockPath)).toBe(true);
    const body = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(body.pid).toBe(process.pid);
    expect(body.hostname).toBe(os.hostname());
    expect(typeof body.acquiredAt).toBe("string");
    expect(body.command).toBe("test-1");
    lock.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("throws LockAcquireError with kind='held' when the same PID file exists", () => {
    const first = acquireLock(tempDir);
    expect(() => acquireLock(tempDir)).toThrow(LockAcquireError);
    try {
      acquireLock(tempDir);
    } catch (err) {
      expect(err).toBeInstanceOf(LockAcquireError);
      expect((err as LockAcquireError).detail.kind).toBe("held");
      expect((err as LockAcquireError).detail.lockPath).toBe(lockPath);
    }
    first.release();
  });

  it("release is idempotent (second call is a no-op)", () => {
    const lock = acquireLock(tempDir);
    lock.release();
    lock.release(); // must not throw
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("recovers a stale lock pointing at a dead PID on the same host", () => {
    // Write a lock file claiming an impossibly-high PID. process.kill
    // with signal 0 against an unallocated PID throws ESRCH, which
    // the helper interprets as stale.
    const staleBody = {
      pid: 999_999_999,
      hostname: os.hostname(),
      acquiredAt: new Date(Date.now() - 60_000).toISOString(),
      command: "ghost",
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleBody));

    // Acquire should succeed by detecting staleness.
    const lock = acquireLock(tempDir);
    const body = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(body.pid).toBe(process.pid);
    expect(body.pid).not.toBe(staleBody.pid);
    lock.release();
  });

  it("REFUSES to break a lock from a different hostname (cross-host safety)", () => {
    const foreignBody = {
      pid: 1,
      hostname: "some-other-host-that-does-not-exist.example.com",
      acquiredAt: new Date().toISOString(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(foreignBody));

    expect(() => acquireLock(tempDir)).toThrow(LockAcquireError);
    try {
      acquireLock(tempDir);
    } catch (err) {
      expect((err as LockAcquireError).detail.kind).toBe("cross_host_held");
    }
    // Foreign body must still be there — we did NOT take the lock.
    const stillThere = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(stillThere.hostname).toBe(foreignBody.hostname);
  });

  it("recovers from a corrupt / unparseable lock body (treats as stale)", () => {
    fs.writeFileSync(lockPath, "this is not valid json {{{ broken");
    const lock = acquireLock(tempDir);
    expect(fs.existsSync(lockPath)).toBe(true);
    const body = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(body.pid).toBe(process.pid);
    lock.release();
  });

  it("withLock acquires + releases around an async function", async () => {
    let observedLockedFile = false;
    const result = await withLock(tempDir, async () => {
      observedLockedFile = fs.existsSync(lockPath);
      return 42;
    });
    expect(result).toBe(42);
    expect(observedLockedFile).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("withLock releases the lock even if the inner function throws", async () => {
    await expect(
      withLock(tempDir, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("withLock with skipLock=true does NOT acquire — the --no-lock contract", async () => {
    const result = await withLock(
      tempDir,
      async () => {
        expect(fs.existsSync(lockPath)).toBe(false);
        return "skipped";
      },
      { skipLock: true },
    );
    expect(result).toBe("skipped");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("release on a lock whose body was replaced by another holder does NOT steal", () => {
    // Acquire, then simulate a stale-recovery sequence where another
    // process took over the lock. The original lock.release() must
    // NOT delete the new holder's file.
    const ours = acquireLock(tempDir);

    // Simulate an external takeover (e.g. a stale-recovery): replace
    // the file body so it no longer matches the original PID.
    const takeoverBody = {
      pid: process.pid + 1,
      hostname: os.hostname(),
      acquiredAt: new Date().toISOString(),
      command: "takeover",
    };
    fs.writeFileSync(lockPath, JSON.stringify(takeoverBody));

    ours.release();
    // The takeover file must still exist — release recognised it as
    // not-our-lock and left it alone.
    expect(fs.existsSync(lockPath)).toBe(true);
    const stillThere = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(stillThere.command).toBe("takeover");

    // Clean up so afterEach's rmSync doesn't error.
    fs.unlinkSync(lockPath);
  });
});
