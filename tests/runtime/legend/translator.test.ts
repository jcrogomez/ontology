import { describe, it, expect } from "vitest";
import {
  INSPECTOR_SYSTEM_PROMPT,
  buildInspectorPrompt,
  checkTranslatorCache,
  computeTranslatorSourceHash,
} from "../../../src/runtime/legend/translator.js";
import type { OntologyNode } from "../../../src/schemas/ontology.js";

// Coverage for the pure δ-1 translator library. The CLI command is
// tested at the integration level; this file pins the cache-validity
// math, the source-hash determinism, and the prompt builder shape.

function makeNode(overrides: Partial<OntologyNode> = {}): OntologyNode {
  return {
    id: "node_0001",
    label: "Test node",
    kind: "rule",
    status: "draft",
    coordinates: {
      abstraction: "artifact",
      time: 1,
      branch: "main",
      plane: "semantic",
      manifestation: "code",
    },
    inputs: [],
    prompt: { raw: "Does the thing.", variables: {}, language: "en" },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: { requires: [], provides: [], forbids: [], optional: [] },
    graph: { parentId: null, orbitOf: null },
    rules: [],
    technical: {},
    outputs: { files: [] },
    validation: { errors: [], warnings: [] },
    integrity: { frozen: false, hash: "h", schemaVersion: "1.0" },
    ...overrides,
  } as OntologyNode;
}

describe("INSPECTOR_SYSTEM_PROMPT", () => {
  it("instructs the model to produce 3-5 sentence prose", () => {
    expect(INSPECTOR_SYSTEM_PROMPT).toContain("3-5 sentence");
    expect(INSPECTOR_SYSTEM_PROMPT).toContain("Plain prose");
  });

  it("teaches the model to surface load-bearing contract tokens", () => {
    expect(INSPECTOR_SYSTEM_PROMPT).toContain("requires");
    expect(INSPECTOR_SYSTEM_PROMPT).toContain("forbids");
  });

  it("forbids JSON / markdown decoration so the cached text is clean", () => {
    expect(INSPECTOR_SYSTEM_PROMPT).toContain("No bullet points");
    expect(INSPECTOR_SYSTEM_PROMPT).toContain("no markdown");
  });
});

describe("computeTranslatorSourceHash", () => {
  it("is deterministic across runs with identical inputs", () => {
    const node = makeNode({
      prompt: { raw: "Does the thing.", variables: {}, language: "en" },
      rules: ["REQUIRE: x"],
    });
    const h1 = computeTranslatorSourceHash(node);
    const h2 = computeTranslatorSourceHash(node);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // sha256 hex
  });

  it("ignores label changes (framing, not semantic content)", () => {
    const a = makeNode({ label: "Label A" });
    const b = makeNode({ label: "Label B" });
    expect(computeTranslatorSourceHash(a)).toBe(
      computeTranslatorSourceHash(b),
    );
  });

  it("changes when prompt.raw changes", () => {
    const a = makeNode({
      prompt: { raw: "First.", variables: {}, language: "en" },
    });
    const b = makeNode({
      prompt: { raw: "Different.", variables: {}, language: "en" },
    });
    expect(computeTranslatorSourceHash(a)).not.toBe(
      computeTranslatorSourceHash(b),
    );
  });

  it("changes when rules change", () => {
    const a = makeNode({ rules: ["REQUIRE: x"] });
    const b = makeNode({ rules: ["REQUIRE: x", "FORBID: y"] });
    expect(computeTranslatorSourceHash(a)).not.toBe(
      computeTranslatorSourceHash(b),
    );
  });

  it("is rule-order-insensitive (sorts before hashing)", () => {
    const a = makeNode({ rules: ["REQUIRE: x", "FORBID: y"] });
    const b = makeNode({ rules: ["FORBID: y", "REQUIRE: x"] });
    expect(computeTranslatorSourceHash(a)).toBe(
      computeTranslatorSourceHash(b),
    );
  });

  it("changes when provides changes", () => {
    const a = makeNode({
      context: {
        requires: [],
        provides: [{ key: "a", nodeType: "rule" }],
        forbids: [],
        optional: [],
      },
    });
    const b = makeNode({
      context: {
        requires: [],
        provides: [{ key: "b", nodeType: "rule" }],
        forbids: [],
        optional: [],
      },
    });
    expect(computeTranslatorSourceHash(a)).not.toBe(
      computeTranslatorSourceHash(b),
    );
  });
});

