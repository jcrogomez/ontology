#!/usr/bin/env node
// Generalized G-direction runner (code' -> ficha') for ROUNDTRIP_BILATERAL_2026-06-12.
// Ingests each regen artifact with the arm's G model; appends records compatible
// with the metrics computer. Resume-safe; pre-registered retry accounting (3).
//
// Usage: node roundtrip-bilateral-2026-06-12-g-runner.mjs \
//          --arm B --ws <abs ws dir> --regen-sub regen/B \
//          --provider ollama --model qwen2.5-coder:3b [--host http://127.0.0.1:11434]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = "/Users/juancarlosromero/Development/ontology";
const SCRATCH = path.join(REPO, ".ontology.scratch-roundtrip-2026-06-12");
const CLI = path.join(REPO, "dist/cli.js");
const MAX_ATTEMPTS = 3;
const G_TIMEOUT_MS = 15 * 60 * 1000;

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const ARM = opt("arm");
const WS = opt("ws");
const REGEN_SUB = opt("regen-sub");
const PROVIDER = opt("provider", "ollama");
const MODEL = opt("model", "qwen2.5-coder:3b");
const HOST = opt("host", null);
if (!ARM || !WS || !REGEN_SUB) { console.error("missing --arm/--ws/--regen-sub"); process.exit(1); }

const RESULTS = path.join(SCRATCH, `results-arm${ARM}.jsonl`);
const LOG = path.join(SCRATCH, `runner-arm${ARM}.log`);
const sample = JSON.parse(fs.readFileSync(path.join(SCRATCH, "sample.json"), "utf8"));
const done = new Set(
  fs.existsSync(RESULTS)
    ? fs.readFileSync(RESULTS, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).id)
    : []
);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
}

function runIngest(regenRel) {
  const t0 = Date.now();
  const args = [CLI, "ingest", regenRel, "--provider", PROVIDER, "--model", MODEL, "--dry-run", "--json"];
  if (HOST) { args.push("--ollama-host", HOST); }
  const res = spawnSync("node", args, { cwd: WS, timeout: G_TIMEOUT_MS, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - t0;
  let json = null;
  try { json = JSON.parse(res.stdout); } catch { /* failure */ }
  const ok = res.status === 0 && json && json.ok !== false && json.extracted;
  return { ok, json, ms, stderr: (res.stderr || "").slice(-2000), timedOut: res.error?.code === "ETIMEDOUT" };
}

const ids = sample.ids.filter((id) => !done.has(id));
log(`Arm ${ARM} G-runner start: ${ids.length} pending (model ${MODEL}${HOST ? " @ " + HOST : ""})`);

for (const id of ids) {
  const node = JSON.parse(fs.readFileSync(path.join(WS, ".ontology/nodes", `${id}.json`), "utf8"));
  const srcFile = node.outputs.files[0];
  const ext = path.extname(srcFile).slice(1) || "ts";
  const regenRel = `${REGEN_SUB}/${id}.${ext}`;
  const record = { id, arm: ARM, srcFile, f: { ok: fs.existsSync(path.join(WS, regenRel)), reused: true, attempts: [] } };
  if (!record.f.ok) {
    record.status = "regen_missing";
    fs.appendFileSync(RESULTS, JSON.stringify(record) + "\n");
    log(`${id} regen_missing (${regenRel})`);
    continue;
  }
  const attempts = [];
  let final = null;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const r = runIngest(regenRel);
    attempts.push({ attempt: i, ok: r.ok, ms: r.ms, timedOut: !!r.timedOut });
    if (r.ok) { final = r; break; }
    log(`  ${id} G attempt ${i}/${MAX_ATTEMPTS} failed (${r.timedOut ? "timeout" : "error"})`);
  }
  record.g = { ok: !!final, attempts };
  if (final) {
    record.status = "ok";
    record.extracted = final.json.extracted;
    record.usage = final.json.usage;
  } else {
    record.status = "extraction_failed";
  }
  fs.appendFileSync(RESULTS, JSON.stringify(record) + "\n");
  log(`${id} ${record.status} (G ${attempts.length} att)`);
}
log(`Arm ${ARM} G-runner finished.`);
