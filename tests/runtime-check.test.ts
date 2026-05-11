import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { runtimeCheck } from "../src/runtime/compile/post/runtime-check.js";

function pythonAvailable(): boolean {
  const r = spawnSync("python3", ["--version"], { encoding: "utf-8" });
  return !r.error && r.status === 0;
}

describe("runtimeCheck", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rt-check-"));
  });

  it("skips when no language is declared", () => {
    const p = path.join(tmp, "nolang.txt");
    fs.writeFileSync(p, "anything");
    const r = runtimeCheck({ absolutePath: p });
    expect(r.status).toBe("skipped");
  });

  it("skips when the language has no registered runner", () => {
    const p = path.join(tmp, "klingon.kl");
    fs.writeFileSync(p, "tlhIngan");
    const r = runtimeCheck({ absolutePath: p, language: "klingon" });
    expect(r.status).toBe("skipped");
    if (r.status === "skipped") expect(r.reason).toContain("klingon");
  });

  it("language matching is case-insensitive (skipped path)", () => {
    const p = path.join(tmp, "case.x");
    fs.writeFileSync(p, "x");
    expect(runtimeCheck({ absolutePath: p, language: "KLINGON" }).status).toBe("skipped");
  });

  describe.runIf(pythonAvailable())("python runner (python3 on PATH)", () => {
    it("returns ok when the script exits 0", () => {
      const p = path.join(tmp, "ok.py");
      fs.writeFileSync(p, 'print("hello")\n');
      const r = runtimeCheck({ absolutePath: p, language: "python" });
      expect(r.status).toBe("ok");
      if (r.status === "ok") {
        expect(r.stdout).toBe("hello\n");
        expect(r.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("returns failed when the script raises", () => {
      const p = path.join(tmp, "raise.py");
      fs.writeFileSync(p, "undefined_symbol_42\n");
      const r = runtimeCheck({ absolutePath: p, language: "python" });
      expect(r.status).toBe("failed");
      if (r.status === "failed") {
        expect(r.message).toMatch(/NameError|undefined_symbol_42/);
        expect(r.exitCode).not.toBe(0);
      }
    });

    it("returns failed with non-zero exit when the script exits non-zero deliberately", () => {
      const p = path.join(tmp, "exit2.py");
      fs.writeFileSync(p, "import sys; sys.exit(2)\n");
      const r = runtimeCheck({ absolutePath: p, language: "python" });
      expect(r.status).toBe("failed");
      if (r.status === "failed") {
        expect(r.exitCode).toBe(2);
      }
    });

    it("times out and reports failed when the script hangs past the budget", () => {
      const p = path.join(tmp, "hang.py");
      fs.writeFileSync(p, "import time; time.sleep(60)\n");
      const r = runtimeCheck({ absolutePath: p, language: "python", timeoutMs: 200 });
      expect(r.status).toBe("failed");
      if (r.status === "failed") {
        expect(r.message).toMatch(/timeout|timed/i);
        expect(r.exitCode).toBeNull();
      }
    });

    it("does not misreport an early SIGTERM as a timeout at the 100ms boundary", () => {
      // The child self-SIGTERMs at startup (durationMs ≈ ms, well below
      // the new 10%-of-budget slack). Pre-fix the threshold collapsed to
      // 0 at timeoutMs=100, so any SIGTERM landed in the "exceeded
      // timeout" branch. Post-fix the slack is 10ms → threshold 90ms →
      // the SIGTERM falls through to the generic failure branch.
      const p = path.join(tmp, "selfkill.py");
      fs.writeFileSync(p, "import os, signal\nos.kill(os.getpid(), signal.SIGTERM)\n");
      const r = runtimeCheck({ absolutePath: p, language: "python", timeoutMs: 100 });
      expect(r.status).toBe("failed");
      if (r.status === "failed") {
        expect(r.message).not.toMatch(/exceeded.*timeout/i);
        expect(r.exitCode).toBeNull();
      }
    });

    it("clamps an absurdly large timeout into the safe range (does not hang on bad input)", () => {
      const p = path.join(tmp, "ok2.py");
      fs.writeFileSync(p, 'print("x")\n');
      const r = runtimeCheck({
        absolutePath: p,
        language: "python",
        // 100x the max — should be clamped to 60000ms ceiling.
        timeoutMs: 6_000_000,
      });
      expect(r.status).toBe("ok");
    });
  });
});
