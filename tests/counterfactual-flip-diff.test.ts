import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  aggregateCaseOutcomes,
  computeFlipDiff,
  buildRepairEventPayload,
  recordRepairEvent,
  splitAuthorConfirm,
  seedFromFichaHash,
  restrictSide,
  MIN_CASES_TO_SPLIT,
  type CaseOutcome,
  type ForkSpec,
} from "../src/runtime/executor/counterfactual.js";
import { SEMANTIC_SPLIT_MIN_RAN_DRAWS } from "../src/laws/gray-zone.js";

// FORK_AND_DIFF slice 1 — the counterfactual verdict artifact. Contract under
// test: (a) majority aggregation is conservative (ties count WRONG, unevaluated
// draws don't vote), (b) the flip diff is per-case and deterministic, with the
// fixture-drift honesty guard (parent-only / fork-only names surfaced), (c) the
// draw floor mirrors the semanticSplit floor and is REPORTED, never silently
// waived, (d) repair events chain into the temporal log without breaking the
// replay law.

const c = (name: string, outcome: string): CaseOutcome => ({ name, outcome });

describe("aggregateCaseOutcomes (majority fold per case)", () => {
  it("a case is RIGHT only on a strict majority of match votes", () => {
    const side = aggregateCaseOutcomes([
      [c("a", "match"), c("b", "divergent")],
      [c("a", "match"), c("b", "match")],
      [c("a", "divergent"), c("b", "match")],
    ]);
    expect(side.evaluatedDraws).toBe(3);
    const byName = new Map(side.cases.map((x) => [x.name, x.outcome]));
    expect(byName.get("a")).toBe("match"); // 2/3
    expect(byName.get("b")).toBe("match"); // 2/3
  });

  it("a tie counts WRONG (an ambiguous case must not look repaired)", () => {
    const side = aggregateCaseOutcomes([
      [c("a", "match")],
      [c("a", "divergent")],
    ]);
    expect(side.cases).toHaveLength(1);
    expect(side.cases[0].outcome).toBe("divergent");
  });

  it("draws that reported no cases do not count as evaluated and cannot vote", () => {
    const side = aggregateCaseOutcomes([
      [], // load-failed draw: no cases at all
      [c("a", "match")],
      [],
    ]);
    expect(side.evaluatedDraws).toBe(1);
    expect(side.cases[0].outcome).toBe("match"); // 1/1, not 1/3
  });

  it("the representative WRONG outcome is the most frequent non-match vote", () => {
    const side = aggregateCaseOutcomes([
      [c("a", "errored")],
      [c("a", "divergent")],
      [c("a", "divergent")],
    ]);
    expect(side.cases[0].outcome).toBe("divergent");
  });

  it("a case reported by only some draws is judged on the draws that reported it", () => {
    const side = aggregateCaseOutcomes([
      [c("a", "match"), c("b", "match")],
      [c("a", "match")],
      [c("a", "divergent")],
    ]);
    const byName = new Map(side.cases.map((x) => [x.name, x.outcome]));
    expect(byName.get("a")).toBe("match"); // 2/3 strict majority
    expect(byName.get("b")).toBe("match"); // 1/1
  });
});

describe("computeFlipDiff (the promotion currency)", () => {
  const agg = (cases: CaseOutcome[], evaluatedDraws: number) => ({ cases, evaluatedDraws });

  it("classifies wrong→right and right→wrong flips per case and nets them", () => {
    const parent = agg([c("a", "divergent"), c("b", "match"), c("cc", "errored"), c("d", "match")], 3);
    const fork = agg([c("a", "match"), c("b", "divergent"), c("cc", "match"), c("d", "match")], 3);
    const diff = computeFlipDiff(parent, fork);
    expect(diff.comparableCases).toBe(4);
    expect(diff.wrongToRight.map((f) => f.name)).toEqual(["a", "cc"]);
    expect(diff.rightToWrong.map((f) => f.name)).toEqual(["b"]);
    expect(diff.netFlips).toBe(1);
    expect(diff.meetsDrawFloor).toBe(true);
    expect(diff.drawFloor).toBe(SEMANTIC_SPLIT_MIN_RAN_DRAWS);
  });

  it("surfaces fixture drift as parent-only / fork-only case names", () => {
    const parent = agg([c("a", "match"), c("gone", "divergent")], 3);
    const fork = agg([c("a", "match"), c("new", "match")], 3);
    const diff = computeFlipDiff(parent, fork);
    expect(diff.comparableCases).toBe(1);
    expect(diff.parentOnlyCases).toEqual(["gone"]);
    expect(diff.forkOnlyCases).toEqual(["new"]);
    expect(diff.wrongToRight).toHaveLength(0);
    expect(diff.rightToWrong).toHaveLength(0);
  });

  it("reports a floor miss on EITHER side, never waives it", () => {
    const thin = agg([c("a", "divergent")], 2); // below default floor of 3
    const full = agg([c("a", "match")], 3);
    expect(computeFlipDiff(thin, full).meetsDrawFloor).toBe(false);
    expect(computeFlipDiff(full, thin).meetsDrawFloor).toBe(false);
    // The flips themselves are still computed — reported, not hidden.
    expect(computeFlipDiff(thin, full).wrongToRight).toHaveLength(1);
  });

  it("honours a caller-supplied floor (a run wanting more power draws more)", () => {
    const side5 = agg([c("a", "match")], 5);
    expect(computeFlipDiff(side5, side5, 5).meetsDrawFloor).toBe(true);
    expect(computeFlipDiff(side5, side5, 6).meetsDrawFloor).toBe(false);
  });

  it("flip order follows parent case order (deterministic across replays)", () => {
    const parent = agg([c("z", "divergent"), c("a", "divergent")], 3);
    const fork = agg([c("a", "match"), c("z", "match")], 3);
    expect(computeFlipDiff(parent, fork).wrongToRight.map((f) => f.name)).toEqual(["z", "a"]);
  });
});

