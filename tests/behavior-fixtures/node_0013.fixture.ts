import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0013 — src/kernel/core/fs/lock.ts (advisory lock for .ontology/).
//
// This is a GLUE/IO node: the contract is not "compute f(x)" but a
// protocol over the filesystem — atomic O_EXCL create, stale-lock
// recovery (same-host dead-PID → reclaim), cross-host refusal, and
// ownership-verified, idempotent release. The auto-generated 7B probe
// fixture for this node was shallow (hard-coded /tmp paths, dubious
// preconditions) and was removed; this hand-written fixture is the
// trustworthy oracle the F∘G round-trip is judged against.
//
// Design notes for trustworthiness:
//   • Every case builds its OWN fresh temp repo in `setup()` (called once
//     per side), with a real `.ontology/` dir and, where the invariant
//     needs it, a pre-written `.lock` file. No shared/global state, no
//     /tmp hard-coding, no injected mocks — the real fs is the oracle.
//   • `invoke` returns a PLAIN-DATA projection (never the raw `Lock`,
//     whose `release` closure is a fresh function reference and would
//     defeat the checker's structural deep-equal). pid/hostname are
//     identical across the two sides because both run in this process,
//     so a faithful regen deep-equals the source.
//   • Each case asserts a behavioural invariant the source genuinely
//     satisfies, so source-vs-source is `pass` (see
//     tests/lock-behavior-fixture.test.ts). A regen that drops the
//     invariant — the observed under-consumption failure mode — fails the
//     gate, which is the point.
//
// `description` carries the contract-level acceptance criterion in prose.
// It is documentary for the checker but is surfaced into the compile-back
// system prompt by oracle-grounding.ts (the "oracle-into-generation"
// lever): the regenerator gets to SEE the spec it will be judged against.
// Kept strictly at the behaviour level — never naming an implementation
// mechanism — so nothing about HOW lock.ts works is hardcoded into the
// prompt.

interface LockBodyLike {
  pid: number;
  hostname: string;
  acquiredAt: string;
  command?: string;
}
interface LockLike {
  lockPath: string;
  body: LockBodyLike;
  release: () => void;
}
interface LockApi {
  acquireLock: (
    repoRoot: string,
    options?: { lockName?: string; command?: string },
  ) => LockLike;
}

function freshRepo(): { repoRoot: string } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-lock-fixture-"));
  fs.mkdirSync(path.join(repoRoot, ".ontology"), { recursive: true });
  return { repoRoot };
}

function lockFilePath(repoRoot: string): string {
  return path.join(repoRoot, ".ontology", ".lock");
}

function writeRawLock(repoRoot: string, body: LockBodyLike): void {
  fs.writeFileSync(lockFilePath(repoRoot), JSON.stringify(body, null, 2) + "\n");
}

