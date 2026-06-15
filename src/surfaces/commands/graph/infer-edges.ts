import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  inferEdgesAutoFromDirectoryAsync,
  type InferredEdge,
} from "../../../inverse/static/edges.js";
import { loadEdges, loadNodes, loadState } from "../../../kernel/core/project/load.js";
import { createProposal } from "../../../kernel/core/proposals/persist.js";
import {
  OntologyEdgeSchema,
  OntologyNodeSchema,
  OntologyStateSchema,
  type OntologyEdge,
  type OntologyNode,
} from "../../../kernel/schemas/ontology.js";
import { errorMessage } from "../../../kernel/core/errors.js";
import {
  planEdgeMaterialization,
  type EdgeMaterializationPreview,
} from "../../../kernel/graph/edge-materialization-preview.js";

// `onto graph infer-edges <dir>` — Project Legend γ-4 (preview) + γ-6
// (create proposals).
//
// Preview mode (default, no `--create-proposals`): walks the
// directory, prints the import-derived edge graph. Read-only.
//
// Proposal mode (`--create-proposals`): in addition to the print,
// resolves each inferred edge to the corresponding applied nodes by
// matching on `outputs.files[0]` (set by `onto ingest <directory>`,
// γ-5), and emits a `node_create` proposal — no, `edge_create`
// proposal — for each resolved pair. Cierra el auto-digest cycle:
//
//   onto ingest <dir>            (γ-5)   → N node_create proposals
//   onto proposal apply <id>×N           → N nodes on graph
//   onto graph infer-edges <dir>         (γ-4)   → file-path edges
//                  --create-proposals    (γ-6)   → M edge_create proposals
//   onto proposal apply <id>×M           → M edges on graph
//
// Edge resolution rules:
//   - We look up nodes by `outputs.files[0]` matching the cwd-relative
//     path γ-4 emits (after macOS-symlink normalisation).
//   - If either endpoint has no matching node (e.g. the ingest
//     proposal for that file was rejected or not yet applied), we
//     skip the edge and surface it in the `skipped` count of the
//     report.
//   - If the same (from, to, type) edge already exists in the
//     graph, we skip it (dedup) — no duplicate proposal noise.
//   - Cross-branch endpoints are NOT supported in γ-6: both nodes
//     must live on the same branch as the project's active branch
//     (state.activeBranch). Cross-branch ingest is a δ concern.

export interface InferEdgesOptions {
  json?: boolean;
  // γ-6 — when set, in addition to printing the inferred edges,
  // resolve them to applied node IDs (via outputs.files[0]) and
  // emit one edge_create proposal per resolved pair. Skips edges
  // whose endpoints are not yet on the graph; skips edges that
  // already exist (no duplicate proposals).
  createProposals?: boolean;
  // Comma-separated extension list (same shape as `onto ingest
  // --include`). Default is "ts,tsx" — matches the historical γ-4
  // TS-only behaviour. Pass "py" for a Python project or "py,ts,tsx"
  // for a mixed-language repo. Static-edge inference dispatches
  // per-language and concatenates the results.
  include?: string;
  // Phase ε hierarchizer-followup — when set, run resolution like
  // --create-proposals does but produce a pure metrics-preview report
  // (before / after `computeHierarchyMetrics`). No proposals written,
  // no mutation. Designed to decide whether materializing these edges
  // actually moves `closedWorldContextReachableSatisfaction` before
  // committing to apply them.
  metricsPreview?: boolean;
  // Score a non-active ontology snapshot (e.g.
  // `.ontology.self-ingest-gamma-result`). Honoured by --metrics-preview
  // only; --create-proposals always targets the active project because
  // proposals are written under cwd.
  ontologyDir?: string;
}

interface ResolvedEdge {
  edge: InferredEdge;
  fromNode: OntologyNode;
  toNode: OntologyNode;
}

interface SkippedEdge {
  edge: InferredEdge;
  reason:
    | "from_node_missing"
    | "to_node_missing"
    | "edge_already_exists"
    | "cross_branch";
  detail?: string;
}

interface ProposalCreated {
  proposalId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
}

