import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBehaviorCheckIsolated } from "../src/laws/behavior-checker-isolated.js";

// These tests prove the headline containment guarantee: a draft can throw on a
// deferred tick, call process.exit, or spin forever, and the PARENT (this test
// process) still survives with a verdict in hand. In-process, the process.exit
// and infinite-loop drafts would terminate the vitest worker outright.

let dir: string;
const W = (name: string, body: string): string => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return p;
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-iso-test-"));
});
afterAll(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

const SOURCE = `export function f() { return 42; }`;
const FIXTURE = `export const cases = [{
  name: "f returns 42",
  setup: () => ({}),
  invoke: (api) => api.f(),
  assert: (r) => r === 42,
}];`;

describe("runBehaviorCheckIsolated — containment", () => {
  it("a well-behaved regen passes (parity with in-process)", () => {
    const sourcePath = W("src-ok.mjs", SOURCE);
    const regenPath = W("regen-ok.mjs", `export function f() { return 42; }`);
    const fixturePath = W("fx-ok.fixture.mjs", FIXTURE);
    const r = runBehaviorCheckIsolated({ nodeId: "node_t1", sourcePath, regenPath, fixturePath });
    expect(r.verdict).toBe("pass");
  }, 30000);

  it("a regen that calls process.exit mid-invoke is contained → untested, parent survives", () => {
    const sourcePath = W("src-exit.mjs", SOURCE);
    // In-process this would kill the vitest worker. Isolated: the child dies,
    // writes no result, and the parent reports untested.
    const regenPath = W("regen-exit.mjs", `export function f() { process.exit(0); }`);
    const fixturePath = W("fx-exit.fixture.mjs", FIXTURE);
    const r = runBehaviorCheckIsolated({ nodeId: "node_t2", sourcePath, regenPath, fixturePath });
    expect(r.verdict).toBe("untested");
    expect(r.reason).toMatch(/isolated_check/);
  }, 30000);

  it("a regen that spins forever is killed by the hard timeout → untested, parent survives", () => {
    const sourcePath = W("src-loop.mjs", SOURCE);
    const regenPath = W("regen-loop.mjs", `export function f() { while (true) {} }`);
    const fixturePath = W("fx-loop.fixture.mjs", FIXTURE);
    const r = runBehaviorCheckIsolated({
      nodeId: "node_t3",
      sourcePath,
      regenPath,
      fixturePath,
      perCaseTimeoutMs: 1000,
      hardTimeoutMs: 8000,
    });
    expect(r.verdict).toBe("untested");
    expect(r.reason).toMatch(/isolated_check_killed|isolated_check_crashed/);
  }, 20000);
});
