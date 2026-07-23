import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  fireRepairFromWalker,
  isRepairProposal,
  resolveRepairProposalFromWalker,
} from "../src/surfaces/walker/actions/repair-from-walker.js";
import { runFichaRepair, type RepairDeps } from "../src/runtime/executor/repair.js";
import { createProposal, loadProposal } from "../src/kernel/core/proposals/persist.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";
import type { RegenerateResult } from "../src/surfaces/commands/regenerate.js";
import type { LlmResponse } from "../src/runtime/llm/types.js";

// Walker wiring of the repair lever (MVP_REGEN_LOOP.md §4.3). Contract under
// test: (a) the proposals panel can TELL a repair proposal from an ordinary
// node_update (event-backed, not just the rationale string), (b) resolving
// through the walker path applies/rejects AND records the repair audit event,
// (c) the single-key fire folds failures into a proc label instead of throwing.

const nodeId = "node_0001";
const REPAIRED = { prompt: "Repaired prompt", rules: ["r1"] };

const drawResult = (outcome: string): RegenerateResult =>
  ({
    ok: true,
    nodeId,
    written: false,
    behaviorVerdict: outcome === "match" ? "pass" : "fail",
    draws: 3,
    draftSummary: [0, 1, 2].map((i) => ({
      i,
      behaviorVerdict: "fail" as const,
      acceptable: false,
      caseOutcomes: [{ name: "a", outcome }],
    })),
  }) as unknown as RegenerateResult;

const scriptedDeps: RepairDeps = {
  regenerate: async (_id, opts) => (opts.fichaOverride ? drawResult("match") : drawResult("divergent")),
  dispatch: async () => ({ text: JSON.stringify(REPAIRED), model: "m", provider: "mock" }) as unknown as LlmResponse,
};

describe("walker repair wiring", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    expect(
      runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greet the user"]).status,
    ).toBe(0);
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("tells a repair proposal from an ordinary node_update", async () => {
    const report = await runFichaRepair({ nodeId, operator: "R_strict", provider: "mock", cwd: tempDir }, scriptedDeps);
    expect(report.ok).toBe(true);
    const repairProposal = loadProposal(report.proposalId!, tempDir)!;
    expect(isRepairProposal(repairProposal, tempDir)).toBe(true);

    // An ordinary walker-draft update — same mutation kind, no repair event.
    const node = loadNodeById(nodeId, tempDir)!;
    const { proposal: plain } = createProposal({
      mutation: { kind: "node_update", payload: { nodeId, prompt: "hand edit" }, nodeHash: node.integrity.hash },
      source: null,
      validation: null,
      provenance: { derivedFrom: [nodeId], rationale: "drafted in walker (in-place update)" },
      cwd: tempDir,
    });
    expect(isRepairProposal(plain, tempDir)).toBe(false);
  });

  it("panel promote applies the ficha AND records repair_promoted", async () => {
    const report = await runFichaRepair({ nodeId, operator: "R_strict", provider: "mock", cwd: tempDir }, scriptedDeps);
    const r = resolveRepairProposalFromWalker(report.proposalId!, "promote", tempDir);
    expect(r.ok).toBe(true);
    expect(loadNodeById(nodeId, tempDir)?.prompt.raw).toBe(REPAIRED.prompt);
    const types = fs
      .readFileSync(path.join(tempDir, ".ontology", "events.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => (JSON.parse(l) as { eventType: string }).eventType);
    expect(types).toContain("repair_promoted");
  });

  it("panel discard rejects AND records repair_discarded, node untouched", async () => {
    const report = await runFichaRepair({ nodeId, operator: "R_strict", provider: "mock", cwd: tempDir }, scriptedDeps);
    const r = resolveRepairProposalFromWalker(report.proposalId!, "discard", tempDir);
    expect(r.ok).toBe(true);
    expect(loadProposal(report.proposalId!, tempDir)?.status).toBe("rejected");
    expect(loadNodeById(nodeId, tempDir)?.prompt.raw).toBe("Greet the user");
    const types = fs
      .readFileSync(path.join(tempDir, ".ontology", "events.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => (JSON.parse(l) as { eventType: string }).eventType);
    expect(types).toContain("repair_discarded");
  });

  it("resolving a non-repair proposal through the repair path refuses cleanly", () => {
    const node = loadNodeById(nodeId, tempDir)!;
    const { proposal } = createProposal({
      mutation: { kind: "node_update", payload: { nodeId, prompt: "hand edit" }, nodeHash: node.integrity.hash },
      source: null,
      validation: null,
      provenance: { derivedFrom: [nodeId], rationale: "drafted in walker (in-place update)" },
      cwd: tempDir,
    });
    const r = resolveRepairProposalFromWalker(proposal.id, "promote", tempDir);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no repair_proposed event/);
    expect(loadProposal(proposal.id, tempDir)?.status).toBe("pending"); // untouched
  });

  it("the single-key fire folds a failed repair into a proc label, never throws", async () => {
    // The real pipeline on a node with no shadow/fixture fails at baseline —
    // the fire must surface that as a red proc, not an exception.
    const res = await fireRepairFromWalker(nodeId, { provider: "mock", cwd: tempDir });
    expect(res.ok).toBe(false);
    expect(res.label).toMatch(/baseline/);
  });
});
