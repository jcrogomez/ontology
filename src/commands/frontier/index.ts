import * as fs from "node:fs";
import * as path from "node:path";
import { collectSourceFiles } from "../../runtime/static/typescript.js";
import {
  tagFileFromDisk,
  type TaggerAttribute,
} from "../../runtime/legend/frontier-tagger.js";
import { errorMessage } from "../../core/errors.js";

// `onto frontier <paths...>` — Phase ε pre-flight diagnostic.
//
// Runs the path + content frontier tagger over every TS/TSX file in
// the given inputs and reports the tag distribution. Pure $0, no LLM,
// no project state. Useful before running a Phase ε pilot to confirm
// the tagger assigns sensible attributes to the perimeter — catches
// rule gaps that would otherwise surface only after paying for ingest.
//
// Semantics:
//   - Accepts one or more positional paths (file or directory). Same
//     dedup contract as `onto ingest <paths...>`.
//   - Walks the same `collectSourceFiles` skip list (node_modules,
//     dist, .ontology, __tests__, .git, coverage).
//   - Reads each file once (path + content rules in one pass).
//   - Emits per-file tag sets, the tag-distribution histogram, and
//     diagnostics (zero-tagged files, fallback-only files).
//
// Does NOT mutate state, write proposals, or contact any LLM. Safe to
// run against any tree.

export interface FrontierCommandOptions {
  include?: string;
  json?: boolean;
  // Suppress the per-file listing (only print totals). Useful for
  // large perimeters where the file list is noise.
  totalsOnly?: boolean;
}

interface FileReport {
  filePath: string;
  cwdRelative: string;
  attrs: readonly TaggerAttribute[];
}

interface FrontierReport {
  inputs: Array<{ path: string; kind: "directory" | "file"; fileCount: number }>;
  totalFiles: number;
  files: FileReport[];
  byTag: Record<string, number>;
  zeroTagged: string[];
  fallbackOnly: string[];
}

export async function frontierCommand(
  pathArgs: string[],
  options: FrontierCommandOptions,
): Promise<void> {
  if (!Array.isArray(pathArgs) || pathArgs.length === 0) {
    fail("No paths provided to frontier.", options.json);
    return;
  }

  const inputs: Array<{ path: string; stat: fs.Stats }> = [];
  for (const p of pathArgs) {
    try {
      inputs.push({ path: p, stat: fs.statSync(p) });
    } catch (err: unknown) {
      fail(`Could not stat "${p}": ${errorMessage(err)}`, options.json);
      return;
    }
  }

  const extensions = parseIncludeFlag(options.include);
  if (extensions.length === 0) {
    fail(
      `--include resolved to an empty extension list. Pass at least one extension (e.g. --include ts,tsx).`,
      options.json,
    );
    return;
  }

  // Collect + dedup by realpath. Same contract as ingest's multi-input.
  const seen = new Set<string>();
  const files: string[] = [];
  const perInput: Array<{
    path: string;
    kind: "directory" | "file";
    fileCount: number;
  }> = [];
  for (const input of inputs) {
    const fromInput = input.stat.isDirectory()
      ? collectSourceFiles(path.resolve(input.path), extensions)
      : [path.resolve(input.path)];
    let kept = 0;
    for (const f of fromInput) {
      let canonical: string;
      try {
        canonical = fs.realpathSync(f);
      } catch {
        canonical = f;
      }
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      files.push(f);
      kept += 1;
    }
    perInput.push({
      path: input.path,
      kind: input.stat.isDirectory() ? "directory" : "file",
      fileCount: kept,
    });
  }

  // Tag every file. Reads contents from disk for content rules.
  const fileReports: FileReport[] = [];
  const byTag = new Map<string, number>();
  const zeroTagged: string[] = [];
  const fallbackOnly: string[] = [];
  for (const filePath of files) {
    const result = tagFileFromDisk(filePath);
    const cwdRelative = computeCwdRelative(filePath);
    fileReports.push({
      filePath,
      cwdRelative,
      attrs: result.attrs,
    });
    if (result.attrs.length === 0) {
      zeroTagged.push(cwdRelative);
    }
    if (result.attrs.length === 1 && result.attrs[0] === "operational-glue") {
      fallbackOnly.push(cwdRelative);
    }
    for (const a of result.attrs) {
      byTag.set(a, (byTag.get(a) ?? 0) + 1);
    }
  }

  const report: FrontierReport = {
    inputs: perInput,
    totalFiles: files.length,
    files: fileReports,
    byTag: Object.fromEntries(byTag),
    zeroTagged,
    fallbackOnly,
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
    return;
  }

  // Human-readable summary.
  console.log(`=== ONTOLOGY FRONTIER PREVIEW ===`);
  for (const i of report.inputs) {
    console.log(
      `  ${i.kind.padEnd(9)}  ${i.path}  →  ${i.fileCount} file(s)`,
    );
  }
  console.log(`  deduped total:    ${report.totalFiles} file(s)`);
  console.log(``);
  console.log(`Tag distribution:`);
  const sorted = Array.from(byTag.entries()).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sorted) {
    console.log(`  ${tag.padEnd(24)} ${String(count).padStart(4)}`);
  }
  console.log(``);
  console.log(
    `Zero-tagged files:    ${zeroTagged.length} (acceptance contract: must be 0)`,
  );
  console.log(
    `Fallback-only files:  ${fallbackOnly.length} (only \`operational-glue\` — likely rule gap)`,
  );

  if (!options.totalsOnly) {
    console.log(``);
    console.log(`Per-file tags:`);
    for (const f of fileReports) {
      console.log(`  ${f.cwdRelative}  →  ${f.attrs.join(", ")}`);
    }
  }

  if (zeroTagged.length > 0) {
    console.log(``);
    console.log(`✖ Zero-tagged files:`);
    for (const f of zeroTagged) console.log(`  - ${f}`);
    process.exit(1);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function computeCwdRelative(filePath: string): string {
  try {
    const cwdReal = fs.realpathSync(process.cwd());
    const fileReal = fs.realpathSync(path.resolve(filePath));
    return path.relative(cwdReal, fileReal);
  } catch {
    return path.relative(process.cwd(), path.resolve(filePath));
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
