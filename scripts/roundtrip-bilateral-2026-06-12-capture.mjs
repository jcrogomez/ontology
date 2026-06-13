#!/usr/bin/env node
// Capture driver for frontier arms (B/C) of ROUNDTRIP_BILATERAL_2026-06-12.
// Runs the real CLI per sample node against the capture-mode fakeollama shim,
// then correlates each node id with the prompt keys it dispatched (a node's
// compile plan may dispatch >1 call if upstreams compile first; all keys are
// recorded, the last one is the focal).
//
// Usage: node roundtrip-bilateral-2026-06-12-capture.mjs <F|G> <captureDir> [port=11500]
//   F: capture compile prompts (intent -> code), targets regen/B/
//   G: capture ingest prompts over regen/C/ artifacts (code -> intent)

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = "/Users/juancarlosromero/Development/ontology";
const SCRATCH = path.join(REPO, ".ontology.scratch-roundtrip-2026-06-12");
const WS = path.join(SCRATCH, "ws-frontier");
const CLI = path.join(REPO, "dist/cli.js");

const [direction, captureDir, portArg] = process.argv.slice(2);
const PORT = Number(portArg || 11500);
const HOST = `http://127.0.0.1:${PORT}`;
if (!["F", "G"].includes(direction) || !captureDir) {
  console.error("usage: capture.mjs <F|G> <captureDir> [port]");
  process.exit(1);
}
const capturedPath = path.join(captureDir, "captured.jsonl");
const mapPath = path.join(captureDir, `capture-map-${direction}.json`);

const sample = JSON.parse(fs.readFileSync(path.join(SCRATCH, "sample.json"), "utf8"));
const readKeys = () =>
  fs.existsSync(capturedPath)
    ? fs.readFileSync(capturedPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).key)
    : [];

const map = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : {};

for (const id of sample.ids) {
  if (map[id]) continue;
  const node = JSON.parse(fs.readFileSync(path.join(WS, ".ontology/nodes", `${id}.json`), "utf8"));
  const ext = path.extname(node.outputs.files[0]).slice(1) || "ts";
  const before = readKeys().length;
  const args =
    direction === "F"
      ? ["compile", "run", id, "--provider", "ollama", "--model", "frontier-shim", "--ollama-host", HOST, "--open-world", "--target", `regen/B/${id}.${ext}`, "--force", "--json"]
      : ["ingest", `regen/C/${id}.${ext}`, "--provider", "ollama", "--model", "frontier-shim", "--ollama-host", HOST, "--dry-run", "--json"];
  spawnSync("node", [CLI, ...args], { cwd: WS, timeout: 120000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const after = readKeys();
  const newKeys = [...new Set(after.slice(before))]; // ingest may retry the same prompt; dedupe
  map[id] = { keys: newKeys, focal: newKeys[newKeys.length - 1] ?? null };
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
  console.log(`${id}: ${newKeys.length} prompt(s) captured`);
}
console.log(`done -> ${mapPath}`);
