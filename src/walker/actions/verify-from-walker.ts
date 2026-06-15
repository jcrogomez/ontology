import * as fs from "node:fs";
import * as path from "node:path";
import type { OntologyNode } from "../../kernel/schemas/ontology.js";
import {
  computeDistanceMetrics,
  classifyVerdict,
  type DistanceMetrics,
  type HomeomorphismVerdict,
  type LanguageHint,
} from "../../runtime/legend/verify-homeomorphism.js";

// Walker v1.5 action: `:verify` — the focal node's round-trip verdict,
// PURE and synchronous. It compares the node's ingested source
// (`outputs.files[0]`) against the LAST COMPILED artifact on disk
// (`.ontology/artifacts/generated/<id>.<ext>`) using the same dual-distance
// metrics + five-label fold the CLI uses. No LLM dispatch happens here —
// honest scope: this is "verdict against the last compile", so a stale
// artifact gives a stale verdict; `:compile` first to refresh. For the full
// sweep (regen, reps, matrix, behaviour axis) use `onto verify-homeomorphism`
// from a shell.

export type VerifyFromWalkerResult =
  | {
      ok: true;
      verdict: Exclude<HomeomorphismVerdict, "unrecoverable">;
      metrics: DistanceMetrics;
      sourcePath: string;
      artifactPath: string;
      language: LanguageHint;
    }
  | { ok: false; message: string };

function languageHint(node: OntologyNode): LanguageHint {
  const lang = (node.technical.language ?? "").toLowerCase();
  if (lang === "typescript" || lang === "ts" || lang === "tsx") return "typescript";
  if (lang === "python" || lang === "py") return "python";
  // Fall back on the source extension when the node carries no language tag.
  const src = node.outputs?.files?.[0] ?? "";
  if (/\.(ts|tsx)$/.test(src)) return "typescript";
  if (/\.py$/.test(src)) return "python";
  return "unknown";
}

export function verifyFromWalker(focal: OntologyNode, cwd?: string): VerifyFromWalkerResult {
  const root = cwd ?? process.cwd();

  const sourceRel = focal.outputs?.files?.[0];
  if (!sourceRel) {
    return {
      ok: false,
      message: `${focal.id} has no outputs.files[0] (ingested source) — nothing to verify the round-trip against`,
    };
  }
  const sourcePath = path.isAbsolute(sourceRel) ? sourceRel : path.resolve(root, sourceRel);
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, message: `source file not found: ${sourceRel}` };
  }

  // The compiler writes `.ontology/artifacts/generated/<nodeId>.<ext>`;
  // the extension depends on the node's language, so glob by id.
  const generatedDir = path.join(root, ".ontology", "artifacts", "generated");
  const candidates = fs.existsSync(generatedDir)
    ? fs.readdirSync(generatedDir).filter((f) => f.startsWith(`${focal.id}.`))
    : [];
  if (candidates.length === 0) {
    return {
      ok: false,
      message: `no compiled artifact for ${focal.id} — run :compile first (the verdict compares source vs last compile)`,
    };
  }
  const artifactPath = path.join(generatedDir, candidates[0]);

  try {
    const original = fs.readFileSync(sourcePath, "utf-8");
    const regen = fs.readFileSync(artifactPath, "utf-8");
    const language = languageHint(focal);
    const metrics = computeDistanceMetrics(original, regen, language, sourceRel);
    const verdict = classifyVerdict(metrics);
    return {
      ok: true,
      verdict,
      metrics,
      sourcePath: sourceRel,
      artifactPath: path.relative(root, artifactPath),
      language,
    };
  } catch (err: unknown) {
    return { ok: false, message: `verify failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
