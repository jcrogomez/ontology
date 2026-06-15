import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { getOntologyPaths } from "../core/project/paths.js";
import { loadNodes } from "../core/project/load.js";
import { ensureDir, writeJson, readJson } from "../core/fs/json.js";
import { createMockLlmAdapter } from "../../runtime/llm/mock.js";
import { createOllamaAdapter } from "../../runtime/llm/ollama/adapter.js";
import type { LlmAdapter } from "../../runtime/llm/types.js";
import type { OntologyEdge, OntologyNode } from "../schemas/ontology.js";

// Local semantic index over the intent graph — the Cursor-inspired piece,
// with the thesis inverted. Cursor embeds CODE because code is its source
// of truth; here we embed the INTENT TEXT of each node (label, prompt,
// rules, provided-token descriptions), because the graph is the durable
// artifact and the index is a disposable accelerator over it.
//
// Scope discipline:
//   - The index is derived cache, content-addressed per node by a
//     sourceHash of (intent text + provider/model). A node whose text
//     changed re-embeds; everything else is reused. Delete the file and
//     nothing of record is lost.
//   - Similarity is HYPOTHESIS generation only. Nothing in this module
//     mutates the graph; the suggester's output becomes edge_create
//     PROPOSALS that pass the same gate as any other mutation.
//   - Brute-force cosine over a few hundred vectors is exact and instant;
//     a vector database would be over-engineering at this scale.
//
// Providers: mock (deterministic feature hashing — CI runs the whole
// pipeline at $0) and ollama (nomic-embed-text by default — local, free).

export type EmbeddingProvider = "mock" | "ollama";

export interface EmbeddingIndexEntry {
  nodeId: string;
  sourceHash: string;
  vector: number[];
}

export interface EmbeddingIndex {
  version: 1;
  provider: EmbeddingProvider;
  model: string;
  dim: number;
  createdAt: string;
  entries: EmbeddingIndexEntry[];
}

export interface BuildIndexOptions {
  cwd?: string;
  provider?: EmbeddingProvider;
  model?: string;
  host?: string;
}

export interface BuildIndexStats {
  total: number;
  embedded: number;
  reused: number;
  skippedEmpty: number;
}

export const DEFAULT_EMBEDDING_MODELS: Record<EmbeddingProvider, string> = {
  mock: "mock_embed",
  ollama: "nomic-embed-text",
};

/** Max characters of intent text sent to the embedder (small local context windows). */
export const EMBED_MAX_CHARS = 4000;

/**
 * The text that represents a node in the index: its intent surface, not its
 * compiled artifact. Stable concatenation — changing this function changes
 * every sourceHash, which (correctly) forces a full re-embed.
 */
export function embeddingSourceText(node: OntologyNode): string {
  const provides = node.context.provides.map((p) =>
    p.description ? `${p.key}: ${p.description}` : p.key,
  );
  const parts = [
    node.label,
    node.prompt?.raw ?? "",
    ...node.rules,
    ...provides,
  ];
  return parts
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0)
    .join("\n");
}

export function embeddingSourceHash(
  text: string,
  provider: string,
  model: string,
): string {
  return createHash("sha256")
    .update(`${provider}\u0000${model}\u0000${text}`)
    .digest("hex");
}

export function resolveEmbeddingAdapter(
  provider: EmbeddingProvider,
  options: { host?: string } = {},
): LlmAdapter {
  if (provider === "mock") return createMockLlmAdapter();
  if (provider === "ollama") return createOllamaAdapter({ host: options.host });
  throw new Error(`Unsupported embedding provider: ${provider as string} (use mock or ollama)`);
}

export function loadEmbeddingIndex(cwd: string = process.cwd()): EmbeddingIndex | null {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.embeddingIndexPath)) return null;
  return readJson<EmbeddingIndex>(paths.embeddingIndexPath);
}

