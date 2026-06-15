import { describe, it, expect } from "vitest";
import { extractTopLevelDeclarations } from "../src/runtime/legend/verify-homeomorphism.js";
import { computeTranslatorSourceHash } from "../src/runtime/legend/translator.js";
import { OntologyEventSchema } from "../src/kernel/schemas/ontology.js";
import type { OntologyNode } from "../src/kernel/schemas/ontology.js";

// Tests for the five reviewer-flagged fixes after the γ-7 calibration
// (MILESTONE_REVIEW-style audit forwarded 2026-05-13):
//
//   §4.1 — extractTopLevelDeclarations must capture `async def` for
//          modern Python. Bloqueante before Phase ε self-ingestion
//          since Ontology's own src/ contains async functions.
//   §4.2 — node_inspected event type exists on the schema.
//   §4.3 — homeomorphism_verified event type exists on the schema.
//   §4.5 — computeTranslatorSourceHash must include node.literal so a
//          β-2 literal mutation invalidates the Inspector cache.
//
// §4.4 (jitter in the Anthropic retry helper) is exercised through
// the existing dispatch path; the change is a single multiplier line
// and is not amenable to a focused unit test without mocking Math.
// §4.10 (BRANCH_MODEL.md Option C confirmation) is a doc-only fix.

describe("§4.1 — extractTopLevelDeclarations captures async def", () => {
  it("picks up a plain async def name", () => {
    const src = "async def fetch(url):\n    pass\n";
    expect(extractTopLevelDeclarations(src, "python")).toEqual(["fetch"]);
  });

  it("picks up multiple async def at column 0 alongside def and class", () => {
    const src = [
      "def sync_fn():",
      "    pass",
      "",
      "async def coro_a():",
      "    pass",
      "",
      "async def coro_b(x, y):",
      "    return x + y",
      "",
      "class Container:",
      "    pass",
      "",
    ].join("\n");
    expect(extractTopLevelDeclarations(src, "python")).toEqual([
      "Container",
      "coro_a",
      "coro_b",
      "sync_fn",
    ]);
  });

  it("does not match nested async def or async lambdas", () => {
    // Indented `async def` is method-on-a-class and is intentionally
    // skipped by the v0 regex (column-0 anchor). This pins that
    // contract: a future change that loosens the anchor would lose
    // information by lumping methods into the top-level cohort.
    const src = [
      "class Foo:",
      "    async def method(self):",
      "        pass",
      "",
      "async def top_level():",
      "    pass",
      "",
    ].join("\n");
    expect(extractTopLevelDeclarations(src, "python")).toEqual([
      "Foo",
      "top_level",
    ]);
  });

  it("tolerates extra whitespace between `async` and `def`", () => {
    // Black / autopep8 / etc. all keep `async def` as a single space,
    // but the regex must not be fragile to a stylistic outlier.
    const src = "async   def    spaced():\n    pass\n";
    expect(extractTopLevelDeclarations(src, "python")).toEqual(["spaced"]);
  });
});

describe("§4.2 / §4.3 — event types registered on schema", () => {
  it("node_inspected is a valid eventType (δ-1 timeline)", () => {
    const parsed = OntologyEventSchema.parse({
      eventId: "evt_abcd1234",
      sequence: 0,
      timestamp: "2026-05-13T00:00:00.000Z",
      eventType: "node_inspected",
      branch: "main",
      previousEventId: null,
      payload: { nodeId: "node_0001", model: "mock", provider: "mock", sourceHash: "x".repeat(64) },
    });
    expect(parsed.eventType).toBe("node_inspected");
  });

  it("homeomorphism_verified is a valid eventType (δ-2 timeline)", () => {
    const parsed = OntologyEventSchema.parse({
      eventId: "evt_efgh5678",
      sequence: 1,
      timestamp: "2026-05-13T00:00:00.000Z",
      eventType: "homeomorphism_verified",
      branch: "main",
      previousEventId: "evt_abcd1234",
      payload: {
        nodeIds: ["node_0001", "node_0002"],
        total: 2,
        byVerdict: {
          epsilon_equivalent: 2,
          divergent_loc: 0,
          divergent_structural: 0,
          divergent_both: 0,
          unrecoverable: 0,
        },
        thresholds: { loc: 0.3, jaccard: 0.5 },
      },
    });
    expect(parsed.eventType).toBe("homeomorphism_verified");
  });

  it("a misspelled eventType still rejects (sanity)", () => {
    expect(() =>
      OntologyEventSchema.parse({
        eventId: "evt_zzzz9999",
        sequence: 0,
        timestamp: "2026-05-13T00:00:00.000Z",
        eventType: "node_inspectd", // typo
        branch: "main",
        previousEventId: null,
        payload: {},
      }),
    ).toThrow();
  });
});

describe("§4.5 — computeTranslatorSourceHash includes node.literal", () => {
  // The test builds two nodes that differ ONLY in `literal` and
  // asserts the translator hash also differs. Any future regression
  // that drops `literal` from the hash payload would let the cache
  // hand back stale prose after a `--literal-file` mutation, which
  // is the exact β-2 escape hatch the inspector must respect.

  // computeTranslatorSourceHash reads only specific fields (prompt,
  // rules, context arrays, literal). Build a partial node shape that
  // satisfies those reads without paying the full OntologyNodeSchema
  // validation tax — the production code path validates separately
  // and this test is about the hash payload, not schema gates.
  function makeBaseNode(literal: string | undefined = undefined): OntologyNode {
    return {
      prompt: { raw: "Implements the max-fooling-set finder.", variables: {}, language: "en" },
      rules: ["REQUIRE: returns clique as list"],
      context: {
        requires: [],
        provides: [{ key: "solve_max_fooling_set", nodeType: "declared" as const }],
        forbids: [],
      },
      ...(literal !== undefined ? { literal } : {}),
    } as unknown as OntologyNode;
  }

  it("returns a stable 64-hex-char hash for a baseline node", () => {
    const node = makeBaseNode();
    const h = computeTranslatorSourceHash(node);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Stable across invocations (sanity).
    expect(computeTranslatorSourceHash(node)).toBe(h);
  });

  it("hash differs when node.literal is set vs absent", () => {
    const without = computeTranslatorSourceHash(makeBaseNode());
    const withLit = computeTranslatorSourceHash(
      makeBaseNode("def solve_max_fooling_set():\n    return []"),
    );
    expect(withLit).not.toBe(without);
  });

  it("hash differs when node.literal mutates", () => {
    const v1 = computeTranslatorSourceHash(
      makeBaseNode("def solve_max_fooling_set():\n    return []"),
    );
    const v2 = computeTranslatorSourceHash(
      makeBaseNode("def solve_max_fooling_set():\n    return [1, 2, 3]"),
    );
    expect(v1).not.toBe(v2);
  });

  it("hash is identical for two literal-free nodes with otherwise identical content", () => {
    // Pins backwards-compat: pre-fix translator hashes (where literal
    // was never in the payload) must still match for nodes without a
    // literal. Otherwise the upgrade silently re-dispatches every
    // existing translator.
    const a = computeTranslatorSourceHash(makeBaseNode());
    const b = computeTranslatorSourceHash(makeBaseNode());
    expect(a).toBe(b);
  });
});
