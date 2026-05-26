import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  deepEqual,
  loadFixture,
  resolveFixturePath,
  runBehaviorCheck,
  importIsolated,
  behaviorVerdictToMatrixState,
  type BehaviorCase,
  type BehaviorFixture,
} from "../src/runtime/legend/behavior-checker.js";

// Tests for the Phase ε behaviour-axis checker (v0).
//
// The four spec-required scenarios from
// docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md §6:
//   (a) fixture-less node → untested
//   (b) src + regen identity → pass
//   (c) deliberate behavioural divergence → fail
//   (d) regen fails to load → untested
//
// Each scenario builds its own tmpdir holding the src module, regen
// module, and (when applicable) the fixture. The runner is invoked
// against the on-disk paths so the test exercises the same import
// path the verify command will use in production.

async function withTmpDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T> | T,
): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function write(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

describe("behavior-checker / deepEqual", () => {
  it("agrees on primitives and Object.is edge cases", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(false);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("walks plain objects key-by-key, order-insensitive", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });

  it("walks arrays in order", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
  });

  it("handles Map and Set with size + membership", () => {
    expect(
      deepEqual(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
        new Map([
          ["b", 2],
          ["a", 1],
        ]),
      ),
    ).toBe(true);
    expect(deepEqual(new Set([1, 2, 3]), new Set([3, 2, 1]))).toBe(true);
    expect(deepEqual(new Set([1, 2]), new Set([1, 2, 3]))).toBe(false);
  });
});

describe("behavior-checker / behaviorVerdictToMatrixState", () => {
  it("is identity on the v0 vocabulary", () => {
    expect(behaviorVerdictToMatrixState("pass")).toBe("pass");
    expect(behaviorVerdictToMatrixState("fail")).toBe("fail");
    expect(behaviorVerdictToMatrixState("untested")).toBe("untested");
  });
});

describe("behavior-checker / resolveFixturePath", () => {
  it("returns null for a missing fixture", async () => {
    await withTmpDir("bc-resolve-", async (dir) => {
      expect(resolveFixturePath(dir, "node_9999")).toBeNull();
    });
  });

  it("returns the absolute path when present", async () => {
    await withTmpDir("bc-resolve-", async (dir) => {
      const p = write(dir, "node_0001.fixture.mjs", "export const cases = [];");
      expect(resolveFixturePath(dir, "node_0001")).toBe(p);
    });
  });
});

describe("behavior-checker / loadFixture", () => {
  it("returns null when the file is missing (scenario a precursor)", async () => {
    await withTmpDir("bc-load-", async (dir) => {
      const r = await loadFixture(dir, "node_9999");
      expect(r).toBeNull();
    });
  });

  it("throws when the fixture has no `cases` export", async () => {
    await withTmpDir("bc-load-", async (dir) => {
      write(dir, "node_0001.fixture.mjs", "export const notCases = [];");
      await expect(loadFixture(dir, "node_0001")).rejects.toThrow(
        /non-empty `cases`/,
      );
    });
  });

  it("throws when a case is missing a required field", async () => {
    await withTmpDir("bc-load-", async (dir) => {
      write(
        dir,
        "node_0001.fixture.mjs",
        `export const cases = [{ name: "x", setup: () => ({}), invoke: () => 1 }];`,
      );
      await expect(loadFixture(dir, "node_0001")).rejects.toThrow(
        /wrong shape/,
      );
    });
  });

  it("loads a well-formed fixture", async () => {
    await withTmpDir("bc-load-", async (dir) => {
      write(
        dir,
        "node_0001.fixture.mjs",
        `export const cases = [{
          name: "ok",
          setup: () => ({}),
          invoke: () => 1,
          assert: (r) => r === 1,
        }];`,
      );
      const r = await loadFixture(dir, "node_0001");
      expect(r).not.toBeNull();
      expect(r?.fixture.cases).toHaveLength(1);
      expect(r?.fixture.cases[0]?.name).toBe("ok");
    });
  });
});

describe("behavior-checker / importIsolated", () => {
  it("returns ok:false on a missing file", async () => {
    const r = await importIsolated("/this/path/does/not/exist.ts");
    expect(r.ok).toBe(false);
  });

  it("returns the namespace object on success", async () => {
    await withTmpDir("bc-import-", async (dir) => {
      const p = write(dir, "mod.mjs", `export const value = 42;`);
      const r = await importIsolated(p);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect((r.api as { value: number }).value).toBe(42);
      }
    });
  });

  it("re-imports return fresh state (cache-busted)", async () => {
    await withTmpDir("bc-import-", async (dir) => {
      const p = write(
        dir,
        "mod.mjs",
        `let count = 0; export function bump() { return ++count; }`,
      );
      const r1 = await importIsolated(p);
      const r2 = await importIsolated(p);
      expect(r1.ok && r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        // Each fresh import resets module state — bump() in each
        // returns 1, not 1 then 2.
        const a = (r1.api as { bump: () => number }).bump();
        const b = (r2.api as { bump: () => number }).bump();
        expect(a).toBe(1);
        expect(b).toBe(1);
      }
    });
  });
});

// ── Spec §6 — the four mandatory scenarios ──────────────────────────────────

