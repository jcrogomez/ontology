// Walker action smoke tests for `linkAnalysisFromWalker`.
//
// We construct the on-disk fixture directly (mirroring the pattern in
// `tests/cli-link.test.ts` and `tests/semantic-linker.test.ts`) because
// `onto node create` does not expose `--requires` / `--provides` flags;
// the CLI surface to author context-contract entries is intentionally
// scoped to schema authoring, not runtime tests.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { linkAnalysisFromWalker } from "../src/surfaces/walker/actions/link-analysis-from-walker.js";
import type { OntologyNode } from "../src/kernel/schemas/ontology.js";

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

function mkFocal(opts: {
  prompt?: string;
  requires?: string[];
  provides?: string[];
  forbids?: string[];
} = {}): OntologyNode {
  return {
    id: "node_focal",
    label: "Focal",
    kind: "entity",
    status: "valid",
    coordinates: { abstraction: "domain", branch: "main", time: 102, plane: "semantic", manifestation: "intent" },
    graph: { parentId: "node_0000_canon", orbitOf: null },
    prompt: { raw: opts.prompt ?? "default focal prompt", variables: {}, language: "es" },
    inputs: [],
    outputs: {},
    rules: [],
    context: {
      provides: (opts.provides ?? []).map((key) => ({ key, nodeType: "token" })),
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

describe("linkAnalysisFromWalker", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(cwd);
  });

  it("returns ok=false with a clear message for a missing focal", async () => {
    bootstrapState(cwd, { nodeCount: 1 });
    writeNode(cwd, mkCanon());

    const result = await linkAnalysisFromWalker("node_does_not_exist", cwd);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("node not found");
  });

  it("uses focal.prompt.raw as the candidate by default", async () => {
    bootstrapState(cwd, { nodeCount: 2 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal({ prompt: "the focal's own prompt" }));

    const result = await linkAnalysisFromWalker("node_focal", cwd);
    expect(result.ok).toBe(true);
    // Validation should not flag empty_candidate (the focal's prompt is
    // non-empty), and should not include any FORBID phrase scan
    // violations (the focal declares no FORBID rules).
    expect(result.validation?.violations ?? []).not.toContain("empty_candidate");
  });

  it("populates requires rows with provider attribution from in-scope fragments", async () => {
    bootstrapState(cwd, { nodeCount: 2 });
    // Canon provides a token that the focal requires — the gluing pool
    // should match them up via the parent-path traversal.
    const canonWithProvide: OntologyNode = {
      ...mkCanon(),
      context: { provides: [{ key: "canon_token", nodeType: "token" }], requires: [], forbids: [], optional: [] },
    };
    writeNode(cwd, canonWithProvide);
    writeNode(cwd, mkFocal({ requires: ["canon_token"] }));

    const result = await linkAnalysisFromWalker("node_focal", cwd);
    expect(result.ok).toBe(true);
    const reqRow = result.requires?.find((r) => r.token === "canon_token");
    expect(reqRow).toBeDefined();
    expect(reqRow!.satisfied).toBe(true);
    expect(reqRow!.providers).toContain("node_0000_canon");
  });

  it("returns edge suggestions for missing requirements visible in the wider graph", async () => {
    bootstrapState(cwd, { nodeCount: 3 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal({ requires: ["wanted_token"] }));
    writeNode(cwd, mkProvider("node_provider", ["wanted_token"]));

    const result = await linkAnalysisFromWalker("node_focal", cwd);
    expect(result.ok).toBe(true);
    const reqRow = result.requires?.find((r) => r.token === "wanted_token");
    expect(reqRow!.satisfied).toBe(false);
    // Two suggestions per provider (depends_on + uses_token).
    expect(result.suggestions).toHaveLength(2);
    const tos = new Set((result.suggestions ?? []).map((s) => s.to));
    expect(tos).toEqual(new Set(["node_provider"]));
  });

  it("flags forbids violations when an in-scope fragment provides a forbidden token", async () => {
    bootstrapState(cwd, { nodeCount: 2 });
    const canonWithForbidden: OntologyNode = {
      ...mkCanon(),
      context: { provides: [{ key: "raw_pii", nodeType: "token" }], requires: [], forbids: [], optional: [] },
    };
    writeNode(cwd, canonWithForbidden);
    writeNode(cwd, mkFocal({ forbids: ["raw_pii"] }));

    const result = await linkAnalysisFromWalker("node_focal", cwd);
    expect(result.ok).toBe(true);
    const forb = result.forbids?.find((f) => f.token === "raw_pii");
    expect(forb).toBeDefined();
    expect(forb!.violated).toBe(true);
    expect(forb!.violators).toContain("node_0000_canon");
  });

  it("falls back to a single-space candidate when focal.prompt.raw is empty", async () => {
    bootstrapState(cwd, { nodeCount: 2 });
    writeNode(cwd, mkCanon());
    writeNode(cwd, mkFocal({ prompt: "" }));

    const result = await linkAnalysisFromWalker("node_focal", cwd);
    expect(result.ok).toBe(true);
    // The fallback to " " avoids the empty_candidate violation that would
    // otherwise overshadow the user's question — the test pins this so we
    // do not silently regress to candidate="" later.
    expect(result.validation?.violations ?? []).not.toContain("empty_candidate");
  });
});