describe("splitAuthorConfirm (the seeded AUTHOR/CONFIRM deal — slice 2)", () => {
  const names = ["c1", "c2", "c3", "c4", "c5", "c6"];

  it("is deterministic: same (names, seed) → byte-identical split, forever", () => {
    const a = splitAuthorConfirm(names, 12345)!;
    const b = splitAuthorConfirm(names, 12345)!;
    expect(a).toEqual(b);
  });

  it("partitions: disjoint, exhaustive, ~1/3 held out, original order kept", () => {
    const s = splitAuthorConfirm(names, 777)!;
    expect(s.confirm).toHaveLength(2); // floor(6/3)
    expect(s.author).toHaveLength(4);
    expect([...s.author, ...s.confirm].sort()).toEqual([...names].sort());
    expect(s.author.every((n, i, arr) => i === 0 || names.indexOf(arr[i - 1]) < names.indexOf(n))).toBe(true);
    expect(s.seed).toBe(777);
  });

  it("refuses to split below the floor (n < 4) — heldOut: none, never a 1-case coin flip", () => {
    expect(splitAuthorConfirm(["a", "b", "c"], 1)).toBeNull();
    expect(splitAuthorConfirm(["a", "b", "c", "d"], 1)).not.toBeNull();
    expect(MIN_CASES_TO_SPLIT).toBe(4);
  });

  it("holds out at least one case even at the floor", () => {
    const s = splitAuthorConfirm(["a", "b", "c", "d"], 9)!;
    expect(s.confirm.length).toBeGreaterThanOrEqual(1);
    expect(s.author.length).toBeGreaterThanOrEqual(2);
  });

  it("seedFromFichaHash: hex prefix → uint32; garbage → 0", () => {
    expect(seedFromFichaHash("deadbeefcafe")).toBe(0xdeadbeef);
    expect(seedFromFichaHash("zzzz")).toBe(0);
  });

  it("restrictSide keeps only the named cases and the draw count", () => {
    const side = { cases: [c("a", "match"), c("b", "divergent")], evaluatedDraws: 3 };
    const r = restrictSide(side, ["b"]);
    expect(r.cases.map((x) => x.name)).toEqual(["b"]);
    expect(r.evaluatedDraws).toBe(3);
  });
});

describe("repair events (audit trail in the temporal log)", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });
  afterEach(() => cleanupTempProject(tempDir));

  const spec: ForkSpec = {
    nodeId: "node_0002",
    parentFichaHash: "aaaa",
    forkFichaHash: "bbbb",
    operator: "R_strict",
    rung: 1,
    provider: "ollama",
    model: "qwen2.5-coder:7b",
  };

  it("chains proposed→promoted events and the replay law still holds", () => {
    const parent = aggregateCaseOutcomes([[c("a", "divergent")], [c("a", "divergent")], [c("a", "divergent")]]);
    const fork = aggregateCaseOutcomes([[c("a", "match")], [c("a", "match")], [c("a", "match")]]);
    const diff = computeFlipDiff(parent, fork);

    const proposed = recordRepairEvent(tempDir, "repair_proposed", buildRepairEventPayload(spec, undefined, "prop_1"));
    const promoted = recordRepairEvent(tempDir, "repair_promoted", buildRepairEventPayload(spec, diff, "prop_1"));

    expect(promoted.previousEventId).toBe(proposed.eventId);
    expect(promoted.sequence).toBe(proposed.sequence + 1);
    const flips = (promoted.payload as { flips?: { wrongToRight: string[]; meetsDrawFloor: boolean } }).flips;
    expect(flips?.wrongToRight).toEqual(["a"]);
    expect(flips?.meetsDrawFloor).toBe(true);

    // The events are on disk in the log…
    const lines = fs
      .readFileSync(path.join(tempDir, ".ontology", "events.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    const types = lines.map((l) => (JSON.parse(l) as { eventType: string }).eventType);
    expect(types).toContain("repair_proposed");
    expect(types).toContain("repair_promoted");

    // …and the replay law survives the new event types (they advance the
    // chain without deriving counters).
    const replay = runCli(tempDir, ["replay"]);
    expect(replay.status).toBe(0);
  });

  it("a discarded repair records the evidence that killed it", () => {
    const parent = aggregateCaseOutcomes([[c("a", "match")], [c("a", "match")], [c("a", "match")]]);
    const fork = aggregateCaseOutcomes([[c("a", "divergent")], [c("a", "divergent")], [c("a", "divergent")]]);
    const diff = computeFlipDiff(parent, fork);
    const ev = recordRepairEvent(tempDir, "repair_discarded", buildRepairEventPayload(spec, diff));
    const flips = (ev.payload as { flips?: { rightToWrong: string[]; netFlips: number } }).flips;
    expect(flips?.rightToWrong).toEqual(["a"]);
    expect(flips?.netFlips).toBe(-1);
  });

  it("refuses to record into an uninitialised project", () => {
    const bare = createTempProject();
    try {
      expect(() => recordRepairEvent(bare, "repair_proposed", buildRepairEventPayload(spec))).toThrow(/not initialised|no event log/i);
    } finally {
      cleanupTempProject(bare);
    }
  });
});
