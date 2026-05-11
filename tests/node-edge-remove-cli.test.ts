import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Integrated coverage for the plasticity primitives §5 + §6:
//   • onto node remove <id>      — refuses if edges reference it
//   • onto edge remove <edgeId>  — drops the edge, rewrites edges.jsonl atomically
//   • onto edge update <edgeId>  — re-classifies an edge's type in place

function setupTwoNodesOneEdge(cwd: string): void {
  expect(runCli(cwd, ["init"]).status).toBe(0);
  expect(runCli(cwd, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "A"]).status).toBe(0);
  expect(runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "B"]).status).toBe(0);
  // node_0001 refines canon, node_0002 refines node_0001.
  expect(runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(cwd, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
}

describe("onto node remove + onto edge remove + onto edge update", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempProject();
    setupTwoNodesOneEdge(cwd);
  });

  afterEach(() => cleanupTempProject(cwd));

  describe("onto node remove", () => {
    it("refuses when the node has incident edges and lists them", () => {
      const r = runCli(cwd, ["node", "remove", "node_0001"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("incident edge");
      // Both edges (incoming from node_0002 and outgoing to canon) must be listed.
      expect(r.stderr).toMatch(/node_0001.*refines.*node_0000_canon/);
      expect(r.stderr).toMatch(/node_0002.*refines.*node_0001/);
    });

    it("refuses --json variant emits ok:false with the incident edges list", () => {
      const r = runCli(cwd, ["node", "remove", "node_0001", "--json"]);
      expect(r.status).toBe(1);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.incidentEdges).toHaveLength(2);
      expect(parsed.incidentEdges.every((e: { type: string }) => e.type === "refines")).toBe(true);
    });

    it("happy path: delete edges first, then remove the node", () => {
      // List edges so we know their ids.
      const edges = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      const incident = edges.filter((e: { from: string; to: string }) => e.from === "node_0001" || e.to === "node_0001");
      for (const e of incident) {
        expect(runCli(cwd, ["edge", "remove", e.edgeId]).status).toBe(0);
      }
      // Now remove the node.
      const r = runCli(cwd, ["node", "remove", "node_0001", "--json"]);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.nodeId).toBe("node_0001");
      expect(fs.existsSync(path.join(cwd, ".ontology", "nodes", "node_0001.json"))).toBe(false);

      // node_removed event landed.
      const evs = fs.readFileSync(path.join(cwd, ".ontology", "events.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      expect(evs.some((e: { eventType: string; payload: { nodeId: string } }) => e.eventType === "node_removed" && e.payload.nodeId === "node_0001")).toBe(true);
    });

    it("exits 1 when the node does not exist", () => {
      const r = runCli(cwd, ["node", "remove", "node_ghost"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Node not found");
    });
  });

  describe("onto edge remove", () => {
    it("removes an edge by id, emits edge_removed, rewrites edges.jsonl without the entry", () => {
      const edgesBefore = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      const target = edgesBefore.find((e: { from: string; to: string }) => e.from === "node_0002" && e.to === "node_0001");
      expect(target).toBeDefined();

      const r = runCli(cwd, ["edge", "remove", target.edgeId, "--json"]);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.edgeId).toBe(target.edgeId);

      const edgesAfter = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      expect(edgesAfter).toHaveLength(edgesBefore.length - 1);
      expect(edgesAfter.find((e: { edgeId: string }) => e.edgeId === target.edgeId)).toBeUndefined();

      const evs = fs.readFileSync(path.join(cwd, ".ontology", "events.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      const last = evs[evs.length - 1];
      expect(last.eventType).toBe("edge_removed");
      expect(last.payload.edgeId).toBe(target.edgeId);
    });

    it("exits 1 when the edge does not exist", () => {
      const r = runCli(cwd, ["edge", "remove", "edge_does_not_exist"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Edge not found");
    });

    it("project validates after an edge removal (state.edgeCount stays consistent)", () => {
      const edges = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      runCli(cwd, ["edge", "remove", edges[0].edgeId]);
      const v = runCli(cwd, ["validate"]);
      expect(v.status).toBe(0);
    });
  });

  describe("onto edge update", () => {
    it("re-classifies an edge's type in place and re-hashes", () => {
      const edges = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      const target = edges.find((e: { from: string; to: string }) => e.from === "node_0002" && e.to === "node_0001");
      const oldHash = target.integrity.hash;

      const r = runCli(cwd, ["edge", "update", target.edgeId, "--type", "depends_on", "--json"]);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.oldType).toBe("refines");
      expect(parsed.newType).toBe("depends_on");
      expect(parsed.oldHash).toBe(oldHash);
      expect(parsed.newHash).not.toBe(oldHash);

      const after = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      const refreshed = after.find((e: { edgeId: string }) => e.edgeId === target.edgeId);
      expect(refreshed.type).toBe("depends_on");
      expect(refreshed.integrity.hash).toBe(parsed.newHash);
    });

    it("rejects an unknown --type", () => {
      const edges = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      const r = runCli(cwd, ["edge", "update", edges[0].edgeId, "--type", "imaginary_type"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Invalid --type");
    });

    it("exits 1 when the edge does not exist", () => {
      const r = runCli(cwd, ["edge", "update", "edge_ghost", "--type", "depends_on"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Edge not found");
    });

    it("project validates after an edge update (the rewrite is consistent)", () => {
      const edges = fs.readFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "utf-8")
        .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      runCli(cwd, ["edge", "update", edges[0].edgeId, "--type", "depends_on"]);
      const v = runCli(cwd, ["validate"]);
      expect(v.status).toBe(0);
    });
  });
});
