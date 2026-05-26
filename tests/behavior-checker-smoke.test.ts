import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import {
  loadFixture,
  runBehaviorCheck,
} from "../src/runtime/legend/behavior-checker.js";

// Smoke-test the v0 behaviour-axis checker end-to-end against the
// project's REAL source files. Validates two paths the unit tests
// in behavior-checker.test.ts cannot reach:
//   1. Loading a `.fixture.ts` file from the shipped
//      tests/behavior-fixtures/ directory (the production extension).
//   2. Loading a real TS module from the project tree via dynamic
//      import, on both sides of the comparison.
//
// Why this is a SMOKE test, not a full integration test: Arm A's
// regenerated artefacts under `.ontology/verify/` are not preserved
// across runs, so we cannot point the checker at a real regen here.
// We use identity (src and regen both point to the same on-disk
// source) to confirm the runner accepts real TS, runs the fixture,
// and yields `pass`. Real regen-vs-source measurement requires
// re-running `verify-homeomorphism` with `--matrix --behavior-check`
// against a live arm.
//
// Vitest caveat: the project's `.ts` files are inside Vite's
// resolver root, so dynamic `import()` of a `file://` URL pointing
// at them works. The unit tests sit in `/tmp/...` (outside the
// root) and have to use `.mjs`; this smoke test deliberately runs
// against the real tree.

const FIXTURES_DIR = path.resolve(__dirname, "behavior-fixtures");
const PROJECT_ROOT = path.resolve(__dirname, "..");

interface IdentityCase {
  nodeId: string;
  sourceRelative: string;
}

// One per fixture-eligible node from the v0 cohort. The runner reads
// src + regen from the same path → fixture must report `pass` if the
// plumbing works. A `fail` or `untested` here means: fixture
// signature drifted from the source's export, or vitest's resolver
// rejected the `.ts` import, or the runner has a bug.
const CASES: readonly IdentityCase[] = [
  { nodeId: "node_0006", sourceRelative: "src/runtime/compile/post/runtime-check.ts" },
  { nodeId: "node_0033", sourceRelative: "src/runtime/legend/render-ascii.ts" },
  { nodeId: "node_0036", sourceRelative: "src/runtime/legend/translator.ts" },
  { nodeId: "node_0038", sourceRelative: "src/runtime/legend/vocab-gap.ts" },
  { nodeId: "node_0055", sourceRelative: "src/runtime/topos/omega.ts" },
  { nodeId: "node_0062", sourceRelative: "src/core/errors.ts" },
  { nodeId: "node_0065", sourceRelative: "src/core/integrity/hash.ts" },
];

describe("behavior-checker / E2E smoke against real source files (identity)", () => {
  for (const c of CASES) {
    it(`${c.nodeId} (${c.sourceRelative}) — identity check passes`, async () => {
      const sourceAbs = path.resolve(PROJECT_ROOT, c.sourceRelative);
      expect(fs.existsSync(sourceAbs)).toBe(true);
      const fixtureLoad = await loadFixture(FIXTURES_DIR, c.nodeId);
      expect(fixtureLoad).not.toBeNull();
      if (!fixtureLoad) return;
      const result = await runBehaviorCheck({
        nodeId: c.nodeId,
        sourcePath: sourceAbs,
        regenPath: sourceAbs, // identity — same file on both sides
        fixture: fixtureLoad.fixture,
      });
      // Identity must produce a pass. A fail would mean the fixture
      // mis-models the function under test.
      expect(result.verdict).toBe("pass");
      expect(result.cases?.every((cc) => cc.outcome === "match")).toBe(true);
    });
  }

  it("detects a deliberate divergence — fixture against a mutated regen", async () => {
    // Build a regen file that re-exports errorMessage with INVERTED
    // semantics: return "WRONG" no matter what. The shipped
    // node_0062 fixture asserts errorMessage(new Error("permission
    // denied")) === "permission denied"; the regen returns "WRONG",
    // so the runner must fold to `fail` with a divergent outcome.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-smoke-div-"));
    try {
      const regen = path.join(dir, "errors.mjs");
      fs.writeFileSync(
        regen,
        `export function errorMessage(_e) { return "WRONG"; }\n`,
      );
      const sourceAbs = path.resolve(PROJECT_ROOT, "src/core/errors.ts");
      const fixtureLoad = await loadFixture(FIXTURES_DIR, "node_0062");
      expect(fixtureLoad).not.toBeNull();
      if (!fixtureLoad) return;
      const result = await runBehaviorCheck({
        nodeId: "node_0062",
        sourcePath: sourceAbs,
        regenPath: regen,
        fixture: fixtureLoad.fixture,
      });
      expect(result.verdict).toBe("fail");
      // At least one case diverged or the assert returned false on
      // the regen side.
      expect(
        result.cases?.some(
          (cc) => cc.outcome === "divergent" || cc.outcome === "errored",
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
