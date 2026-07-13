import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// s(c) record-only wiring (P7, STOCHASTIC_FUNCTORS.md; calibration gated by
// P7_ROUTING_CALIBRATION_2026-07-08). Pins the CONTRACT of the wiring:
//   - the routing signature is SURFACED in `onto ingest --json` when the
//     static classifier is observing (report-only / enabled), and
//   - it is RECORD-ONLY — computing it never changes the dispatched
//     provider/model (acting on s(c) is gated behind the P3 result).
// The semantic mapping (which shape → which mode/profile/tier) is pinned
// separately in routing-signature.test.ts on real code fixtures; the mock
// provider requires the fixture to BE the extraction JSON, so here we only
// assert the surface + record-only invariants.

const VALID_EXTRACTION_JSON = JSON.stringify({
  label: "fixture",
  level: "artifact",
  kind: "artifact",
  manifestation: "code",
  language: "typescript",
  prompt: "A fixture extraction whose text the mock provider echoes back.",
  requires: [],
  provides: [],
  forbids: [],
  rules: [],
});

describe("onto ingest — s(c) record-only routing signature (P7)", () => {
  let tempDir: string;
  let srcFile: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    srcFile = path.join(tempDir, "src", "fixture.ts");
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(srcFile, VALID_EXTRACTION_JSON);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("surfaces routingSignature in --json under report-only, WITHOUT changing dispatch", () => {
    const r = runCli(tempDir, [
      "ingest",
      srcFile,
      "--provider",
      "mock",
      "--dry-run",
      "--json",
      "--static-classifier",
      "report-only",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);

    // The signature is present and well-formed…
    expect(parsed.routingSignature).toBeDefined();
    expect(["core", "truncation_risk", "reexpression_risk"]).toContain(
      parsed.routingSignature.predictedMode,
    );
    expect(typeof parsed.routingSignature.promptProfile).toBe("string");
    expect(["economy", "standard", "frontier"]).toContain(
      parsed.routingSignature.modelTier,
    );
    expect(typeof parsed.routingSignature.exportCount).toBe("number");

    // …but dispatch is RECORD-ONLY: still the provider we asked for, still a
    // dry run, no proposal written.
    expect(parsed.provider).toBe("mock");
    expect(parsed.dryRun).toBe(true);
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const proposals = fs.existsSync(proposalsDir)
      ? fs.readdirSync(proposalsDir)
      : [];
    expect(proposals).toEqual([]);
  });

  it("omits routingSignature when the static classifier is off (default)", () => {
    const r = runCli(tempDir, [
      "ingest",
      srcFile,
      "--provider",
      "mock",
      "--dry-run",
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.routingSignature).toBeUndefined();
  });
});
