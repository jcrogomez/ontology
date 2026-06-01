// Axiom 5 — presheaf / sheaf rigor pins.
//
// MATHEMATICAL_CLAIMS.md §Axiom 5 ("Presheaf context") was T2: the
// fragments-and-gluing structure is real and used everywhere, but no test
// pinned the *presheaf-restriction law* or characterised what kind of object
// `glueFragments` actually is. This file closes that gap on two fronts:
//
//   Part 1 — Restriction law on `assembleContext` (the named T1 gate from
//   §6 item 2). A presheaf F: Open(graph)^op → Set must have restriction maps
//   F(U) → F(V) for V ⊆ U that are coherent. We model the "open set" as the
//   set of edge-types that decide which neighbours are pulled into context.
//   For edge-type sets S' ⊆ S we assert F(S') ⊑ F(S): the context assembled
//   against the smaller neighbourhood is a substructure of the larger one,
//   and the always-present parent-chain base is identical. That pins the
//   restriction law in test form (T2 → T1 for the restriction half).
//
//   Part 2 — Sheaf characterisation of `glueFragments`. The honest question
//   is whether gluing is a *sheaf* (agreeing local sections glue to a unique
//   global one) or merely a *separated presheaf* (sections are uniquely
//   determined, but the gluing axiom does not hold). We pin the precise
//   answer rather than assume it: the separation axiom HOLDS (duplicate
//   providers are rejected, not silently identified), the merge is
//   order-independent (a real coherence law), incompatibility is an
//   obstruction to gluing — but the gluing axiom FAILS for agreeing sections
//   (two fragments that both provide the same key conflict instead of
//   gluing). Conclusion, asserted as tests: glueFragments is a separated
//   presheaf with provider-uniqueness, NOT a sheaf. This is the honest
//   characterisation the §Axiom 5 ledger entry anticipated ("a
//   coproduct-with-coherence-checks rather than a colimit").

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { assembleContext } from "../src/runtime/context/assembler.js";
import { glueFragments } from "../src/runtime/context/gluing.js";
import type { ContextFragment } from "../src/runtime/context/presheaf.js";
import type { OntologyNode, OntologyEdge } from "../src/schemas/ontology.js";

// ---------------------------------------------------------------------------
// Part 1 — Restriction law on assembleContext
// ---------------------------------------------------------------------------

