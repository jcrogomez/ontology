// Per-node round-trip loss report (Phase ε diagnostic).
//
// Reads a verify-homeomorphism sidecar JSON (the `{ok, report}` or bare
// AggregateReport shape) and prints the symbol-level loss decomposition:
// for the whole run and per node, how much of the structural Jaccard
// gap is RECALL loss (original declarations the regen dropped) vs
// PRECISION loss (declarations the regen over-emitted / invented).
//
// $0 — pure analysis over the declaration arrays the report already
// carries; no LLM, no new run. Usage:
//
//   npx tsx scripts/loss-report.ts <path-to-sidecar.json> [topN]
//
// e.g. npx tsx scripts/loss-report.ts .ontology.self-ingest-epsilon-3a-arm-a.json

import { readFileSync } from "node:fs";
import {
  lossFromResults,
  aggregateLoss,
  type NodeLoss,
} from "../src/runtime/legend/loss-breakdown.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: tsx scripts/loss-report.ts <sidecar.json> [topN]");
  process.exit(2);
}
const topN = Number(process.argv[3] ?? 8);

const raw = JSON.parse(readFileSync(path, "utf8")) as {
  report?: { results?: unknown[] };
  results?: unknown[];
};
const report = raw.report ?? raw;
const results = (report.results ?? []) as Parameters<typeof lossFromResults>[0];
if (results.length === 0) {
  console.error(`no results[] in ${path}`);
  process.exit(1);
}

const losses = lossFromResults(results);
const agg = aggregateLoss(losses, topN);
const pct = (x: number) => (x * 100).toFixed(1) + "%";
const names = (l: NodeLoss, dir: "dropped" | "overEmitted") =>
  l[dir].slice(0, 5).join(", ") + (l[dir].length > 5 ? ", …" : "");

console.log(`# Round-trip loss — ${path}\n`);
console.log(
  `nodes ${agg.nodeCount} | perfect(J=1) ${agg.perfectCount} (${pct(
    agg.perfectCount / agg.nodeCount,
  )})`,
);
console.log(
  `mean Jaccard ${agg.meanJaccard.toFixed(3)} | recall ${agg.meanRecall.toFixed(
    3,
  )} | precision ${agg.meanPrecision.toFixed(3)} | dominant: ${agg.dominantFailure}`,
);
console.log(
  `Σ original ${agg.totalOriginal} | Σ regen ${agg.totalRegen} | Σ dropped ${agg.totalDropped} | Σ over-emitted ${agg.totalOverEmitted}\n`,
);
console.log(`## Worst droppers (recall loss)`);
for (const l of agg.worstDroppers) {
  console.log(
    `  ${l.nodeId}  dropped ${l.dropped.length}/${l.originalCount} (recall ${pct(
      l.recall,
    )})  ${names(l, "dropped")}`,
  );
}
console.log(`\n## Worst over-emitters (precision loss)`);
for (const l of agg.worstOverEmitters) {
  console.log(
    `  ${l.nodeId}  over-emitted ${l.overEmitted.length} (precision ${pct(
      l.precision,
    )})  ${names(l, "overEmitted")}`,
  );
}
