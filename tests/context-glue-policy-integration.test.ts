// O2 first consumer (integration) — the identify-if-equal gluing policy over
// the REAL context-assembly path (CONTEXT_GLUING_REGIMES.md O2 → O3 wiring).
//
// Two edge-neighbour nodes that provide the SAME key with an identical
// syntactic signature (the kind O1's static extractor populates) are assembled
// into one context. Under the default policy they conflict (duplicate_provider,
// the separated presheaf); under `identify-if-equal` they glue (the sheaf on
// the equal-signature subcategory). A divergent signature still conflicts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { assembleContext } from "../src/runtime/context/assembler.js";
import { buildFragment } from "../src/runtime/context/presheaf.js";
import { glueFragments } from "../src/runtime/context/gluing.js";
import type { OntologyNode, OntologyEdge } from "../src/kernel/schemas/ontology.js";

describe("identify-if-equal gluing over assembled context (O2 consumer)", () => {
  let cwd: string;

  const node = (
    over: Partial<OntologyNode> & { id: string },
  ): OntologyNode =>
    ({
      label: over.id,
      kind: "component",
      status: "valid",
      coordinates: {
        abstraction: "unit",
        time: 1,
        branch: "main",
        plane: "semantic",
        manifestation: "intent",
      },
      inputs: [],
      prompt: { raw: `${over.id} prompt`, variables: {}, language: "en" },
      model: { ref: "mock" },
      processors: { pre: [], post: [] },
      context: { requires: [], provides: [], forbids: [], optional: [] },
      graph: { parentId: null, orbitOf: null },
      rules: [],
      technical: {},
      outputs: {},
      integrity: { hash: "hash", schemaVersion: "1.0" },
      ...over,
    }) as OntologyNode;

  const edge = (
    over: Partial<OntologyEdge> & {
      edgeId: string;
      from: string;
      to: string;
      type: OntologyEdge["type"];
    },
  ): OntologyEdge =>
    ({
      branch: "main",
      createdAt: "2026-06-09T00:00:00.000Z",
      createdByEventId: "evt_0000",
      integrity: { hash: "hash", schemaVersion: "1.0" },
      ...over,
    }) as OntologyEdge;

  // Build a project: canon → target, with target depends_on two providers of
  // key "A". `p2Signature` lets a test make the second provider agree or drift.
  function setup(p2Signature: string): void {
    cwd = createTempProject();
    fs.mkdirSync(path.join(cwd, ".ontology", "nodes"), { recursive: true });
    const state = {
      initialized: true,
      schemaVersion: "1.0",
      projectName: "Glue Policy",
      rootNodeId: "node_0000_canon",
      activeBranch: "main",
      nodeCount: 4,
      edgeCount: 2,
      eventCount: 0,
      lastEventId: "evt_0000",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    };
    fs.writeFileSync(path.join(cwd, ".ontology", "state.json"), JSON.stringify(state));
    fs.writeFileSync(path.join(cwd, ".ontology", "events.jsonl"), "");

    const nodes: OntologyNode[] = [
      node({
        id: "node_0000_canon",
        kind: "canon",
        coordinates: { abstraction: "canon", time: 0, branch: "main", plane: "semantic", manifestation: "intent" },
      }),
      node({
        id: "node_0001_target",
        graph: { parentId: "node_0000_canon", orbitOf: null },
      }),
      node({
        id: "node_0002_p1",
        graph: { parentId: "node_0000_canon", orbitOf: null },
        context: {
          requires: [],
          provides: [{ key: "A", nodeType: "declared", signature: "(): number" }],
          forbids: [],
          optional: [],
        },
      }),
      node({
        id: "node_0003_p2",
        graph: { parentId: "node_0000_canon", orbitOf: null },
        context: {
          requires: [],
          provides: [{ key: "A", nodeType: "declared", signature: p2Signature }],
          forbids: [],
          optional: [],
        },
      }),
    ];
    for (const n of nodes) {
      fs.writeFileSync(path.join(cwd, ".ontology", "nodes", `${n.id}.json`), JSON.stringify(n, null, 2));
    }
    const edges: OntologyEdge[] = [
      edge({ edgeId: "edge_0001", from: "node_0001_target", to: "node_0002_p1", type: "depends_on" }),
      edge({ edgeId: "edge_0002", from: "node_0001_target", to: "node_0003_p2", type: "depends_on" }),
    ];
    fs.writeFileSync(
      path.join(cwd, ".ontology", "edges.jsonl"),
      edges.map((e) => JSON.stringify(e)).join("\n"),
    );
  }

  afterEach(() => cleanupTempProject(cwd));

  const glueAssembled = (policy: "conflict" | "identify-if-equal") => {
    const assembled = assembleContext(
      {
        targetNodeId: "node_0001_target",
        mode: "strict",
        includeEdges: true,
        edgeTypes: ["depends_on"],
      },
      cwd,
    );
    // Both providers must be present for the policy to matter.
    const ids = assembled.nodes.map((n) => n.id);
    expect(ids).toContain("node_0002_p1");
    expect(ids).toContain("node_0003_p2");
    return glueFragments(assembled.nodes.map(buildFragment), { onDuplicateProvider: policy });
  };

  it("default conflicts on the two providers; identify-if-equal glues them (equal signature)", () => {
    setup("(): number"); // p2 agrees with p1
    const def = glueAssembled("conflict");
    expect(def.ok).toBe(false);
    expect(def.conflicts.map((c) => c.type)).toContain("duplicate_provider");

    const sheaf = glueAssembled("identify-if-equal");
    expect(sheaf.ok).toBe(true);
    expect(sheaf.conflicts).toHaveLength(0);
    expect(sheaf.merged.provides).toContain("A");
  });

  it("identify-if-equal still conflicts when the signatures diverge (drift caught)", () => {
    setup("(): string"); // p2 drifts from p1's "(): number"
    const sheaf = glueAssembled("identify-if-equal");
    expect(sheaf.ok).toBe(false);
    expect(sheaf.conflicts.map((c) => c.type)).toContain("duplicate_provider");
  });
});
