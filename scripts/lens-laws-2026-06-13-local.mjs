#!/usr/bin/env node
// Local-arm runner for LENS_LAWS_2026-06-13. put = regenerate --draws 3
// (independent drafts via cache-bypass), get = ingest 3b. cwd = scratch ws.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = "/Users/juancarlosromero/Development/ontology";
const SCRATCH = path.join(REPO, ".ontology.scratch-lens-laws-2026-06-13");
const WS = SCRATCH; // ws root has .ontology + symlinked src/tests
const CLI = path.join(REPO, "dist/cli.js");
const editset = JSON.parse(fs.readFileSync(path.join(SCRATCH, "editset.json"), "utf8"));
const PUT = ["--provider", "ollama", "--model", "qwen2.5-coder:7b"];
const GET = ["--provider", "ollama", "--model", "qwen2.5-coder:3b"];

const cli = (args, timeout = 20 * 60 * 1000) => {
  const r = spawnSync("node", [CLI, ...args], { cwd: WS, timeout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { ok: r.status === 0, json, stdout: r.stdout, stderr: (r.stderr || "").slice(-500) };
};
const nodePath = (id) => path.join(WS, ".ontology/nodes", id + ".json");
const readNode = (id) => JSON.parse(fs.readFileSync(nodePath(id), "utf8"));
const writeNode = (id, n) => fs.writeFileSync(nodePath(id), JSON.stringify(n, null, 2));
const tokens = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9_]+/g) || []);
const tjac = (a, b) => { const ta = tokens(a), tb = tokens(b); const inter = [...ta].filter((x) => tb.has(x)).length; return inter / new Set([...ta, ...tb]).size || 0; };

// regenerate --draws 3 (preview) leaves drafts at .ontology/verify/<id>.d{1,2,3}<ext>
function putDraws(id, ext) {
  cli(["regenerate", id, ...PUT, "--draws", "3", "--json"]);
  const drafts = [];
  for (let i = 1; i <= 3; i++) {
    const p = path.join(WS, ".ontology/verify", `${id}.d${i}${ext}`);
    if (fs.existsSync(p)) drafts.push(fs.readFileSync(p, "utf8"));
  }
  return drafts;
}
function getIngest(absFile) {
  const rel = path.relative(WS, absFile);
  const r = cli(["ingest", rel, ...GET, "--dry-run", "--json"]);
  return r.json?.extracted ?? null;
}

const results = [];
for (const e of editset) {
  const id = e.id, ext = path.extname(e.srcRel) || ".ts";
  const orig = readNode(id);
  const rec = { id, srcRel: e.srcRel };

  // ── E1: contract edit (PutGet primary) ──
  {
    const n = JSON.parse(JSON.stringify(orig));
    n.prompt.raw = (n.prompt.raw || "") + e.e1.promptClause;
    n.context.provides = [...(n.context.provides || []), { key: e.e1.marker, nodeType: "declared" }];
    writeNode(id, n);
    const drafts = putDraws(id, ext);
    const putHits = drafts.filter((d) => d.includes(e.e1.marker)).length;
    const putSurvived = putHits >= 2; // consensus majority of 3
    // ingest a marker-carrying draft (else draft 1)
    let getProvides = [];
    const carrier = drafts.find((d) => d.includes(e.e1.marker)) ?? drafts[0];
    if (carrier) {
      fs.writeFileSync(path.join(WS, ".ontology/verify", `${id}.e1pick${ext}`), carrier);
      const intentP = getIngest(path.join(WS, ".ontology/verify", `${id}.e1pick${ext}`));
      getProvides = (intentP?.provides || []).map((p) => (typeof p === "string" ? p : p.key));
    }
    const getSurvived = getProvides.includes(e.e1.marker);
    rec.e1 = { putHits, putSurvived, getSurvived, survived: putSurvived && getSurvived };
    writeNode(id, orig);
  }

  // ── E2: rule edit (PutGet secondary) ──
  {
    const n = JSON.parse(JSON.stringify(orig));
    n.rules = [...(n.rules || []), e.e2.rule];
    writeNode(id, n);
    const drafts = putDraws(id, ext);
    const carrier = drafts[0];
    let getRules = [];
    if (carrier) {
      fs.writeFileSync(path.join(WS, ".ontology/verify", `${id}.e2pick${ext}`), carrier);
      const intentP = getIngest(path.join(WS, ".ontology/verify", `${id}.e2pick${ext}`));
      getRules = intentP?.rules || [];
    }
    const survived = getRules.some((r) => tjac(r, e.e2.rule) >= 0.5);
    rec.e2 = { recoveredRules: getRules.length, survived };
    writeNode(id, orig);
  }

  // ── E3: code edit (GetPut, other direction) ──
  {
    const srcAbs = path.join(REPO, e.srcRel);
    const edited = fs.readFileSync(srcAbs, "utf8") + e.e3.codeAppend;
    const tmp = path.join(WS, ".ontology/verify", `${id}.e3src${ext}`);
    fs.writeFileSync(tmp, edited);
    const intentP = getIngest(tmp);
    const getProvides = (intentP?.provides || []).map((p) => (typeof p === "string" ? p : p.key));
    const getSurvived = getProvides.includes(e.e3.marker);
    // put: inject intent' as the node ficha, regenerate -> code"
    let putSurvived = false;
    if (intentP) {
      const n = JSON.parse(JSON.stringify(orig));
      n.prompt.raw = intentP.prompt || n.prompt.raw;
      n.context.provides = getProvides.map((k) => ({ key: k, nodeType: "declared" }));
      writeNode(id, n);
      const drafts = putDraws(id, ext);
      putSurvived = drafts.filter((d) => d.includes(e.e3.marker)).length >= 2;
      writeNode(id, orig);
    }
    rec.e3 = { getSurvived, putSurvived, survived: getSurvived && putSurvived };
  }

  results.push(rec);
  console.log(JSON.stringify(rec));
  fs.writeFileSync(path.join(SCRATCH, "results-local.json"), JSON.stringify(results, null, 2));
}

// summary
const sum = (k, f) => results.filter((r) => f(r[k])).length;
console.log("\n=== LOCAL ARM SURVIVAL (of 6) ===");
console.log("E1 contract:", sum("e1", (x) => x?.survived), "(put", sum("e1", (x) => x?.putSurvived), "/ get", sum("e1", (x) => x?.getSurvived) + ")");
console.log("E2 rule:    ", sum("e2", (x) => x?.survived));
console.log("E3 code:    ", sum("e3", (x) => x?.survived), "(get", sum("e3", (x) => x?.getSurvived), "/ put", sum("e3", (x) => x?.putSurvived) + ")");
