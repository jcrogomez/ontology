// Ladder economics — the executor's oracle-routing accounting.
//
// Pins the measured-facts contract of docs/design/proposals/LADDER_ECONOMICS.md:
// every attempt records wall-clock + rung locality, every NodeRecord aggregates
// them, and ExecReport.economics derives the local-coverage share (the project's
// analogue of the Stanford "intelligence per watt" local-coverage number — with
// deterministic gates instead of a probabilistic router). No dollars, no watts:
// time and locality only.

import { describe, it, expect } from "vitest";
import { runExecutor, type ExecutorConfig, type ExecutorDeps } from "../src/runtime/executor/runner.js";
import { rungLocality, resolveLadder, DEFAULT_PREMISE } from "../src/runtime/executor/model-ladder.js";
import { buildReport } from "../src/runtime/executor/report.js";
import type { RegenerateCommandOptions, RegenerateResult } from "../src/surfaces/commands/regenerate.js";
import type { ModelCaps, OntologyModel } from "../src/kernel/schemas/ontology.js";

const LOCAL_CAPS: ModelCaps = { locality: "local", tier: "cheap", cost: "free", openWeights: true };
const CLOUD_CAPS: ModelCaps = { locality: "cloud", tier: "mid", cost: "free", openWeights: true };

// A caps-annotated two-rung ladder: local 7B → cloud open model.
const LADDER = [
  { provider: "ollama" as const, model: "cheap-local", caps: LOCAL_CAPS },
  { provider: "ollama" as const, model: "big-cloud", caps: CLOUD_CAPS },
];

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

function mockRegen(
  decideFn: (nodeId: string, opts: RegenerateCommandOptions) => Partial<RegenerateResult>,
): ExecutorDeps["regenerate"] {
  return async (nodeId, opts) => {
    const v = decideFn(nodeId, opts);
    const written = opts.write === true && v.behaviorVerdict === "pass";
    return { nodeId, written, ...v } as RegenerateResult;
  };
}

describe("rung locality", () => {
  it("explicit caps win over the provider heuristic", () => {
    expect(rungLocality(LADDER[1])).toBe("cloud"); // ollama provider, cloud caps
    expect(rungLocality({ provider: "ollama", model: "x" })).toBe("local"); // heuristic
    expect(rungLocality({ provider: "anthropic", model: "x" })).toBe("cloud");
  });

  it("resolveLadder attaches the caps it ordered by", () => {
    const registry: { models: OntologyModel[] } = {
      models: [
        {
          id: "cloud-open",
          provider: "ollama",
          name: "big:480b-cloud",
          temperature: 0.2,
          multimodal: false,
          caps: CLOUD_CAPS,
        } as OntologyModel,
        {
          id: "local-7b",
          provider: "ollama",
          name: "small:7b",
          temperature: 0.2,
          multimodal: false,
          caps: LOCAL_CAPS,
        } as OntologyModel,
      ],
    };
    const ladder = resolveLadder(DEFAULT_PREMISE, registry);
    expect(ladder.map((r) => rungLocality(r))).toEqual(["local", "cloud"]);
    expect(ladder.every((r) => r.caps !== undefined)).toBe(true);
  });
});

describe("executor ladder economics", () => {
  it("a node closed at the local rung counts as local coverage", async () => {
    const config: ExecutorConfig = { focalIds: ["node_A"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: mockRegen(() => PASS) });

    const rec = report.nodes[0];
    expect(rec.closedLocality).toBe("local");
    expect(rec.attemptsLocal).toBe(1);
    expect(rec.attemptsCloud).toBe(0);
    expect(rec.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.economics.closedLocal).toBe(1);
    expect(report.economics.closedCloud).toBe(0);
    expect(report.economics.localCloseShare).toBe(1);
  });

  it("an escalated close counts as cloud, with the attempt split preserved", async () => {
    const regen = mockRegen((_n, opts) => (opts.model === "big-cloud" ? PASS : FAIL_DIRTY));
    const config: ExecutorConfig = { focalIds: ["node_B"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: regen });

    const rec = report.nodes[0];
    expect(rec.terminal).toBe("closed");
    expect(rec.closedLocality).toBe("cloud"); // κ* rung is the cloud rung
    // generate(local) + refine(local) failed, escalate(cloud) passed
    expect(rec.attemptsLocal).toBe(2);
    expect(rec.attemptsCloud).toBe(1);
    expect(report.economics.localCloseShare).toBe(0); // 0 of 1 closed locally
    expect(report.economics.attemptsLocal).toBe(2);
    expect(report.economics.attemptsCloud).toBe(1);
  });

  it("a never-closed node has null locality and does not enter the share", async () => {
    const config: ExecutorConfig = { focalIds: ["node_C"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: mockRegen(() => FAIL_DIRTY) });

    const rec = report.nodes[0];
    expect(rec.terminal).not.toBe("closed");
    expect(rec.closedLocality).toBeNull();
    expect(rec.attemptsLocal + rec.attemptsCloud).toBe(rec.attempts);
    expect(report.economics.localCloseShare).toBeNull(); // nothing closed
  });

  it("every attempt records a duration and the node total is their sum", async () => {
    const regen = mockRegen((_n, opts) => (opts.model === "big-cloud" ? PASS : FAIL_DIRTY));
    const config: ExecutorConfig = { focalIds: ["node_D"], ladder: LADDER };
    const report = await runExecutor(config, { edges: [], regenerate: regen });

    const rec = report.nodes[0];
    const durations = rec.decisions.length; // sanity: we did attempt
    expect(durations).toBeGreaterThan(0);
    expect(rec.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.economics.totalDurationMs).toBe(
      report.nodes.reduce((s, n) => s + n.totalDurationMs, 0),
    );
  });

  it("buildReport with zero records yields an empty, non-crashing economics block", () => {
    const report = buildReport([]);
    expect(report.economics.totalDurationMs).toBe(0);
    expect(report.economics.localCloseShare).toBeNull();
  });
});
