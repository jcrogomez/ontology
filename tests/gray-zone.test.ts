import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  computeGrayZone,
  recordGrayZone,
  readGrayZoneRecords,
  grayZoneReportPath,
  type DrawObservation,
} from "../src/laws/gray-zone.js";

// Gray-zone index — per-node draw-vs-draw disagreement. The pure fold is
// pinned exhaustively here (it is the Gap-A/Gap-B evidence source for the
// executor router, so its zone labels are load-bearing); persistence and the
// regenerate→report→status wiring are covered against the deterministic mock
// provider (identity functor → all draws agree → unanimous / disagreement 0).

const obs = (i: number, over: Partial<DrawObservation> = {}): DrawObservation => ({
  i,
  compiled: true,
  declKey: "f,g",
  behaviorVerdict: "no_fixture",
  acceptable: true,
  ...over,
});

describe("computeGrayZone (pure fold)", () => {
  it("all draws in one cluster → unanimous, disagreement 0, entropy 0", () => {
    const gz = computeGrayZone([obs(1), obs(2), obs(3)]);
    expect(gz.zone).toBe("unanimous");
    expect(gz.clusterCount).toBe(1);
    expect(gz.agreementRate).toBe(1);
    expect(gz.disagreementRate).toBe(0);
    expect(gz.clusterEntropyBits).toBe(0);
    expect(gz.compiledDraws).toBe(3);
    expect(gz.acceptableDraws).toBe(3);
  });

  it("2-1 split → majority (a consensus class exists but draws disagree)", () => {
    const gz = computeGrayZone([obs(1), obs(2), obs(3, { declKey: "f" })]);
    expect(gz.zone).toBe("majority");
    expect(gz.clusterCount).toBe(2);
    expect(gz.topClusterSize).toBe(2);
    expect(gz.agreementRate).toBeCloseTo(2 / 3);
    expect(gz.disagreementRate).toBeCloseTo(1 / 3);
  });

  it("all draws disagree → gray, disagreement approaches 1", () => {
    const gz = computeGrayZone([
      obs(1, { declKey: "a" }),
      obs(2, { declKey: "b" }),
      obs(3, { declKey: "c" }),
    ]);
    expect(gz.zone).toBe("gray");
    expect(gz.clusterCount).toBe(3);
    expect(gz.agreementRate).toBeCloseTo(1 / 3);
    expect(gz.clusterEntropyBits).toBeCloseTo(Math.log2(3));
  });

  it("no compiled draws → no-signal (yield problem, not disagreement)", () => {
    const gz = computeGrayZone([obs(1, { compiled: false, acceptable: false }), obs(2, { compiled: false, acceptable: false })]);
    expect(gz.zone).toBe("no-signal");
    expect(gz.compiledDraws).toBe(0);
    expect(gz.disagreementRate).toBe(0); // no evidence ≠ maximal disagreement
  });

  it("compiled-but-unparseable drafts each count as their own cluster", () => {
    const gz = computeGrayZone([obs(1), obs(2, { declKey: undefined }), obs(3, { declKey: undefined })]);
    expect(gz.clusterCount).toBe(3);
    expect(gz.zone).toBe("gray");
  });

  it("behaviour split: pass AND fail among draws on the same fixture", () => {
    const gz = computeGrayZone([
      obs(1, { behaviorVerdict: "pass" }),
      obs(2, { behaviorVerdict: "fail", acceptable: false }),
      obs(3, { behaviorVerdict: "pass" }),
    ]);
    expect(gz.behaviorSplit).toBe(true);
    // Same declKey → still unanimous structurally; the split is orthogonal.
    expect(gz.zone).toBe("unanimous");
  });

  it("uncompiled draws count toward draws but not toward clusters", () => {
    const gz = computeGrayZone([obs(1), obs(2), obs(3, { compiled: false, acceptable: false })]);
    expect(gz.draws).toBe(3);
    expect(gz.compiledDraws).toBe(2);
    expect(gz.zone).toBe("unanimous");
  });

  // Semantic-divergence signal — draws that AGREE structurally (same declKey)
  // and all FAIL, but on DIFFERENT cases. This is the bespoke extraction-gap
  // the structural cluster and behaviorSplit both miss (found inert on foreign
  // code 2026-07-21: query-string thin-ficha).
  it("draws fail DIFFERENT cases → semanticSplit → gray (even if structurally unanimous)", () => {
    const gz = computeGrayZone([
      obs(1, { behaviorVerdict: "fail", acceptable: false, caseOutcomes: [
        { name: "comma", outcome: "divergent" }, { name: "bracket", outcome: "match" }] }),
      obs(2, { behaviorVerdict: "fail", acceptable: false, caseOutcomes: [
        { name: "comma", outcome: "match" }, { name: "bracket", outcome: "divergent" }] }),
      obs(3, { behaviorVerdict: "fail", acceptable: false, caseOutcomes: [
        { name: "comma", outcome: "divergent" }, { name: "bracket", outcome: "match" }] }),
    ]);
    expect(gz.clusterCount).toBe(1);         // declKey agrees
    expect(gz.behaviorSplit).toBe(false);    // no draw passed
    expect(gz.evaluatedDraws).toBe(3);       // meets the floor
    expect(gz.semanticClusterCount).toBe(2); // {comma} vs {bracket}
    expect(gz.semanticSplit).toBe(true);
    expect(gz.zone).toBe("gray");
  });

  it("floor guard: only 2 evaluated draws failing differently → NO semanticSplit (noise, not signal)", () => {
    const gz = computeGrayZone([
      obs(1, { behaviorVerdict: "fail", acceptable: false, caseOutcomes: [
        { name: "comma", outcome: "divergent" }, { name: "bracket", outcome: "match" }] }),
      obs(2, { behaviorVerdict: "fail", acceptable: false, caseOutcomes: [
        { name: "comma", outcome: "match" }, { name: "bracket", outcome: "divergent" }] }),
      // 3rd draw did not evaluate (load failure) → below the floor
      obs(3, { behaviorVerdict: "untested", acceptable: false }),
    ]);
    expect(gz.evaluatedDraws).toBe(2);
    expect(gz.semanticClusterCount).toBe(2); // they DO differ...
    expect(gz.semanticSplit).toBe(false);    // ...but too few evaluated to trust
    expect(gz.zone).toBe("unanimous");
  });

  it("3 draws fail the SAME cases → no semanticSplit → unanimous (capacity, not extraction — the dequal/lite control)", () => {
    const same = { behaviorVerdict: "fail", acceptable: false, caseOutcomes: [
      { name: "setIdentity", outcome: "divergent" }, { name: "primitives", outcome: "match" }] };
    const gz = computeGrayZone([obs(1, same), obs(2, same), obs(3, same)]);
    expect(gz.evaluatedDraws).toBe(3);        // meets the floor — so it is NOT the guard
    expect(gz.semanticClusterCount).toBe(1);  // one shared failure fingerprint
    expect(gz.semanticSplit).toBe(false);
    expect(gz.zone).toBe("unanimous");
  });

  it("pass vs fail is behaviorSplit, not semanticSplit (only one non-empty fingerprint)", () => {
    const gz = computeGrayZone([
      obs(1, { behaviorVerdict: "pass", caseOutcomes: [{ name: "a", outcome: "match" }] }),
      obs(2, { behaviorVerdict: "fail", acceptable: false, caseOutcomes: [{ name: "a", outcome: "divergent" }] }),
    ]);
    expect(gz.behaviorSplit).toBe(true);
    expect(gz.semanticSplit).toBe(false);
    expect(gz.zone).toBe("unanimous");
  });
});

