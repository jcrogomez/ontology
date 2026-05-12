import * as fs from "node:fs";
import * as path from "node:path";
import { inferEdgesFromDirectory } from "../../runtime/static/typescript.js";

// `onto graph infer-edges <dir>` — Project Legend γ-4 surface.
//
// Walks a directory of TypeScript source files and prints the
// import-derived edge graph: which file `depends_on` which (value
// imports) and which `uses_token` which (type-only imports). Pure
// static analysis — no LLM, no proposals written, no graph state
// touched. The command exists primarily as a preview surface for
// γ-5 (`onto ingest <directory>`), which will consume the same
// inference to seed cross-file edge proposals after the per-file
// extraction lands.
//
// Read-only by design. Use `--json` for machine-readable output
// suitable for piping into a follow-up tool; the human form prints
// a compact per-edge table.

export interface InferEdgesOptions {
  json?: boolean;
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

  const edges = inferEdgesFromDirectory(absDir);
  // Render paths relative to the scanned root so the output reads
  // independently of the absolute mount point — same paths whether
  // the user runs from /Users/x/proj or /tmp/proj.
  const relEdges = edges.map((e) => ({
    fromFile: path.relative(absDir, e.fromFile),
    toFile: path.relative(absDir, e.toFile),
    type: e.type,
    tokens: e.tokens,
  }));

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          rootDir: absDir,
          edgeCount: relEdges.length,
          edges: relEdges,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`=== ONTOLOGY GRAPH INFER-EDGES ===`);
  console.log(`Root:        ${dirPath}`);
  console.log(`Edge count:  ${relEdges.length}`);
  console.log(``);
  if (relEdges.length === 0) {
    console.log(`No cross-file edges found.`);
    console.log(`(External imports — node:* / npm packages / files outside`);
    console.log(` the scanned root — are not reported here.)`);
    return;
  }
  for (const edge of relEdges) {
    const arrow = edge.type === "uses_token" ? "─type→" : "──→";
    console.log(`  ${edge.fromFile}  ${arrow}  ${edge.toFile}`);
    if (edge.tokens.length > 0) {
      console.log(`    tokens: ${edge.tokens.join(", ")}`);
    }
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
