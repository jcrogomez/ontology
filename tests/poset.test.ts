import { describe, it, expect } from "vitest";
import {
  ABSTRACTION_INDEX,
  EDGE_DIRECTION_RULES,
  posetIndex,
  validateEdgeDirection,
} from "../src/kernel/graph/poset.js";

describe("ABSTRACTION_INDEX", () => {
  it("orders the 11 levels from canon (0) down to artifact (10)", () => {
    expect(ABSTRACTION_INDEX.canon).toBe(0);
    expect(ABSTRACTION_INDEX.project).toBe(1);
    expect(ABSTRACTION_INDEX.target).toBe(2);
    expect(ABSTRACTION_INDEX.stack).toBe(3);
    expect(ABSTRACTION_INDEX.architecture).toBe(4);
    expect(ABSTRACTION_INDEX.domain).toBe(5);
    expect(ABSTRACTION_INDEX.workflow).toBe(6);
    expect(ABSTRACTION_INDEX.interface).toBe(7);
    expect(ABSTRACTION_INDEX.unit).toBe(8);
    expect(ABSTRACTION_INDEX.token).toBe(9);
    expect(ABSTRACTION_INDEX.artifact).toBe(10);
  });

  it("posetIndex agrees with the table", () => {
    expect(posetIndex("canon")).toBe(0);
    expect(posetIndex("artifact")).toBe(10);
  });
});

describe("EDGE_DIRECTION_RULES", () => {
  it("flags the four refinement-family edges as upward", () => {
    expect(EDGE_DIRECTION_RULES.refines).toBe("upward");
    expect(EDGE_DIRECTION_RULES.inherits_from).toBe("upward");
    expect(EDGE_DIRECTION_RULES.implements).toBe("upward");
    expect(EDGE_DIRECTION_RULES.belongs_to).toBe("upward");
  });

  it("leaves all other edge types as any", () => {
    const otherTypes: Array<keyof typeof EDGE_DIRECTION_RULES> = [
      "depends_on",
      "validates_against",
      "uses_token",
      "mutates",
      "reads_from",
      "emits",
      "contradicts",
      "supersedes",
      "triggers",
      "tests",
      "documents",
      "orbits",
      "blocks",
      "unblocks",
    ];
    for (const t of otherTypes) {
      expect(EDGE_DIRECTION_RULES[t]).toBe("any");
    }
  });
});

describe("validateEdgeDirection", () => {
  it("accepts an upward refinement: domain refines architecture", () => {
    const result = validateEdgeDirection({
      sourceLevel: "domain",
      targetLevel: "architecture",
      edgeType: "refines",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a same-level refinement (siblings)", () => {
    const result = validateEdgeDirection({
      sourceLevel: "domain",
      targetLevel: "domain",
      edgeType: "refines",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an inversion: architecture refines domain", () => {
    const result = validateEdgeDirection({
      sourceLevel: "architecture",
      targetLevel: "domain",
      edgeType: "refines",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("refines");
      expect(result.reason).toContain("architecture");
      expect(result.reason).toContain("domain");
    }
  });

  it("rejects an inversion for inherits_from", () => {
    const result = validateEdgeDirection({
      sourceLevel: "canon",
      targetLevel: "artifact",
      edgeType: "inherits_from",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an inversion for implements", () => {
    const result = validateEdgeDirection({
      sourceLevel: "canon",
      targetLevel: "domain",
      edgeType: "implements",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an inversion for belongs_to", () => {
    const result = validateEdgeDirection({
      sourceLevel: "project",
      targetLevel: "artifact",
      edgeType: "belongs_to",
    });
    expect(result.ok).toBe(false);
  });

  it("does not constrain depends_on (any direction)", () => {
    expect(
      validateEdgeDirection({
        sourceLevel: "canon",
        targetLevel: "artifact",
        edgeType: "depends_on",
      }).ok
    ).toBe(true);
    expect(
      validateEdgeDirection({
        sourceLevel: "artifact",
        targetLevel: "canon",
        edgeType: "depends_on",
      }).ok
    ).toBe(true);
  });

  it("does not constrain documents, tests, or validates_against", () => {
    for (const edgeType of ["documents", "tests", "validates_against"] as const) {
      expect(
        validateEdgeDirection({
          sourceLevel: "canon",
          targetLevel: "artifact",
          edgeType,
        }).ok
      ).toBe(true);
    }
  });
});
