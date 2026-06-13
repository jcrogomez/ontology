#!/usr/bin/env node
// Wire shim (Ollama /api/chat) for ROUNDTRIP_BILATERAL_2026-06-12.
//
// Why it exists: on the live graph (580 depends_on edges) every compile plan
// walks a ~216-node transitive closure, but upstream artifacts are NOT
// threaded into focal prompts (only `refines` parents are, and the graph has
// none — see compile-plan-runner.ts). The shim therefore answers upstream
// steps with instant contract-satisfying stubs and routes only the 48 focal
// dispatches to the real model/capture/replay path. The CLI pipeline runs
// unmodified; prompts are bit-identical either way.
//
// Modes:
//   proxy   <dir> <port> <nodesDir> <samplePath> <realHost>  — focal -> real Ollama, upstream -> stub
//   capture <dir> <port> <nodesDir> <samplePath>             — focal -> log + 500, upstream -> stub
//   replay  <dir> <port> <nodesDir> <samplePath>             — focal -> canned responses/<key>.txt|.json, upstream -> stub
//
// All modes append every focal-request key to <dir>/captured.jsonl (replay
// logs misses loudly). Stub content exports the target's declared provides
// keys so the compile-time intent gate passes.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [mode, dir, portArg, nodesDir, samplePath, realHost] = process.argv.slice(2);
if (!["proxy", "capture", "replay"].includes(mode) || !dir || !nodesDir || !samplePath) {
  console.error("usage: fakeollama.mjs <proxy|capture|replay> <dir> <port> <nodesDir> <samplePath> [realHost]");
  process.exit(1);
}
const PORT = Number(portArg || 11500);
const REAL = realHost || "http://127.0.0.1:11434";
fs.mkdirSync(path.join(dir, "responses"), { recursive: true });
const capturedPath = path.join(dir, "captured.jsonl");
const sampleIds = new Set(JSON.parse(fs.readFileSync(samplePath, "utf8")).ids);

const keyOf = (messages) => crypto.createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 24);
const targetOf = (messages) =>
  (messages.find((m) => m.role === "system")?.content || "").match(/Target: (node_\w+)/)?.[1] ?? null;

function stubFor(target) {
  let keys = [];
  try {
    const n = JSON.parse(fs.readFileSync(path.join(nodesDir, `${target}.json`), "utf8"));
    keys = (n.context?.provides || []).map((p) => (typeof p === "string" ? p : p.key)).filter(Boolean);
  } catch { /* unknown node: bare stub */ }
  const lines = keys.map((k) => `export const ${k} = undefined as any;`);
  if (lines.length === 0) lines.push("export const __shim_stub = 1;");
  return `// shim stub artifact (upstream dependency, not measured)\n${lines.join("\n")}\n`;
}

const ollamaChatResponse = (model, content) =>
  JSON.stringify({
    model,
    created_at: "1970-01-01T00:00:00Z",
    message: { role: "assistant", content },
    done: true,
    prompt_eval_count: 0,
    eval_count: 0,
  });

function proxyToReal(body, res) {
  const url = new URL("/api/chat", REAL);
  const req = http.request(
    { hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { "content-type": "application/json" } },
    (up) => {
      res.writeHead(up.statusCode || 500, { "content-type": "application/json" });
      up.pipe(res);
    }
  );
  req.on("error", (e) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `proxy: ${e.message}` }));
  });
  req.setTimeout(0);
  req.end(body);
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "GET" && req.url.startsWith("/api/tags")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ models: [{ name: "frontier-shim", model: "frontier-shim" }] }));
    }
    if (req.method === "GET" && req.url.startsWith("/api/version")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ version: "0.0.0-shim" }));
    }
    if (req.method === "POST" && req.url.startsWith("/api/chat")) {
      let parsed;
      try { parsed = JSON.parse(body); } catch { res.writeHead(400); return res.end("bad json"); }
      const target = targetOf(parsed.messages);
      const key = keyOf(parsed.messages);

      // SHIM_ALL=1: every request is focal (ingest prompts carry no
      // "Target:" header — used for the G-direction capture/replay).
      const ALL = process.env.SHIM_ALL === "1";

      // Upstream step: instant contract-satisfying stub, every mode.
      if (!ALL && (!target || !sampleIds.has(target))) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(ollamaChatResponse(parsed.model, stubFor(target)));
      }

      // Focal dispatch.
      if (mode === "proxy") return proxyToReal(body, res);
      if (mode === "capture") {
        // Capture AND answer with a stub: sample members appear as upstreams
        // of other sample members, and a 500 here would abort those plans
        // before their own focal dispatch. A node's compile-back prompt is
        // identical whether it appears as focal or upstream (it depends only
        // on the target node + graph), so capturing on first sight is enough
        // — the run-cache may absorb later occurrences, but the prompt is
        // already on file.
        fs.appendFileSync(capturedPath, JSON.stringify({ key, target, model: parsed.model, format: parsed.format ?? null, messages: parsed.messages }) + "\n");
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(ollamaChatResponse(parsed.model, stubFor(target)));
      }
      // replay
      const txtPath = path.join(dir, "responses", `${key}.txt`);
      const jsonPath = path.join(dir, "responses", `${key}.json`);
      let content;
      if (fs.existsSync(txtPath)) content = fs.readFileSync(txtPath, "utf8");
      else if (fs.existsSync(jsonPath)) content = JSON.parse(fs.readFileSync(jsonPath, "utf8")).content;
      else {
        fs.appendFileSync(capturedPath, JSON.stringify({ key, target, miss: true }) + "\n");
        res.writeHead(500, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: `no canned response for ${key} (target ${target})` }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(ollamaChatResponse(parsed.model, content));
    }
    res.writeHead(404);
    res.end("not found");
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`fakeollama ${mode} on 127.0.0.1:${PORT} dir=${dir} sample=${sampleIds.size}`));
