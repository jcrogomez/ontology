import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// `onto replay` — MATHEMATICAL_CLAIMS.md §4.4. The law pinned here:
//   replay(history(state)) === state
// for every log-derived field (initialized, schemaVersion, projectName,
// rootNodeId, activeBranch, nodeCount, edgeCount, eventCount, lastEventId),
// over a real mutation history. Wall-clock fields (createdAt/updatedAt) are
// excluded by design (written from `new Date()` at write time, not from the
// log). Chain integrity (sequence + previousEventId) is verified in the same
// fold, and --write is the recovery primitive.

describe("onto replay (events.jsonl → state.json law)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  const statePath = () => path.join(tempDir, ".ontology/state.json");
  const readStateFile = () => JSON.parse(fs.readFileSync(statePath(), "utf-8"));

  const createNode = (prompt: string): string => {
    const r = runCli(tempDir, [
      "node", "create", "--level", "domain", "--kind", "entity", "--prompt", prompt,
    ]);
    expect(r.status).toBe(0);
    return (r.stdout + r.stderr).match(/node_\d{4}/)![0];
  };

  it("a fresh init replays to its own state (incl. projectName from the genesis payload)", () => {
    const r = runCli(tempDir, ["replay", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.divergences).toEqual([]);
    expect(parsed.chainViolations).toEqual([]);
    expect(parsed.warnings).toEqual([]); // genesis carries projectName since 2026-06-09
    expect(parsed.replayed.nodeCount).toBe(1); // the canon
    expect(parsed.replayed.rootNodeId).toBe("node_0000_canon");
  });

  it("THE LAW: a real mutation history (nodes, edge, proposal apply, edge remove) replays exactly", () => {
    const a = createNode("first");
    const b = createNode("second");
    const link = runCli(tempDir, [
      "node", "link", "--from", a, "--to", b, "--type", "depends_on",
    ]);
    expect(link.status).toBe(0);
    const edgeId = (link.stdout + link.stderr).match(/edge_[0-9a-f]{8}/)![0];

    // A proposal lifecycle (created + applied events).
    const propose = runCli(tempDir, [
      "propose", "node", "--level", "domain", "--kind", "entity", "--prompt", "proposed",
      "--json",
    ]);
    expect(propose.status).toBe(0);
    const proposalId = JSON.parse(propose.stdout).proposal.id;
    expect(runCli(tempDir, ["proposal", "apply", proposalId, "--json"]).status).toBe(0);

    // An edge removal (the only decrementing fold rule).
    expect(runCli(tempDir, ["edge", "remove", edgeId, "--json"]).status).toBe(0);

    const r = runCli(tempDir, ["replay", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.divergences).toEqual([]);
    expect(parsed.chainViolations).toEqual([]);

    // And the replayed fold equals the on-disk summary field-by-field.
    const state = readStateFile();
    expect(parsed.replayed.nodeCount).toBe(state.nodeCount);
    expect(parsed.replayed.edgeCount).toBe(state.edgeCount);
    expect(parsed.replayed.eventCount).toBe(state.eventCount);
    expect(parsed.replayed.lastEventId).toBe(state.lastEventId);
  });

  it("detects a hand-mangled state.json and --write repairs it from the log", () => {
    createNode("real");
    // Tamper: bump nodeCount out from under the log.
    const state = readStateFile();
    state.nodeCount += 7;
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));

    const check = runCli(tempDir, ["replay", "--json"]);
    expect(check.status).not.toBe(0);
    const parsed = JSON.parse(check.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.divergences.map((d: { field: string }) => d.field)).toContain("nodeCount");

    // Recovery primitive: rebuild from the log, then the law holds again.
    expect(runCli(tempDir, ["replay", "--write", "--json"]).status).toBe(0);
    expect(runCli(tempDir, ["replay", "--json"]).status).toBe(0);
    expect(readStateFile().nodeCount).toBe(state.nodeCount - 7);
  });

  it("detects a broken chain (tampered previousEventId) and refuses --write", () => {
    createNode("x");
    const eventsPath = path.join(tempDir, ".ontology/events.jsonl");
    const lines = fs.readFileSync(eventsPath, "utf-8").trim().split("\n");
    const second = JSON.parse(lines[1]);
    second.previousEventId = "evt_deadbeef"; // break the link
    lines[1] = JSON.stringify(second);
    fs.writeFileSync(eventsPath, lines.join("\n") + "\n");

    const r = runCli(tempDir, ["replay", "--json"]);
    expect(r.status).not.toBe(0);
    expect(JSON.parse(r.stdout).chainViolations.length).toBeGreaterThan(0);

    // A replay of a broken log must not be trusted as a repair source.
    const write = runCli(tempDir, ["replay", "--write", "--json"]);
    expect(write.status).not.toBe(0);
    expect(JSON.parse(write.stdout).written).toBe(false);
  });
});