describe("gray-zone persistence", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
  });
  afterEach(() => cleanupTempProject(tempDir));

  const record = (nodeId: string, over: Record<string, unknown> = {}) => ({
    nodeId,
    measuredAt: "2026-07-20T00:00:00.000Z",
    ...computeGrayZone([obs(1), obs(2, { declKey: "f" })]),
    ...over,
  });

  it("recordGrayZone round-trips and upserts per node", () => {
    recordGrayZone(tempDir, record("node_a"));
    recordGrayZone(tempDir, record("node_b"));
    recordGrayZone(tempDir, record("node_a", { measuredAt: "2026-07-21T00:00:00.000Z" }));
    const nodes = readGrayZoneRecords(tempDir);
    expect(Object.keys(nodes).sort()).toEqual(["node_a", "node_b"]);
    expect(nodes.node_a.measuredAt).toBe("2026-07-21T00:00:00.000Z");
  });

  it("a corrupt report file reads as empty (never throws)", () => {
    const p = grayZoneReportPath(tempDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "{not json");
    expect(readGrayZoneRecords(tempDir)).toEqual({});
  });
});

// ── Integration: multi-draw regenerate records; status ranks. ──

const SHADOW_REL = "src/hello.py";

function patchNode(tempDir: string, nodeId: string, mutate: (n: Record<string, unknown>) => void): void {
  const p = path.join(tempDir, ".ontology/nodes", `${nodeId}.json`);
  const n = JSON.parse(fs.readFileSync(p, "utf-8"));
  mutate(n);
  fs.writeFileSync(p, JSON.stringify(n, null, 2));
}

