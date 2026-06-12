import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// `onto drift` end-to-end: Merkle change-detection over the compiled
// shadows. Uses the same mock-ingest fixture pattern as
// graph-infer-edges-cli.test.ts so applied nodes carry outputs.files —
// the leaf set drift hashes.

function makeFixtureProject(tempDir: string): string {
  const srcDir = path.join(tempDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "a.ts"),
    [
      `export function alpha(): number { return 1; }`,
      `/* mock-fixture`,
      JSON.stringify({
        label: "alpha",
        level: "unit",
        kind: "rule",
        prompt: "Alpha helper.",
        provides: ["alpha"],
      }),
      `*/`,
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(srcDir, "b.ts"),
    [
      `export function beta(): number { return 2; }`,
      `/* mock-fixture`,
      JSON.stringify({
        label: "beta",
        level: "unit",
        kind: "rule",
        prompt: "Beta helper.",
        provides: ["beta"],
      }),
      `*/`,
    ].join("\n"),
  );
  return srcDir;
}

function applyAllProposals(tempDir: string): void {
  const proposalsDir = path.join(tempDir, ".ontology/proposals");
  const proposalIds = fs
    .readdirSync(proposalsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  for (const id of proposalIds) {
    expect(runCli(tempDir, ["proposal", "apply", id, "--json"]).status).toBe(0);
  }
}

function driftJson(tempDir: string, ...args: string[]): any {
  const r = runCli(tempDir, ["drift", ...args, "--json"]);
  const parsed = JSON.parse(r.stdout);
  return { status: r.status, ...parsed };
}

describe("onto drift — Merkle over compiled shadows", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const srcDir = makeFixtureProject(tempDir);
    expect(
      runCli(tempDir, ["ingest", srcDir, "--provider", "mock", "--json"]).status,
    ).toBe(0);
    applyAllProposals(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("without an anchor it reports the tree and suggests --update", () => {
    const r = driftJson(tempDir);
    expect(r.status).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.report.anchor).toBeNull();
    expect(r.report.drifted).toBeNull();
    expect(r.report.leafCount).toBe(2);
    expect(r.report.anchored).toBe(false);
  });

  it("--update anchors, appends a drift_anchored event, and a re-run is clean", () => {
    const anchor = driftJson(tempDir, "--update");
    expect(anchor.status).toBe(0);
    expect(anchor.report.anchored).toBe(true);
    expect(
      fs.existsSync(path.join(tempDir, ".ontology/drift/snapshot.json")),
    ).toBe(true);

    const events = fs
      .readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const anchored = events.filter((e) => e.eventType === "drift_anchored");
    expect(anchored.length).toBe(1);
    expect(anchored[0].payload.rootHash).toBe(anchor.report.rootHash);
    expect(anchored[0].payload.leafCount).toBe(2);

    // The event chain must still replay cleanly.
    const replay = runCli(tempDir, ["replay", "--json"]);
    expect(replay.status).toBe(0);
    expect(JSON.parse(replay.stdout).ok).toBe(true);

    const clean = driftJson(tempDir);
    expect(clean.report.drifted).toBe(false);
    expect(clean.report.changedNodeIds).toEqual([]);
  });

  it("editing one shadow reports exactly that file and its node", () => {
    expect(driftJson(tempDir, "--update").status).toBe(0);

    fs.appendFileSync(path.join(tempDir, "src/b.ts"), "\n// drifted\n");

    const r = driftJson(tempDir);
    expect(r.status).toBe(0);
    expect(r.report.drifted).toBe(true);
    expect(r.report.changed).toEqual(["src/b.ts"]);
    expect(r.report.added).toEqual([]);
    expect(r.report.removed).toEqual([]);
    expect(r.report.changedNodeIds.length).toBe(1);

    // The reported node really is the one whose outputs.files[0] is b.ts.
    const nodeId = r.report.changedNodeIds[0];
    const node = JSON.parse(
      fs.readFileSync(path.join(tempDir, `.ontology/nodes/${nodeId}.json`), "utf-8"),
    );
    expect(node.outputs.files[0]).toContain("b.ts");
  });

  it("a deleted shadow surfaces as changed + missing, and re-anchoring clears it", () => {
    expect(driftJson(tempDir, "--update").status).toBe(0);
    fs.rmSync(path.join(tempDir, "src/a.ts"));

    const r = driftJson(tempDir);
    expect(r.report.drifted).toBe(true);
    expect(r.report.changed).toEqual(["src/a.ts"]);
    expect(r.report.missing).toEqual(["src/a.ts"]);

    // Re-anchor: the missing state becomes the baseline.
    expect(driftJson(tempDir, "--update").status).toBe(0);
    const clean = driftJson(tempDir);
    expect(clean.report.drifted).toBe(false);
    expect(clean.report.missing).toEqual(["src/a.ts"]);
  });

  it("--fail-on-drift exits 1 only when drifted", () => {
    expect(driftJson(tempDir, "--update").status).toBe(0);
    expect(runCli(tempDir, ["drift", "--fail-on-drift", "--json"]).status).toBe(0);

    fs.appendFileSync(path.join(tempDir, "src/a.ts"), "\n// drifted\n");
    expect(runCli(tempDir, ["drift", "--fail-on-drift", "--json"]).status).toBe(1);
  });

  it("human output suggests the verify-homeomorphism subset command", () => {
    expect(driftJson(tempDir, "--update").status).toBe(0);
    fs.appendFileSync(path.join(tempDir, "src/a.ts"), "\n// drifted\n");

    const r = runCli(tempDir, ["drift"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("verify-homeomorphism --nodes");
  });

  it("fails cleanly outside an initialised project", () => {
    const bare = createTempProject();
    try {
      const r = runCli(bare, ["drift", "--json"]);
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).ok).toBe(false);
    } finally {
      cleanupTempProject(bare);
    }
  });
});
