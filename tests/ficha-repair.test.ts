import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  buildRepairSystemPrompt,
  buildRepairUserPrompt,
  parseRepairResponse,
  checkRepairBudget,
} from "../src/runtime/executor/repair-prompt.js";
import { runFichaRepair, resolveRepair, type RepairConfig, type RepairDeps } from "../src/runtime/executor/repair.js";
import { fichaHashFor } from "../src/runtime/executor/precedents.js";
import { loadProposal, listProposals } from "../src/kernel/core/proposals/persist.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";
import type { RegenerateResult } from "../src/surfaces/commands/regenerate.js";
import type { LlmResponse } from "../src/runtime/llm/types.js";

// The A1 ficha-repair lever (MVP_REGEN_LOOP.md §4.2). Contract under test:
// (a) R_strict physically cannot receive the reference source (laundering
// guard throws at build time), (b) the guards (parse, injected-text budget,
// unchanged-ficha) DISCARD candidates before any proposal exists, (c) a
// successful run leaves a pending node_update proposal + a chained
// repair_proposed event and mutates NOTHING, (d) promotion applies the
// proposal and the fork hash PREDICTED the promoted ficha's identity,
// (e) discard rejects and records, with the node untouched.

const REPAIRED = { prompt: "Repaired: greet with locale-aware casing", rules: ["greeting must be locale-aware"] };
const asResponse = (text: string): LlmResponse => ({ text, model: "test-repairer", provider: "mock" }) as unknown as LlmResponse;

describe("repair-prompt (pure)", () => {
  const inputs = {
    nodeId: "node_0001",
    fichaPrompt: "Greet the user",
    rules: ["be polite"],
    contract: { requires: [], provides: ["greet"], forbids: [] },
    oracle: [{ name: "greets by name", description: "greet('a') includes 'a'" }],
    failingCases: [{ name: "greets by name", diagnostic: "returned constant string" }],
    missingExports: ["greet"],
    extraExports: [],
  };

  it("R_strict throws when handed a reference source (laundering guard)", () => {
    expect(() => buildRepairUserPrompt("R_strict", { ...inputs, referenceSource: "export const x = 1" })).toThrow(
      /laundering/i,
    );
  });

  it("R_perm embeds the source; R_strict prompt never mentions one", () => {
    const perm = buildRepairUserPrompt("R_perm", { ...inputs, referenceSource: "export function greet() {}" });
    expect(perm).toContain("export function greet() {}");
    const strict = buildRepairUserPrompt("R_strict", inputs);
    expect(strict).not.toContain("Reference implementation");
    expect(strict).toContain("greets by name");
    expect(buildRepairSystemPrompt("R_strict")).toContain("do NOT see the reference implementation");
  });

  it("parses fenced and bare JSON, rejects garbage and empty prompts", () => {
    expect(parseRepairResponse('```json\n{"prompt":"p","rules":["r"]}\n```')).toEqual({ prompt: "p", rules: ["r"] });
    expect(parseRepairResponse('noise {"prompt":"p"} noise')).toEqual({ prompt: "p", rules: [] });
    expect(parseRepairResponse("no json here")).toBeNull();
    expect(parseRepairResponse('{"prompt":""}')).toBeNull();
    expect(parseRepairResponse('{"rules":["r"]}')).toBeNull();
  });

  it("budget counts ADDED chars only — shrinking repairs are free", () => {
    const orig = { prompt: "12345", rules: ["abc"] };
    expect(checkRepairBudget(orig, { prompt: "1234567890", rules: ["abc"] }, 4).withinBudget).toBe(false);
    expect(checkRepairBudget(orig, { prompt: "1234567890", rules: ["abc"] }, 5).withinBudget).toBe(true);
    expect(checkRepairBudget(orig, { prompt: "1", rules: [] }, 0).withinBudget).toBe(true);
  });
});

