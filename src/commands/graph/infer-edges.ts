import * as fs from "node:fs";
import * as path from "node:path";
import {
  inferEdgesAutoFromDirectory,
  type InferredEdge,
} from "../../runtime/static/edges.js";
import { loadEdges, loadNodes, loadState } from "../../core/project/load.js";
import { createProposal } from "../../core/proposals/persist.js";
import type { OntologyNode } from "../../schemas/ontology.js";
import { errorMessage } from "../../core/errors.js";

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
  const edges = inferEdgesAutoFromDirectory(absDir, extensions);

  // Render paths relative to the scanned root so the *display* reads
  // independently of the absolute mount point — same paths whether
  // the user runs from /Users/x/proj or /tmp/proj.
  const displayEdges = edges.map((e) => ({
    fromFile: path.relative(absDir, e.fromFile),
    toFile: path.relative(absDir, e.toFile),
    type: e.type,
    tokens: e.tokens,
  }));

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