describe("checkTranslatorCache", () => {
  it("returns hit=false reason=no_translator when none exists", () => {
    const node = makeNode();
    expect(node.translator).toBeUndefined();
    const status = checkTranslatorCache(node);
    expect(status.hit).toBe(false);
    if (!status.hit) expect(status.reason).toBe("no_translator");
  });

  it("returns hit=true when sourceHash matches", () => {
    const base = makeNode({
      prompt: { raw: "Does the thing.", variables: {}, language: "en" },
      rules: ["REQUIRE: x"],
    });
    const sourceHash = computeTranslatorSourceHash(base);
    const node = {
      ...base,
      translator: {
        text: "It does the thing carefully.",
        model: "claude-opus-4-7",
        provider: "anthropic",
        generatedAt: "2026-05-12T12:00:00Z",
        sourceHash,
      },
    };
    const status = checkTranslatorCache(node);
    expect(status.hit).toBe(true);
    if (status.hit) {
      expect(status.text).toBe("It does the thing carefully.");
      expect(status.model).toBe("claude-opus-4-7");
      expect(status.provider).toBe("anthropic");
    }
  });

  it("returns hit=false reason=source_changed when the hash drifts", () => {
    const base = makeNode({
      prompt: { raw: "Original prompt.", variables: {}, language: "en" },
    });
    const node = {
      ...base,
      translator: {
        text: "Old summary.",
        model: "claude-opus-4-7",
        provider: "anthropic",
        generatedAt: "2026-05-12T12:00:00Z",
        sourceHash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    };
    const status = checkTranslatorCache(node);
    expect(status.hit).toBe(false);
    if (!status.hit) {
      expect(status.reason).toBe("source_changed");
      expect(status.staleHash).toBe(
        "0000000000000000000000000000000000000000000000000000000000000000",
      );
    }
  });
});

describe("buildInspectorPrompt", () => {
  it("includes id, label, kind, prompt, contract, and rules", () => {
    const node = makeNode({
      id: "node_0042",
      label: "Hash primitives",
      kind: "rule",
      prompt: { raw: "Implements SHA-256.", variables: {}, language: "en" },
      context: {
        requires: [{ source: "createHash", nodeType: "declared" }],
        provides: [
          { key: "hashObject", nodeType: "declared" },
          { key: "hashPrompt", nodeType: "declared" },
        ],
        forbids: [{ source: "JSON.stringify", nodeType: "declared" }],
        optional: [],
      },
      rules: [
        "REQUIRE: uses fast-json-stable-stringify for canonical JSON",
      ],
    });
    const text = buildInspectorPrompt(node);
    expect(text).toContain("node_0042");
    expect(text).toContain("Hash primitives");
    expect(text).toContain("Implements SHA-256.");
    expect(text).toContain("provides: hashObject, hashPrompt");
    expect(text).toContain("requires: createHash");
    expect(text).toContain("forbids:  JSON.stringify");
    expect(text).toContain("REQUIRE: uses fast-json-stable-stringify");
    expect(text).toContain("Inspector summary");
  });

  it("omits Contract block when all three contract arrays are empty", () => {
    const node = makeNode();
    const text = buildInspectorPrompt(node);
    expect(text).not.toContain("Contract:");
  });

  it("omits Rules block when rules array is empty", () => {
    const node = makeNode();
    const text = buildInspectorPrompt(node);
    expect(text).not.toContain("Rules:");
  });
});