describe("Axiom 5 — presheaf restriction law on assembleContext", () => {
  let cwd: string;

  const node = (over: Partial<OntologyNode> & { id: string }): OntologyNode =>
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
      context: { requires: [], forbids: [], optional: [] },
      graph: { parentId: null, orbitOf: null },
      rules: [],
      technical: {},
      outputs: {},
      integrity: { hash: "hash", schemaVersion: "1.0" },
      ...over,
    }) as OntologyNode;

  const edge = (over: Partial<OntologyEdge> & { edgeId: string; from: string; to: string; type: OntologyEdge["type"] }): OntologyEdge =>
    ({
      branch: "main",
      createdAt: "2026-06-01T00:00:00.000Z",
      createdByEventId: "evt_0000",
      integrity: { hash: "hash", schemaVersion: "1.0" },
      ...over,
    }) as OntologyEdge;

  beforeEach(() => {
    cwd = createTempProject();
    fs.mkdirSync(path.join(cwd, ".ontology", "nodes"), { recursive: true });

    const state = {
      initialized: true,
      schemaVersion: "1.0",
      projectName: "Restriction Law",
      rootNodeId: "node_0000_canon",
      activeBranch: "main",
      nodeCount: 5,
      edgeCount: 2,
      eventCount: 0,
      lastEventId: "evt_0000",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    fs.writeFileSync(path.join(cwd, ".ontology", "state.json"), JSON.stringify(state));
    fs.writeFileSync(path.join(cwd, ".ontology", "events.jsonl"), "");

    const nodes: OntologyNode[] = [
      node({
        id: "node_0000_canon",
        kind: "canon",
        coordinates: { abstraction: "canon", time: 0, branch: "main", plane: "semantic", manifestation: "intent" },
        rules: ["1. Everything is a node."],
      }),
      node({
        id: "node_0001_ancestor",
        kind: "rule",
        coordinates: { abstraction: "architecture", time: 1, branch: "main", plane: "semantic", manifestation: "intent" },
        graph: { parentId: "node_0000_canon", orbitOf: null },
        rules: ["1. Rules must be followed."],
      }),
      node({
        id: "node_0002_target",
        graph: { parentId: "node_0001_ancestor", orbitOf: null },
        rules: [],
      }),
      // Neighbour reached only by a depends_on edge.
      node({
        id: "node_0003_dep",
        graph: { parentId: "node_0000_canon", orbitOf: null },
        rules: ["Dependency neighbour rule"],
      }),
      // Neighbour reached only by a validates_against edge.
      node({
        id: "node_0004_val",
        graph: { parentId: "node_0000_canon", orbitOf: null },
        rules: ["Validation neighbour rule"],
      }),
    ];
    for (const n of nodes) {
      fs.writeFileSync(path.join(cwd, ".ontology", "nodes", `${n.id}.json`), JSON.stringify(n, null, 2));
    }

    const edges: OntologyEdge[] = [
      edge({ edgeId: "edge_dep", from: "node_0002_target", to: "node_0003_dep", type: "depends_on" }),
      edge({ edgeId: "edge_val", from: "node_0002_target", to: "node_0004_val", type: "validates_against" }),
    ];
    fs.writeFileSync(path.join(cwd, ".ontology", "edges.jsonl"), edges.map((e) => JSON.stringify(e)).join("\n"));
  });

  afterEach(() => cleanupTempProject(cwd));

  const subsetOf = (small: string[], big: string[]) => small.every((x) => big.includes(x));

  it("F(S') ⊑ F(S) for edge-type sets S' ⊆ S — nodes, constraints, edges all restrict", () => {
    const target = "node_0002_target";
    // S  = {depends_on, validates_against} → both neighbours visible (larger open set)
    const big = assembleContext(
      { targetNodeId: target, mode: "strict", includeEdges: true, edgeTypes: ["depends_on", "validates_against"] },
      cwd,
    );
    // S' = {depends_on} ⊂ S → only the dependency neighbour visible (smaller open set)
    const small = assembleContext(
      { targetNodeId: target, mode: "strict", includeEdges: true, edgeTypes: ["depends_on"] },
      cwd,
    );

    const bigNodes = big.nodes.map((n) => n.id);
    const smallNodes = small.nodes.map((n) => n.id);
    const bigEdges = (big.edgeContext?.edges ?? []).map((e) => e.edgeId);
    const smallEdges = (small.edgeContext?.edges ?? []).map((e) => e.edgeId);

    // Restriction is a substructure inclusion on every component of the section.
    expect(subsetOf(smallNodes, bigNodes)).toBe(true);
    expect(subsetOf(small.constraints, big.constraints)).toBe(true);
    expect(subsetOf(smallEdges, bigEdges)).toBe(true);

    // ...and it is *strict* here: the larger neighbourhood really does see more.
    expect(bigNodes).toContain("node_0004_val");
    expect(smallNodes).not.toContain("node_0004_val");
    expect(big.constraints).toContain("Validation neighbour rule");
    expect(small.constraints).not.toContain("Validation neighbour rule");
  });

  it("the parent-chain base is invariant under restriction (the global section restricts to itself)", () => {
    const target = "node_0002_target";
    const big = assembleContext(
      { targetNodeId: target, mode: "strict", includeEdges: true, edgeTypes: ["depends_on", "validates_against"] },
      cwd,
    );
    const empty = assembleContext(
      { targetNodeId: target, mode: "strict", includeEdges: true, edgeTypes: [] },
      cwd,
    );

    // The canon → ancestor → target chain is present and identical regardless
    // of which neighbours the open set admits. This is the F(U) → F(∅-neighbours)
    // restriction recovering exactly the base section.
    const base = ["node_0000_canon", "node_0001_ancestor", "node_0002_target"];
    expect(empty.nodes.map((n) => n.id)).toEqual(base);
    expect(subsetOf(empty.nodes.map((n) => n.id), big.nodes.map((n) => n.id))).toBe(true);
    expect(empty.constraints).toEqual(["Everything is a node.", "Rules must be followed."]);
    expect(subsetOf(empty.constraints, big.constraints)).toBe(true);
  });

  it("restriction is idempotent / deterministic (recomputing the same open set agrees)", () => {
    const target = "node_0002_target";
    const a = assembleContext(
      { targetNodeId: target, mode: "strict", includeEdges: true, edgeTypes: ["depends_on"] },
      cwd,
    );
    const b = assembleContext(
      { targetNodeId: target, mode: "strict", includeEdges: true, edgeTypes: ["depends_on"] },
      cwd,
    );
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.constraints).toEqual(b.constraints);
    expect((a.edgeContext?.edges ?? []).map((e) => e.edgeId)).toEqual(
      (b.edgeContext?.edges ?? []).map((e) => e.edgeId),
    );
  });
});

