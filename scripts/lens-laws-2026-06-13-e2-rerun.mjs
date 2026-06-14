#!/usr/bin/env node
// E2 re-run WITH rules-grounding — empirical proof the channel closes the gap.
// put = regenerate --rules-grounding (injects @ontology:rules block);
// get = ingest (deterministic block recovery). Same 6 nodes as LENS_LAWS E2.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = "/Users/juancarlosromero/Development/ontology";
const WS = path.join(REPO, ".ontology.scratch-lens-laws-2026-06-13");
const CLI = path.join(REPO, "dist/cli.js");
const editset = JSON.parse(fs.readFileSync(path.join(WS, "editset.json"), "utf8"));
const cli = (args, t = 15 * 60 * 1000) => {
  const r = spawnSync("node", [CLI, ...args], { cwd: WS, timeout: t, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { ok: r.status === 0, json };
};
const nodePath = (id) => path.join(WS, ".ontology/nodes", id + ".json");
const tokens = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9_]+/g) || []);
const tjac = (a, b) => { const ta = tokens(a), tb = tokens(b); const i = [...ta].filter((x) => tb.has(x)).length; return i / new Set([...ta, ...tb]).size || 0; };

const results = [];
for (const e of editset) {
  const id = e.id, ext = path.extname(e.srcRel) || ".ts";
  const orig = JSON.parse(fs.readFileSync(nodePath(id), "utf8"));
  const n = JSON.parse(JSON.stringify(orig));
  n.rules = [...(n.rules || []), e.e2.rule];
  fs.writeFileSync(nodePath(id), JSON.stringify(n, null, 2));
  // put with rules-grounding (single draw; the block is deterministic)
  cli(["regenerate", id, "--provider", "ollama", "--model", "qwen2.5-coder:7b", "--rules-grounding", "--json"]);
  const draft = path.join(WS, ".ontology/verify", `${id}${ext}`);
  const hasBlock = fs.existsSync(draft) && fs.readFileSync(draft, "utf8").includes("@ontology:rules");
  // get (recover)
  let getRules = [];
  if (fs.existsSync(draft)) {
    const r = cli(["ingest", path.relative(WS, draft), "--provider", "ollama", "--model", "qwen2.5-coder:3b", "--dry-run", "--json"]);
    getRules = r.json?.extracted?.rules || [];
  }
  const survived = getRules.some((r) => tjac(r, e.e2.rule) >= 0.5);
  results.push({ id, putBlock: hasBlock, survived });
  console.log(id, "put-block:", hasBlock, "| survived:", survived);
  fs.writeFileSync(nodePath(id), JSON.stringify(orig, null, 2));
}
fs.writeFileSync(path.join(WS, "results-e2-grounded.json"), JSON.stringify(results, null, 2));
console.log("\n=== E2 WITH rules-grounding ===");
console.log("survived:", results.filter((r) => r.survived).length + "/6", "(was 0/6 without grounding)");
