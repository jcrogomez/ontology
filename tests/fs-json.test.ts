import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeJson, readJson } from "../src/core/fs/json.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-json-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("writeJson", () => {
  it("round-trips through disk", () => {
    const file = path.join(tmpDir, "value.json");
    const value = { name: "demo", items: [1, 2, 3], nested: { ok: true } };
    writeJson(file, value);
    expect(readJson<typeof value>(file)).toEqual(value);
  });

  it("creates intermediate directories", () => {
    const file = path.join(tmpDir, "deeply", "nested", "value.json");
    writeJson(file, { ok: true });
    expect(fs.existsSync(file)).toBe(true);
  });

  it("overwrites an existing file cleanly", () => {
    const file = path.join(tmpDir, "value.json");
    writeJson(file, { v: 1 });
    writeJson(file, { v: 2 });
    expect(readJson<{ v: number }>(file).v).toBe(2);
  });

  it("leaves no .tmp.* artefacts after a successful write", () => {
    const file = path.join(tmpDir, "value.json");
    writeJson(file, { ok: true });
    const leftovers = fs.readdirSync(tmpDir).filter((f) => f.includes(".tmp."));
    expect(leftovers).toEqual([]);
  });

  it("cleans up the temp file when rename fails", () => {
    // Force renameSync to fail by occupying the target path with a
    // non-empty directory. This proves the catch path unlinks the temp
    // file so a crashed run does not litter the parent directory.
    const target = path.join(tmpDir, "occupied");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "child"), "x");
    expect(() => writeJson(target, { ok: true })).toThrow();
    const leftovers = fs.readdirSync(tmpDir).filter((f) => f.includes(".tmp."));
    expect(leftovers).toEqual([]);
    // Target was untouched — still the original directory with its child.
    expect(fs.statSync(target).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(target, "child"))).toBe(true);
  });
});
