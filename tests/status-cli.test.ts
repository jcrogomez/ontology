import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto status` — read-only graph health for the sync loop. It
// composes shadow/fixture presence + static rule cleanliness + `onto drift` +
// `onto ficha audit`. Writes nothing, runs no fixtures. See SYNC_LOOP_SPEC §4.

const SHADOW_REL = "src/hello.py";

function patchNode(tempDir: string, nodeId: string, mutate: (n: Record<string, unknown>) => void): void {
  const p = path.join(tempDir, ".ontology/nodes", `${nodeId}.json`);
  const n = JSON.parse(fs.readFileSync(p, "utf-8"));
  mutate(n);
  fs.writeFileSync(p, JSON.stringify(n, null, 2));
}

// An artifact node with a code shadow on disk (mirrors an ingested node).
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

function writeFixture(tempDir: string, nodeId: string): void {
  const dir = path.join(tempDir, "tests/behavior-fixtures");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${nodeId}.fixture.ts`), "export const cases = [];\n");
}

function status(tempDir: string): { status: number | null; report: any } {
  const r = runCli(tempDir, ["status", "--json"]);
  return { status: r.status, report: JSON.parse(r.stdout).report };
}

describe("onto status", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("classifies a shadow node with no fixture as lower-confidence (not core)", () => {
    setupShadowNode(tempDir, 'print("hello world")');
    const { status: code, report } = status(tempDir);
    expect(code).toBe(0);
    expect(report.trackable).toBe(1);
    expect(report.core).toBe(0);
    expect(report.lowerConfidence).toBe(1);
    expect(report.withFixture).toBe(0);
  });

  it("counts a node with shadow + fixture + clean rules as core", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    writeFixture(tempDir, id);
    const { report } = status(tempDir);
    expect(report.core).toBe(1);
    expect(report.lowerConfidence).toBe(0);
    expect(report.withFixture).toBe(1);
  });

  it("classifies a node with a static rule violation as blocked, even with a fixture", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    writeFixture(tempDir, id);
    // FORBID: hello — "hello" is present in the source → static violation.
    patchNode(tempDir, id, (n) => {
      n.rules = ["FORBID: hello"];
    });
    const { report } = status(tempDir);
    expect(report.blocked).toBe(1);
    expect(report.core).toBe(0);
    const node = report.nodes.find((x: any) => x.nodeId === id);
    expect(node.ruleViolations).toBeGreaterThan(0);
  });

  it("reports no drift baseline until one is anchored, then tracks drift", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');

    // No anchor yet.
    expect(status(tempDir).report.drift.hasAnchor).toBe(false);

    // Anchor → drifted 0.
    expect(runCli(tempDir, ["drift", "--update"]).status).toBe(0);
    let report = status(tempDir).report;
    expect(report.drift.hasAnchor).toBe(true);
    expect(report.drift.drifted).toBe(0);

    // Mutate the shadow on disk → drifted 1.
    fs.writeFileSync(path.join(tempDir, SHADOW_REL), 'print("changed")');
    report = status(tempDir).report;
    expect(report.drift.drifted).toBe(1);
    expect(report.nodes.find((x: any) => x.nodeId === id).drifted).toBe(true);
  });

  it("its drift + ficha counts agree with the underlying commands (AC4)", () => {
    setupShadowNode(tempDir, 'print("hello world")');
    expect(runCli(tempDir, ["drift", "--update"]).status).toBe(0);
    fs.writeFileSync(path.join(tempDir, SHADOW_REL), 'print("changed")');

    const report = status(tempDir).report;

    // Drift count agrees with `onto drift --json`.
    const drift = JSON.parse(runCli(tempDir, ["drift", "--json"]).stdout).report;
    expect(report.drift.drifted).toBe(drift.changedNodeIds.length);

    // Ficha counts agree with `onto ficha audit --json`.
    const audit = JSON.parse(runCli(tempDir, ["ficha", "audit", "--json"]).stdout);
    expect(report.ficha.underDeclared).toBe(audit.nodesWithMissingExports);
    expect(report.ficha.missingExports).toBe(audit.totalMissingExports);
    expect(report.ficha.proseRules).toBe(audit.totalProseRulesOnCodeNodes);
  });

  it("errors (exit 1) when there is no .ontology", () => {
    const r = runCli(tempDir, ["status", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });

  it("renders a human dashboard with the tiers", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    writeFixture(tempDir, id);
    const r = runCli(tempDir, ["status", "--list"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("graph health");
    expect(r.stdout).toContain("syncable core:");
    expect(r.stdout).toContain("fixtures:");
    expect(r.stdout).toContain("ficha:");
  });
});
