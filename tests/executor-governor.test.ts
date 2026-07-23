// The run governor (B1/B2 — MVP_REGEN_LOOP.md §4.1). Contract under test:
// (a) the cloud-attempt budget spends per dispatched cloud attempt and, once
// exhausted, LATER nodes climb a local-only effective ladder (honest plateau,
// no cloud dispatch), (b) a mid-climb cloud attempt over budget terminates
// THAT node infra-error with the budget spelled out — never a model verdict,
// (c) a quota/dead-provider infra failure removes that provider's rungs for
// the rest of the run (failover, the 2026-07-07 shape), (d) an empty effective
// ladder is an explicit infra-error record, (e) the report carries the
// governor's accounting.

import { describe, it, expect } from "vitest";
import { runExecutor, type ExecutorConfig } from "../src/runtime/executor/runner.js";
import { RunGovernor } from "../src/runtime/executor/governor.js";
import type { RegenerateCommandOptions, RegenerateResult } from "../src/surfaces/commands/regenerate.js";
import type { ModelCaps } from "../src/kernel/schemas/ontology.js";

const LOCAL_CAPS: ModelCaps = { locality: "local", tier: "cheap", cost: "free", openWeights: true };
const CLOUD_CAPS: ModelCaps = { locality: "cloud", tier: "mid", cost: "free", openWeights: true };

const LOCAL = { provider: "ollama" as const, model: "cheap-local", caps: LOCAL_CAPS };
const CLOUD = { provider: "ollama" as const, model: "big-cloud", caps: CLOUD_CAPS };
const CLOUD_B = { provider: "anthropic" as const, model: "frontier", caps: CLOUD_CAPS };

const PASS: Partial<RegenerateResult> = {
  ok: true,
  verdict: "epsilon_equivalent",
  behaviorVerdict: "pass",
  ruleViolations: 0,
  lintIssueCount: 0,
};
const FAIL_DIRTY: Partial<RegenerateResult> = {
  ok: true,
  verdict: "divergent_structural",
  behaviorVerdict: "fail",
  ruleViolations: 0,
  lintIssueCount: 2,
};
const QUOTA_DEAD: Partial<RegenerateResult> = {
  ok: false,
  failure: "cloud quota exhausted: status code 429 too many requests",
  failureKind: "provider" as never,
};

const mockRegen =
  (decideFn: (nodeId: string, opts: RegenerateCommandOptions) => Partial<RegenerateResult>) =>
  async (nodeId: string, opts: RegenerateCommandOptions): Promise<RegenerateResult> => {
    const v = decideFn(nodeId, opts);
    const written = opts.write === true && v.behaviorVerdict === "pass";
    return { nodeId, written, ...v } as RegenerateResult;
  };

describe("RunGovernor (unit)", () => {
  it("filters dead providers always, cloud rungs only after the budget dies", () => {
    const g = new RunGovernor({ maxCloudAttempts: 1 });
    expect(g.effectiveLadder([LOCAL, CLOUD])).toHaveLength(2);
    expect(g.noteAttempt(CLOUD).allowed).toBe(true); // spends 1/1
    expect(g.effectiveLadder([LOCAL, CLOUD]).map((r) => r.model)).toEqual(["cheap-local"]);
    expect(g.noteAttempt(LOCAL).allowed).toBe(true); // local is never budgeted
    expect(g.noteAttempt(CLOUD).allowed).toBe(false);
    expect(g.summary().budgetExhausted).toBe(true);
  });

  it("marks a provider dead only on the dead/exhausted infra family", () => {
    const g = new RunGovernor({});
    g.noteVerdict(CLOUD, { outcome: "behavior-fail", detail: "rate limit mentioned in a draft" });
    expect(g.summary().deadProviders).toHaveLength(0);
    g.noteVerdict(CLOUD, { outcome: "infra-error", detail: "regenerate threw: something odd" });
    expect(g.summary().deadProviders).toHaveLength(0); // infra but not the dead family
    g.noteVerdict(CLOUD, { outcome: "infra-error", detail: "status code 429 quota" });
    expect(g.summary().deadProviders.map((d) => d.provider)).toEqual(["ollama"]);
    expect(g.effectiveLadder([LOCAL, CLOUD, CLOUD_B]).map((r) => r.provider)).toEqual(["anthropic"]);
  });
});

