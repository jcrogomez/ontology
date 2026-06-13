#!/usr/bin/env node
// Fase 2 local-arm runner for ROUNDTRIP_BILATERAL_2026-06-12.
// Per node: F (compile run, qwen2.5-coder:7b) -> regen/<arm>/<id>.<ext>
//           G (ingest --dry-run, qwen2.5-coder:3b) -> ficha' appended to results JSONL.
// Resume-safe: nodes already present in the results file are skipped, so the
// run survives interruption (repo-scratch lesson, 2026-06-10).
// Retry accounting is pre-registered: up to 3 attempts per direction; failures
// stay in the denominator.
//
// Usage: node scripts/roundtrip-bilateral-2026-06-12-arm-local.mjs [--only id1,id2] [--skip-f]
//   --only: restrict to listed node ids (smoke testing)
//   --skip-f: reuse existing regen artifacts, run only G (echo sub-arm reuse)

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = "/Users/juancarlosromero/Development/ontology";
const SCRATCH = path.join(REPO, ".ontology.scratch-roundtrip-2026-06-12");
const WS = path.join(SCRATCH, "ws");
const CLI = path.join(REPO, "dist/cli.js");
const ARM = "A";
const F_MODEL = ["--provider", "ollama", "--model", "qwen2.5-coder:7b"];
const G_MODEL = ["--provider", "ollama", "--model", "qwen2.5-coder:3b"];
const RESULTS = path.join(SCRATCH, `results-arm${ARM}.jsonl`);
const LOG = path.join(SCRATCH, `runner-arm${ARM}.log`);
const MAX_ATTEMPTS = 3;
const F_TIMEOUT_MS = 30 * 60 * 1000;
const G_TIMEOUT_MS = 15 * 60 * 1000;

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;
const skipF = args.includes("--skip-f");

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

function runCli(cliArgs, timeoutMs) {
  const t0 = Date.now();
  const res = spawnSync("node", [CLI, ...cliArgs], {
    cwd: WS,
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - t0;
  let json = null;
  try { json = JSON.parse(res.stdout); } catch { /* non-JSON output = failure */ }
  const ok = res.status === 0 && json && json.ok !== false;
  return { ok, json, ms, stderr: (res.stderr || "").slice(-2000), timedOut: res.error?.code === "ETIMEDOUT" };
}

function withRetries(label, fn) {
  const attempts = [];
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const r = fn();
    attempts.push({ attempt: i, ok: r.ok, ms: r.ms, timedOut: !!r.timedOut });
    if (r.ok) return { ok: true, result: r, attempts };
    log(`  ${label} attempt ${i}/${MAX_ATTEMPTS} failed (${r.timedOut ? "timeout" : "error"}) stderr: ${r.stderr.slice(-300).replace(/\n/g, " | ")}`);
  }
  return { ok: false, result: null, attempts };
}

const ids = sample.ids.filter((id) => (!only || only.has(id)) && !done.has(id));
log(`Arm ${ARM} runner start: ${ids.length} nodes pending (${done.size} already done)${only ? " [--only]" : ""}${skipF ? " [--skip-f]" : ""}`);

for (const id of ids) {
  const node = JSON.parse(fs.readFileSync(path.join(WS, ".ontology/nodes", `${id}.json`), "utf8"));
  const srcFile = node.outputs.files[0];
  const ext = path.extname(srcFile).slice(1) || "ts";
  const regenRel = `regen/${ARM}/${id}.${ext}`;
  const record = { id, arm: ARM, srcFile };

  if (!skipF) {
    log(`${id} F (compile 7b) -> ${regenRel}`);
    const f = withRetries(`${id} F`, () =>
      runCli(["compile", "run", id, ...F_MODEL, "--open-world", "--target", regenRel, "--force", "--json"], F_TIMEOUT_MS)
    );
    record.f = { ok: f.ok, attempts: f.attempts, bytes: f.ok ? f.result.json.focalArtifact?.bytes : null, cached: f.ok ? f.result.json.steps?.[0]?.cached : null };
    if (!f.ok) {
      record.status = "compile_failed";
      fs.appendFileSync(RESULTS, JSON.stringify(record) + "\n");
      log(`${id} COMPILE_FAILED after ${MAX_ATTEMPTS} attempts`);
      continue;
    }
  } else {
    record.f = { ok: fs.existsSync(path.join(WS, regenRel)), attempts: [], reused: true };
    if (!record.f.ok) {
      record.status = "regen_missing";
      fs.appendFileSync(RESULTS, JSON.stringify(record) + "\n");
      continue;
    }
  }

  log(`${id} G (ingest 3b dry-run)`);
  const g = withRetries(`${id} G`, () =>
    runCli(["ingest", regenRel, ...G_MODEL, "--dry-run", "--json"], G_TIMEOUT_MS)
  );
  record.g = { ok: g.ok, attempts: g.attempts };
  if (g.ok) {
    record.status = "ok";
    record.extracted = g.result.json.extracted;
    record.usage = g.result.json.usage;
  } else {
    record.status = "extraction_failed";
  }
  fs.appendFileSync(RESULTS, JSON.stringify(record) + "\n");
  log(`${id} ${record.status} (F ${record.f.attempts.length || 0} att, G ${g.attempts.length} att)`);
}

log(`Arm ${ARM} runner finished.`);
