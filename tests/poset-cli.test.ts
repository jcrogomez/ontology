import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { hashObject, removeIntegrityHash } from "../src/core/integrity/hash.js";

// Poset enforcement at the CLI boundary.
// Two surfaces are exercised:
//   1. `onto node link` — preventive check at link time.
//   2. `onto validate` — retroactive check on existing edges.

describe("onto node link: poset enforcement", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it("accepts a refines edge that climbs the poset (domain → architecture)", () => {
    expect(runCli(tempDir, ["node", "create", "--level", "architecture", "--kind", "definition", "--prompt", "Arch entity"]).status).toBe(0);
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain entity"]).status).toBe(0);
    // node_0001 = architecture, node_0002 = domain
    const result = runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ONTOLOGY EDGE CREATED");
  });

  it("accepts a same-level refines edge (sibling refinement)", () => {
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain A"]);
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain B"]);
    const result = runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "refines"]);
    expect(result.status).toBe(0);
  });

  it("rejects a refines edge that inverts the poset (canon → domain)", () => {
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain entity"]);
    const result = runCli(tempDir, ["node", "link", "--from", "node_0000_canon", "--to", "node_0001", "--type", "refines"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("abstraction poset");
    expect(result.stderr).toContain("refines");
  });

  it("rejects an inherits_from inversion in --json mode and reports it cleanly", () => {
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain entity"]);
    const result = runCli(tempDir, ["node", "link", "--from", "node_0000_canon", "--to", "node_0001", "--type", "inherits_from", "--json"]);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("abstraction poset");
  });

  it("rejects a belongs_to inversion (project belongs_to artifact)", () => {
    runCli(tempDir, ["node", "create", "--level", "project", "--kind", "definition", "--prompt", "Project node"]);
    runCli(tempDir, ["node", "create", "--level", "artifact", "--kind", "artifact", "--prompt", "Artifact node"]);
    const result = runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "belongs_to"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("belongs_to");
  });

  it("does not constrain depends_on direction", () => {
    runCli(tempDir, ["node", "create", "--level", "architecture", "--kind", "definition", "--prompt", "Arch"]);
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain"]);
    // Either direction should be accepted for depends_on.
    const downward = runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]);
    expect(downward.status).toBe(0);
    // Re-create another pair to test the upward direction without duplicate-edge collision.
    runCli(tempDir, ["node", "create", "--level", "architecture", "--kind", "definition", "--prompt", "Arch2"]);
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain2"]);
    const upward = runCli(tempDir, ["node", "link", "--from", "node_0004", "--to", "node_0003", "--type", "depends_on"]);
    expect(upward.status).toBe(0);
  });

  it("does not constrain documents direction", () => {
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain"]);
    const result = runCli(tempDir, ["node", "link", "--from", "node_0000_canon", "--to", "node_0001", "--type", "documents"]);
    expect(result.status).toBe(0);
  });
});

describe("onto validate: retroactive poset enforcement", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it("flags a hand-crafted inverted refines edge", () => {
    runCli(tempDir, ["node", "create", "--level", "architecture", "--kind", "definition", "--prompt", "Arch"]);
    runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Domain"]);

    // Hand-craft an inverted edge by writing directly to the edges.jsonl file.
    // This simulates a malformed import or a hand-edited graph that escaped
    // the `node link` preventive check.
    const edgesPath = path.join(tempDir, ".ontology/edges.jsonl");
    const statePath = path.join(tempDir, ".ontology/state.json");
    const eventsPath = path.join(tempDir, ".ontology/events.jsonl");

    // Reuse a real edge body shape so only the from/to are inverted on purpose.
    const sampleEdge = {
      edgeId: "edge_deadbeef",
      from: "node_0001", // architecture
      to: "node_0002",   // domain — refines points down: invalid
      type: "refines" as const,
      branch: "main",
      createdAt: new Date().toISOString(),
      createdByEventId: "evt_deadbeef",
      integrity: { schemaVersion: "0.1.0", hash: "" },
    };
    // Hash without integrity.hash, then re-attach. Mirrors the production path.
    const edgeWithoutHash = removeIntegrityHash(sampleEdge);
    const edgeHash = hashObject(edgeWithoutHash);
    sampleEdge.integrity.hash = edgeHash;

    fs.appendFileSync(edgesPath, JSON.stringify(sampleEdge) + "\n");

    // Append a corresponding event so state stays internally consistent and
    // validate's other checks (event chain, edge count) do not drown out the
    // poset failure we are looking for.
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    const newEvent = {
      eventId: "evt_deadbeef",
      sequence: state.eventCount,
      timestamp: sampleEdge.createdAt,
      eventType: "edge_created",
      branch: "main",
      previousEventId: state.lastEventId,
      payload: { action: "edge_created", edgeId: "edge_deadbeef", from: "node_0001", to: "node_0002", type: "refines" },
    };
    fs.appendFileSync(eventsPath, JSON.stringify(newEvent) + "\n");
    state.edgeCount += 1;
    state.eventCount += 1;
    state.lastEventId = "evt_deadbeef";
    state.updatedAt = newEvent.timestamp;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const result = runCli(tempDir, ["validate"]);
    expect(result.status).not.toBe(0);
    const allOutput = `${result.stdout}\n${result.stderr}`;
    expect(allOutput).toContain("abstraction poset");
    expect(allOutput).toContain("edge_deadbeef");
  });
});