// ---------------------------------------------------------------------------
// Part 2 — Sheaf characterisation of glueFragments
// ---------------------------------------------------------------------------

describe("Axiom 5 — glueFragments is a separated presheaf, NOT a sheaf", () => {
  const frag = (over: Partial<ContextFragment> & { nodeId: string }): ContextFragment => ({
    branch: "main",
    provides: [],
    requires: [],
    forbids: [],
    optional: [],
    rules: [],
    ...over,
  });

  it("SEPARATION axiom holds — distinct sections may not provide the same key (no silent identification)", () => {
    // In a separated presheaf a section is uniquely determined by its
    // restrictions: you cannot have two distinct sections that look the same
    // on an overlap and survive. Here, two fragments providing the same key
    // are rejected rather than merged — provider uniqueness is enforced.
    const result = glueFragments([
      frag({ nodeId: "n1", provides: ["A"] }),
      frag({ nodeId: "n2", provides: ["A"] }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.conflicts.map((c) => c.type)).toContain("duplicate_provider");
  });

  it("GLUING axiom FAILS — agreeing local sections do not glue (they conflict)", () => {
    // The sheaf gluing axiom: local sections that agree on overlaps glue to a
    // unique global section. Take a global section g = {provides: [A]} and
    // "restrict" it to a cover whose pieces both still provide A. Re-gluing
    // those agreeing restrictions SHOULD recover g. It does not: glueFragments
    // reports duplicate_provider. So the gluing axiom does not hold — this is
    // the precise sense in which the object is a separated presheaf, not a
    // sheaf. (Documented finding, asserted so it can't silently regress.)
    const g = frag({ nodeId: "g", provides: ["A"] });
    const reglued = glueFragments([g, { ...g, nodeId: "g_copy" }]);
    expect(reglued.ok).toBe(false);
    // The recovered section is explicitly NOT the original global section.
    expect(reglued.merged).not.toEqual(g);
  });

  it("IDENTITY holds — a single self-contained section glues to itself", () => {
    // Gluing over the trivial cover {U} must be the identity. A self-contained
    // fragment (requires ⊆ provides) glues with no conflict and the merged
    // section is set-equal to the input (modulo sort/dedup).
    const f = frag({ nodeId: "solo", provides: ["A", "B"], requires: ["A"], rules: ["r1"] });
    const result = glueFragments([f]);
    expect(result.ok).toBe(true);
    expect(result.merged.provides.sort()).toEqual(["A", "B"]);
    expect(result.merged.requires).toEqual(["A"]);
    expect(result.merged.rules).toEqual(["r1"]);
  });

  it("INCOMPATIBILITY is an obstruction to gluing — missing/forbidden/branch all block", () => {
    // The useful half of the structure: genuinely incompatible local sections
    // fail to glue, and the conflict names the obstruction. This is what makes
    // failure-to-glue a meaningful conflict-detection primitive.
    expect(glueFragments([frag({ nodeId: "n1", requires: ["X"] })]).ok).toBe(false);
    expect(
      glueFragments([
        frag({ nodeId: "n1", provides: ["X"] }),
        frag({ nodeId: "n2", forbids: ["X"] }),
      ]).ok,
    ).toBe(false);
    expect(
      glueFragments([
        frag({ nodeId: "n1", branch: "main" }),
        frag({ nodeId: "n2", branch: "dev" }),
      ]).ok,
    ).toBe(false);
  });

  it("COHERENCE — the merge is order-independent (gluing is well-defined on the cover, not its enumeration)", () => {
    // A genuine presheaf-coherence law: the glued section must not depend on
    // the order in which the cover's pieces are presented.
    const a = frag({ nodeId: "n1", provides: ["B"], requires: ["A"], rules: ["r2"] });
    const b = frag({ nodeId: "n2", provides: ["C", "A"], requires: ["B"], rules: ["r1"] });
    const ab = glueFragments([a, b]);
    const ba = glueFragments([b, a]);
    expect(ab.ok).toBe(true);
    expect(ba.ok).toBe(true);
    expect(ab.merged).toEqual(ba.merged);
  });
});
