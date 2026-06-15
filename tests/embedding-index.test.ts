import { describe, it, expect } from "vitest";

import {
  cosineSimilarity,
  embeddingSourceHash,
  embeddingSourceText,
  rankBySimilarity,
  suggestSemanticPairs,
  type EmbeddingIndex,
} from "../src/kernel/semantic/embedding-index.js";
import { mockEmbedText, MOCK_EMBED_DIM } from "../src/runtime/llm/mock.js";
import type { OntologyEdge, OntologyNode } from "../src/kernel/schemas/ontology.js";

// Unit coverage for the semantic-index primitives. The mock embedder is
// bag-of-words feature hashing, so similarity assertions can be MEANINGFUL:
// shared vocabulary ⇒ high cosine, disjoint vocabulary ⇒ low cosine.

const node = (over: Partial<OntologyNode> & { id: string; label: string }): OntologyNode =>
  ({
    kind: "component",
    status: "active",
    prompt: { raw: "", variables: {} },
    rules: [],
    context: { requires: [], provides: [], forbids: [] },
    coordinates: { abstraction: "module", plane: "semantic", manifestation: "intent", branch: "main", time: 0 },
    outputs: { files: [] },
    integrity: { hash: `hash_${over.id}` },
    ...over,
  }) as unknown as OntologyNode;

const edge = (from: string, to: string): OntologyEdge =>
  ({
    edgeId: `edge_${from}_${to}`,
    from,
    to,
    type: "depends_on",
    branch: "main",
  }) as unknown as OntologyEdge;

describe("mockEmbedText — deterministic feature hashing", () => {
  it("is deterministic and L2-normalised", () => {
    const a = mockEmbedText("compile the intent graph");
    const b = mockEmbedText("compile the intent graph");
    expect(a).toEqual(b);
    expect(a.length).toBe(MOCK_EMBED_DIM);
    const norm = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("shared vocabulary scores higher than disjoint vocabulary", () => {
    const compileA = mockEmbedText("compile intent graph into artifacts");
    const compileB = mockEmbedText("the compile step turns intent into artifacts");
    const unrelated = mockEmbedText("walrus accordion sunset");
    expect(cosineSimilarity(compileA, compileB)).toBeGreaterThan(
      cosineSimilarity(compileA, unrelated),
    );
  });

  it("empty text yields the zero vector (and zero similarity)", () => {
    const zero = mockEmbedText("");
    expect(zero.every((v) => v === 0)).toBe(true);
    expect(cosineSimilarity(zero, mockEmbedText("anything"))).toBe(0);
  });
});

describe("embeddingSourceText / embeddingSourceHash", () => {
  it("concatenates label, prompt, rules, and provided-token descriptions", () => {
    const text = embeddingSourceText(
      node({
        id: "node_a",
        label: "Compiler",
        prompt: { raw: "Compile intent into code.", variables: {} },
        rules: ["Never mutate the graph."],
        context: {
          requires: [],
          provides: [{ key: "compileNode", nodeType: "component", description: "the F functor" }],
          forbids: [],
        },
      } as unknown as Partial<OntologyNode> & { id: string; label: string }),
    );
    expect(text).toContain("Compiler");
    expect(text).toContain("Compile intent into code.");
    expect(text).toContain("Never mutate the graph.");
    expect(text).toContain("compileNode: the F functor");
  });

  it("hash changes with text, provider, and model", () => {
    const base = embeddingSourceHash("text", "mock", "m1");
    expect(embeddingSourceHash("text2", "mock", "m1")).not.toBe(base);
    expect(embeddingSourceHash("text", "ollama", "m1")).not.toBe(base);
    expect(embeddingSourceHash("text", "mock", "m2")).not.toBe(base);
    expect(embeddingSourceHash("text", "mock", "m1")).toBe(base);
  });
});

function indexOf(nodes: OntologyNode[]): EmbeddingIndex {
  return {
    version: 1,
    provider: "mock",
    model: "mock_embed",
    dim: MOCK_EMBED_DIM,
    createdAt: "2026-06-10T00:00:00.000Z",
    entries: nodes.map((n) => ({
      nodeId: n.id,
      sourceHash: embeddingSourceHash(embeddingSourceText(n), "mock", "mock_embed"),
      vector: mockEmbedText(embeddingSourceText(n)),
    })),
  };
}

describe("rankBySimilarity / suggestSemanticPairs", () => {
  const compiler = node({
    id: "node_compiler",
    label: "compiler functor",
    prompt: { raw: "compile intent graph into code artifacts", variables: {} },
  } as never);
  const compilerDocs = node({
    id: "node_compiler_docs",
    label: "compiler documentation",
    prompt: { raw: "document how the compiler turns intent into code artifacts", variables: {} },
  } as never);
  const podcast = node({
    id: "node_podcast",
    label: "podcast briefing",
    prompt: { raw: "draft a radio briefing about broccoli seeds", variables: {} },
  } as never);
  const nodes = [compiler, compilerDocs, podcast];
  const index = indexOf(nodes);

  it("ranks the vocabulary-sharing node first", () => {
    const query = mockEmbedText("how does compiling intent produce code");
    const ranked = rankBySimilarity(index, query, { top: 3 });
    expect(ranked[0].nodeId).toMatch(/node_compiler/);
    expect(ranked.map((r) => r.nodeId)).toContain("node_podcast");
    expect(ranked[ranked.length - 1].nodeId).toBe("node_podcast");
  });

  it("suggests the unlinked similar pair and respects existing edges in either direction", () => {
    const open = suggestSemanticPairs({ index, nodes, edges: [], threshold: 0.3, limit: 10 });
    expect(open.some((p) => p.from === "node_compiler" && p.to === "node_compiler_docs")).toBe(true);

    const withEdge = suggestSemanticPairs({
      index,
      nodes,
      edges: [edge("node_compiler_docs", "node_compiler")],
      threshold: 0.3,
      limit: 10,
    });
    expect(
      withEdge.some((p) => p.from === "node_compiler" && p.to === "node_compiler_docs"),
    ).toBe(false);
  });

  it("never pairs nodes across branches", () => {
    const otherBranch = node({
      id: "node_compiler_b2",
      label: "compiler functor",
      prompt: { raw: "compile intent graph into code artifacts", variables: {} },
      coordinates: { abstraction: "module", plane: "semantic", manifestation: "intent", branch: "exp", time: 0 },
    } as never);
    const all = [compiler, otherBranch];
    const pairs = suggestSemanticPairs({
      index: indexOf(all),
      nodes: all,
      edges: [],
      threshold: 0.1,
      limit: 10,
    });
    expect(pairs).toEqual([]);
  });

  it("threshold and limit bound the hypothesis set", () => {
    const none = suggestSemanticPairs({ index, nodes, edges: [], threshold: 0.999, limit: 10 });
    expect(none).toEqual([]);
    const capped = suggestSemanticPairs({ index, nodes, edges: [], threshold: -1, limit: 1 });
    expect(capped.length).toBe(1);
  });
});
