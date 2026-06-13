#!/usr/bin/env node
// Build the cold-reader input: the intent layer ONLY (id, label, prompt,
// contract keys), grouped by source directory. No code, no docs, no README.
// Read-only over the live graph.
// Output: .ontology.scratch-roundtrip-2026-06-12/intent-layer.md

import fs from "node:fs";
import path from "node:path";

const REPO = "/Users/juancarlosromero/Development/ontology";
const OUT = path.join(REPO, ".ontology.scratch-roundtrip-2026-06-12/intent-layer.md");
const NODES = path.join(REPO, ".ontology/nodes");

const nodes = fs.readdirSync(NODES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(NODES, f), "utf8")));

const groups = new Map();
for (const n of nodes) {
  const file = n.outputs?.files?.[0];
  const dir = file ? path.dirname(file) : "(intent-level, no source file)";
  if (!groups.has(dir)) groups.set(dir, []);
  groups.get(dir).push(n);
}

let md = `# Intent layer dump (anonymous system)\n\nEach entry: node id | label | declared intent (prompt) | contract keys.\n\n`;
for (const dir of [...groups.keys()].sort()) {
  md += `\n## ${dir}\n\n`;
  for (const n of groups.get(dir).sort((a, b) => a.id.localeCompare(b.id))) {
    const provides = (n.context?.provides || []).map((p) => (typeof p === "string" ? p : p.key)).join(", ");
    const requires = (n.context?.requires || []).map((p) => (typeof p === "string" ? p : p.key)).join(", ");
    md += `### ${n.id} — ${n.label}\n`;
    if (provides) md += `provides: ${provides}\n`;
    if (requires) md += `requires: ${requires}\n`;
    md += `intent: ${(n.prompt?.raw || "").replace(/\s+/g, " ").trim()}\n\n`;
  }
}
fs.writeFileSync(OUT, md);
console.log(`${nodes.length} nodes, ${groups.size} groups -> ${OUT} (${(md.length / 1024).toFixed(0)} KB)`);