export const cases: BehaviorCase[] = [
  {
    name: "acquire on a fresh repo → returns a Lock recording this process",
    description:
      "The advisory lock file lives at `<repoRoot>/.ontology/.lock` (the " +
      "`.ontology/` directory, file name `.lock`). Calling acquireLock on a " +
      "repo with no such lock file succeeds and returns a handle whose body " +
      "records the CURRENT process's pid and this machine's hostname, and the " +
      "lock file exists at that path while the lock is held.",
    setup: () => freshRepo(),
    invoke: (api, ctx) => {
      const { repoRoot } = ctx as { repoRoot: string };
      const lock = (api as LockApi).acquireLock(repoRoot);
      const existedWhileHeld = fs.existsSync(lock.lockPath);
      const result = {
        pid: lock.body.pid,
        hostname: lock.body.hostname,
        hasLockPath: typeof lock.lockPath === "string" && lock.lockPath.length > 0,
        existedWhileHeld,
      };
      lock.release();
      return result;
    },
    assert: (r) => {
      const v = r as {
        pid: number;
        hostname: string;
        hasLockPath: boolean;
        existedWhileHeld: boolean;
      };
      return (
        v.pid === process.pid &&
        v.hostname === os.hostname() &&
        v.hasLockPath === true &&
        v.existedWhileHeld === true
      );
    },
  },
  {
    name: "cross-host held lock → refuses with kind cross_host_held",
    description:
      "If the lock file at `<repoRoot>/.ontology/.lock` already exists and " +
      "records a DIFFERENT hostname, acquireLock must refuse — it cannot probe " +
      "liveness on another machine — by throwing a LockAcquireError whose " +
      "detail.kind is \"cross_host_held\". It must not steal or overwrite the " +
      "foreign lock.",
    setup: () => {
      const repo = freshRepo();
      writeRawLock(repo.repoRoot, {
        pid: 4242,
        hostname: `not-${os.hostname()}-other-machine`,
        acquiredAt: new Date(0).toISOString(),
        command: "some other process",
      });
      return repo;
    },
    invoke: (api, ctx) => {
      const { repoRoot } = ctx as { repoRoot: string };
      try {
        const lock = (api as LockApi).acquireLock(repoRoot);
        lock.release();
        return { threw: false as const };
      } catch (err) {
        const detail = (err as { detail?: { kind?: string } }).detail;
        const stillForeign =
          JSON.parse(fs.readFileSync(lockFilePath(repoRoot), "utf-8")).pid === 4242;
        // We compare the BEHAVIOURAL discriminant (detail.kind) and the
        // side-effect (foreign lock untouched) — NOT the Error's `.name`
        // string. `.name` is a cosmetic property (does the class set
        // `this.name`?), not the contract the oracle specifies ("throws a
        // LockAcquireError whose detail.kind is cross_host_held"). Including
        // it over-constrained the gate: a regen that threw the correct
        // cross_host_held error but left `.name` at its "Error" default was
        // wrongly marked divergent. (REGEN_ORACLE_REFINE: surfaced by the
        // qwen3-coder:480b arm, which was behaviourally correct here.)
        return {
          threw: true as const,
          kind: detail?.kind,
          stillForeign,
        };
      }
    },
    assert: (r) => {
      const v = r as { threw: boolean; kind?: string; stillForeign?: boolean };
      return v.threw === true && v.kind === "cross_host_held" && v.stillForeign === true;
    },
  },
  {
    name: "same-host dead PID → stale lock is reclaimed",
    description:
      "If the lock file at `<repoRoot>/.ontology/.lock` records THIS machine's " +
      "hostname but a pid that is no longer alive, acquireLock treats the lock " +
      "as stale and reclaims it: it succeeds and the returned handle's body " +
      "records the current process's pid (not the dead one).",
    setup: () => {
      const repo = freshRepo();
      // A pid that cannot be alive (above the OS pid ceiling), on THIS host.
      writeRawLock(repo.repoRoot, {
        pid: 999999,
        hostname: os.hostname(),
        acquiredAt: new Date(0).toISOString(),
      });
      return repo;
    },
    invoke: (api, ctx) => {
      const { repoRoot } = ctx as { repoRoot: string };
      const lock = (api as LockApi).acquireLock(repoRoot);
      const result = {
        reclaimedByUs: lock.body.pid === process.pid,
        hostname: lock.body.hostname,
      };
      lock.release();
      return result;
    },
    assert: (r) => {
      const v = r as { reclaimedByUs: boolean; hostname: string };
      return v.reclaimedByUs === true && v.hostname === os.hostname();
    },
  },
  {
    name: "release is idempotent and removes the held lock file",
    description:
      "Releasing an acquired lock removes the lock file from disk, and " +
      "calling release a second time is a no-op (must not throw and must " +
      "not error even though the file is already gone).",
    setup: () => freshRepo(),
    invoke: (api, ctx) => {
      const { repoRoot } = ctx as { repoRoot: string };
      const lock = (api as LockApi).acquireLock(repoRoot);
      const existedBefore = fs.existsSync(lock.lockPath);
      lock.release();
      const goneAfterFirst = !fs.existsSync(lock.lockPath);
      let secondReleaseThrew = false;
      try {
        lock.release();
      } catch {
        secondReleaseThrew = true;
      }
      return { existedBefore, goneAfterFirst, secondReleaseThrew };
    },
    assert: (r) => {
      const v = r as {
        existedBefore: boolean;
        goneAfterFirst: boolean;
        secondReleaseThrew: boolean;
      };
      return (
        v.existedBefore === true &&
        v.goneAfterFirst === true &&
        v.secondReleaseThrew === false
      );
    },
  },
  {
    name: "release verifies ownership → will not steal a reclaimed lock",
    description:
      "Release must verify it still owns the lock before unlinking. If, " +
      "after acquisition, the on-disk lock file has been replaced by a " +
      "different acquisition (a different acquiredAt), calling release must " +
      "NOT delete that file — releasing one's own handle must never steal " +
      "a lock another acquisition now holds.",
    setup: () => freshRepo(),
    invoke: (api, ctx) => {
      const { repoRoot } = ctx as { repoRoot: string };
      const lock = (api as LockApi).acquireLock(repoRoot);
      // Simulate a different acquisition replacing our lock on disk: same
      // pid (we ARE this process) but a different acquiredAt timestamp.
      writeRawLock(repoRoot, {
        pid: lock.body.pid,
        hostname: lock.body.hostname,
        acquiredAt: "2000-01-01T00:00:00.000Z",
      });
      lock.release();
      const fileStillPresent = fs.existsSync(lock.lockPath);
      const body = fileStillPresent
        ? (JSON.parse(fs.readFileSync(lock.lockPath, "utf-8")) as LockBodyLike)
        : null;
      return {
        fileStillPresent,
        foreignAcquiredAtPreserved: body?.acquiredAt === "2000-01-01T00:00:00.000Z",
      };
    },
    assert: (r) => {
      const v = r as { fileStillPresent: boolean; foreignAcquiredAtPreserved: boolean };
      return v.fileStillPresent === true && v.foreignAcquiredAtPreserved === true;
    },
  },
];
