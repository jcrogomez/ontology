import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { validateLanguage } from "../src/forward/compile/post/validate-language.js";

function pythonAvailable(): boolean {
  const r = spawnSync("python3", ["--version"], { encoding: "utf-8" });
  return !r.error && r.status === 0;
}

describe("validateLanguage", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "validate-lang-"));
  });

  it("skips when no language is declared", () => {
    const p = path.join(tmp, "no-lang.txt");
    fs.writeFileSync(p, "anything");
    const r = validateLanguage({ absolutePath: p });
    expect(r.status).toBe("skipped");
  });

  it("skips when the language has no registered validator", () => {
    const p = path.join(tmp, "klingon.kl");
    fs.writeFileSync(p, "tlhIngan");
    const r = validateLanguage({ absolutePath: p, language: "klingon" });
    expect(r.status).toBe("skipped");
    if (r.status === "skipped") expect(r.reason).toContain("klingon");
  });

  it("language matching is case-insensitive", () => {
    const p = path.join(tmp, "no-validator.x");
    fs.writeFileSync(p, "x");
    const a = validateLanguage({ absolutePath: p, language: "KLINGON" });
    const b = validateLanguage({ absolutePath: p, language: "klingon" });
    expect(a.status).toBe("skipped");
    expect(b.status).toBe("skipped");
  });

  describe.runIf(pythonAvailable())("python validator (python3 on PATH)", () => {
    it("returns ok for valid python source", () => {
      const p = path.join(tmp, "ok.py");
      fs.writeFileSync(p, 'print("hello")\n');
      const r = validateLanguage({ absolutePath: p, language: "python" });
      expect(r.status).toBe("ok");
    });

    it("returns ok for empty source (ast.parse accepts an empty module)", () => {
      const p = path.join(tmp, "empty.py");
      fs.writeFileSync(p, "");
      const r = validateLanguage({ absolutePath: p, language: "python" });
      expect(r.status).toBe("ok");
    });

    it("returns failed for malformed python (the chat-prose case)", () => {
      const p = path.join(tmp, "broken.py");
      fs.writeFileSync(p, "Here you go:\nIn this example, we've:\n");
      const r = validateLanguage({ absolutePath: p, language: "python" });
      expect(r.status).toBe("failed");
      if (r.status === "failed") {
        expect(r.message).toMatch(/SyntaxError|invalid syntax|unterminated/i);
      }
    });
  });
});
