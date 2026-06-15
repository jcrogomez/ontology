import { describe, it, expect } from "vitest";
import { glueFragments } from "../src/forward/context/gluing";
import type { ContextFragment } from "../src/forward/context/presheaf";

describe("context gluing", () => {
  const createFragment = (overrides: Partial<ContextFragment> = {}): ContextFragment => ({
    nodeId: "node_test",
    branch: "main",
    provides: [],
    requires: [],
    forbids: [],
    optional: [],
    rules: [],
    ...overrides,
  });

  it("glueFragments accepts compatible fragments", () => {
    const fragments = [
      createFragment({ nodeId: "node_1", provides: ["A"] }),
      createFragment({ nodeId: "node_2", requires: ["A"], provides: ["B"] }),
    ];

    const result = glueFragments(fragments);

    expect(result.ok).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.provides).toEqual(["A", "B"]);
    expect(result.merged.requires).toEqual(["A"]);
  });

  it("glueFragments detects missing requirement", () => {
    const fragments = [
      createFragment({ nodeId: "node_1", requires: ["A"] }),
    ];

    const result = glueFragments(fragments);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        type: "missing_requirement",
        nodeIds: ["node_1"],
      })
    );
  });

  it("glueFragments detects forbidden match", () => {
    const fragments = [
      createFragment({ nodeId: "node_1", provides: ["A"] }),
      createFragment({ nodeId: "node_2", forbids: ["A"] }),
    ];

    const result = glueFragments(fragments);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        type: "forbidden_match",
        nodeIds: ["node_1", "node_2"],
      })
    );
  });

  it("glueFragments detects duplicate provider", () => {
    const fragments = [
      createFragment({ nodeId: "node_1", provides: ["A"] }),
      createFragment({ nodeId: "node_2", provides: ["A"] }),
    ];

    const result = glueFragments(fragments);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        type: "duplicate_provider",
        nodeIds: ["node_1", "node_2"],
      })
    );
  });

  it("glueFragments detects branch mismatch", () => {
    const fragments = [
      createFragment({ nodeId: "node_1", branch: "main" }),
      createFragment({ nodeId: "node_2", branch: "feature" }),
    ];

    const result = glueFragments(fragments);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        type: "branch_mismatch",
        nodeIds: ["node_1", "node_2"],
      })
    );
  });

  it("glueFragments returns deterministic merged output", () => {
    const fragments = [
      createFragment({ nodeId: "node_1", provides: ["B"], requires: ["A"], rules: ["Rule 2"] }),
      createFragment({ nodeId: "node_2", provides: ["C", "A"], requires: ["B"], rules: ["Rule 1"] }),
    ];

    const result = glueFragments(fragments);

    expect(result.merged.provides).toEqual(["A", "B", "C"]);
    expect(result.merged.requires).toEqual(["A", "B"]);
    expect(result.merged.rules).toEqual(["Rule 1", "Rule 2"]);
  });
});

describe("context gluing — identify-if-equal policy (O2)", () => {
  const frag = (over: Partial<ContextFragment> & { nodeId: string }): ContextFragment => ({
    branch: "main",
    provides: [],
    requires: [],
    forbids: [],
    optional: [],
    rules: [],
    ...over,
  });

  it("default policy still conflicts on duplicate providers EVEN with equal signatures (back-compat / separated presheaf)", () => {
    const fragments = [
      frag({ nodeId: "n1", provides: ["A"], provideSignatures: { A: "(): number" } }),
      frag({ nodeId: "n2", provides: ["A"], provideSignatures: { A: "(): number" } }),
    ];
    const result = glueFragments(fragments); // no options → "conflict"
    expect(result.ok).toBe(false);
    expect(result.conflicts.map((c) => c.type)).toContain("duplicate_provider");
  });

  it("identify-if-equal GLUES two providers with an identical defined signature", () => {
    const fragments = [
      frag({ nodeId: "n1", provides: ["A"], provideSignatures: { A: "(): number" } }),
      frag({ nodeId: "n2", provides: ["A"], provideSignatures: { A: "(): number" } }),
    ];
    const result = glueFragments(fragments, { onDuplicateProvider: "identify-if-equal" });
    expect(result.ok).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.provides).toEqual(["A"]); // identified to one
    expect(result.warnings.join(" ")).toMatch(/Identified 2 providers of key "A"/);
  });

  it("identify-if-equal CONFLICTS when signatures differ (drift is caught, never silently merged)", () => {
    const fragments = [
      frag({ nodeId: "n1", provides: ["A"], provideSignatures: { A: "(): number" } }),
      frag({ nodeId: "n2", provides: ["A"], provideSignatures: { A: "(): string" } }),
    ];
    const result = glueFragments(fragments, { onDuplicateProvider: "identify-if-equal" });
    expect(result.ok).toBe(false);
    expect(result.conflicts.map((c) => c.type)).toContain("duplicate_provider");
  });

  it("identify-if-equal CONFLICTS when a signature is missing on either side (unknown ⇒ conflict)", () => {
    const fragments = [
      frag({ nodeId: "n1", provides: ["A"], provideSignatures: { A: "(): number" } }),
      frag({ nodeId: "n2", provides: ["A"] }), // no signature
    ];
    const result = glueFragments(fragments, { onDuplicateProvider: "identify-if-equal" });
    expect(result.ok).toBe(false);
    expect(result.conflicts.map((c) => c.type)).toContain("duplicate_provider");
  });

  it("identify-if-equal does not affect non-duplicate keys", () => {
    const fragments = [
      frag({ nodeId: "n1", provides: ["A"], provideSignatures: { A: "(): number" } }),
      frag({ nodeId: "n2", provides: ["B"], requires: ["A"] }),
    ];
    const result = glueFragments(fragments, { onDuplicateProvider: "identify-if-equal" });
    expect(result.ok).toBe(true);
    expect(result.merged.provides).toEqual(["A", "B"]);
  });
});
