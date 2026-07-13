// P1 collapse-variance analysis (pre-registered:
// docs/legend/calibrations/P1_COLLAPSE_VARIANCE_2026-07-08_HYPOTHESIS.md).
//
// Reads a `verify-homeomorphism --reps 7 --json` report and computes the
// pre-registered HV1–HV3 verdicts from the PER-DRAW telemetry
// (`result.reps.perRepMetrics` / `perRepVerdicts`, produced by
// reps-aggregator.ts). No LLM, no new run — pure analysis over the draws
// the verify command already generated.
//
//   npx tsx scripts/p1-variance-report.ts .ontology.p1-variance.json
//
// Emits a per-node table + the three verdicts. Paste the numbers into
// P1_COLLAPSE_VARIANCE_2026-07-08_RESULT.md.

import { readFileSync } from "node:fs";

// Frozen sample (hypothesis §2, amended 2026-07-08 pre-run).
const POSITIVES = [
  "node_0005", "node_0009", "node_0013", "node_0018", "node_0019", "node_0021",
  "node_0041", "node_0042", "node_0048", "node_0052", "node_0060", "node_0061",
  "node_0067", "node_0070", "node_0071", "node_0072", "node_0073", "node_0083",
  "node_0088", "node_0096", "node_0099", "node_0100",
];
const CONTROLS = [
  "node_0017", "node_0022", "node_0015", "node_0023", "node_0030", "node_0031",
  "node_0084", "node_0085", "node_0001", "node_0003", "node_0006", "node_0007",
];

// Frozen metric thresholds (hypothesis §3/§4).
const COLLAPSE_RECALL = 0.2; // a draw with recall < this is a "collapse-draw"
const STABLE_FRACTION = 6 / 7; // stable-collapse ⇔ ≥ 6/7 draws collapse

const pathArg = process.argv[2];
if (!pathArg) {
  console.error("usage: tsx scripts/p1-variance-report.ts <verify-json>");
  process.exit(2);
}
const text = readFileSync(pathArg, "utf8");
const raw = JSON.parse(text.slice(text.indexOf("{")));
const report = raw.report ?? raw;
const results: any[] = report.results ?? [];
if (results.length === 0) {
  console.error(`no results[] in ${pathArg}`);
  process.exit(1);
}

function recallOf(m: any): number {
  if (!m) return 0; // unrecoverable draw = total collapse
  const A = new Set<string>(m.originalDeclarations ?? []);
  const B = new Set<string>(m.regenDeclarations ?? []);
  if (A.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / A.size;
}

type Row = {
  id: string; group: "pos" | "ctrl"; n: number;
  collapse: number; meanRecall: number; maxRecall: number; agreement: number;
  stableCollapse: boolean;
};
const byId = new Map<string, any>();
for (const r of results) byId.set(r.nodeId, r);

function analyze(id: string, group: "pos" | "ctrl"): Row | null {
  const r = byId.get(id);
  if (!r) { console.error(`! missing node in report: ${id}`); return null; }
  const reps = r.reps;
  if (!reps || !Array.isArray(reps.perRepMetrics)) {
    console.error(`! no per-rep telemetry for ${id} (was --reps > 1 used?)`);
    return null;
  }
  const per: any[] = reps.perRepMetrics;
  const recalls = per.map(recallOf);
  const n = recalls.length;
  const collapse = recalls.filter((x) => x < COLLAPSE_RECALL).length;
  const meanRecall = recalls.reduce((a, b) => a + b, 0) / n;
  const maxRecall = Math.max(...recalls);
  // agreement = modal-verdict fraction (verdict distribution concentration).
  const verds: string[] = reps.perRepVerdicts ?? [];
  const counts: Record<string, number> = {};
  for (const v of verds) counts[v] = (counts[v] ?? 0) + 1;
  const modal = Math.max(0, ...Object.values(counts));
  const agreement = verds.length ? modal / verds.length : 0;
  return {
    id, group, n, collapse, meanRecall, maxRecall, agreement,
    stableCollapse: collapse / n >= STABLE_FRACTION,
  };
}

const rows: Row[] = [];
for (const id of POSITIVES) { const x = analyze(id, "pos"); if (x) rows.push(x); }
for (const id of CONTROLS) { const x = analyze(id, "ctrl"); if (x) rows.push(x); }

const pos = rows.filter((r) => r.group === "pos");
const ctrl = rows.filter((r) => r.group === "ctrl");
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ── per-node table ──
console.log(`# P1 collapse-variance — ${pathArg}\n`);
console.log("id          grp   collapse/N  meanRecall  maxRecall  agreement  stable?");
for (const r of rows) {
  console.log(
    `${r.id}  ${r.group.padEnd(4)}  ${String(r.collapse).padStart(4)}/${r.n}     ${r.meanRecall.toFixed(2).padStart(6)}     ${r.maxRecall.toFixed(2).padStart(6)}     ${r.agreement.toFixed(2).padStart(5)}     ${r.stableCollapse ? "STABLE" : ""}`,
  );
}

// ── HV1 ──
const nStable = pos.filter((r) => r.stableCollapse).length;
const p = pos.length ? nStable / pos.length : NaN;
const band = p >= 0.60 ? "PROPERTY (≥0.60 → semantic predictor)"
  : p <= 0.30 ? "DRAW (≤0.30 → best-of-N + P4 decompose; P3/P7 dead)"
    : "MIXED (0.30–0.60 → both levers, per node)";
console.log(`\nHV1  stable-collapse p = ${nStable}/${pos.length} = ${p.toFixed(3)}  →  ${band}`);

// ── HV2 ──
const ctrlRecall = mean(ctrl.map((r) => r.meanRecall));
const ctrlAgree = mean(ctrl.map((r) => r.agreement));
const hv2 = ctrlAgree >= 0.70 && ctrlRecall >= 0.70 ? "PASS (controls stable)"
  : ctrlAgree < 0.50 ? "FALSIFIED — pipeline globally high-variance; ε n=1 matrix must be re-run with N"
    : "WEAK (controls partly unstable)";
console.log(`HV2  control meanRecall = ${ctrlRecall.toFixed(3)}, meanAgreement = ${ctrlAgree.toFixed(3)}  →  ${hv2}`);

// ── HV3 ──
const bestMedian = median(pos.map((r) => r.maxRecall));
const hv3 = bestMedian >= 0.50 ? "PASS — best-of-N recovers ≥ half the collapse today (cheap ship)"
  : bestMedian < 0.25 ? "FALSIFIED — resampling insufficient; P4 decompose is load-bearing"
    : "PARTIAL (0.25–0.50)";
console.log(`HV3  median best-of-${pos[0]?.n ?? "N"} recall (positives) = ${bestMedian.toFixed(3)}  →  ${hv3}`);
console.log(`\n(HV4 G-vs-F localization is a separate G-only pass — not in this report.)`);
