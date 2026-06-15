import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  inferEdgesAutoFromDirectoryAsync,
  type InferredEdge,
} from "../../runtime/static/edges.js";
import {
  planEdgeMaterialization,
} from "../../kernel/graph/edge-materialization-preview.js";
import {
  composeEdgeApplication,
  type ResolvedEdgeSpec,
} from "../../kernel/graph/apply-edges-to-copy.js";
import {
  OntologyEdgeSchema,
  OntologyEventSchema,
  OntologyNodeSchema,
  OntologyStateSchema,
  type OntologyEdge,
  type OntologyEvent,
  type OntologyNode,
  type OntologyState,
} from "../../kernel/schemas/ontology.js";

export interface GraphMaterializeEdgesOptions {
  json?: boolean;
  include?: string;
}

// `onto graph materialize-edges <src> <dst>` — clone an ontology
// directory and apply the statically-inferred edges into the copy,
// without touching the source.
//
// Why this command exists: Phase ε needs an empirical answer to
// "does the brújula jump that --metrics-preview predicts actually
// translate to better regenerations?" To get that answer we need a
// real ontology dir with the edges materialised, so
// `verify-homeomorphism` (or `compile run`) can run against it. The
// existing `infer-edges --create-proposals` writes into the active
// project; this command lets the experiment run against a copy of
// an archived snapshot.
//
// Read-only on the source. Writes a fresh edges.jsonl, events.jsonl
// and state.json into the destination. The audit chain is preserved
// — each materialised edge produces an `edge_created` event with a
// sequence number continuing the source's event log, and event
// payloads carry the inferred-edge provenance (source file paths +
// tokens) so an operator can trace any new edge back to the import
// that produced it.
//
// No proposals are written; no LLM is dispatched. This is the
// $0 prework before the real homeomorphism dispatch.
export async function graphMaterializeEdgesCommand(
  srcDir: string,
  dstDir: string,
  sourceRoot: string,
  options: GraphMaterializeEdgesOptions,
): Promise<void> {
  const srcAbs = path.resolve(srcDir);
  const dstAbs = path.resolve(dstDir);
  const sourceRootAbs = path.resolve(sourceRoot);

  if (!fs.existsSync(srcAbs)) {
    fail(`Source ontology dir not found: ${srcDir}`, options.json);
    return;
  }
  if (!fs.statSync(srcAbs).isDirectory()) {
    fail(`Source is not a directory: ${srcDir}`, options.json);
    return;
  }
  if (fs.existsSync(dstAbs)) {
    fail(
      `Destination already exists: ${dstDir}. Refusing to clobber — pick a fresh path or delete the existing one first.`,
      options.json,
    );
    return;
  }
  if (!fs.existsSync(sourceRootAbs)) {
    fail(`Source root not found: ${sourceRoot}`, options.json);
    return;
  }
  if (srcAbs === dstAbs) {
    fail(`Source and destination must differ.`, options.json);
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

  // 1. Clone the source ontology dir into the destination. fs.cpSync's
  //    recursive copy preserves every file shape we care about
  //    (nodes/*.json, edges.jsonl, events.jsonl, state.json,
  //    optional verify/ and runs/ caches).
  fs.cpSync(srcAbs, dstAbs, { recursive: true });

  let nodes: OntologyNode[];
  let existingEdges: OntologyEdge[];
  let state: OntologyState;
  try {
    nodes = loadNodesFromDir(dstAbs);
    existingEdges = loadEdgesFromDir(dstAbs);
    state = loadStateFromDir(dstAbs);
  } catch (err: unknown) {
    fail(
      `Failed to parse cloned ontology: ${err instanceof Error ? err.message : String(err)}`,
      options.json,
    );
    return;
  }

  // 2. Infer static edges from the source root.
  const inferredEdges = await inferEdgesAutoFromDirectoryAsync(
    sourceRootAbs,
    extensions,
  );

  // 3. Resolve via the same logic --metrics-preview uses — same skip
  //    taxonomy, same dedup against existingEdges. relativize is
  //    cwd-relative since outputs.files[0] is stored that way.
  const preview = planEdgeMaterialization({
    nodes,
    edges: existingEdges,
    inferredEdges,
    relativize: computeCwdRelative,
  });

  const resolvedSpecs: ResolvedEdgeSpec[] = preview.resolved.map((r) => ({
    fromNodeId: r.fromNodeId,
    toNodeId: r.toNodeId,
    type: r.type,
    provenance: {
      inferredBy: "static-typescript",
      tokens: r.tokens,
      fromFile: r.fromFile,
      toFile: r.toFile,
    },
  }));

  // 4. Compose new edges + events + state. The composer is pure; we
  //    pass `crypto.randomBytes` as the id minter and an ISO now() as
  //    the timestamp. Audit-chain integrity preserved.
  const application = composeEdgeApplication({
    resolvedEdges: resolvedSpecs,
    state,
    mintId: () => crypto.randomBytes(4).toString("hex"),
    timestamp: new Date().toISOString(),
  });

  // 5. Persist into the destination. Append edges + events; rewrite
  //    state.json with the updated counters.
  const edgesPath = path.join(dstAbs, "edges.jsonl");
  const eventsPath = path.join(dstAbs, "events.jsonl");
  const statePath = path.join(dstAbs, "state.json");

  const edgesAppend = application.edges
    .map((e) => JSON.stringify(e))
    .join("\n");
  const eventsAppend = application.events
    .map((e) => JSON.stringify(e))
    .join("\n");

  if (edgesAppend.length > 0) {
    appendWithNewline(edgesPath, edgesAppend);
  }
  if (eventsAppend.length > 0) {
    appendWithNewline(eventsPath, eventsAppend);
  }
  fs.writeFileSync(
    statePath,
    JSON.stringify(application.newState, null, 2) + "\n",
    "utf-8",
  );

  // 6. Report.
  const summary = {
    source: srcAbs,
    destination: dstAbs,
    sourceRoot: sourceRootAbs,
    extensions,
    inferred: inferredEdges.length,
    resolved: preview.resolved.length,
    skipped: preview.skipped.length,
    skippedByReason: rollUpSkipped(preview.skipped),
    appliedEdges: application.edges.length,
    appliedEvents: application.events.length,
    newState: {
      edgeCount: application.newState.edgeCount,
      eventCount: application.newState.eventCount,
      lastEventId: application.newState.lastEventId,
    },
    deltas: preview.deltas,
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: true, summary }, null, 2));
    return;
  }

  renderHuman(summary);
}