export async function graphInferEdgesCommand(
  dirPath: string,
  options: InferEdgesOptions,
): Promise<void> {
  const absDir = path.resolve(dirPath);
  if (!fs.existsSync(absDir)) {
    fail(`Directory not found: ${dirPath}`, options.json);
    return;
  }
  const stat = fs.statSync(absDir);
  if (!stat.isDirectory()) {
    fail(`Not a directory: ${dirPath}`, options.json);
    return;
  }

  const extensions = parseIncludeFlag(options.include);
  if (extensions.length === 0) {
    fail(
      `--include resolved to an empty extension list. Pass at least one extension (e.g. --include py).`,
      options.json,
    );
    return;
  }
  if (options.createProposals && options.metricsPreview) {
    fail(
      `--metrics-preview and --create-proposals are mutually exclusive. --metrics-preview reports only; --create-proposals writes.`,
      options.json,
    );
    return;
  }
  if (options.ontologyDir && options.createProposals) {
    fail(
      `--ontology-dir is honoured by --metrics-preview only (proposals always write under cwd).`,
      options.json,
    );
    return;
  }

  const edges = await inferEdgesAutoFromDirectoryAsync(absDir, extensions);

  // Render paths relative to the scanned root so the *display* reads
  // independently of the absolute mount point — same paths whether
  // the user runs from /Users/x/proj or /tmp/proj.
  const displayEdges = edges.map((e) => ({
    fromFile: path.relative(absDir, e.fromFile),
    toFile: path.relative(absDir, e.toFile),
    type: e.type,
    tokens: e.tokens,
  }));

  if (options.metricsPreview) {
    runMetricsPreview(dirPath, edges, options);
    return;
  }

  if (!options.createProposals) {
    printPreview(dirPath, displayEdges, options.json);
    return;
  }

  // γ-6 proposal mode. Resolution uses cwd-relative paths (the same
  // convention ingest used when writing outputs.files), so we
  // recompute that view of each edge endpoint here.
  const resolveResult = resolveEdgesToProposals(edges);
  printProposalReport(dirPath, displayEdges, resolveResult, options.json);

  // Exit non-zero ONLY when every edge was skipped AND we had edges
  // to work with — every edge silently failing is a likely sign the
  // user hasn't run `onto proposal apply` yet, and we want CI / scripts
  // to notice. An empty walk (no edges at all) is exit 0 — there is
  // simply nothing to do.
  if (
    edges.length > 0 &&
    resolveResult.proposals.length === 0
  ) {
    process.exit(1);
  }
}

interface ResolveResult {
  proposals: ProposalCreated[];
  resolved: ResolvedEdge[];
  skipped: SkippedEdge[];
}

function resolveEdgesToProposals(edges: InferredEdge[]): ResolveResult {
  const nodes = loadNodes();
  const state = loadState();

  // Build a file-path → node index. Each ingested node should have
  // exactly one entry in `outputs.files` (γ-5 puts the source file
  // path there). Hand-authored nodes typically have an empty
  // outputs.files and so won't appear in the index — they can't
  // anchor an edge_create proposal anyway.
  const nodeByFile = new Map<string, OntologyNode>();
  for (const n of nodes) {
    const first = n.outputs?.files?.[0];
    if (typeof first === "string" && first.length > 0) {
      // If two nodes claim the same source file, the first wins.
      // This is a malformed state (one source → one intent node);
      // future tooling should flag it.
      if (!nodeByFile.has(first)) nodeByFile.set(first, n);
    }
  }

  // Build an existing-edge set so we don't propose duplicates.
  // Each (from, to, type) triple is one membership key.
  // Edges live in events.jsonl; for the dedup check we use the
  // canonical loadEdges() helper that loads the persisted edge log.
  const existingEdges = loadEdgesSet();

  const proposals: ProposalCreated[] = [];
  const resolved: ResolvedEdge[] = [];
  const skipped: SkippedEdge[] = [];

  for (const edge of edges) {
    const fromKey = computeCwdRelative(edge.fromFile);
    const toKey = computeCwdRelative(edge.toFile);
    const fromNode = nodeByFile.get(fromKey);
    const toNode = nodeByFile.get(toKey);
    if (!fromNode) {
      skipped.push({
        edge,
        reason: "from_node_missing",
        detail: `No node found whose outputs.files[0] === "${fromKey}"`,
      });
      continue;
    }
    if (!toNode) {
      skipped.push({
        edge,
        reason: "to_node_missing",
        detail: `No node found whose outputs.files[0] === "${toKey}"`,
      });
      continue;
    }
    if (fromNode.coordinates.branch !== toNode.coordinates.branch) {
      skipped.push({
        edge,
        reason: "cross_branch",
        detail: `from on branch "${fromNode.coordinates.branch}", to on branch "${toNode.coordinates.branch}"`,
      });
      continue;
    }
    const dedupKey = `${fromNode.id}|${toNode.id}|${edge.type}`;
    if (existingEdges.has(dedupKey)) {
      skipped.push({
        edge,
        reason: "edge_already_exists",
        detail: `Edge ${fromNode.id} →(${edge.type})→ ${toNode.id} already in the graph`,
      });
      continue;
    }
    resolved.push({ edge, fromNode, toNode });

    try {
      const { proposal } = createProposal({
        mutation: {
          kind: "edge_create",
          payload: {
            from: fromNode.id,
            to: toNode.id,
            type: edge.type,
            branch: state.activeBranch,
          },
          fromHash: fromNode.integrity.hash,
          toHash: toNode.integrity.hash,
        },
        source: null,
        validation: null,
        provenance: {
          derivedFrom: [fromNode.id, toNode.id],
          rationale: JSON.stringify(
            {
              inferredBy: "static-typescript",
              tokens: edge.tokens,
              fromFile: fromKey,
              toFile: toKey,
            },
            null,
            2,
          ),
        },
      });
      proposals.push({
        proposalId: proposal.id,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        type: edge.type,
      });
    } catch (err: unknown) {
      // A proposal-create failure (e.g. underlying IO) is recorded as
      // skipped — the resolver got that far but the persist step
      // couldn't write. We don't bail on the loop: other edges should
      // still get their chance.
      skipped.push({
        edge,
        reason: "edge_already_exists",
        detail: `Proposal create failed: ${errorMessage(err)}`,
      });
    }
  }

  return { proposals, resolved, skipped };
}

