import { describe, it, expect } from "vitest";
import {
  navigateUp,
  navigateDown,
  navigateSiblingPrevious,
  navigateSiblingNext,
} from "../src/walker/state/navigation.js";
import type { OntologyNode } from "../src/kernel/schemas/ontology.js";
import type { FocalNeighborhood } from "../src/walker/state/neighborhood.js";

// Minimal node factory: only the fields navigation actually reads.
function n(id: string, parentId: string | null, time: number, abstraction: OntologyNode["coordinates"]["abstraction"] = "domain"): OntologyNode {
  return {
    id,
    label: id,
    kind: "definition",
    status: "draft",
    coordinates: {
      abstraction,
      time,
      branch: "main",
      plane: "semantic",
      manifestation: "intent",
    },
    inputs: [],
    prompt: { raw: id, language: "en", variables: {} },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: { requires: [], provides: [], forbids: [], optional: [] },
    graph: { parentId, orbitOf: null },
    rules: [],
    technical: {},
    outputs: { files: [] },
    validation: { errors: [], warnings: [] },
    integrity: { frozen: false, hash: "h", schemaVersion: "0.1.0" },
  } as OntologyNode;
}

function neighborhood(opts: {
  focal: OntologyNode;
  parent: OntologyNode | null;
  children?: OntologyNode[];
  siblings?: OntologyNode[];
}): FocalNeighborhood {
  return {
    focal: opts.focal,
    pathToCanon: [opts.focal],
    parent: opts.parent,
    children: opts.children ?? [],
    siblings: opts.siblings ?? [],
    edgesOut: [],
    edgesIn: [],
    edgeNeighbors: [],
  };
}

describe("walker navigation transitions", () => {
  it("navigateUp returns the parent id when present", () => {
    const parent = n("node_0000_canon", null, 0, "canon");
    const focal = n("node_0001", "node_0000_canon", 1);
    expect(navigateUp(neighborhood({ focal, parent }))).toBe("node_0000_canon");
  });

  it("navigateUp returns null when there is no parent (canon)", () => {
    const focal = n("node_0000_canon", null, 0, "canon");
    expect(navigateUp(neighborhood({ focal, parent: null }))).toBeNull();
  });

  it("navigateDown returns the first child by sorted order", () => {
    const focal = n("node_0001", "node_0000_canon", 1);
    const childA = n("node_0010", "node_0001", 5);
    const childB = n("node_0011", "node_0001", 6);
    expect(
      navigateDown(neighborhood({ focal, parent: null, children: [childA, childB] }))
    ).toBe("node_0010");
  });

  it("navigateDown returns null when there are no children", () => {
    const focal = n("node_0001", "node_0000_canon", 1);
    expect(navigateDown(neighborhood({ focal, parent: null, children: [] }))).toBeNull();
  });

  it("navigateSiblingNext returns the sibling immediately after focal in time order", () => {
    const focal = n("node_0001", "node_0000_canon", 1);
    const siblingA = n("node_0002", "node_0000_canon", 2);
    const siblingB = n("node_0003", "node_0000_canon", 3);
    expect(
      navigateSiblingNext(neighborhood({ focal, parent: null, siblings: [siblingA, siblingB] }))
    ).toBe("node_0002");
  });

  it("navigateSiblingPrevious returns the sibling immediately before focal", () => {
    const focal = n("node_0002", "node_0000_canon", 2);
    const siblingA = n("node_0001", "node_0000_canon", 1);
    const siblingB = n("node_0003", "node_0000_canon", 3);
    expect(
      navigateSiblingPrevious(neighborhood({ focal, parent: null, siblings: [siblingA, siblingB] }))
    ).toBe("node_0001");
  });

  it("navigateSiblingNext returns null when focal is last", () => {
    const focal = n("node_0003", "node_0000_canon", 3);
    const siblingA = n("node_0001", "node_0000_canon", 1);
    const siblingB = n("node_0002", "node_0000_canon", 2);
    expect(
      navigateSiblingNext(neighborhood({ focal, parent: null, siblings: [siblingA, siblingB] }))
    ).toBeNull();
  });

  it("navigateSiblingPrevious returns null when focal is first", () => {
    const focal = n("node_0001", "node_0000_canon", 1);
    const siblingB = n("node_0002", "node_0000_canon", 2);
    expect(
      navigateSiblingPrevious(neighborhood({ focal, parent: null, siblings: [siblingB] }))
    ).toBeNull();
  });
});