function loadNodesFromDir(dir: string): OntologyNode[] {
  const nodesDir = path.join(dir, "nodes");
  if (!fs.existsSync(nodesDir)) {
    throw new Error(`Missing nodes/ inside ${dir}`);
  }
  const out: OntologyNode[] = [];
  const files = fs
    .readdirSync(nodesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of files) {
    const fullPath = path.join(nodesDir, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      out.push(OntologyNodeSchema.parse(parsed));
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const summary = err.issues
          .slice(0, 3)
          .map((it) => `${it.path.join(".")}: ${it.message}`)
          .join(", ");
        throw new Error(`Failed to parse node ${file}: ${summary}`);
      }
      throw err;
    }
  }
  return out;
}

function loadEdgesFromDir(dir: string): OntologyEdge[] {
  const edgesPath = path.join(dir, "edges.jsonl");
  if (!fs.existsSync(edgesPath)) return [];
  const content = fs.readFileSync(edgesPath, "utf-8");
  const out: OntologyEdge[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    try {
      out.push(OntologyEdgeSchema.parse(JSON.parse(trimmed)));
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
      throw err;
    }
  }
  return out;
}

function loadStateFromDir(dir: string): OntologyState {
  const statePath = path.join(dir, "state.json");
  if (!fs.existsSync(statePath)) {
    throw new Error(`Missing state.json inside ${dir}`);
  }
  const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  return OntologyStateSchema.parse(parsed);
}

