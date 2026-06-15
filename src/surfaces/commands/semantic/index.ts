import * as fs from "node:fs";
import { z } from "zod";
import { getOntologyPaths } from "../../../kernel/core/project/paths.js";
import { loadNodes, loadEdges, loadNodeById } from "../../../kernel/core/project/load.js";
import { EdgeTypeSchema } from "../../../kernel/schemas/ontology.js";
import { validateEdgeDirection } from "../../../kernel/graph/poset.js";
import { createProposal } from "../../../kernel/core/proposals/persist.js";
import {
  buildEmbeddingIndex,
  loadEmbeddingIndex,
  staleIndexNodeIds,
  suggestSemanticPairs,
  DEFAULT_EMBEDDING_MODELS,
  type EmbeddingProvider,
} from "../../../kernel/semantic/embedding-index.js";
import { errorMessage } from "../../../kernel/core/errors.js";

// `onto semantic` — the local semantic index over the intent graph and its
// consumers. Two verbs:
//
//   onto semantic index   build/refresh .ontology/embeddings/index.json
//                         (incremental: unchanged nodes reuse their vector)
//   onto semantic links   rank high-similarity UNLINKED node pairs; with
//                         --propose --type <t> each pair becomes an
//                         edge_create PROPOSAL through the standard gate —
//                         embeddings generate hypotheses, never edges.

const PROVIDERS: EmbeddingProvider[] = ["mock", "ollama"];

function parseProvider(raw: unknown): EmbeddingProvider {
  const provider = typeof raw === "string" ? raw : "mock";
  if (!PROVIDERS.includes(provider as EmbeddingProvider)) {
    throw new Error(
      `Unsupported embedding provider: ${provider}. Expected one of: ${PROVIDERS.join(", ")}`,
    );
  }
  return provider as EmbeddingProvider;
}

export interface SemanticIndexOptions {
  provider?: string;
  model?: string;
  host?: string;
  json?: boolean;
  cwd?: string;
}

export async function semanticIndexCommand(options: SemanticIndexOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.ontologyDir)) {
    failWith("no .ontology/ found — run `onto init` first", options.json);
    return;
  }

  let provider: EmbeddingProvider;
  try {
    provider = parseProvider(options.provider);
  } catch (err: unknown) {
    failWith(errorMessage(err), options.json);
    return;
  }
  const model = options.model ?? DEFAULT_EMBEDDING_MODELS[provider];

  let result;
  try {
    result = await buildEmbeddingIndex({ cwd, provider, model, host: options.host });
  } catch (err: unknown) {
    failWith(`failed to build embedding index: ${errorMessage(err)}`, options.json);
    return;
  }

  const report = {
    provider,
    model,
    dim: result.index.dim,
    indexedNodes: result.index.entries.length,
    ...result.stats,
    indexPath: paths.embeddingIndexPath,
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } else {
    console.log(`=== ONTOLOGY SEMANTIC INDEX ===`);
    console.log(`Provider/model:  ${provider}/${model} (dim ${result.index.dim})`);
    console.log(`Indexed nodes:   ${result.index.entries.length} of ${result.stats.total}`);
    console.log(`Embedded fresh:  ${result.stats.embedded}`);
    console.log(`Reused cached:   ${result.stats.reused}`);
    if (result.stats.skippedEmpty > 0) {
      console.log(`Skipped (empty): ${result.stats.skippedEmpty} node(s) with no intent text`);
    }
    console.log(`Index:           ${paths.embeddingIndexPath}`);
    console.log(``);
    console.log(`Next:`);
    console.log(`  onto semantic links            # unlinked high-similarity pairs`);
    console.log(`  onto query --semantic "<text>" # rank nodes against a question`);
  }
}

export interface SemanticLinksOptions {
  threshold?: string;
  top?: string;
  propose?: boolean;
  type?: string;
  json?: boolean;
  cwd?: string;
}