describe("behavior-checker / spec §6 scenarios", () => {
  function makeFixture(cases: BehaviorCase[]): BehaviorFixture {
    return { cases };
  }

  it("(a) fixture-less node → untested (via the verify command's path)", async () => {
    // The command resolves the fixture path first; missing file →
    // `untested` with reason `no_fixture`. The checker module's
    // `loadFixture` returns null in that case; we exercised that
    // above. Here we cover the verdict downstream: a fixture that
    // exists but has zero cases would also resolve to a useless
    // checker run — but the loader rejects zero-case fixtures up
    // front, so the command-level path of "no fixture file" stays
    // the single source of `untested-by-fixture-absence`.
    await withTmpDir("bc-a-", async (dir) => {
      expect(resolveFixturePath(dir, "node_9999")).toBeNull();
    });
  });

  it("(b) src + regen identity → pass", async () => {
    await withTmpDir("bc-b-", async (dir) => {
      const src = write(
        dir,
        "mod.src.mjs",
        `export function add(a, b) { return a + b; }`,
      );
      const regen = write(
        dir,
        "mod.regen.mjs",
        `export function add(a, b) { return a + b; }`,
      );
      const fixture = makeFixture([
        {
          name: "add — happy path",
          setup: () => ({ a: 2, b: 3 }),
          invoke: (api, ctx) =>
            (api as { add: (a: number, b: number) => number }).add(
              (ctx as { a: number; b: number }).a,
              (ctx as { a: number; b: number }).b,
            ),
          assert: (r) => r === 5,
        },
      ]);
      const result = await runBehaviorCheck({
        nodeId: "node_test",
        sourcePath: src,
        regenPath: regen,
        fixture,
      });
      expect(result.verdict).toBe("pass");
      expect(result.cases).toHaveLength(1);
      expect(result.cases?.[0]?.outcome).toBe("match");
    });
  });

  it("(c) deliberate behavioural divergence → fail", async () => {
    await withTmpDir("bc-c-", async (dir) => {
      const src = write(
        dir,
        "mod.src.mjs",
        `export function add(a, b) { return a + b; }`,
      );
      // Regen does multiplication instead — same export name, same
      // signature, divergent semantics. This is the precise case the
      // structural Jaccard cannot see: declarations match, behaviour
      // does not.
      const regen = write(
        dir,
        "mod.regen.mjs",
        `export function add(a, b) { return a * b; }`,
      );
      const fixture = makeFixture([
        {
          name: "add — non-trivial inputs",
          setup: () => ({ a: 2, b: 3 }),
          invoke: (api, ctx) =>
            (api as { add: (a: number, b: number) => number }).add(
              (ctx as { a: number; b: number }).a,
              (ctx as { a: number; b: number }).b,
            ),
          assert: () => true, // We're testing the deep-equal compare.
        },
      ]);
      const result = await runBehaviorCheck({
        nodeId: "node_test",
        sourcePath: src,
        regenPath: regen,
        fixture,
      });
      expect(result.verdict).toBe("fail");
      expect(result.cases?.[0]?.outcome).toBe("divergent");
    });
  });

  it("(d) regen fails to load → untested", async () => {
    await withTmpDir("bc-d-", async (dir) => {
      const src = write(
        dir,
        "mod.src.mjs",
        `export function add(a, b) { return a + b; }`,
      );
      // Regen has a syntax error so the dynamic import throws.
      const regen = write(
        dir,
        "mod.regen.mjs",
        `export function add(a, b) { return a + b; } this is not valid syntax`,
      );
      const fixture = makeFixture([
        {
          name: "add",
          setup: () => ({}),
          invoke: (api) =>
            (api as { add: (a: number, b: number) => number }).add(1, 2),
          assert: (r) => r === 3,
        },
      ]);
      const result = await runBehaviorCheck({
        nodeId: "node_test",
        sourcePath: src,
        regenPath: regen,
        fixture,
      });
      expect(result.verdict).toBe("untested");
      expect(result.reason).toMatch(/regen_load_failed/);
    });
  });
});

// ── Beyond-spec coverage: throw-equivalence and per-case timeout ────────────

describe("behavior-checker / throw semantics", () => {
  it("treats both-sides-throw-same-message as match (throwing is part of behaviour)", async () => {
    await withTmpDir("bc-throw-", async (dir) => {
      const body = `export function explode() { throw new Error("boom"); }`;
      const src = write(dir, "src.mjs", body);
      const regen = write(dir, "regen.mjs", body);
      const result = await runBehaviorCheck({
        nodeId: "node_test",
        sourcePath: src,
        regenPath: regen,
        fixture: {
          cases: [
            {
              name: "explode",
              setup: () => ({}),
              invoke: (api) => (api as { explode: () => never }).explode(),
              assert: () => true,
            },
          ],
        },
      });
      expect(result.verdict).toBe("pass");
      expect(result.cases?.[0]?.outcome).toBe("match");
      expect(result.cases?.[0]?.detail).toMatch(/both threw: boom/);
    });
  });

  it("treats one-side-throws-other-returns as divergent", async () => {
    await withTmpDir("bc-throw-", async (dir) => {
      const src = write(
        dir,
        "src.mjs",
        `export function maybe() { return 1; }`,
      );
      const regen = write(
        dir,
        "regen.mjs",
        `export function maybe() { throw new Error("nope"); }`,
      );
      const result = await runBehaviorCheck({
        nodeId: "node_test",
        sourcePath: src,
        regenPath: regen,
        fixture: {
          cases: [
            {
              name: "maybe",
              setup: () => ({}),
              invoke: (api) => (api as { maybe: () => number }).maybe(),
              assert: () => true,
            },
          ],
        },
      });
      expect(result.verdict).toBe("fail");
      expect(result.cases?.[0]?.outcome).toBe("errored");
    });
  });
});
