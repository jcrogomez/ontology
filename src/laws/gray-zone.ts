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
  /** Per-case behaviour outcomes for this draw, when a fixture ran (subset of
   *  regenerate's DraftEval.behaviorCases). Drives the SEMANTIC-divergence
   *  signal below: draws that fail DIFFERENT cases localise a bespoke
   *  extraction-gap even when their declaration sets agree and none passes —
   *  the class declKey-clustering and the pass/fail behaviorSplit both miss. */
  caseOutcomes?: ReadonlyArray<{ name: string; outcome: string }>;
}

export type GrayZone = "unanimous" | "majority" | "gray" | "no-signal";

/** Floor on `evaluatedDraws` (compiled draws that ran ≥1 fixture case) below
 *  which `semanticSplit` will NOT fire even with ≥2 distinct failure
 *  fingerprints. Guards the false-positive residual found on the dequal/lite
 *  capacity control (2026-07-21): with only 2 evaluated draws, "fail on
 *  different cases" is coin-flip noise for a high-variance model, not evidence
 *  the ficha under-determines the artifact. Matches DEFAULT_PROBE_DRAWS /
 *  sync's default `--draws 3` — the signal wants a fully-evaluated round, and
 *  a run wanting more discriminating power should draw more. */
export const SEMANTIC_SPLIT_MIN_RAN_DRAWS = 3;

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
  /** Compiled draws that produced case-level evidence (ran ≥1 fixture case).
   *  The evidence base for the semantic signal; `semanticSplit` needs enough
   *  of these to trust a divergence read (see SEMANTIC_SPLIT_MIN_RAN_DRAWS). */
  evaluatedDraws: number;
  /** Distinct NON-EMPTY failure fingerprints among compiled draws that ran the
   *  fixture. A fingerprint is the sorted set of case names a draw did not
   *  `match`. 0 ⇔ no fixture ran (or every runner passed); 1 ⇔ every failing
   *  draw failed the SAME cases (consistent failure ⇒ capacity); ≥2 ⇔ draws
   *  fail DIFFERENT cases. */
  semanticClusterCount: number;
  /** semanticClusterCount ≥ 2 AND evaluatedDraws ≥ SEMANTIC_SPLIT_MIN_RAN_DRAWS:
   *  draws agree nothing is right yet disagree on WHAT is wrong. The bespoke
   *  extraction-gap signal that fires even when declaration sets agree and no
   *  draw passes (found inert on foreign code 2026-07-21: query-string
   *  thin-ficha draws all failed but on different arrayFormat cases, which
   *  declKey/behaviorSplit read as `unanimous`). The floor guards the residual
   *  false positive: with only 2 evaluated draws, "fail differently" is
   *  coin-flip noise for a high-variance model, not evidence of ficha
   *  under-determination. */
  semanticSplit: boolean;
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

  // Semantic-divergence signal. Fingerprint each compiled draw that ran the
  // fixture by the sorted set of case names it did NOT `match`; keep only the
  // non-empty ones (a draw that passed every case contributes no failure
  // fingerprint). ≥2 distinct fingerprints ⇒ draws fail DIFFERENT cases ⇒ the
  // ficha under-determines WHICH behaviour is correct (bespoke extraction-gap),
  // as opposed to every draw failing the SAME cases (consistent ⇒ capacity).
  // This fires where the declKey cluster and behaviorSplit are both inert:
  // structure agrees and no draw passes.
  const failureFingerprints = new Set<string>();
  let evaluatedDraws = 0;
  for (const o of compiled) {
    if (!o.caseOutcomes || o.caseOutcomes.length === 0) continue;
    evaluatedDraws++;
    const failed = o.caseOutcomes
      .filter((c) => c.outcome !== "match")
      .map((c) => c.name)
      .sort();
    if (failed.length > 0) failureFingerprints.add(failed.join(""));
  }
  const semanticClusterCount = failureFingerprints.size;
  // Floor guard: a divergence read is only trustworthy with enough draws that
  // actually produced case evidence — 2 diverging draws is noise, not signal.
  const semanticSplit =
    semanticClusterCount >= 2 && evaluatedDraws >= SEMANTIC_SPLIT_MIN_RAN_DRAWS;

  const agreementRate = n === 0 ? 0 : top / n;
  // Any grounded disagreement makes the zone gray. Semantic disagreement takes
  // precedence over structural agreement: draws can share a declaration set yet
  // implement conflicting behaviour, which is the exact bespoke case the
  // structural cluster misses.
  const zone: GrayZone =
    n === 0 ? "no-signal"
    : semanticSplit ? "gray"
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
    evaluatedDraws,
    semanticClusterCount,
    semanticSplit,
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