export async function semanticLinksCommand(options: SemanticLinksOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const index = loadEmbeddingIndex(cwd);
  if (!index) {
    failWith("no semantic index found — run `onto semantic index` first", options.json);
    return;
  }

  const threshold = options.threshold !== undefined ? Number(options.threshold) : 0.7;
  const top = options.top !== undefined ? Number(options.top) : 10;
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    failWith(`invalid --threshold: ${options.threshold} (expected a number in [-1, 1])`, options.json);
    return;
  }
  if (!Number.isFinite(top) || top <= 0) {
    failWith(`invalid --top: ${options.top} (expected a positive number)`, options.json);
    return;
  }

  let edgeType: z.infer<typeof EdgeTypeSchema> | null = null;
  if (options.propose) {
    if (!options.type) {
      failWith(
        "--propose requires --type <edgeType>: similarity is symmetric and has no opinion on edge semantics — the human picks the type",
        options.json,
      );
      return;
    }
    try {
      edgeType = EdgeTypeSchema.parse(options.type);
    } catch {
      failWith(
        `Invalid edge type: "${options.type}". Expected one of: ${EdgeTypeSchema.options.join(", ")}`,
        options.json,
      );
      return;
    }
  }

  const nodes = loadNodes(cwd);
  const edges = loadEdges(cwd);
  const stale = staleIndexNodeIds(index, nodes);
  const pairs = suggestSemanticPairs({ index, nodes, edges, threshold, limit: top });

  const proposals: Array<{ proposalId: string; from: string; to: string; score: number }> = [];
  const skipped: Array<{ from: string; to: string; reason: string }> = [];
  if (options.propose && edgeType) {
    for (const pair of pairs) {
      const fromNode = loadNodeById(pair.from, cwd);
      const toNode = loadNodeById(pair.to, cwd);
      if (!fromNode || !toNode) {
        skipped.push({ from: pair.from, to: pair.to, reason: "endpoint not found" });
        continue;
      }
      const direction = validateEdgeDirection({
        sourceLevel: fromNode.coordinates.abstraction,
        targetLevel: toNode.coordinates.abstraction,
        edgeType,
      });
      if (!direction.ok) {
        skipped.push({ from: pair.from, to: pair.to, reason: direction.reason });
        continue;
      }
      try {
        const { proposal } = createProposal({
          mutation: {
            kind: "edge_create",
            payload: { from: pair.from, to: pair.to, type: edgeType, branch: null },
            fromHash: fromNode.integrity.hash,
            toHash: toNode.integrity.hash,
          },
          source: null,
          validation: null,
          provenance: {
            derivedFrom: [pair.from, pair.to],
            rationale: `semantic similarity ${pair.score.toFixed(3)} (${index.provider}/${index.model} embedding) — hypothesis, verify before apply`,
          },
          cwd,
        });
        proposals.push({ proposalId: proposal.id, from: pair.from, to: pair.to, score: pair.score });
      } catch (err: unknown) {
        skipped.push({ from: pair.from, to: pair.to, reason: errorMessage(err) });
      }
    }
  }

  const report = {
    provider: index.provider,
    model: index.model,
    threshold,
    top,
    staleNodeIds: stale,
    pairs,
    ...(options.propose ? { edgeType, proposals, skipped } : {}),
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY SEMANTIC LINKS (embedding hypotheses) ===`);
  console.log(`Index:      ${index.provider}/${index.model} · threshold ≥ ${threshold} · top ${top}`);
  if (stale.length > 0) {
    console.log(`⚠ Stale:    ${stale.length} node(s) changed since the index was built — run \`onto semantic index\``);
  }
  if (pairs.length === 0) {
    console.log(`Pairs:      none above the threshold — every similar pair is already linked, or lower --threshold`);
    return;
  }
  console.log(`Pairs:      ${pairs.length} unlinked candidate(s)`);
  for (const pair of pairs) {
    console.log(`  ${pair.score.toFixed(3)}  ${pair.from} ↔ ${pair.to}`);
  }
  if (options.propose) {
    console.log(``);
    console.log(`Proposals created (${proposals.length}):`);
    for (const p of proposals) {
      console.log(`  ${p.proposalId}  ${p.from} → ${p.to}  (${p.score.toFixed(3)})`);
    }
    for (const s of skipped) {
      console.log(`  ✖ skipped ${s.from} → ${s.to}: ${s.reason}`);
    }
    if (proposals.length > 0) {
      console.log(``);
      console.log(`Review with \`onto proposal list\`, then apply or reject each.`);
    }
  } else {
    console.log(``);
    console.log(`Pick a type per pair and propose (similarity does not choose semantics):`);
    for (const pair of pairs) {
      console.log(`  onto propose link ${pair.from} ${pair.to} <edgeType> --rationale "semantic similarity ${pair.score.toFixed(3)}"`);
    }
    console.log(`Or batch with an explicit type: onto semantic links --propose --type <edgeType>`);
  }
}

function failWith(msg: string, json?: boolean): void {
  process.exitCode = 1;
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
}
