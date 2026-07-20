// Gray-zone index — per-node semantic disagreement across regeneration draws.
//
// The sync loop already draws N candidates and clusters them by declKey
// (sorted top-level declaration set) to pick a consensus winner; everything
// but the winner is discarded. This module keeps the one thing the losing
// draws PROVE: how much the draws disagreed with EACH OTHER. High
// disagreement is not model noise to average away — it localises nodes whose
// intent under-determines the artifact (the "gray zone": the correct output
// hinges on policy the ficha does not state). Draws that AGREE but still fail
// the gates point the other way: the intent is consumed consistently and the
// model/capacity is the limit.
//
// That split is exactly the executor's Gap A (extraction-gap: repair the
// ficha) vs Gap B (capacity-ceiling: climb the ladder) taxonomy, measured
// from data the multi-draw loop already produces — $0, no extra dispatches.
// (External inspiration, T3: D. Lin's "agent flip-flop concentrates near the
// decision boundary; sharpen the policy, don't fine-tune" — AI Engineer 2026.
// We adopt the framing, not her numbers.)
//
// The core fold is pure and deterministic (same observations → same index),
// mirroring verdict-variance.ts, whose metric names (agreementRate,
// entropyBits) it reuses. Persistence is a small governed report file under
// .ontology/reports/ so `onto status --gray-zone` can rank nodes without
// re-drawing.

import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../kernel/core/project/paths.js";
import type { HomeomorphismVerdict } from "./verify-homeomorphism.js";

/** What the fold needs from one draw — a subset of regenerate's DraftEval. */
export interface DrawObservation {
  i: number;
  compiled: boolean;
  /** Sorted top-level declaration set; undefined when the draft compiled but
   *  could not be parsed/compared (each such draft is its own cluster —
   *  maximal disagreement is the honest reading of an unparseable draw). */
  declKey?: string;
  verdict?: HomeomorphismVerdict;
  behaviorVerdict: string;
  acceptable: boolean;
}

export type GrayZone = "unanimous" | "majority" | "gray" | "no-signal";

export interface GrayZoneIndex {
  /** Total draws requested (compiled or not). */
  draws: number;
  /** Draws that produced a comparable artifact. */
  compiledDraws: number;
  acceptableDraws: number;
  /** Distinct declKey clusters among compiled draws. 1 ⇔ full agreement. */
  clusterCount: number;
  topClusterSize: number;
  /** topClusterSize / compiledDraws — same semantics as verdict-variance's
   *  agreementRate, but over draw-vs-draw clusters instead of vs-original. */
  agreementRate: number;
  /** 1 − agreementRate. THE gray-zone ranking key. */
  disagreementRate: number;
  /** Shannon entropy (bits) of the cluster-size distribution. */
  clusterEntropyBits: number;
  /** True when, under the same fixture, some compiled draw passes and another
   *  fails — behaviour-grounded flip-flop, the strongest disagreement signal. */
  behaviorSplit: boolean;
  zone: GrayZone;
}

/** Fold one multi-draw round into the disagreement index. Pure. */
export function computeGrayZone(observations: DrawObservation[]): GrayZoneIndex {
  const draws = observations.length;
  const compiled = observations.filter((o) => o.compiled);
  const clusters = new Map<string, number>();
  for (const o of compiled) {
    // A compiled-but-unparseable draft gets a per-draw key: it agrees with
    // nothing, and pretending otherwise would understate the disagreement.
    const key = o.declKey ?? `__unparsed_${o.i}`;
    clusters.set(key, (clusters.get(key) ?? 0) + 1);
  }
  const sizes = [...clusters.values()];
  const top = Math.max(0, ...sizes);
  const n = compiled.length;
  let entropy = 0;
  for (const s of sizes) {
    const p = s / n;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const verdicts = new Set(compiled.map((o) => o.behaviorVerdict));
  const agreementRate = n === 0 ? 0 : top / n;
  const zone: GrayZone =
    n === 0 ? "no-signal"
    : clusters.size === 1 ? "unanimous"
    : top * 2 > n ? "majority"
    : "gray";
  return {
    draws,
    compiledDraws: n,
    acceptableDraws: observations.filter((o) => o.acceptable).length,
    clusterCount: clusters.size,
    topClusterSize: top,
    agreementRate,
    disagreementRate: n === 0 ? 0 : 1 - agreementRate,
    clusterEntropyBits: entropy,
    behaviorSplit: verdicts.has("pass") && verdicts.has("fail"),
    zone,
  };
}

// ── Persistence: .ontology/reports/gray-zone.json ──
//
// One latest record per node (not a history): the index answers "which fichas
// should I repair FIRST, today", so the freshest measurement wins. History
// lives in the dated calibration records when a run is worth preserving.

export interface GrayZoneRecord extends GrayZoneIndex {
  nodeId: string;
  /** ISO timestamp of the measurement. */
  measuredAt: string;
  provider?: string;
}

interface GrayZoneReportFile {
  version: 1;
  nodes: Record<string, GrayZoneRecord>;
}

export function grayZoneReportPath(cwd: string): string {
  return path.join(getOntologyPaths(cwd).reportsDir, "gray-zone.json");
}

export function readGrayZoneRecords(cwd: string): Record<string, GrayZoneRecord> {
  try {
    const raw = fs.readFileSync(grayZoneReportPath(cwd), "utf-8");
    const parsed = JSON.parse(raw) as GrayZoneReportFile;
    return parsed.nodes ?? {};
  } catch {
    return {};
  }
}

/** Upsert one node's latest measurement. Best-effort by contract: callers are
 *  mid-regeneration — a bookkeeping failure must never sink the run, so this
 *  throws only on JSON.stringify bugs, not on a missing directory. */
export function recordGrayZone(cwd: string, record: GrayZoneRecord): void {
  const file: GrayZoneReportFile = { version: 1, nodes: readGrayZoneRecords(cwd) as Record<string, GrayZoneRecord> };
  file.nodes[record.nodeId] = record;
  const p = grayZoneReportPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(file, null, 2) + "\n", "utf-8");
}
