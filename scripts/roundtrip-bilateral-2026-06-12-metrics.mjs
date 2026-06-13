#!/usr/bin/env node
// Deterministic metrics computer for ROUNDTRIP_BILATERAL_2026-06-12 Fase 2.
// Reads results-arm<X>.jsonl + original fichas + regen artifacts, computes
// M1 (contract Jaccard), M2 (embedding cosine + null distribution),
// M3 (rule survival), echo (contract text in regen comments).
// All metric definitions are fixed by the pre-registration; do not tune here.
//
// Usage: node scripts/roundtrip-bilateral-2026-06-12-metrics.mjs <ARM>

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REPO = "/Users/juancarlosromero/Development/ontology";
const SCRATCH = path.join(REPO, ".ontology.scratch-roundtrip-2026-06-12");
const ARM = process.argv[2] || "A";
// Arm A regens live in ws/; frontier arms B/C in ws-frontier/. Nodes are an
// identical graph copy in both, so original fichas read the same either way.
const WS = path.join(SCRATCH, ARM === "A" ? "ws" : "ws-frontier");
const RESULTS = path.join(SCRATCH, `results-arm${ARM}.jsonl`);
const OUT = path.join(SCRATCH, `metrics-arm${ARM}.json`);
const EMBED_CACHE_FILE = path.join(SCRATCH, "embed-cache.json");
const OLLAMA = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const EMBED_MAX_CHARS = 4000; // matches EMBED_MAX_CHARS convention from the live-graph run

const sample = JSON.parse(fs.readFileSync(path.join(SCRATCH, "sample.json"), "utf8"));
const stratumOf = {};
for (const [key, s] of Object.entries(sample.strata)) for (const p of s.picked) stratumOf[p.id] = key;

const embedCache = fs.existsSync(EMBED_CACHE_FILE) ? JSON.parse(fs.readFileSync(EMBED_CACHE_FILE, "utf8")) : {};

async function embed(text) {
  const t = text.slice(0, EMBED_MAX_CHARS);
  const key = crypto.createHash("sha256").update(t).digest("hex");
  if (embedCache[key]) return embedCache[key];
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: t }),
  });
  if (!res.ok) throw new Error(`embed failed: ${res.status}`);
  const j = await res.json();
  embedCache[key] = j.embedding;
  return j.embedding;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Node contract entries are heterogeneous: provides use {key}, requires use
// {source} (discovered 2026-06-12 via the cold-reader dump bug). Extracted
// fichas use plain strings.
const keyOf = (x) => (typeof x === "string" ? x : x?.key ?? x?.source ?? String(x)).trim();
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return null; // both empty: undefined, excluded
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? null : inter / union;
}

const tokens = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9_]+/g) || []);
function tokenJaccard(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  const inter = [...ta].filter((x) => tb.has(x)).length;
  return inter / new Set([...ta, ...tb]).size;
}

function extractComments(code) {
  const out = [];
  const re = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  let m;
  while ((m = re.exec(code))) out.push(m[0]);
  return out.join("\n");
}

function ruleEchoed(rule, comments) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
  const r = norm(rule), c = norm(comments);
  if (r.length < 12) return c.includes(r) && r.length > 0;
  for (let i = 0; i + 12 <= r.length; i += 4) if (c.includes(r.slice(i, i + 12))) return true;
  return false;
}

