import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "../../helpers/temp-project.js";
import { runCli } from "../../helpers/run-cli.js";

// Builds a tiny fixture network so we can exercise both node-level filters
// (kind, abstraction, status) and edge-level filters (hasIncoming /
// hasOutgoing) in the same suite. The structure mirrors the one used in
// tests/graph-cli.test.ts so anyone hopping between files sees the same
// shape.
function setupFixture(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "First domain"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "rule", "--prompt", "Domain rule"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "workflow", "--kind", "decision", "--prompt", "A decision"]).status).toBe(0);
  // node_0001 refines canon (rule -> canon makes the rule reachable via refines incoming).
  // node_0002 (rule) refines node_0001 — gives node_0001 an incoming refines edge.
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0003", "--to", "node_0001", "--type", "depends_on"]).status).toBe(0);
}

describe("onto query", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); setupFixture(tempDir); });
  afterEach(() => cleanupTempProject(tempDir));

  it("--json with --kind returns matching nodes", () => {
    const r = runCli(tempDir, ["query", "--kind", "rule", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.shape).toEqual({ kind: ["rule"] });
    expect(parsed.count).toBe(1);
    expect(parsed.nodes[0].id).toBe("node_0002");
    expect(parsed.nodes[0].kind).toBe("rule");
  });

  it("--kind accepts comma-separated values (any-of)", () => {
    const r = runCli(tempDir, ["query", "--kind", "rule,decision", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.count).toBe(2);
    expect(new Set(parsed.nodes.map((n: any) => n.id))).toEqual(new Set(["node_0002", "node_0003"]));
  });

  it("--has-incoming filters nodes by inbound edge type", () => {
    const r = runCli(tempDir, ["query", "--has-incoming", "refines", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // node_0001 has an incoming refines edge from node_0002.
    // canon also has an incoming refines edge (the implicit one if any) — let's not assume,
    // just assert that node_0001 is in the result.
    const ids = new Set(parsed.nodes.map((n: any) => n.id));
    expect(ids.has("node_0001")).toBe(true);
  });

  it("--has-outgoing filters nodes by outbound edge type", () => {
    const r = runCli(tempDir, ["query", "--has-outgoing", "depends_on", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const ids = parsed.nodes.map((n: any) => n.id);
    expect(ids).toContain("node_0003");
  });

  it("--shape JSON literal overrides per-field flags", () => {
    const shape = JSON.stringify({ kind: ["entity"] });
    const r = runCli(tempDir, ["query", "--shape", shape, "--kind", "rule", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // The shape says entity; the per-field --kind=rule must be ignored.
    expect(parsed.nodes.every((n: any) => n.kind === "entity")).toBe(true);
  });

  it("--shape-file reads a shape from disk", () => {
    const shapePath = path.join(tempDir, "shape.json");
    fs.writeFileSync(shapePath, JSON.stringify({ kind: ["rule"] }));
    const r = runCli(tempDir, ["query", "--shape-file", shapePath, "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.count).toBe(1);
    expect(parsed.nodes[0].kind).toBe("rule");
  });

  it("rejects --shape and --shape-file used together", () => {
    const shapePath = path.join(tempDir, "shape.json");
    fs.writeFileSync(shapePath, JSON.stringify({}));
    const r = runCli(tempDir, ["query", "--shape", "{}", "--shape-file", shapePath]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("mutually exclusive");
  });

  it("rejects malformed --shape JSON", () => {
    const r = runCli(tempDir, ["query", "--shape", "{kind:rule}"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not valid JSON");
  });

  it("rejects an unknown enum value with a clear error", () => {
    const r = runCli(tempDir, ["query", "--kind", "not_a_kind"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid query shape");
  });

  it("rejects unknown shape fields (.strict())", () => {
    const r = runCli(tempDir, ["query", "--shape", JSON.stringify({ bogus: 1 })]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid query shape");
  });

  it("empty shape returns every node sorted by id", () => {
    const r = runCli(tempDir, ["query", "--shape", "{}", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const ids = parsed.nodes.map((n: any) => n.id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("human output uses the === ONTOLOGY ... === header", () => {
    const r = runCli(tempDir, ["query", "--kind", "rule"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("=== ONTOLOGY QUERY (representable) ===");
  });

  it("does NOT mutate .ontology", () => {
    const stateBefore = fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8");
    runCli(tempDir, ["query", "--kind", "rule"]);
    const stateAfter = fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8");
    expect(stateAfter).toBe(stateBefore);
  });
});
