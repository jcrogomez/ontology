import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

describe("onto propose node", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it("creates a pending proposal record and surfaces the id", () => {
    const result = runCli(tempDir, [
      "propose", "node",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "Harvest entity",
    ]);
    expect(result.status).toBe(0);
    const match = result.stdout.match(/Proposal:\s+(proposal_\d{4})/);
    expect(match).not.toBeNull();
    const id = match![1];
    const filePath = path.join(tempDir, ".ontology/proposals", `${id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(stored.status).toBe("pending");
    expect(stored.mutation.kind).toBe("node_create");
  });

  it("--json mode returns parseable output with proposal id, status, hash", () => {
    const result = runCli(tempDir, [
      "propose", "node",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "Harvest entity",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.proposal.id).toMatch(/^proposal_\d{4}$/);
    expect(parsed.proposal.status).toBe("pending");
    expect(parsed.proposal.mutationKind).toBe("node_create");
    expect(parsed.proposal.hash).toMatch(/^proposal:hash:/);
    expect(parsed.event.eventType).toBe("proposal_created");
  });

  it("appends a proposal_created event to events.jsonl", () => {
    runCli(tempDir, [
      "propose", "node",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "Harvest entity",
    ]);
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8");
    expect(events).toContain("\"eventType\":\"proposal_created\"");
  });

  it("does NOT create a real node (no .ontology/nodes mutation)", () => {
    const before = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    runCli(tempDir, [
      "propose", "node",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "Harvest entity",
    ]);
    const after = fs.readdirSync(path.join(tempDir, ".ontology/nodes")).sort();
    expect(after).toEqual(before);
  });

  it("captures the parent's current hash so future apply can detect staleness", () => {
    // Default parent is the root canon. Resolve its hash and verify the
    // proposal stores it verbatim in mutation.parentHash.
    const canonPath = path.join(tempDir, ".ontology/nodes/node_0000_canon.json");
    const canon = JSON.parse(fs.readFileSync(canonPath, "utf-8"));
    const result = runCli(tempDir, [
      "propose", "node",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "Test",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const id = JSON.parse(result.stdout).proposal.id;
    const stored = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8")
    );
    expect(stored.mutation.parentHash).toBe(canon.integrity.hash);
  });

  it("rejects an invalid level", () => {
    const result = runCli(tempDir, [
      "propose", "node",
      "--level", "imaginary",
      "--kind", "entity",
      "--prompt", "x",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid level");
  });

  it("rejects an unknown parent node id", () => {
    const result = runCli(tempDir, [
      "propose", "node",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "x",
      "--parent", "node_does_not_exist",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Parent node not found");
  });

  it("--rationale is recorded under provenance", () => {
    const result = runCli(tempDir, [
      "propose", "node",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "x",
      "--rationale", "because the canon implies it",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const id = JSON.parse(result.stdout).proposal.id;
    const stored = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${id}.json`), "utf-8")
    );
    expect(stored.provenance.rationale).toBe("because the canon implies it");
  });

  it("two proposals get sequential ids", () => {
    const r1 = runCli(tempDir, ["propose", "node", "--level", "domain", "--kind", "entity", "--prompt", "a", "--json"]);
    const r2 = runCli(tempDir, ["propose", "node", "--level", "domain", "--kind", "entity", "--prompt", "b", "--json"]);
    const id1 = JSON.parse(r1.stdout).proposal.id;
    const id2 = JSON.parse(r2.stdout).proposal.id;
    expect(id1).toBe("proposal_0001");
    expect(id2).toBe("proposal_0002");
  });

  it("validate is unaffected by an outstanding pending proposal", () => {
    runCli(tempDir, ["propose", "node", "--level", "domain", "--kind", "entity", "--prompt", "x"]);
    const v = runCli(tempDir, ["validate"]);
    expect(v.status).toBe(0);
  });
});