function appendWithNewline(filePath: string, payload: string): void {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    const needsLeadingNewline = content.length > 0 && !content.endsWith("\n");
    fs.appendFileSync(
      filePath,
      `${needsLeadingNewline ? "\n" : ""}${payload}\n`,
      "utf-8",
    );
  } else {
    fs.writeFileSync(filePath, `${payload}\n`, "utf-8");
  }
}

// macOS-symlink-aware project-relative path. Mirrors the helper in
// commands/graph/infer-edges.ts so the resolver here matches the same
// outputs.files[0] keys ingest stored under cwd.
function computeCwdRelative(filePath: string): string {
  try {
    const cwdReal = fs.realpathSync(process.cwd());
    const fileReal = fs.realpathSync(path.resolve(filePath));
    return path.relative(cwdReal, fileReal);
  } catch {
    return path.relative(process.cwd(), path.resolve(filePath));
  }
}

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

function rollUpSkipped(
  skipped: ReturnType<typeof planEdgeMaterialization>["skipped"],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of skipped) {
    out[s.reason] = (out[s.reason] ?? 0) + 1;
  }
  return out;
}

interface MaterializeSummary {
  source: string;
  destination: string;
  sourceRoot: string;
  extensions: string[];
  inferred: number;
  resolved: number;
  skipped: number;
  skippedByReason: Record<string, number>;
  appliedEdges: number;
  appliedEvents: number;
  newState: { edgeCount: number; eventCount: number; lastEventId: string };
  deltas: ReturnType<typeof planEdgeMaterialization>["deltas"];
}

function renderHuman(summary: MaterializeSummary): void {
  console.log(`=== ONTOLOGY GRAPH MATERIALIZE-EDGES ===`);
  console.log(`Source:        ${summary.source}`);
  console.log(`Destination:   ${summary.destination}`);
  console.log(`Source root:   ${summary.sourceRoot}`);
  console.log(`Extensions:    ${summary.extensions.join(", ")}`);
  console.log(``);
  console.log(`Inference`);
  console.log(`  inferred edges:  ${summary.inferred}`);
  console.log(`  resolved edges:  ${summary.resolved}`);
  console.log(`  skipped edges:   ${summary.skipped}`);
  for (const [reason, count] of Object.entries(summary.skippedByReason).sort()) {
    console.log(`    ${reason.padEnd(28)} ${count}`);
  }
  console.log(``);
  console.log(`Applied to destination`);
  console.log(`  edges appended:  ${summary.appliedEdges}`);
  console.log(`  events appended: ${summary.appliedEvents}`);
  console.log(`  state.edgeCount: ${summary.newState.edgeCount}`);
  console.log(`  state.eventCount: ${summary.newState.eventCount}`);
  console.log(``);
  console.log(`Simulated metric deltas (from --metrics-preview math)`);
  console.log(
    `  Δ edgeCount:                                ${signed(summary.deltas.edgeCount)}`,
  );
  console.log(
    `  Δ closedWorldContextReachableSatisfaction:  ${signed(summary.deltas.closedWorldContextReachableSatisfactionRatio)}`,
  );
  console.log(``);
  console.log(`Next:`);
  console.log(
    `  onto graph metrics --ontology-dir ${path.relative(process.cwd(), summary.destination)}`,
  );
  console.log(`    # confirm the brújula moved in the actual copy`);
  console.log(
    `  onto verify-homeomorphism --cost-estimate <node-id>`,
  );
  console.log(
    `    # pre-flight: see what an empirical compile-back would cost`,
  );
}

function signed(n: number): string {
  const fixed = Number.isInteger(n) ? n.toString() : n.toFixed(3);
  return n > 0 ? `+${fixed}` : fixed;
}

function fail(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
