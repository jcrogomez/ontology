// `onto query` runner.
//
// Translates CLI options (either a JSON shape literal or per-field flags)
// into a validated QueryShape, runs the representable-functor matcher, and
// prints the result either as a pretty table (default) or full JSON.
//
// Read-only: no graph mutation, no LLM dispatch. The command never writes
// to .ontology/.

import * as fs from "node:fs";
import { assertOntologyProject, loadEdges, loadNodes } from "../../core/project/load.js";
import type { OntologyNode } from "../../schemas/ontology.js";
import { QueryShapeSchema, type QueryShape } from "../../runtime/query/types.js";
import { queryNodes } from "../../runtime/query/representable.js";
import {
  loadEmbeddingIndex,
  resolveEmbeddingAdapter,
  staleIndexNodeIds,
} from "../../runtime/semantic/embedding-index.js";
import { renderTable } from "../../core/render/table.js";
import { bold, dim, byKind, byLevel, byStatus, statusGlyph } from "../../core/render/style.js";

export interface QueryCommandOptions {
  shape?: string;
  shapeFile?: string;
  kind?: string;
  abstraction?: string;
  plane?: string;
  manifestation?: string;
  status?: string;
  branch?: string;
  provides?: string;
  requires?: string;
  forbids?: string;
  hasIncoming?: string;
  hasOutgoing?: string;
  semantic?: string;
  top?: string;
  minScore?: string;
  json?: boolean;
}

// Splits a comma-separated CLI flag value into trimmed non-empty tokens.
// Empty strings are dropped so `--kind ,rule` and `--kind rule` are
// equivalent — defensive against shell-quoting accidents.
function csv(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  return list.length === 0 ? undefined : list;
}

// Builds a QueryShape from the per-field CLI flags. Each typed dimension is
// validated through the corresponding ontology schema so a typo (e.g.
// --kind rul) is rejected with the same error path as if it appeared in a
// JSON shape literal.
function shapeFromFlags(options: QueryCommandOptions): unknown {
  const shape: Record<string, unknown> = {};
  const k = csv(options.kind);
  if (k) shape.kind = k;
  const a = csv(options.abstraction);
  if (a) shape.abstraction = a;
  const p = csv(options.plane);
  if (p) shape.plane = p;
  const m = csv(options.manifestation);
  if (m) shape.manifestation = m;
  const s = csv(options.status);
  if (s) shape.status = s;
  if (options.branch !== undefined) shape.branch = options.branch;
  const prov = csv(options.provides);
  if (prov) shape.provides = prov;
  const req = csv(options.requires);
  if (req) shape.requires = req;
  const forb = csv(options.forbids);
  if (forb) shape.forbids = forb;
  const inc = csv(options.hasIncoming);
  if (inc) shape.hasIncoming = inc;
  const out = csv(options.hasOutgoing);
  if (out) shape.hasOutgoing = out;
  return shape;
}

// Resolves the QueryShape source per the precedence in
// docs/design/laws/QUERY_REPRESENTABLE.md: --shape > --shape-file > per-field flags.
// Throws a clear Error when --shape and --shape-file are combined, when
// --shape-file points at a missing or invalid file, or when the resulting
// shape fails Zod validation.
export function resolveShape(options: QueryCommandOptions): QueryShape {
  const hasInline = options.shape !== undefined;
  const hasFile = options.shapeFile !== undefined;

  if (hasInline && hasFile) {
    throw new Error("--shape and --shape-file are mutually exclusive");
  }

  let raw: unknown;
  if (hasInline) {
    try {
      raw = JSON.parse(options.shape!);
    } catch (err) {
      throw new Error(`--shape is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (hasFile) {
    if (!fs.existsSync(options.shapeFile!)) {
      throw new Error(`--shape-file does not exist: ${options.shapeFile}`);
    }
    const content = fs.readFileSync(options.shapeFile!, "utf-8");
    try {
      raw = JSON.parse(content);
    } catch (err) {
      throw new Error(`--shape-file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    raw = shapeFromFlags(options);
  }

  const parsed = QueryShapeSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3)
      .map(i => `${i.path.length > 0 ? i.path.join(".") + ": " : ""}${i.message}`)
      .join("; ");
    throw new Error(`Invalid query shape: ${issues}`);
  }
  return parsed.data;
}

function printPretty(matches: OntologyNode[], shape: QueryShape): void {
  console.log(bold("=== ONTOLOGY QUERY (representable) ==="));
  console.log(`${dim("Shape:")}   ${describeShape(shape)}`);
  console.log(`${dim("Matches:")} ${matches.length === 0 ? dim("0") : String(matches.length)}`);
  console.log("");
  if (matches.length === 0) {
    console.log(dim("(no node satisfies the shape)"));
    return;
  }
  console.log(renderTable<OntologyNode>(matches, [
    { header: "", render: (r) => statusGlyph((r as OntologyNode).status) },
    { header: "ID",          render: (r) => (r as OntologyNode).id },
    { header: "Kind",        render: (r) => byKind((r as OntologyNode).kind) },
    { header: "Level",       render: (r) => byLevel((r as OntologyNode).coordinates.abstraction) },
    { header: "Status",      render: (r) => byStatus((r as OntologyNode).status) },
    { header: "Label",       render: (r) => (r as OntologyNode).label, maxWidth: 50 },
  ]));
}

