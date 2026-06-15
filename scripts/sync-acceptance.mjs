#!/usr/bin/env node
// Step 5 acceptance harness for the governed sync loop (docs/SYNC_LOOP_SPEC.md §6).
//
// Measures the HONEST NUMBER (AC5): on an UNCHANGED intent, what fraction of a
// hand-picked set of core nodes would `onto sync` write clean — i.e. the
// round-trip floor F∘G, run through the unified loop with ALL gates on.
//
// SAFE BY CONSTRUCTION: every node is run with `sync --dry-run`, so nothing is
// ever written to source and no drift is re-anchored. "Would write clean" is
// derived from the dry-run JSON: for the default 3-draw consensus, a node would
// write iff its largest acceptable (structure-preserving + behaviour-passing +
// rules-clean) agreeing cluster reaches the consensus floor.
//
// Usage:
//   node scripts/sync-acceptance.mjs [--provider ollama] [--model qwen2.5-coder:7b]
//                                    [--node node_0011 --node node_0225 ...]
//                                    [--out outputs/sync-acceptance.json]
// Defaults: provider ollama, model qwen2.5-coder:7b, a curated 6-node core set.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "dist", "cli.js");

// ── args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function opt(flag, def) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
function multi(flag) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1]);
  return out;
}
const provider = opt("--provider", "ollama");
const model = opt("--model", "qwen2.5-coder:7b");
const draws = opt("--draws", null); // passthrough; null → CLI default (3)
const outPath = opt("--out", "outputs/sync-acceptance.json");
const nodes = multi("--node");
// Curated core handful spanning shadow sizes (3 → 292 LoC), incl. the
// fixture-rich node_0225. Override with one or more --node flags.
const DEFAULT_NODES = ["node_0011", "node_0017", "node_0022", "node_0026", "node_0029", "node_0225"];
const targets = nodes.length > 0 ? nodes : DEFAULT_NODES;

console.error(`◆ sync acceptance — provider=${provider} model=${model} nodes=${targets.length}`);
console.error(`  (dry-run only — nothing is written)\n`);

// ── run ──────────────────────────────────────────────────────────────────
function runSync(nodeId) {
  const args = ["sync", nodeId, "--dry-run", "--json", "--provider", provider];
  if (model) args.push("--model", model);
  if (draws) args.push("--draws", draws);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
    timeout: 15 * 60 * 1000, // 15 min hard ceiling per node
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = Math.round((Date.now() - t0) / 1000);
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    /* leave null */
  }
  return { seconds, status: r.status, parsed, stderr: (r.stderr || "").slice(-400) };
}

// Derive the clean-write decision from a dry-run result.
function classify(res) {
  if (!res.parsed) return { outcome: "harness_error", detail: res.stderr || "no JSON" };
  const sync = res.parsed;
  const regen = sync.regen ?? {};
  if (sync.decision === "error" || regen.ok === false) {
    return { outcome: "compile_error", detail: sync.reason ?? regen.failure ?? "regen failed" };
  }
  // Multi-draw (default 3): would write iff consensus floor reached.
  if (regen.draws && regen.draws > 1) {
    const wouldWrite = (regen.consensusSize ?? 0) >= (regen.consensusK ?? Infinity);
    return {
      outcome: wouldWrite ? "clean" : "no_consensus",
      verdict: regen.verdict,
      behaviour: regen.behaviorVerdict,
      consensus: `${regen.consensusSize}/${regen.draws} (need ${regen.consensusK}); acceptable ${regen.acceptableDraws}`,
      detail: wouldWrite ? "" : "no acceptable agreeing cluster reached the floor",
    };
  }
  // Single draw fallback.
  const safe = regen.verdict === "epsilon_equivalent" || regen.verdict === "divergent_loc";
  const behOk = regen.behaviorVerdict !== "fail";
  const rulesOk = (regen.ruleViolations ?? 0) === 0;
  const wouldWrite = safe && behOk && rulesOk;
  return {
    outcome: wouldWrite ? "clean" : "blocked",
    verdict: regen.verdict,
    behaviour: regen.behaviorVerdict,
    detail: wouldWrite ? "" : `verdict=${regen.verdict} behaviour=${regen.behaviorVerdict} ruleViol=${regen.ruleViolations}`,
  };
}

const results = [];
for (const nodeId of targets) {
  console.error(`→ ${nodeId} …`);
  const res = runSync(nodeId);
  const cls = classify(res);
  results.push({ nodeId, seconds: res.seconds, ...cls });
  console.error(`  ${cls.outcome.toUpperCase()}  (${res.seconds}s)  ${cls.verdict ?? ""} ${cls.consensus ?? ""} ${cls.detail ? "— " + cls.detail : ""}`);
}

// ── tally ──────────────────────────────────────────────────────────────────
const clean = results.filter((r) => r.outcome === "clean").length;
const total = results.length;
const fraction = total > 0 ? clean / total : 0;

const summary = {
  generatedFor: "SYNC_LOOP_SPEC.md AC5 — round-trip floor through the sync loop",
  provider,
  model,
  draws: draws ? Number(draws) : "default(3)",
  mode: "dry-run (no writes)",
  total,
  clean,
  fractionClean: Number(fraction.toFixed(3)),
  byOutcome: results.reduce((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {}),
  results,
};

fs.mkdirSync(path.join(repoRoot, path.dirname(outPath)), { recursive: true });
fs.writeFileSync(path.join(repoRoot, outPath), JSON.stringify(summary, null, 2));

console.error(`\n=== HONEST NUMBER (AC5) ===`);
console.error(`  ${clean}/${total} core nodes would sync clean on unchanged intent  →  ${(fraction * 100).toFixed(1)}%`);
console.error(`  provider=${provider} model=${model}`);
console.error(`  full report: ${outPath}`);
