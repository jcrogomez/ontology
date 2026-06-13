#!/usr/bin/env node
// Split captured.jsonl into per-key prompt files for the frontier subagents.
// Usage: node roundtrip-bilateral-2026-06-12-split-prompts.mjs <captureDir>

import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const lines = fs.readFileSync(path.join(dir, "captured.jsonl"), "utf8").trim().split("\n").filter(Boolean);
fs.mkdirSync(path.join(dir, "prompts"), { recursive: true });
const seen = new Set();
for (const line of lines) {
  const { key, messages, format } = JSON.parse(line);
  if (seen.has(key)) continue;
  seen.add(key);
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  fs.writeFileSync(path.join(dir, "prompts", `${key}.json`), JSON.stringify({ key, format, system, user }, null, 2));
}
console.log(`${seen.size} unique prompts -> ${dir}/prompts/`);