function setupShadowNode(tempDir: string, sourceContent: string): string {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greeting domain"]).status).toBe(0);
  expect(
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", 'print("hello world")',
    ]).status,
  ).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
  const shadowAbs = path.join(tempDir, SHADOW_REL);
  fs.mkdirSync(path.dirname(shadowAbs), { recursive: true });
  fs.writeFileSync(shadowAbs, sourceContent);
  patchNode(tempDir, "node_0002", (n) => {
    n.outputs = { ...((n.outputs as object) ?? {}), files: [SHADOW_REL] };
  });
  return "node_0002";
}

describe("gray-zone wiring (regenerate → report → status)", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("a multi-draw regenerate reports and records the index; status ranks it", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');

    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--draws", "3", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    // Identity mock: all 3 draws agree.
    expect(p.grayZone.zone).toBe("unanimous");
    expect(p.grayZone.disagreementRate).toBe(0);
    expect(p.draftSummary.every((d: { declKey?: string }) => d.declKey !== undefined)).toBe(true);

    const recorded = readGrayZoneRecords(tempDir);
    expect(recorded[id]).toBeDefined();
    expect(recorded[id].provider).toBe("mock");
    expect(recorded[id].zone).toBe("unanimous");

    const s = runCli(tempDir, ["status", "--json"]);
    expect(s.status).toBe(0);
    const report = JSON.parse(s.stdout).report;
    expect(report.grayZone.measured).toBe(1);
    expect(report.grayZone.gray).toBe(0);
    expect(report.grayZone.ranking[0].nodeId).toBe(id);
  });

  it("status --gray-zone renders the ranking section; single-draw runs record nothing", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');

    // Single draw: no consensus machinery → no gray-zone record.
    expect(runCli(tempDir, ["regenerate", id, "--provider", "mock", "--json"]).status).toBe(0);
    expect(readGrayZoneRecords(tempDir)).toEqual({});

    const empty = runCli(tempDir, ["status", "--gray-zone"]);
    expect(empty.status).toBe(0);
    expect(empty.stdout).toContain("no measurements yet");

    // Hand-plant a gray record (as a disagreeing multi-draw run would) and a
    // record for a node that no longer exists (must be ignored, not ranked).
    recordGrayZone(tempDir, {
      nodeId: id,
      measuredAt: "2026-07-20T00:00:00.000Z",
      ...computeGrayZone([obs(1, { declKey: "a" }), obs(2, { declKey: "b" }), obs(3, { declKey: "c" })]),
    });
    recordGrayZone(tempDir, {
      nodeId: "node_deleted",
      measuredAt: "2026-07-20T00:00:00.000Z",
      ...computeGrayZone([obs(1), obs(2)]),
    });

    const shown = runCli(tempDir, ["status", "--gray-zone"]);
    expect(shown.status).toBe(0);
    expect(shown.stdout).toContain("gray-zone index");
    expect(shown.stdout).toContain(`${id}\t[gray]`);
    expect(shown.stdout).not.toContain("node_deleted");
  });
});
