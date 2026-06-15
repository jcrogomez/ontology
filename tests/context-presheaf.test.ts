import { describe, it, expect } from "vitest";
import { buildFragment } from "../src/runtime/context/presheaf";
import type { OntologyNode } from "../src/kernel/schemas/ontology";

describe("context presheaf", () => {
  const createMockNode = (overrides: Partial<OntologyNode> = {}): OntologyNode => {
    return {
      id: "node_0001",
      label: "Test Node",
      kind: "decision",
      status: "draft",
      coordinates: {
        abstraction: "project",
        time: 1,
        branch: "main",
        plane: "semantic",
        manifestation: "intent",
      },
      inputs: [],
      prompt: {
        variables: {},
        language: "es",
      },
      model: { ref: "mock_default" },
      processors: { pre: [], post: [] },
      context: {
        provides: [],
        requires: [],
        forbids: [],
        optional: [],
      },
      graph: {
        parentId: null,
        orbitOf: null,
      },
      rules: [],
      technical: {},
      outputs: { files: [] },
      validation: { errors: [], warnings: [] },
      integrity: {
        frozen: false,
        hash: "abc",
        schemaVersion: "0.1.0",
      },
      ...overrides,
    };
  };

  it("buildFragment extracts provides/requires/forbids/optional/rules", () => {
    const node = createMockNode({
      context: {
        provides: [{ key: "db_access", nodeType: "domain" }],
        requires: [{ source: "auth_token", nodeType: "security" }],
        forbids: [{ source: "legacy_api", nodeType: "interface" }],
        optional: [{ source: "cache", nodeType: "infrastructure" }],
      },
      rules: ["Rule 1", "Rule 2"],
    });

    const fragment = buildFragment(node);

    expect(fragment.nodeId).toBe("node_0001");
    expect(fragment.branch).toBe("main");
    expect(fragment.provides).toEqual(["db_access"]);
    expect(fragment.requires).toEqual(["auth_token"]);
    expect(fragment.forbids).toEqual(["legacy_api"]);
    expect(fragment.optional).toEqual(["cache"]);
    expect(fragment.rules).toEqual(["Rule 1", "Rule 2"]);
  });

  it("buildFragment cleans numeric rule prefixes", () => {
    const node = createMockNode({
      rules: ["1. First rule", "12. Second rule", "No prefix rule"],
    });

    const fragment = buildFragment(node);

    expect(fragment.rules).toEqual(["First rule", "Second rule", "No prefix rule"]);
  });

  it("buildFragment surfaces per-key signatures as a side channel, keeping provides a string[] (O1)", () => {
    const node = createMockNode({
      context: {
        provides: [
          { key: "add", nodeType: "declared", signature: "(a: number, b: number): number" },
          { key: "Untyped", nodeType: "declared" },
        ],
        requires: [],
        forbids: [],
        optional: [],
      },
    });

    const fragment = buildFragment(node);

    // provides stays a bare string[] — the gluing token set is unchanged.
    expect(fragment.provides).toEqual(["add", "Untyped"]);
    // signatures ride alongside, only for keys that carry one.
    expect(fragment.provideSignatures).toEqual({
      add: "(a: number, b: number): number",
    });
  });

  it("buildFragment omits provideSignatures entirely when no provision carries one", () => {
    const node = createMockNode({
      context: {
        provides: [{ key: "db_access", nodeType: "domain" }],
        requires: [],
        forbids: [],
        optional: [],
      },
    });

    const fragment = buildFragment(node);

    expect(fragment.provides).toEqual(["db_access"]);
    expect(fragment.provideSignatures).toBeUndefined();
  });

  it("buildFragment does not mutate original node", () => {
    const node = createMockNode({
      rules: ["1. Rule"],
    });

    const originalRules = [...node.rules];
    buildFragment(node);

    expect(node.rules).toEqual(originalRules);
  });
});
