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
// docs/QUERY_REPRESENTABLE.md: --shape > --shape-file > per-field flags.
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

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}

