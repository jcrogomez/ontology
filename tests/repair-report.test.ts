import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  foldRepairEvents,
  computeOperatorGap,
  computeAgreement,
  autoDecision,
  type RepairAttempt,
} from "../src/runtime/executor/repair-report.js";
import { runFichaRepair, resolveRepair, type RepairDeps } from "../src/runtime/executor/repair.js";
import { readEventLog } from "../src/kernel/core/state/replay.js";
import type { OntologyEvent } from "../src/kernel/schemas/ontology.js";
import type { FlipSummary } from "../src/runtime/executor/counterfactual.js";
import type { RegenerateResult } from "../src/surfaces/commands/regenerate.js";
import type { LlmResponse } from "../src/runtime/llm/types.js";

// The two MVP numbers (MVP_REGEN_LOOP.md §3 + §5) as pure folds over the
// temporal log. Contract under test: (a) the strict↔perm gap only exists
// where BOTH operators measured at the SAME parent ficha hash — never fudged
// across baselines, (b) autoDecision is the pre-registered v2 rule: net>0,
// floor met, no fixture drift, held-out present AND clean — in-sample
// evidence alone never auto-promotes, (c) the agreement rate scores the
// human's actual resolutions against that rule, joined by proposalId.

const flips = (over: Partial<FlipSummary> = {}): FlipSummary => ({
  wrongToRight: ["a"],
  rightToWrong: [],
  netFlips: 1,
  comparableCases: 4,
  parentOnlyCases: [],
  forkOnlyCases: [],
  parentEvaluatedDraws: 3,
  forkEvaluatedDraws: 3,
  meetsDrawFloor: true,
  drawFloor: 3,
  ...over,
});

const cleanConfirm = (): FlipSummary => flips({ wrongToRight: [], netFlips: 0, comparableCases: 2 });

const attempt = (over: Partial<RepairAttempt> = {}): RepairAttempt => ({
  nodeId: "node_0001",
  operator: "R_strict",
  parentFichaHash: "aaaa0000",
  forkFichaHash: "bbbb0000",
  proposalId: "proposal_0001",
  flips: flips(),
  confirmFlips: cleanConfirm(),
  heldOut: true,
  timestamp: "2026-07-23T00:00:00Z",
  ...over,
});

const proposedEvent = (payload: Record<string, unknown>, seq: number): OntologyEvent =>
  ({
    eventId: `evt_${seq}`,
    sequence: seq,
    timestamp: "2026-07-23T00:00:00Z",
    eventType: "repair_proposed",
    branch: "main",
    previousEventId: seq === 0 ? null : `evt_${seq - 1}`,
    payload,
  }) as OntologyEvent;

describe("autoDecision (the pre-registered v2 rule)", () => {
  it("promotes only on net>0 + floor + no drift + clean held-out CONFIRM", () => {
    expect(autoDecision(attempt())).toBe("promote");
  });

  it("discards every degraded variant — each guard is load-bearing", () => {
    expect(autoDecision(attempt({ flips: undefined }))).toBe("discard"); // unmeasured
    expect(autoDecision(attempt({ flips: flips({ netFlips: 0 }) }))).toBe("discard"); // no gain
    expect(autoDecision(attempt({ flips: flips({ meetsDrawFloor: false }) }))).toBe("discard"); // noise-grade
    expect(autoDecision(attempt({ flips: flips({ forkOnlyCases: ["new"] }) }))).toBe("discard"); // moved target
    expect(autoDecision(attempt({ heldOut: false, confirmFlips: undefined }))).toBe("discard"); // in-sample only
    expect(
      autoDecision(attempt({ confirmFlips: flips({ rightToWrong: ["cc"], netFlips: -1 }) })),
    ).toBe("discard"); // held-out regression
  });
});

describe("computeOperatorGap (same-baseline discipline)", () => {
  it("reports the gap only where both arms measured at the same parent hash", () => {
    const rows = computeOperatorGap([
      attempt({ operator: "R_strict", flips: flips({ netFlips: 1 }) }),
      attempt({ operator: "R_perm", proposalId: "proposal_0002", flips: flips({ netFlips: 3 }) }),
      // A perm attempt at a DIFFERENT baseline must not enter that gap.
      attempt({ operator: "R_perm", parentFichaHash: "cccc0000", proposalId: "proposal_0003", flips: flips({ netFlips: 9 }) }),
    ]);
    const same = rows.find((r) => r.parentFichaHash === "aaaa0000")!;
    expect(same.gap).toBe(2); // 3 − 1, not 9 − 1
    const other = rows.find((r) => r.parentFichaHash === "cccc0000")!;
    expect(other.gap).toBeUndefined();
    expect(other.perm?.netFlips).toBe(9);
    expect(other.strict).toBeUndefined();
  });

  it("takes each operator's BEST attempt at the baseline (retries don't dilute)", () => {
    const rows = computeOperatorGap([
      attempt({ flips: flips({ netFlips: 0 }) }),
      attempt({ proposalId: "proposal_0002", flips: flips({ netFlips: 2 }) }),
    ]);
    expect(rows[0].strict?.netFlips).toBe(2);
  });
});

