import { describe, it, expect } from "vitest";
import {
  composeEdgeApplication,
  type ResolvedEdgeSpec,
} from "../src/kernel/graph/apply-edges-to-copy.js";
import type { OntologyState } from "../src/kernel/schemas/ontology.js";

function baseState(overrides?: Partial<OntologyState>): OntologyState {
  return {
    initialized: true,
    schemaVersion: "0.1.0",
    projectName: "test",
    rootNodeId: "node_0000_canon",
    activeBranch: "main",
    nodeCount: 5,
    edgeCount: 0,
    eventCount: 10,
    lastEventId: "evt_initial",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// Counter-based id minter — deterministic, no fs / crypto / Date.now.
function counterMinter(): () => string {
  let i = 0;
  return () => `id${String(i++).padStart(4, "0")}`;
}

const FIXED_TS = "2026-05-22T12:00:00.000Z";

describe("composeEdgeApplication — empty input", () => {
  it("returns no edges/events and an unchanged state (modulo updatedAt)", () => {
    const state = baseState();
    const result = composeEdgeApplication({
      resolvedEdges: [],
      state,
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    expect(result.edges).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.newState.edgeCount).toBe(state.edgeCount);
    expect(result.newState.eventCount).toBe(state.eventCount);
    expect(result.newState.lastEventId).toBe(state.lastEventId);
    expect(result.newState.updatedAt).toBe(FIXED_TS);
  });
});

describe("composeEdgeApplication — single edge", () => {
  const spec: ResolvedEdgeSpec = {
    fromNodeId: "node_0001",
    toNodeId: "node_0002",
    type: "depends_on",
  };

  it("produces one valid edge with deterministic edgeId + hash", () => {
    const result = composeEdgeApplication({
      resolvedEdges: [spec],
      state: baseState(),
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    expect(result.edges).toHaveLength(1);
    const edge = result.edges[0]!;
    expect(edge.edgeId).toBe("edge_id0000");
    expect(edge.from).toBe("node_0001");
    expect(edge.to).toBe("node_0002");
    expect(edge.type).toBe("depends_on");
    expect(edge.branch).toBe("main");
    expect(edge.createdAt).toBe(FIXED_TS);
    expect(edge.integrity.schemaVersion).toBe("0.1.0");
    // Hash must be present and look like a sha256 hex digest.
    expect(edge.integrity.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces an edge_created event with correct sequence + prev id", () => {
    const result = composeEdgeApplication({
      resolvedEdges: [spec],
      state: baseState({ eventCount: 10, lastEventId: "evt_xyz" }),
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.eventType).toBe("edge_created");
    expect(event.sequence).toBe(10); // starts at previous eventCount
    expect(event.previousEventId).toBe("evt_xyz");
    expect(event.timestamp).toBe(FIXED_TS);
    expect(event.payload.edgeId).toBe(result.edges[0]!.edgeId);
    expect(event.payload.from).toBe("node_0001");
    expect(event.payload.to).toBe("node_0002");
  });

  it("updates state.edgeCount, state.eventCount, and state.lastEventId", () => {
    const state = baseState({ edgeCount: 3, eventCount: 10 });
    const result = composeEdgeApplication({
      resolvedEdges: [spec],
      state,
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    expect(result.newState.edgeCount).toBe(4);
    expect(result.newState.eventCount).toBe(11);
    expect(result.newState.lastEventId).toBe(result.events[0]!.eventId);
  });
});

describe("composeEdgeApplication — chaining", () => {
  it("threads sequence numbers and previousEventId across multiple edges", () => {
    const specs: ResolvedEdgeSpec[] = [
      { fromNodeId: "node_a", toNodeId: "node_b", type: "depends_on" },
      { fromNodeId: "node_b", toNodeId: "node_c", type: "uses_token" },
      { fromNodeId: "node_a", toNodeId: "node_c", type: "depends_on" },
    ];
    const result = composeEdgeApplication({
      resolvedEdges: specs,
      state: baseState({ eventCount: 100, lastEventId: "evt_root" }),
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    expect(result.events.map((e) => e.sequence)).toEqual([100, 101, 102]);
    expect(result.events[0]!.previousEventId).toBe("evt_root");
    expect(result.events[1]!.previousEventId).toBe(result.events[0]!.eventId);
    expect(result.events[2]!.previousEventId).toBe(result.events[1]!.eventId);
    expect(result.newState.lastEventId).toBe(result.events[2]!.eventId);
    expect(result.newState.eventCount).toBe(103);
    expect(result.newState.edgeCount).toBe(3);
  });
});

describe("composeEdgeApplication — provenance + branch", () => {
  it("propagates the spec's provenance into the event payload", () => {
    const result = composeEdgeApplication({
      resolvedEdges: [
        {
          fromNodeId: "node_a",
          toNodeId: "node_b",
          type: "depends_on",
          provenance: {
            inferredBy: "static-typescript",
            tokens: ["foo", "bar"],
            fromFile: "src/a.ts",
            toFile: "src/b.ts",
          },
        },
      ],
      state: baseState(),
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    const payload = result.events[0]!.payload;
    expect(payload.inferredBy).toBe("static-typescript");
    expect(payload.tokens).toEqual(["foo", "bar"]);
    expect(payload.fromFile).toBe("src/a.ts");
  });

  it("honours an explicit branch override on the edge", () => {
    const result = composeEdgeApplication({
      resolvedEdges: [
        { fromNodeId: "node_a", toNodeId: "node_b", type: "depends_on" },
      ],
      state: baseState({ activeBranch: "main" }),
      branch: "feature/x",
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    expect(result.edges[0]!.branch).toBe("feature/x");
    expect(result.events[0]!.branch).toBe("feature/x");
    // activeBranch on the new state must still be "main" — branch override
    // is a per-call decision, not a project-wide switch.
    expect(result.newState.activeBranch).toBe("main");
  });
});

describe("composeEdgeApplication — determinism", () => {
  it("identical inputs produce byte-identical outputs", () => {
    const specs: ResolvedEdgeSpec[] = [
      { fromNodeId: "node_a", toNodeId: "node_b", type: "depends_on" },
      { fromNodeId: "node_b", toNodeId: "node_c", type: "uses_token" },
    ];
    const r1 = composeEdgeApplication({
      resolvedEdges: specs,
      state: baseState(),
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    const r2 = composeEdgeApplication({
      resolvedEdges: specs,
      state: baseState(),
      mintId: counterMinter(),
      timestamp: FIXED_TS,
    });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