export async function buildEmbeddingIndex(
  options: BuildIndexOptions = {},
): Promise<{ index: EmbeddingIndex; stats: BuildIndexStats }> {
  const cwd = options.cwd ?? process.cwd();
  const provider = options.provider ?? "mock";
  const model = options.model ?? DEFAULT_EMBEDDING_MODELS[provider];
  const adapter = resolveEmbeddingAdapter(provider, { host: options.host });
  if (!adapter.embed) {
    throw new Error(`Provider ${provider} has no embedding support`);
  }

  const nodes = loadNodes(cwd);
  const previous = loadEmbeddingIndex(cwd);
  const reusable = new Map<string, EmbeddingIndexEntry>();
  if (previous && previous.provider === provider && previous.model === model) {
    for (const entry of previous.entries) reusable.set(entry.sourceHash, entry);
  }

  const entries: EmbeddingIndexEntry[] = [];
  const pending: Array<{ nodeId: string; sourceHash: string; text: string }> = [];
  let skippedEmpty = 0;
  let reused = 0;

  for (const node of nodes) {
    // Truncated for embedding: local embedding models have small context
    // windows (nomic-embed-text rejects inputs past its context length —
    // surfaced by the 2026-06-11 self-ingest, where cli.ts's contract
    // prompt alone overflowed it). The retrieval signal concentrates in
    // the label + the head of the prompt, so the cut is cheap; the hash
    // covers the SAME truncated text so re-embeds stay consistent.
    const text = embeddingSourceText(node).slice(0, EMBED_MAX_CHARS);
    if (text.length === 0) {
      skippedEmpty += 1;
      continue;
    }
    const sourceHash = embeddingSourceHash(text, provider, model);
    const cached = reusable.get(sourceHash);
    if (cached && cached.nodeId === node.id) {
      entries.push(cached);
      reused += 1;
    } else {
      pending.push({ nodeId: node.id, sourceHash, text });
    }
  }

  if (pending.length > 0) {
    const response = await adapter.embed({ model, input: pending.map((p) => p.text) });
    if (response.embeddings.length !== pending.length) {
      throw new Error(
        `embedding count mismatch: sent ${pending.length} texts, received ${response.embeddings.length} vectors`,
      );
    }
    pending.forEach((p, i) => {
      entries.push({ nodeId: p.nodeId, sourceHash: p.sourceHash, vector: response.embeddings[i] });
    });
  }

  entries.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  const index: EmbeddingIndex = {
    version: 1,
    provider,
    model,
    dim: entries[0]?.vector.length ?? 0,
    createdAt: new Date().toISOString(),
    entries,
  };

  const paths = getOntologyPaths(cwd);
  ensureDir(paths.embeddingsDir);
  writeJson(paths.embeddingIndexPath, index);

  return {
    index,
    stats: {
      total: nodes.length,
      embedded: pending.length,
      reused,
      skippedEmpty,
    },
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SemanticRanking {
  nodeId: string;
  score: number;
}

export function rankBySimilarity(
  index: EmbeddingIndex,
  queryVector: number[],
  options: { top?: number; minScore?: number } = {},
): SemanticRanking[] {
  const top = options.top ?? 10;
  const minScore = options.minScore ?? -1;
  return index.entries
    .map((e) => ({ nodeId: e.nodeId, score: cosineSimilarity(queryVector, e.vector) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || (a.nodeId < b.nodeId ? -1 : 1))
    .slice(0, top);
}

export interface SemanticPair {
  from: string;
  to: string;
  score: number;
}

/**
 * High-similarity node pairs with NO existing edge between them, in either
 * direction, of any type — the hypothesis set for `onto semantic links`.
 * Pairs are unordered hypotheses; `from` is just the lexicographically
 * smaller id. The human (or a downstream verifier) picks the edge type and
 * direction — similarity has no opinion on either.
 */
export function suggestSemanticPairs(input: {
  index: EmbeddingIndex;
  nodes: ReadonlyArray<OntologyNode>;
  edges: ReadonlyArray<OntologyEdge>;
  threshold?: number;
  limit?: number;
}): SemanticPair[] {
  const threshold = input.threshold ?? 0.7;
  const limit = input.limit ?? 10;
  const nodesById = new Map(input.nodes.map((n) => [n.id, n]));
  const linked = new Set<string>();
  for (const edge of input.edges) {
    linked.add(`${edge.from}\u0000${edge.to}`);
    linked.add(`${edge.to}\u0000${edge.from}`);
  }

  const pairs: SemanticPair[] = [];
  const entries = input.index.entries;
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const nodeA = nodesById.get(a.nodeId);
    if (!nodeA) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      const nodeB = nodesById.get(b.nodeId);
      if (!nodeB) continue;
      if (nodeA.coordinates.branch !== nodeB.coordinates.branch) continue;
      if (linked.has(`${a.nodeId}\u0000${b.nodeId}`)) continue;
      const score = cosineSimilarity(a.vector, b.vector);
      if (score < threshold) continue;
      const [from, to] = a.nodeId < b.nodeId ? [a.nodeId, b.nodeId] : [b.nodeId, a.nodeId];
      pairs.push({ from, to, score });
    }
  }
  pairs.sort(
    (x, y) => y.score - x.score || (x.from < y.from ? -1 : 1) || (x.to < y.to ? -1 : 1),
  );
  return pairs.slice(0, limit);
}

/**
 * Nodes whose intent text changed since the index was built (or that joined
 * after it). Surfaced as a staleness warning by consumers; rebuilding is
 * one `onto semantic index` away.
 */
export function staleIndexNodeIds(index: EmbeddingIndex, nodes: ReadonlyArray<OntologyNode>): string[] {
  const byNodeId = new Map(index.entries.map((e) => [e.nodeId, e.sourceHash]));
  const stale: string[] = [];
  for (const node of nodes) {
    const text = embeddingSourceText(node);
    if (text.length === 0) continue;
    const expected = embeddingSourceHash(text, index.provider, index.model);
    if (byNodeId.get(node.id) !== expected) stale.push(node.id);
  }
  return stale.sort();
}