// Compact human-readable rendering of the active shape, useful in the
// pretty header so a user can see what they actually queried for.
function describeShape(shape: QueryShape): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(shape)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      parts.push(`${k}=[${v.join(",")}]`);
    } else {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.length === 0 ? "(empty — match all)" : parts.join(" ");
}

export async function runQueryCommand(options: QueryCommandOptions): Promise<void> {
  assertOntologyProject();

  let shape: QueryShape;
  try {
    shape = resolveShape(options);
  } catch (err) {
    failWith(err instanceof Error ? err.message : String(err), options.json);
    return;
  }

  const nodes = loadNodes();
  const edges = loadEdges();
  const matches = queryNodes(nodes, shape, edges);

  // Semantic access path (hybrid retrieval): the structural shape filters
  // FIRST — exact, deterministic — then the survivors are re-ranked by
  // cosine similarity against the local embedding index. Similarity never
  // overrides a structural constraint; it only orders what already matched.
  if (options.semantic !== undefined) {
    const queryText = options.semantic.trim();
    if (queryText.length === 0) {
      failWith("--semantic requires non-empty text", options.json);
      return;
    }
    const index = loadEmbeddingIndex();
    if (!index) {
      failWith("no semantic index found — run `onto semantic index` first", options.json);
      return;
    }
    const top = options.top !== undefined ? Number(options.top) : 10;
    const minScore = options.minScore !== undefined ? Number(options.minScore) : -1;
    if (!Number.isFinite(top) || top <= 0) {
      failWith(`invalid --top: ${options.top} (expected a positive number)`, options.json);
      return;
    }
    if (!Number.isFinite(minScore)) {
      failWith(`invalid --min-score: ${options.minScore} (expected a number)`, options.json);
      return;
    }

    const adapter = resolveEmbeddingAdapter(index.provider);
    let queryVector: number[];
    try {
      const response = await adapter.embed!({ model: index.model, input: [queryText] });
      queryVector = response.embeddings[0];
    } catch (err) {
      failWith(`failed to embed query text: ${err instanceof Error ? err.message : String(err)}`, options.json);
      return;
    }

    const vectorsByNodeId = new Map(index.entries.map((e) => [e.nodeId, e.vector]));
    const stale = staleIndexNodeIds(index, matches);
    const ranked = matches
      .filter((n) => vectorsByNodeId.has(n.id))
      .map((n) => ({
        node: n,
        score: cosine(queryVector, vectorsByNodeId.get(n.id)!),
      }))
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score || (a.node.id < b.node.id ? -1 : 1))
      .slice(0, top);
    const notIndexed = matches.filter((n) => !vectorsByNodeId.has(n.id)).map((n) => n.id);

    if (options.json) {
      console.log(JSON.stringify({
        shape,
        semantic: {
          query: queryText,
          provider: index.provider,
          model: index.model,
          top,
          minScore,
          staleNodeIds: stale,
          notIndexedNodeIds: notIndexed,
        },
        count: ranked.length,
        nodes: ranked.map((r) => r.node),
        scores: ranked.map((r) => r.score),
      }, null, 2));
      return;
    }

    console.log(bold("=== ONTOLOGY QUERY (representable + semantic) ==="));
    console.log(`${dim("Shape:")}    ${describeShape(shape)}`);
    console.log(`${dim("Semantic:")} "${queryText}" via ${index.provider}/${index.model}`);
    if (stale.length > 0) {
      console.log(`${dim("⚠ Stale:")}  ${stale.length} matched node(s) changed since indexing — run \`onto semantic index\``);
    }
    if (notIndexed.length > 0) {
      console.log(`${dim("⚠ Missing:")} ${notIndexed.length} matched node(s) not in the index (no intent text or never indexed)`);
    }
    console.log(`${dim("Matches:")}  ${ranked.length === 0 ? dim("0") : String(ranked.length)}`);
    console.log("");
    if (ranked.length === 0) {
      console.log(dim("(no indexed node satisfies the shape and score floor)"));
      return;
    }
    console.log(renderTable(ranked, [
      { header: "Score", render: (r) => (r as { score: number }).score.toFixed(3) },
      { header: "", render: (r) => statusGlyph((r as { node: OntologyNode }).node.status) },
      { header: "ID", render: (r) => (r as { node: OntologyNode }).node.id },
      { header: "Kind", render: (r) => byKind((r as { node: OntologyNode }).node.kind) },
      { header: "Level", render: (r) => byLevel((r as { node: OntologyNode }).node.coordinates.abstraction) },
      { header: "Label", render: (r) => (r as { node: OntologyNode }).node.label, maxWidth: 44 },
    ]));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({
      shape,
      count: matches.length,
      nodes: matches,
    }, null, 2));
    return;
  }

  printPretty(matches, shape);
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}