describe("computeAgreement (human vs the rule)", () => {
  it("joins resolutions to attempts by proposalId and scores agreement", () => {
    const attempts = [
      attempt(), // auto: promote
      attempt({ proposalId: "proposal_0002", confirmFlips: flips({ rightToWrong: ["cc"], netFlips: -1 }) }), // auto: discard
    ];
    const report = computeAgreement(attempts, [
      { proposalId: "proposal_0001", decision: "promote", timestamp: "t" }, // agrees
      { proposalId: "proposal_0002", decision: "promote", timestamp: "t" }, // human overrode a confirm regression
    ]);
    expect(report.resolved).toBe(2);
    expect(report.agreements).toBe(1);
    expect(report.rate).toBe(0.5);
    const disagreement = report.rows.find((r) => !r.agree)!;
    expect(disagreement.proposalId).toBe("proposal_0002");
    expect(disagreement.human).toBe("promote");
    expect(disagreement.auto).toBe("discard");
  });

  it("rate is null before any resolution — no fake 100%", () => {
    expect(computeAgreement([attempt()], []).rate).toBeNull();
  });
});

describe("foldRepairEvents (log → attempts/resolutions)", () => {
  it("reads split-presence as heldOut and skips resolution-less noise", () => {
    const events: OntologyEvent[] = [
      proposedEvent(
        { nodeId: "node_0001", operator: "R_strict", parentFichaHash: "aa", forkFichaHash: "bb", proposalId: "proposal_0001", flips: flips(), split: { seed: 1, author: ["a"], confirm: ["c"] }, confirmFlips: cleanConfirm() },
        0,
      ),
      proposedEvent(
        { nodeId: "node_0002", operator: "R_perm", parentFichaHash: "aa", forkFichaHash: "cc", proposalId: "proposal_0002", flips: flips() },
        1,
      ),
    ];
    const { attempts, resolutions } = foldRepairEvents(events);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].heldOut).toBe(true);
    expect(attempts[1].heldOut).toBe(false);
    expect(resolutions).toHaveLength(0);
  });
});

describe("end-to-end: two arms + a human call, read back off the real log", () => {
  let tempDir: string;
  const nodeId = "node_0001";
  const CASES = ["c1", "c2", "c3", "c4", "c5", "c6"];

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    expect(
      runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greet the user"]).status,
    ).toBe(0);
    const dir = path.join(tempDir, "tests", "behavior-fixtures");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${nodeId}.fixture.mjs`),
      `export const cases = ${JSON.stringify(CASES)}.map((name) => ({\n` +
        `  name, setup: () => ({}), invoke: () => undefined, assert: () => true,\n` +
        `}));\n`,
    );
    // R_perm reads the reference source when present.
    fs.writeFileSync(path.join(tempDir, "src.js"), "export const greet = () => 'hi';\n");
  });
  afterEach(() => cleanupTempProject(tempDir));

  const resultWith = (outcomeFor: (name: string) => string): RegenerateResult =>
    ({
      ok: true,
      nodeId,
      written: false,
      behaviorVerdict: "fail",
      draws: 3,
      draftSummary: [0, 1, 2].map((i) => ({
        i,
        behaviorVerdict: "fail" as const,
        acceptable: false,
        caseOutcomes: CASES.map((name) => ({ name, outcome: outcomeFor(name) })),
      })),
    }) as unknown as RegenerateResult;

  const depsFor = (forkOutcome: (name: string) => string, repairedPrompt: string): RepairDeps => ({
    regenerate: async (_id, opts) => (opts.fichaOverride ? resultWith(forkOutcome) : resultWith(() => "divergent")),
    dispatch: async () =>
      ({ text: JSON.stringify({ prompt: repairedPrompt, rules: [] }), model: "m", provider: "mock" }) as unknown as LlmResponse,
  });

  it("gap + agreement both come straight off events.jsonl", async () => {
    // Strict arm: fixes everything. Perm arm (same baseline): also fixes everything.
    const strict = await runFichaRepair(
      { nodeId, operator: "R_strict", provider: "mock", draws: 3, cwd: tempDir },
      depsFor(() => "match", "Strict repaired"),
    );
    expect(strict.ok).toBe(true);
    const perm = await runFichaRepair(
      { nodeId, operator: "R_perm", provider: "mock", draws: 3, cwd: tempDir },
      depsFor(() => "match", "Perm repaired"),
    );
    expect(perm.ok).toBe(true);
    expect(perm.parentFichaHash).toBe(strict.parentFichaHash); // same baseline — comparable

    // Human promotes the strict one.
    const resolved = resolveRepair({
      proposalId: strict.proposalId!,
      decision: "promote",
      spec: {
        nodeId,
        parentFichaHash: strict.parentFichaHash!,
        forkFichaHash: strict.forkFichaHash!,
        operator: "R_strict",
        rung: 0,
      },
      diff: strict.diff,
      cwd: tempDir,
    });
    expect(resolved.ok).toBe(true);

    const { attempts, resolutions } = foldRepairEvents(readEventLog(tempDir));
    expect(attempts).toHaveLength(2);
    const gap = computeOperatorGap(attempts);
    const row = gap.find((r) => r.parentFichaHash === strict.parentFichaHash)!;
    expect(row.gap).toBe(0); // both arms fixed all AUTHOR cases → no perm advantage
    expect(row.strict?.confirmRegression).toBe(false);

    const agreement = computeAgreement(attempts, resolutions);
    expect(agreement.resolved).toBe(1);
    // Strict fixed AUTHOR and CONFIRM stayed clean → the rule agrees with the human.
    expect(agreement.rate).toBe(1);
  });
});
