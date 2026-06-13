#!/usr/bin/env node
// Deterministic stratified sample selector for the ROUNDTRIP_BILATERAL_2026-06-12
// pre-registered experiment. No RNG: within each stratum, eligible nodes are
// sorted by id and picked by centered systematic sampling, so re-running this
// script on the same graph state always yields the same sample.
//
// Pre-registration: docs/legend/calibrations/ROUNDTRIP_BILATERAL_2026-06-12_HYPOTHESIS.md
// Output: .ontology.scratch-roundtrip-2026-06-12/sample.json

import fs from "node:fs";
import path from "node:path";

const NODES_DIR = ".ontology/nodes";
const OUT_DIR = ".ontology.scratch-roundtrip-2026-06-12";

// The 8 governed-escalation nodes (frontier-extracted fichas) form their own
// overlay stratum S7 and are excluded from the main strata universe.
const ESCALATED = [
  "node_0220", "node_0221", "node_0222", "node_0223",
  "node_0224", "node_0225", "node_0226", "node_0227",
];

const STRATA = [
  { key: "S1_nucleo",        quota: 6, match: (f) => f.startsWith("src/core/") || f.startsWith("src/schemas/") || f === "src/cli.ts" },
  { key: "S2_comandos",      quota: 8, match: (f) => f.startsWith("src/commands/") },
  { key: "S3_runtime_F",     quota: 6, match: (f) => /^src\/runtime\/(llm|compile|context|prompt)\//.test(f) },
  { key: "S4_runtime_G_zeta",quota: 6, match: (f) => /^src\/runtime\/(legend|workflow|ingest|semantic)\//.test(f) },
  { key: "S5_runtime_otros", quota: 6, match: (f) => f.startsWith("src/runtime/") },
  { key: "S6_walker",        quota: 8, match: (f) => f.startsWith("src/walker/") },
];

const nodes = fs.readdirSync(NODES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(NODES_DIR, f), "utf8")))
  .filter((n) => n.coordinates?.manifestation === "code" && n.outputs?.files?.[0]);

const assigned = new Set(ESCALATED);
const sample = { generatedAt: null, graphNodeCount: nodes.length, strata: {}, ids: [] };

for (const stratum of STRATA) {
  const eligible = nodes
    .filter((n) => !assigned.has(n.id) && stratum.match(n.outputs.files[0]))
    .sort((a, b) => a.id.localeCompare(b.id));
  // claim eligibility so later (broader) strata don't re-match these files
  const picked = [];
  const N = eligible.length;
  const k = Math.min(stratum.quota, N);
  for (let i = 0; i < k; i++) {
    const idx = Math.floor((i + 0.5) * N / k); // centered systematic
    picked.push(eligible[Math.min(idx, N - 1)]);
  }
  for (const n of eligible) assigned.add(n.id); // exclude whole stratum universe from later strata
  sample.strata[stratum.key] = {
    universe: N,
    picked: picked.map((n) => ({ id: n.id, file: n.outputs.files[0], label: n.label })),
  };
  sample.ids.push(...picked.map((n) => n.id));
}

// S7 overlay: all escalated nodes, analyzed separately.
sample.strata.S7_escalados = {
  universe: ESCALATED.length,
  picked: ESCALATED.map((id) => {
    const n = nodes.find((x) => x.id === id);
    return { id, file: n?.outputs?.files?.[0] ?? "?", label: n?.label ?? "?" };
  }),
};
sample.ids.push(...ESCALATED);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "sample.json"), JSON.stringify(sample, null, 2));

for (const [key, s] of Object.entries(sample.strata)) {
  console.log(`${key}: universe=${s.universe} picked=${s.picked.length}`);
  for (const p of s.picked) console.log(`  ${p.id}  ${p.file}`);
}
console.log(`TOTAL sample: ${sample.ids.length}`);
