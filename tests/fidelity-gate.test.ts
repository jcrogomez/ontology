import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  loadAggregateReport,
  synthesizeBakeoff,
  type BakeoffArm,
} from "../src/laws/bakeoff-synthesis.js";

// Deterministic, $0 regression guard over the COMMITTED ε arm corpus.
//
// HONESTY: this does not re-run any LLM. It reads the recorded
// verify-homeomorphism reports from the Move 3α run and asserts the scoring
// machinery + the recorded numbers don't regress. It guards (a) the Jaccard
// /verdict math in synthesizeBakeoff, and (b) the integrity of the committed
// corpus — NOT live fidelity (a live measurement needs a real model).

const REPO_ROOT = path.resolve(__dirname, "..");
const CLI_PATH = path.join(REPO_ROOT, "dist", "cli.js");

const ARM_FILES = {
  A: ".ontology.self-ingest-epsilon-3a-arm-a.json",
  "A0-control": ".ontology.self-ingest-epsilon-3a-arm-a0.json",
  B: ".ontology.self-ingest-epsilon-3a-arm-b.json",
  "C-local": ".ontology.self-ingest-epsilon-3a-arm-c-local.json",
} as const;

function armPath(file: string): string {
  return path.join(REPO_ROOT, file);
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

describe("fidelity gate (recorded ε corpus regression guard)", () => {
  beforeAll(() => {
    for (const f of Object.values(ARM_FILES)) {
      if (!fs.existsSync(armPath(f))) {
        throw new Error(`Committed arm report missing: ${f}`);
      }
    }
  });

  it("the recorded corpus holds the pre-registered floor and the grounding lift", () => {
    const arms: BakeoffArm[] = [
      { label: "A", report: loadAggregateReport(armPath(ARM_FILES.A)) },
      { label: "A0-control", report: loadAggregateReport(armPath(ARM_FILES["A0-control"])) },
    ];
    const s = synthesizeBakeoff(arms, { h1JaccardFloor: 0.1 });

    const a = s.arms[0].meanStructuralJaccard;
    const a0 = s.arms[1].meanStructuralJaccard;
    expect(a).not.toBeNull();
    expect(a0).not.toBeNull();

    // Recorded: A=0.5808, A0=0.2262, lift 0.3546. Pin with margin.
    expect(a as number).toBeGreaterThanOrEqual(0.5);
    expect(a0 as number).toBeGreaterThanOrEqual(0.18);
    // The Move 3α headline: AST grounding contributes Δ ≈ +0.355 mean Jaccard.
    expect((a as number) - (a0 as number)).toBeGreaterThanOrEqual(0.3);

    // Baseline clears the pre-registered H1 floor.
    expect(s.h1.perArm[0].passes).toBe(true);
  });

  it("the comparison arms (B granite, C-local starcoder) are recorded as low — a real finding, not a bug", () => {
    const arms: BakeoffArm[] = [
      { label: "B", report: loadAggregateReport(armPath(ARM_FILES.B)) },
      { label: "C-local", report: loadAggregateReport(armPath(ARM_FILES["C-local"])) },
    ];
    const s = synthesizeBakeoff(arms, { h1JaccardFloor: 0.1 });
    // Both collapsed (~0 mean Jaccard); this is why the gate targets the
    // baseline arm, not all arms, by default.
    expect((s.arms[0].meanStructuralJaccard ?? 0)).toBeLessThan(0.1);
    expect((s.arms[1].meanStructuralJaccard ?? 0)).toBeLessThan(0.1);
  });

  // ── CLI gate (exit codes) ────────────────────────────────────────────────

  function gateArgs(extra: string[]): string[] {
    return [
      "bakeoff",
      `A=${ARM_FILES.A}`,
      `A0-control=${ARM_FILES["A0-control"]}`,
      `B=${ARM_FILES.B}`,
      `C-local=${ARM_FILES["C-local"]}`,
      ...extra,
    ];
  }

  it("default gate (baseline) at the 0.1 floor PASSES (exit 0)", () => {
    if (!fs.existsSync(CLI_PATH)) throw new Error("dist/cli.js not found — run `npm run build`.");
    const r = runCli(gateArgs(["--min-jaccard", "0.1"]));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Fidelity gate PASSED/);
  });

  it("gate FAILS (exit 1) when the baseline floor is set above the recorded value", () => {
    const r = runCli(gateArgs(["--min-jaccard", "0.9"]));
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/Fidelity gate FAILED/);
  });

  it("--gate-all FAILS (exit 1) because B and C-local are below the floor", () => {
    const r = runCli(gateArgs(["--gate-all", "--min-jaccard", "0.1"]));
    expect(r.status).not.toBe(0);
  });
});