describe("runFichaRepair (orchestration, scripted deps)", () => {
  let tempDir: string;
  const nodeId = "node_0001";

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    expect(
      runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greet the user"]).status,
    ).toBe(0);
  });
  afterEach(() => cleanupTempProject(tempDir));

  const drawResult = (outcomes: Array<Array<{ name: string; outcome: string }>>): RegenerateResult =>
    ({
      ok: true,
      nodeId,
      written: false,
      behaviorVerdict: "fail",
      draws: outcomes.length,
      draftSummary: outcomes.map((cases, i) => ({
        i,
        behaviorVerdict: "fail" as const,
        acceptable: false,
        caseOutcomes: cases,
      })),
    }) as unknown as RegenerateResult;

  const failing = [
    [{ name: "a", outcome: "divergent" }],
    [{ name: "a", outcome: "divergent" }],
    [{ name: "a", outcome: "divergent" }],
  ];
  const passing = [
    [{ name: "a", outcome: "match" }],
    [{ name: "a", outcome: "match" }],
    [{ name: "a", outcome: "match" }],
  ];

  const config: RepairConfig = { nodeId, operator: "R_strict", provider: "mock", draws: 3, cwd: undefined as unknown as string };

  const deps = (script: { parent: RegenerateResult; fork?: RegenerateResult; response: string }): RepairDeps => {
    let call = 0;
    return {
      regenerate: async (_id, opts) => {
        call += 1;
        if (opts.fichaOverride) {
          expect(opts.write).not.toBe(true);
          return script.fork ?? script.parent;
        }
        return script.parent;
      },
      dispatch: async () => asResponse(script.response),
    };
  };

  it("happy path: proposal + repair_proposed event + flip diff, node untouched", async () => {
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult(failing), fork: drawResult(passing), response: JSON.stringify(REPAIRED) }),
    );
    expect(report.ok).toBe(true);
    expect(report.diff?.wrongToRight.map((f) => f.name)).toEqual(["a"]);
    expect(report.diff?.meetsDrawFloor).toBe(true);

    // Proposal exists, pending, carrying the repaired ficha.
    const proposal = loadProposal(report.proposalId!, tempDir);
    expect(proposal?.status).toBe("pending");
    expect(proposal?.mutation.kind).toBe("node_update");
    expect((proposal?.mutation.payload as { prompt?: string }).prompt).toBe(REPAIRED.prompt);

    // The audit event chained, pointing at the proposal.
    const events = fs
      .readFileSync(path.join(tempDir, ".ontology", "events.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { eventType: string; payload: { proposalId?: string } });
    const proposed = events.filter((e) => e.eventType === "repair_proposed");
    expect(proposed).toHaveLength(1);
    expect(proposed[0].payload.proposalId).toBe(report.proposalId);

    // The live node is NOT mutated (human-gated).
    expect(loadNodeById(nodeId, tempDir)?.prompt.raw).toBe("Greet the user");
    expect(fichaHashFor(nodeId, tempDir)).toBe(report.parentFichaHash);
  });

  it("a busted budget discards BEFORE any proposal exists", async () => {
    const huge = { prompt: "x".repeat(5000), rules: [] };
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult(failing), response: JSON.stringify(huge) }),
    );
    expect(report.ok).toBe(false);
    expect(report.failedStage).toBe("budget");
    expect(listProposals(tempDir)).toHaveLength(0);
  });

  it("an unparseable repairer response discards without proposing", async () => {
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult(failing), response: "sorry, cannot help" }),
    );
    expect(report.ok).toBe(false);
    expect(report.failedStage).toBe("parse");
    expect(listProposals(tempDir)).toHaveLength(0);
  });

  it("a repairer that returns the ficha unchanged is rejected (nothing to evaluate)", async () => {
    const unchanged = { prompt: "Greet the user", rules: [] };
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult(failing), response: JSON.stringify(unchanged) }),
    );
    expect(report.ok).toBe(false);
    expect(report.failedStage).toBe("parse");
    expect(report.detail).toMatch(/unchanged/);
  });

  it("a parent that already passes reports parentAlreadyPasses and stops", async () => {
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult(passing), response: JSON.stringify(REPAIRED) }),
    );
    expect(report.ok).toBe(false);
    expect(report.parentAlreadyPasses).toBe(true);
    expect(listProposals(tempDir)).toHaveLength(0);
  });

  it("a parent with no evaluated cases refuses (no oracle → no measurable repair)", async () => {
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult([[], [], []]), response: JSON.stringify(REPAIRED) }),
    );
    expect(report.ok).toBe(false);
    expect(report.failedStage).toBe("baseline");
  });

  it("promote applies the proposal and the fork hash PREDICTED the promoted identity", async () => {
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult(failing), fork: drawResult(passing), response: JSON.stringify(REPAIRED) }),
    );
    expect(report.ok).toBe(true);

    const resolved = resolveRepair({
      proposalId: report.proposalId!,
      decision: "promote",
      spec: {
        nodeId,
        parentFichaHash: report.parentFichaHash!,
        forkFichaHash: report.forkFichaHash!,
        operator: "R_strict",
        rung: 0,
      },
      diff: report.diff,
      cwd: tempDir,
    });
    expect(resolved.ok).toBe(true);

    // The node now carries the repaired ficha…
    const node = loadNodeById(nodeId, tempDir);
    expect(node?.prompt.raw).toBe(REPAIRED.prompt);
    expect(node?.rules).toEqual(REPAIRED.rules);
    // …and its live ficha hash equals the fork hash computed BEFORE apply —
    // the counterfactual evaluated exactly the identity that was promoted.
    expect(fichaHashFor(nodeId, tempDir)).toBe(report.forkFichaHash);

    const events = fs
      .readFileSync(path.join(tempDir, ".ontology", "events.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { eventType: string });
    expect(events.some((e) => e.eventType === "repair_promoted")).toBe(true);
  });

  it("discard rejects the proposal, records the event, node untouched", async () => {
    const report = await runFichaRepair(
      { ...config, cwd: tempDir },
      deps({ parent: drawResult(failing), fork: drawResult(passing), response: JSON.stringify(REPAIRED) }),
    );
    const resolved = resolveRepair({
      proposalId: report.proposalId!,
      decision: "discard",
      spec: {
        nodeId,
        parentFichaHash: report.parentFichaHash!,
        forkFichaHash: report.forkFichaHash!,
        operator: "R_strict",
        rung: 0,
      },
      diff: report.diff,
      cwd: tempDir,
    });
    expect(resolved.ok).toBe(true);
    expect(loadProposal(report.proposalId!, tempDir)?.status).toBe("rejected");
    expect(loadNodeById(nodeId, tempDir)?.prompt.raw).toBe("Greet the user");
  });
});
