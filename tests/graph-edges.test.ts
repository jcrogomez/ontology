import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

import {
  getOutgoingEdges,
  getIncomingEdges,
  getEdgesByType,
  getNeighbors
} from "../src/runtime/graph/edges.js";

const FIXTURE_EDGES = [
  {
    edgeId: "edge_3",
    from: "node_A",
    to: "node_B",
    type: "inherits_from",
    branch: "main",
    createdAt: "2023-01-03T00:00:00Z",
    createdByEventId: "evt_3",
    integrity: { hash: "hash3", schemaVersion: "1.0" }
  },
  {
    edgeId: "edge_1",
    from: "node_A",
    to: "node_C",
    type: "depends_on",
    branch: "main",
    createdAt: "2023-01-01T00:00:00Z",
    createdByEventId: "evt_1",
    integrity: { hash: "hash1", schemaVersion: "1.0" }
  },
  {
    edgeId: "edge_2",
    from: "node_B",
    to: "node_A",
    type: "depends_on",
    branch: "main",
    createdAt: "2023-01-02T00:00:00Z",
    createdByEventId: "evt_2",
    integrity: { hash: "hash2", schemaVersion: "1.0" }
  },
  {
    edgeId: "edge_4",
    from: "node_A",
    to: "node_B",
    type: "depends_on",
    branch: "main",
    createdAt: "2023-01-03T00:00:00Z",
    createdByEventId: "evt_4",
    integrity: { hash: "hash4", schemaVersion: "1.0" }
  }
];

describe("Graph Edges Runtime", () => {
  let tempDir: string;
  let originalCwd: () => string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-test-"));
    const ontologyDir = path.join(tempDir, ".ontology");
    fs.mkdirSync(ontologyDir, { recursive: true });

    fs.writeFileSync(
      path.join(ontologyDir, "edges.jsonl"),
      FIXTURE_EDGES.map(e => JSON.stringify(e)).join("\n")
    );

    originalCwd = process.cwd;
    process.cwd = () => tempDir;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("getOutgoingEdges returns edges from node", () => {
    const edges = getOutgoingEdges("node_A");
    expect(edges.length).toBe(3);
    // Deterministic sorting check
    expect(edges[0].edgeId).toBe("edge_1");
    expect(edges[1].edgeId).toBe("edge_3");
    expect(edges[2].edgeId).toBe("edge_4");
  });

  it("getIncomingEdges returns edges to node", () => {
    const edges = getIncomingEdges("node_A");
    expect(edges.length).toBe(1);
    expect(edges[0].edgeId).toBe("edge_2");
  });

  it("getEdgesByType filters by type", () => {
    const edges = getEdgesByType("depends_on");
    expect(edges.length).toBe(3);
    // Deterministic sorting check
    expect(edges[0].edgeId).toBe("edge_1");
    expect(edges[1].edgeId).toBe("edge_2");
    expect(edges[2].edgeId).toBe("edge_4");
  });

  it("getNeighbors returns incoming and outgoing edges", () => {
    const neighbors = getNeighbors("node_B");

    expect(neighbors.incoming.length).toBe(2);
    expect(neighbors.incoming[0].edgeId).toBe("edge_3");
    expect(neighbors.incoming[1].edgeId).toBe("edge_4");

    expect(neighbors.outgoing.length).toBe(1);
    expect(neighbors.outgoing[0].edgeId).toBe("edge_2");
  });

  it("edge queries return deterministic ordering", () => {
    const edges = getOutgoingEdges("node_A");
    expect(edges.map(e => e.edgeId)).toEqual(["edge_1", "edge_3", "edge_4"]);
  });

  it("edge queries return empty arrays when no edges exist", () => {
    expect(getOutgoingEdges("node_X")).toEqual([]);
    expect(getIncomingEdges("node_X")).toEqual([]);
    expect(getEdgesByType("superseded")).toEqual([]);
    expect(getNeighbors("node_X")).toEqual({ incoming: [], outgoing: [] });
  });

  it("edge queries do not mutate .ontology", () => {
    const statBefore = fs.statSync(path.join(tempDir, ".ontology", "edges.jsonl"));
    const hashBefore = fs.readFileSync(path.join(tempDir, ".ontology", "edges.jsonl"), "utf-8");

    getOutgoingEdges("node_A");
    getIncomingEdges("node_B");
    getEdgesByType("depends_on");
    getNeighbors("node_A");

    const statAfter = fs.statSync(path.join(tempDir, ".ontology", "edges.jsonl"));
    const hashAfter = fs.readFileSync(path.join(tempDir, ".ontology", "edges.jsonl"), "utf-8");

    expect(statBefore.mtimeMs).toBe(statAfter.mtimeMs);
    expect(hashBefore).toBe(hashAfter);
  });
});