describe("executor under the governor", () => {
  it("budget spends on the first node's escalation; later nodes climb local-only", async () => {
    const regen = mockRegen((_n, opts) => (opts.model === "big-cloud" ? PASS : FAIL_DIRTY));
    const config: ExecutorConfig = {
      focalIds: ["node_A", "node_B"],
      ladder: [LOCAL, CLOUD],
      maxCloudAttempts: 1,
    };
    const report = await runExecutor(config, { edges: [], regenerate: regen });

    const a = report.nodes.find((n) => n.nodeId === "node_A")!;
    const b = report.nodes.find((n) => n.nodeId === "node_B")!;
    // A closed on the cloud rung, spending the whole budget.
    expect(a.terminal).toBe("closed");
    expect(a.closedLocality).toBe("cloud");
    // B never saw a cloud rung: zero cloud attempts, honest local plateau.
    expect(b.attemptsCloud).toBe(0);
    expect(b.terminal).toBe("capacity-ceiling");
    expect(report.governor?.cloudAttemptsUsed).toBe(1);
    expect(report.governor?.maxCloudAttempts).toBe(1);
    expect(report.governor?.budgetExhausted).toBe(true);
  });

  it("a zero budget removes cloud rungs from the very first node (honest local plateau)", async () => {
    const regen = mockRegen(() => FAIL_DIRTY);
    const config: ExecutorConfig = {
      focalIds: ["node_A"],
      ladder: [LOCAL, CLOUD],
      maxCloudAttempts: 0,
    };
    const report = await runExecutor(config, { edges: [], regenerate: regen });
    const a = report.nodes[0];
    expect(a.terminal).toBe("capacity-ceiling"); // climbed local-only, never cut mid-air
    expect(a.attemptsCloud).toBe(0);
    expect(report.governor?.budgetExhausted).toBe(true);
  });

  it("a budget spent MID-CLIMB terminates that node infra-error with the budget detail", async () => {
    const regen = mockRegen(() => FAIL_DIRTY);
    const config: ExecutorConfig = {
      focalIds: ["node_A"],
      ladder: [LOCAL, CLOUD],
      maxCloudAttempts: 1,
    };
    const report = await runExecutor(config, { edges: [], regenerate: regen });
    const a = report.nodes[0];
    // The climb reaches cloud (spends 1/1, still failing), and the NEXT cloud
    // attempt of the same climb is refused — a resource cut, not a verdict.
    expect(a.terminal).toBe("infra-error");
    expect(a.lastDetail).toMatch(/cloud attempt budget exhausted/);
    expect(report.governor?.cloudAttemptsUsed).toBe(1);
  });

  it("a quota death fails over: later nodes skip the dead provider's rungs", async () => {
    const regen = mockRegen((_n, opts) => {
      if (opts.model === "big-cloud") return QUOTA_DEAD; // ollama cloud dies
      if (opts.model === "frontier") return PASS; // anthropic still alive
      return FAIL_DIRTY;
    });
    const config: ExecutorConfig = {
      focalIds: ["node_A", "node_B"],
      ladder: [LOCAL, CLOUD, CLOUD_B],
    };
    const report = await runExecutor(config, { edges: [], regenerate: regen });

    const a = report.nodes.find((n) => n.nodeId === "node_A")!;
    const b = report.nodes.find((n) => n.nodeId === "node_B")!;
    expect(a.terminal).toBe("infra-error"); // the quota hit itself
    expect(report.governor?.deadProviders.map((d) => d.provider)).toEqual(["ollama"]);
    // B's effective ladder excludes EVERY ollama rung (local included — the
    // provider is dead, not the rung) and closes on the anthropic rung.
    expect(b.terminal).toBe("closed");
    expect(b.attempts).toBe(1);
  });

  it("an all-cloud ladder under a zero budget is an explicit infra-error record, not a crash", async () => {
    const regen = mockRegen(() => PASS);
    const report = await runExecutor(
      { focalIds: ["node_A"], ladder: [CLOUD], maxCloudAttempts: 0 },
      { edges: [], regenerate: regen },
    );
    const a = report.nodes[0];
    expect(a.terminal).toBe("infra-error");
    expect(a.attempts).toBe(0);
    expect(a.lastDetail).toMatch(/no dispatchable rungs/);
  });

  it("with no budget and healthy providers the governor is invisible", async () => {
    const regen = mockRegen(() => PASS);
    const config: ExecutorConfig = { focalIds: ["node_A"], ladder: [LOCAL, CLOUD] };
    const report = await runExecutor(config, { edges: [], regenerate: regen });
    expect(report.nodes[0].terminal).toBe("closed");
    expect(report.governor?.maxCloudAttempts).toBeNull();
    expect(report.governor?.cloudAttemptsUsed).toBe(0);
    expect(report.governor?.deadProviders).toHaveLength(0);
    expect(report.governor?.budgetExhausted).toBe(false);
  });
});