// Walk the edges.jsonl to build the existing (from, to, type) set.
// Used for dedup so γ-6 never proposes an edge that's already in the
// graph (an edge user has already applied stays applied; rerunning
// `infer-edges --create-proposals` is therefore idempotent).
function loadEdgesSet(): Set<string> {
  const edges = loadEdges();
  const out = new Set<string>();
  for (const e of edges) out.add(`${e.from}|${e.to}|${e.type}`);
  return out;
}

// Mirror of the helper in src/commands/ingest/index.ts. Kept inline
// (rather than imported) to avoid a cross-command dependency for one
// 5-line helper. The macOS-symlink normalisation rule is the same:
// realpath both ends to make the relative path stable.
function computeCwdRelative(filePath: string): string {
  try {
    const cwdReal = fs.realpathSync(process.cwd());
    const fileReal = fs.realpathSync(path.resolve(filePath));
    return path.relative(cwdReal, fileReal);
  } catch {
    return path.relative(process.cwd(), path.resolve(filePath));
  }
}

// ── Printing helpers ────────────────────────────────────────────────────────

interface DisplayEdge {
  fromFile: string;
  toFile: string;
  type: string;
  tokens: string[];
}

function printPreview(
  dirPath: string,
  edges: DisplayEdge[],
  json?: boolean,
): void {
  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          rootDir: path.resolve(dirPath),
          edgeCount: edges.length,
          edges,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`=== ONTOLOGY GRAPH INFER-EDGES ===`);
  console.log(`Root:        ${dirPath}`);
  console.log(`Edge count:  ${edges.length}`);
  console.log(``);
  if (edges.length === 0) {
    console.log(`No cross-file edges found.`);
    console.log(`(External imports — node:* / npm packages / files outside`);
    console.log(` the scanned root — are not reported here.)`);
    return;
  }
  for (const edge of edges) {
    const arrow = edge.type === "uses_token" ? "─type→" : "──→";
    console.log(`  ${edge.fromFile}  ${arrow}  ${edge.toFile}`);
    if (edge.tokens.length > 0) {
      console.log(`    tokens: ${edge.tokens.join(", ")}`);
    }
  }
}

