// CLI smoke tests for `onto link`.
//
// We hand-construct a minimal three-node project on disk (canon → focal,
// plus a sibling provider node) so the gluing analysis has both a missing
// requirement and a candidate to satisfy it — that makes the suggester's
// output non-trivial enough to assert against. Mirrors the fixture style
// in `tests/semantic-linker.test.ts`.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { runCli } from "./helpers/run-cli.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import type { OntologyNode } from "../src/schemas/ontology.js";

function bootstrapState(cwd: string, opts: { nodeCount: number }): void {
  fs.mkdirSync(path.join(cwd, ".ontology", "nodes"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".ontology", "models"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".ontology", "processors"), { recursive: true });

  const state = {
    initialized: true,
    schemaVersion: "1.0",
    projectName: "Test Project",
    rootNodeId: "node_0000_canon",
    activeBranch: "main",
    nodeCount: opts.nodeCount,
    edgeCount: 0,
    eventCount: 0,
    lastEventId: "evt_0000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(cwd, ".ontology", "state.json"), JSON.stringify(state));
  fs.writeFileSync(path.join(cwd, ".ontology", "events.jsonl"), "");
  fs.writeFileSync(path.join(cwd, ".ontology", "edges.jsonl"), "");
  fs.writeFileSync(path.join(cwd, ".ontology", "models", "registry.json"), JSON.stringify({ models: [] }));
  fs.writeFileSync(path.join(cwd, ".ontology", "processors", "registry.json"), JSON.stringify({ processors: [] }));
}

function writeNode(cwd: string, node: OntologyNode): void {
  fs.writeFileSync(path.join(cwd, ".ontology", "nodes", `${node.id}.json`), JSON.stringify(node));
}

function mkCanon(): OntologyNode {
  return {
    id: "node_0000_canon",
    label: "Canon",
    kind: "canon",
    status: "valid",
    coordinates: { abstraction: "canon", branch: "main", time: 100, plane: "semantic", manifestation: "intent" },
    graph: { parentId: null, orbitOf: null },
    prompt: { raw: "canon body", variables: {}, language: "es" },
    inputs: [{ type: "text", role: "mathematical_canon", value: "Canon text" }],
    outputs: {},
    rules: ["1. Canon rule."],
    context: { provides: [], requires: [], forbids: [], optional: [] },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    technical: {},
    integrity: { hash: "hash:canon", schemaVersion: "1.0" },
  };
}

function mkFocal(opts: { requires?: string[]; forbids?: string[] } = {}): OntologyNode {
  return {
    id: "node_focal",
    label: "Focal",
    kind: "entity",
    status: "valid",
    coordinates: { abstraction: "domain", branch: "main", time: 102, plane: "semantic", manifestation: "intent" },
    graph: { parentId: "node_0000_canon", orbitOf: null },
    prompt: { raw: "focal body", variables: {}, language: "es" },
    inputs: [],
    outputs: {},
    rules: [],
    context: {
      provides: [{ key: "focal_output", nodeType: "token" }],
      requires: (opts.requires ?? []).map((source) => ({ source, nodeType: "token" })),
      forbids: (opts.forbids ?? []).map((source) => ({ source, nodeType: "token" })),
      optional: [],
    },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    technical: {},
    integrity: { hash: "hash:focal", schemaVersion: "1.0" },
  };
}

function mkProvider(id: string, provides: string[]): OntologyNode {
  return {
    id,
    label: id,
    kind: "entity",
    status: "valid",
    coordinates: { abstraction: "domain", branch: "main", time: 103, plane: "semantic", manifestation: "intent" },
    graph: { parentId: "node_0000_canon", orbitOf: null },
    prompt: { raw: "", variables: {}, language: "es" },
    inputs: [],
    outputs: {},
    rules: [],
    context: {
      provides: provides.map((key) => ({ key, nodeType: "token" })),
      requires: [],
      forbids: [],
      optional: [],
    },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    technical: {},
    integrity: { hash: `hash:${id}`, schemaVersion: "1.0" },
  };
}

describe("onto link", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(cwd);
  });

  it("fails when --candidate is missing", () => {
    bootstrapState(cwd, { nodeCount: 2 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal());

    const result = runCli(cwd, ["link", "node_focal"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("requires a candidate");
  });

  it("fails when both --candidate and --candidate-file are passed", () => {
    bootstrapState(cwd, { nodeCount: 2 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal());

    const result = runCli(cwd, [
      "link",
      "node_focal",
      "--candidate", "x",
      "--candidate-file", "ignored.txt",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("mutually exclusive");
  });

  it("fails on missing focal node", () => {
    bootstrapState(cwd, { nodeCount: 1 });
    writeNode(cwd, mkCanon());

    const result = runCli(cwd, ["link", "node_does_not_exist", "--candidate", "x"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Node not found");
  });

  it("renders the LINK card with validation block on a clean focal", () => {
    // No requires, no forbids, no providers needed.
    bootstrapState(cwd, { nodeCount: 2 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal());

    const result = runCli(cwd, ["link", "node_focal", "--candidate", "anything works"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("LINK");
    expect(result.stdout).toContain("node_focal");
    expect(result.stdout).toContain("Validation");
    expect(result.stdout).toContain("Requires (0)");
    expect(result.stdout).toContain("Provides (1)"); // focal_output
    expect(result.stdout).toContain("focal_output");
  });

  it("--json emits parseable structured output with the expected keys", () => {
    bootstrapState(cwd, { nodeCount: 2 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal());

    const result = runCli(cwd, ["link", "node_focal", "--candidate", "anything", "--json"]);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      ok: expect.any(Boolean),
      focal: "node_focal",
      branch: "main",
      requires: expect.any(Array),
      provides: expect.any(Array),
      forbids: expect.any(Array),
      neighbors: expect.any(Array),
      conflicts: expect.any(Array),
      suggestions: expect.any(Array),
      validation: expect.any(Object),
    });
    expect(parsed.validation).toHaveProperty("ok");
    expect(parsed.validation).toHaveProperty("score");
  });

  it("surfaces missing requirements and emits edge suggestions for them", () => {
    bootstrapState(cwd, { nodeCount: 3 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal({ requires: ["needed_token"] }));
    writeNode(cwd, mkProvider("node_provider", ["needed_token"]));

    const result = runCli(cwd, [
      "link",
      "node_focal",
      "--candidate", "any candidate body",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // The focal has a requires with no provider in the gluing pool (only
    // the canon is upstream by parent path), so the requirement is missing.
    const needed = parsed.requires.find((r: { token: string }) => r.token === "needed_token");
    expect(needed).toMatchObject({ token: "needed_token", satisfied: false, providers: [] });
    // The provider is in the wider graph so the suggester should pick it
    // up — two suggestions per provider (depends_on + uses_token).
    const suggestionTos = parsed.suggestions.map((s: { to: string }) => s.to);
    expect(suggestionTos).toContain("node_provider");
    const types = parsed.suggestions.map((s: { type: string }) => s.type).sort();
    expect(types).toEqual(["depends_on", "uses_token"]);
    // Each suggestion carries a copy-pasteable command that mentions the
    // satisfied token in the rationale.
    const cmd = parsed.suggestions[0].command as string;
    expect(cmd).toContain("onto propose link");
    expect(cmd).toContain("--from node_focal");
    expect(cmd).toContain("--to node_provider");
    expect(cmd).toContain("needed_token");
  });

  it("--no-suggest-edges suppresses suggestions even when there are missing requirements", () => {
    bootstrapState(cwd, { nodeCount: 3 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal({ requires: ["needed_token"] }));
    writeNode(cwd, mkProvider("node_provider", ["needed_token"]));

    const result = runCli(cwd, [
      "link",
      "node_focal",
      "--candidate", "any candidate body",
      "--no-suggest-edges",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.suggestions).toEqual([]);
  });
});
