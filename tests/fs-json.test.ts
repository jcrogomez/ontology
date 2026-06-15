import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeJson, readJson, appendJsonl, readJsonl } from "../src/kernel/core/fs/json.js";

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

  it("does not leak the fd when fsync/rename fails on cleanup path", () => {
    // The fsync+close+rename path is more complex than the legacy
    // writeFileSync path; verify the cleanup branch still leaves no
    // temp behind even when the failure happens late.
    const target = path.join(tmpDir, "occupied2");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "child"), "x");
    // First call throws on rename (occupied target).
    expect(() => writeJson(target, { v: 1 })).toThrow();
    // Second call into the same parent succeeds — proves no fd /
    // tmp-name collision was left behind.
    const ok = path.join(tmpDir, "ok.json");
    writeJson(ok, { v: 2 });
    expect(readJson<{ v: number }>(ok).v).toBe(2);
  });
});

describe("appendJsonl — durability + fd hygiene (Arm A pre-flight)", () => {
  it("appends a line, terminator included, round-trips through readJsonl", () => {
    const file = path.join(tmpDir, "events.jsonl");
    appendJsonl(file, { eventId: "evt_1", payload: { ok: true } });
    appendJsonl(file, { eventId: "evt_2", payload: { ok: false } });
    const events = readJsonl<{ eventId: string }>(file);
    expect(events.map((e) => e.eventId)).toEqual(["evt_1", "evt_2"]);
  });

  it("creates intermediate directories on first append", () => {
    const file = path.join(tmpDir, "deeply", "nested", "events.jsonl");
    appendJsonl(file, { ok: true });
    expect(fs.existsSync(file)).toBe(true);
  });

  it("does not leak file descriptors across many appends", () => {
    // 1024 appends would exhaust the default macOS soft limit (256
    // open files) if even a fraction leaked. A successful run is the
    // assertion: any leak surfaces as EMFILE on the open syscall.
    const file = path.join(tmpDir, "many.jsonl");
    for (let i = 0; i < 512; i++) {
      appendJsonl(file, { i });
    }
    const events = readJsonl<{ i: number }>(file);
    expect(events).toHaveLength(512);
    expect(events[0].i).toBe(0);
    expect(events[511].i).toBe(511);
  });

  it("each line is terminated with exactly one newline (no double-terminator drift)", () => {
    const file = path.join(tmpDir, "events.jsonl");
    appendJsonl(file, { a: 1 });
    appendJsonl(file, { a: 2 });
    const raw = fs.readFileSync(file, "utf-8");
    // Two records → exactly two terminators, no trailing blank line.
    expect(raw.split("\n").filter((l) => l !== "")).toHaveLength(2);
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);
  });
});