function printProposalReport(
  dirPath: string,
  displayEdges: DisplayEdge[],
  result: ResolveResult,
  json?: boolean,
): void {
  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          rootDir: path.resolve(dirPath),
          edgeCount: displayEdges.length,
          createdCount: result.proposals.length,
          skippedCount: result.skipped.length,
          edges: displayEdges,
          proposals: result.proposals,
          skipped: result.skipped.map((s) => ({
            fromFile: path.relative(path.resolve(dirPath), s.edge.fromFile),
            toFile: path.relative(path.resolve(dirPath), s.edge.toFile),
            type: s.edge.type,
            reason: s.reason,
            detail: s.detail,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`=== ONTOLOGY GRAPH INFER-EDGES (γ-6 — proposals) ===`);
  console.log(`Root:           ${dirPath}`);
  console.log(`Edges found:    ${displayEdges.length}`);
  console.log(`  proposals:    ${result.proposals.length}`);
  console.log(`  skipped:      ${result.skipped.length}`);
  console.log(``);
  for (const p of result.proposals) {
    const arrow = p.type === "uses_token" ? "─type→" : "──→";
    console.log(`  ✓ ${p.proposalId}  ${p.fromNodeId}  ${arrow}  ${p.toNodeId}`);
  }
  if (result.skipped.length > 0) {
    console.log(``);
    console.log(`Skipped:`);
    for (const s of result.skipped) {
      const fromRel = path.relative(path.resolve(dirPath), s.edge.fromFile);
      const toRel = path.relative(path.resolve(dirPath), s.edge.toFile);
      const arrow = s.edge.type === "uses_token" ? "─type→" : "──→";
      console.log(`  ✖ ${fromRel}  ${arrow}  ${toRel}  (${s.reason})`);
      if (s.detail) console.log(`    ${s.detail}`);
    }
  }
  if (result.proposals.length > 0) {
    console.log(``);
    console.log(`Next:`);
    console.log(`  onto proposal list                         # review the ${result.proposals.length} edge proposals`);
    console.log(`  # apply with: onto proposal apply <id>`);
  }
}

function fail(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}

// ── Phase ε hierarchizer-followup: --metrics-preview ───────────────────────
//
// Runs the resolver (same skip taxonomy as --create-proposals) and the
// simulation (`planEdgeMaterialization`) without writing anything.
// Useful gate before `proposal apply` to confirm the inferred edges
// would actually move closedWorldContextReachableSatisfaction.
function runMetricsPreview(
  dirPath: string,
  edges: InferredEdge[],
  options: InferEdgesOptions,
): void {
  let nodes: OntologyNode[];
  let existingEdges: OntologyEdge[];
  let rootNodeId: string | null = null;
  let sourceLabel: string;

  try {
    if (options.ontologyDir) {
      const dir = path.resolve(options.ontologyDir);
      const loaded = loadFromOntologyDir(dir);
      nodes = loaded.nodes;
      existingEdges = loaded.edges;
      rootNodeId = loaded.rootNodeId;
      sourceLabel = dir;
    } else {
      const state = loadState();
      nodes = loadNodes();
      existingEdges = loadEdges();
      rootNodeId = state.rootNodeId;
      sourceLabel = path.join(process.cwd(), ".ontology");
    }
  } catch (err: unknown) {
    fail(
      `Failed to load ontology: ${err instanceof Error ? err.message : String(err)}`,
      options.json,
    );
    return;
  }

  const preview = planEdgeMaterialization({
    nodes,
    edges: existingEdges,
    inferredEdges: edges,
    relativize: computeCwdRelative,
    rootNodeId,
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          rootDir: path.resolve(dirPath),
          ontologySource: sourceLabel,
          preview,
        },
        null,
        2,
      ),
    );
    return;
  }

  printMetricsPreview(dirPath, sourceLabel, preview);
}

