#!/usr/bin/env node
// Read-only simplification candidates (compression-pressure groundwork) for
// ROUNDTRIP_BILATERAL_2026-06-12 §9. Measures, never mutates: merge candidates
// (embedding near-duplicates + provides-key overlaps), split candidates (ficha
// length distribution), co-change (honest no-data note on a 1-day-old graph).
// Output: .ontology.scratch-roundtrip-2026-06-12/simplification-candidates.json

import fs from "node:fs";
import path from "node:path";

const REPO = "/Users/juancarlosromero/Development/ontology";
const OUT = path.join(REPO, ".ontology.scratch-roundtrip-2026-06-12/simplification-candidates.json");

const nodes = Object.fromEntries(
  fs.readdirSync(path.join(REPO, ".ontology/nodes"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const n = JSON.parse(fs.readFileSync(path.join(REPO, ".ontology/nodes", f), "utf8"));
      return [n.id, n];
    })
);

// 1. Embedding near-duplicates (existing live index; no new compute)
const index = JSON.parse(fs.readFileSync(path.join(REPO, ".ontology/embeddings/index.json"), "utf8"));
const entries = index.entries.filter((e) => nodes[e.nodeId]);
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};
const pairs = [];
for (let i = 0; i < entries.length; i++)
  for (let j = i + 1; j < entries.length; j++)
    pairs.push({ a: entries[i].nodeId, b: entries[j].nodeId, cos: cosine(entries[i].vector, entries[j].vector) });
pairs.sort((x, y) => y.cos - x.cos);
const describe = (id) => ({ id, label: nodes[id]?.label, file: nodes[id]?.outputs?.files?.[0] });
const nearDuplicates = pairs.filter((p) => p.cos > 0.95).map((p) => ({ cos: +p.cos.toFixed(4), a: describe(p.a), b: describe(p.b) }));
const top20 = pairs.slice(0, 20).map((p) => ({ cos: +p.cos.toFixed(4), a: describe(p.a), b: describe(p.b) }));

// 2. provides-key overlaps (SSoT pressure)
const byKey = new Map();
for (const n of Object.values(nodes))
  for (const p of n.context?.provides || []) {
    const k = typeof p === "string" ? p : p.key;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(n.id);
  }
const providesOverlaps = [...byKey.entries()].filter(([, ids]) => ids.length > 1)
  .map(([key, ids]) => ({ key, nodes: ids })).sort((a, b) => b.nodes.length - a.nodes.length);

// 3. ficha length distribution (split-candidate generator)
const lengths = Object.values(nodes)
  .filter((n) => n.coordinates?.manifestation === "code")
  .map((n) => ({ id: n.id, file: n.outputs?.files?.[0], chars: (n.prompt?.raw || "").length }))
  .sort((a, b) => b.chars - a.chars);
const q = (p) => lengths[Math.floor(lengths.length * p)]?.chars;
const lengthStats = { n: lengths.length, p50: q(0.5), p90: q(0.1), p10: q(0.9), max: lengths[0]?.chars, top10Longest: lengths.slice(0, 10) };

// 4. co-change: honest no-data on a 1-day-old batch-populated graph
const coChange = { note: "Graph populated in batches on 2026-06-11; update history is too young for co-change signal. Recorded as no-data, re-measure after weeks of walker edits." };

const out = { nearDuplicates, top20ClosestPairs: top20, providesOverlaps: providesOverlaps.slice(0, 40), providesOverlapCount: providesOverlaps.length, lengthStats, coChange };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ nearDuplicates: nearDuplicates.length, providesOverlaps: providesOverlaps.length, longest: lengths[0] }, null, 2));