const lines = fs.readFileSync(RESULTS, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
// keep last record per id (re-runs append)
const byId = new Map();
for (const r of lines) byId.set(r.id, r);
const records = [...byId.values()].filter((r) => sample.ids.includes(r.id));

const perNode = [];
const embOrig = {}, embExtr = {};

for (const r of records) {
  const node = JSON.parse(fs.readFileSync(path.join(WS, ".ontology/nodes", `${r.id}.json`), "utf8"));
  const row = { id: r.id, stratum: stratumOf[r.id], status: r.status, fAttempts: r.f?.attempts?.length ?? 0, gAttempts: r.g?.attempts?.length ?? 0 };
  if (r.status !== "ok") { perNode.push(row); continue; }

  const ex = r.extracted;
  const oP = new Set((node.context?.provides || []).map(keyOf));
  const oR = new Set((node.context?.requires || []).map(keyOf));
  const oF = new Set((node.context?.forbids || []).map(keyOf));
  const eP = new Set((ex.provides || []).map(keyOf));
  const eR = new Set((ex.requires || []).map(keyOf));
  const eF = new Set((ex.forbids || []).map(keyOf));
  const tag = (s, t) => new Set([...s].map((x) => `${t}:${x}`));
  const lower = (s) => new Set([...s].map((x) => x.toLowerCase()));

  row.m1 = {
    provides: jaccard(oP, eP),
    requires: jaccard(oR, eR),
    forbids: jaccard(oF, eF),
    combined: jaccard(
      new Set([...tag(oP, "p"), ...tag(oR, "r"), ...tag(oF, "f")]),
      new Set([...tag(eP, "p"), ...tag(eR, "r"), ...tag(eF, "f")])
    ),
    combinedCI: jaccard(
      new Set([...tag(lower(oP), "p"), ...tag(lower(oR), "r"), ...tag(lower(oF), "f")]),
      new Set([...tag(lower(eP), "p"), ...tag(lower(eR), "r"), ...tag(lower(eF), "f")])
    ),
  };

  const oRules = node.rules || [];
  if (oRules.length === 0) row.m3 = "no_rules";
  else {
    const eRules = ex.rules || [];
    const survived = oRules.filter((or) => eRules.some((er) => tokenJaccard(typeof or === "string" ? or : JSON.stringify(or), typeof er === "string" ? er : JSON.stringify(er)) >= 0.5));
    row.m3 = survived.length / oRules.length;
  }

  const regenPath = path.join(WS, `regen/${ARM}/${r.id}.${path.extname(r.srcFile).slice(1) || "ts"}`);
  if (fs.existsSync(regenPath)) {
    const comments = extractComments(fs.readFileSync(regenPath, "utf8"));
    const contractKeys = [...oP, ...oR, ...oF];
    const echoedKeys = contractKeys.filter((k) => comments.includes(k));
    const echoedRules = oRules.filter((rl) => ruleEchoed(typeof rl === "string" ? rl : JSON.stringify(rl), comments));
    const total = contractKeys.length + oRules.length;
    row.echo = total === 0 ? null : (echoedKeys.length + echoedRules.length) / total;
  }

  embOrig[r.id] = node.prompt?.raw || "";
  embExtr[r.id] = ex.prompt || "";
  perNode.push(row);
}

// M2 + null distribution
const okIds = perNode.filter((r) => r.status === "ok").map((r) => r.id);
const vecsO = {}, vecsE = {};
for (const id of okIds) { vecsO[id] = await embed(embOrig[id]); vecsE[id] = await embed(embExtr[id]); }
fs.writeFileSync(EMBED_CACHE_FILE, JSON.stringify(embedCache));

const nullCos = [];
for (const i of okIds) for (const j of okIds) if (i !== j) nullCos.push(cosine(vecsO[i], vecsE[j]));
nullCos.sort((a, b) => a - b);
const p95 = nullCos.length ? nullCos[Math.floor(nullCos.length * 0.95)] : null;

for (const row of perNode) {
  if (row.status !== "ok") continue;
  row.m2 = cosine(vecsO[row.id], vecsE[row.id]);
  row.m2BeatsNull = p95 === null ? null : row.m2 > p95;
}

// aggregates
const median = (xs) => { const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const agg = (rows) => ({
  n: rows.length,
  ok: rows.filter((r) => r.status === "ok").length,
  compileFailed: rows.filter((r) => r.status === "compile_failed").length,
  extractionFailed: rows.filter((r) => r.status === "extraction_failed").length,
  medianM1: median(rows.map((r) => r.m1?.combined)),
  medianM1Provides: median(rows.map((r) => r.m1?.provides)),
  medianM2: median(rows.map((r) => r.m2)),
  m2BeatsNullRate: (() => { const v = rows.filter((r) => r.m2BeatsNull !== undefined && r.m2BeatsNull !== null); return v.length ? v.filter((r) => r.m2BeatsNull).length / v.length : null; })(),
  medianM3: median(rows.map((r) => r.m3)),
  meanEcho: (() => { const v = rows.map((r) => r.echo).filter((x) => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })(),
  totalRetries: rows.reduce((a, r) => a + Math.max(0, (r.fAttempts || 0) - 1) + Math.max(0, (r.gAttempts || 0) - 1), 0),
});

const main = perNode.filter((r) => r.stratum !== "S7_escalados");
const s7 = perNode.filter((r) => r.stratum === "S7_escalados");
const byStratum = {};
for (const r of perNode) (byStratum[r.stratum] ||= []).push(r);

const out = {
  arm: ARM,
  nullP95: p95,
  nullSize: nullCos.length,
  aggregates: { main_S1_S6: agg(main), S7_escalados: agg(s7), all: agg(perNode) },
  perStratum: Object.fromEntries(Object.entries(byStratum).map(([k, v]) => [k, agg(v)])),
  perNode,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ arm: ARM, nullP95: p95, main: out.aggregates.main_S1_S6, S7: out.aggregates.S7_escalados }, null, 2));