// Direct ontology-dir loader for --metrics-preview. Mirrors the helper
// in commands/graph/metrics.ts; not extracted into a shared loader yet
// because the third consumer would clarify the right contract.
function loadFromOntologyDir(dir: string): {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  rootNodeId: string | null;
} {
  if (!fs.existsSync(dir)) throw new Error(`Directory not found: ${dir}`);
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${dir}`);

  const nodesDir = path.join(dir, "nodes");
  if (!fs.existsSync(nodesDir)) {
    throw new Error(`Missing nodes/ inside ${dir}`);
  }

  const nodes: OntologyNode[] = [];
  const nodeFiles = fs
    .readdirSync(nodesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of nodeFiles) {
    const fullPath = path.join(nodesDir, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      nodes.push(OntologyNodeSchema.parse(parsed));
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const summary = err.issues
          .slice(0, 3)
          .map((it) => `${it.path.join(".")}: ${it.message}`)
          .join(", ");
        throw new Error(`Failed to parse node ${file}: ${summary}`);
      }
      throw new Error(
        `Failed to parse node ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const edges: OntologyEdge[] = [];
  const edgesPath = path.join(dir, "edges.jsonl");
  if (fs.existsSync(edgesPath)) {
    const content = fs.readFileSync(edgesPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (!trimmed) continue;
      try {
        edges.push(OntologyEdgeSchema.parse(JSON.parse(trimmed)));
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          const summary = err.issues
            .slice(0, 3)
            .map((it) => `${it.path.join(".")}: ${it.message}`)
            .join(", ");
          throw new Error(
            `Failed to parse edge on line ${i + 1} of edges.jsonl: ${summary}`,
          );
        }
        throw new Error(
          `Failed to parse edge on line ${i + 1} of edges.jsonl: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  let rootNodeId: string | null = null;
  const statePath = path.join(dir, "state.json");
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      const state = OntologyStateSchema.parse(parsed);
      rootNodeId = state.rootNodeId;
    } catch {
      rootNodeId = null;
    }
  }
  return { nodes, edges, rootNodeId };
}

function printMetricsPreview(
  dirPath: string,
  ontologySource: string,
  preview: EdgeMaterializationPreview,
): void {
  console.log(`=== ONTOLOGY GRAPH INFER-EDGES (metrics preview) ===`);
  console.log(`Source dir:       ${dirPath}`);
  console.log(`Ontology source:  ${ontologySource}`);
  console.log(``);
  console.log(`Resolution`);
  console.log(`  resolved edges:  ${preview.resolved.length}`);
  console.log(`  skipped edges:   ${preview.skipped.length}`);
  if (preview.skipped.length > 0) {
    const byReason = new Map<string, number>();
    for (const s of preview.skipped) {
      byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
    }
    for (const [reason, count] of Array.from(byReason.entries()).sort()) {
      console.log(`    ${reason.padEnd(28)} ${count}`);
    }
  }
  console.log(``);

  console.log(`Before / after`);
  renderDeltaRow("edgeCount", preview.before.edgeCount, preview.after.edgeCount);
  renderDeltaRow(
    "maxDepth",
    preview.before.maxDepth,
    preview.after.maxDepth,
  );
  renderDeltaRow(
    "isolatedNodeRatio",
    formatNum(preview.before.isolatedNodeRatio),
    formatNum(preview.after.isolatedNodeRatio),
  );
  renderDeltaRow("verdict", preview.before.verdict, preview.after.verdict);
  renderDeltaRow(
    "closedWorldGlobalSatisfaction",
    formatNum(preview.before.closedWorldGlobalSatisfactionRatio),
    formatNum(preview.after.closedWorldGlobalSatisfactionRatio),
  );
  renderDeltaRow(
    "closedWorldContextReachable (brújula)",
    formatNum(preview.before.closedWorldContextReachableSatisfactionRatio),
    formatNum(preview.after.closedWorldContextReachableSatisfactionRatio),
  );
  console.log(``);
  console.log(
    `Δ closedWorldContextReachableSatisfaction: ${signed(preview.deltas.closedWorldContextReachableSatisfactionRatio)}`,
  );
  console.log(`Δ edgeCount: ${signed(preview.deltas.edgeCount)}`);
  console.log(``);

  if (preview.after.topClosedWorldUnreachableRequires.length > 0) {
    console.log(`Top closed-world unreachable AFTER materialization:`);
    for (const entry of preview.after.topClosedWorldUnreachableRequires) {
      console.log(
        `  ${entry.source.padEnd(40)} consumers=${entry.consumers}`,
      );
    }
  } else {
    console.log(`No closed-world unreachable requires remain.`);
  }
}

function renderDeltaRow(
  label: string,
  before: number | string,
  after: number | string,
): void {
  console.log(
    `  ${label.padEnd(42)} ${String(before).padStart(8)}  →  ${after}`,
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(3);
}

function signed(n: number): string {
  if (n > 0) return `+${formatNum(n)}`;
  return formatNum(n);
}

// Mirrors `onto ingest --include` parsing: comma-separated, lowercased,
// leading-dot stripped, deduped. Default "ts,tsx" matches the
// historical γ-4 TS-only behaviour for backward compatibility.
function parseIncludeFlag(raw: string | undefined): string[] {
  if (raw === undefined) return ["ts", "tsx"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const cleaned = piece.toLowerCase().replace(/^\./, "").trim();
    if (cleaned.length === 0) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}
