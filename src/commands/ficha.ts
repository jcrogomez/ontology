import { loadNodeById, loadNodes } from "../core/project/load.js";
import { updateNode } from "../core/nodes/update-node.js";
import { fichaQuality, auditFichas } from "../runtime/legend/ficha-quality.js";

// `onto ficha audit` / `onto ficha cleanup <node>` — measure and fix the
// quality of a node's intent record (its "ficha": prompt + contract + rules).
// audit is read-only (the measure-before-construct worklist); cleanup applies
// the one deterministic, high-confidence fix — completing the contract with the
// export surface the AST actually has (the recall-bound thinness the bilateral
// round-trip measured). Prose-rule noise is reported, never auto-removed (that
// needs judgment).

export async function fichaAuditCommand(options: { json?: boolean; top?: number }): Promise<void> {
  const cwd = process.cwd();
  const audit = auditFichas(loadNodes(cwd), cwd);
  if (options.json) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }
  console.log(`◆ ficha audit — ${audit.nodesScanned} code nodes`);
  console.log(`  contract thinness: ${audit.nodesWithMissingExports} nodes under-declare their exports`);
  console.log(`    → ${audit.totalMissingExports} export(s) the source has but the ficha doesn't declare (deterministically fixable: \`onto ficha cleanup\`)`);
  console.log(`  rule noise: ${audit.totalProseRulesOnCodeNodes} prose/extraction-noise rule(s) on code nodes (review + prune)`);
  const top = options.top ?? 12;
  console.log(`  worklist (top ${Math.min(top, audit.worklist.length)} by cleanup score):`);
  for (const q of audit.worklist.slice(0, top)) {
    const bits = [
      q.contractGap.missing.length ? `+${q.contractGap.missing.length} exports` : "",
      q.ruleNoise.prose ? `${q.ruleNoise.prose} prose-rules` : "",
    ].filter(Boolean).join(", ");
    console.log(`    ${String(q.cleanupScore).padStart(3)}  ${q.nodeId}  ${q.srcFile}  (${bits})`);
  }
}

export interface FichaCleanupOptions {
  apply?: boolean;
  json?: boolean;
}

export async function fichaCleanupCommand(nodeId: string, options: FichaCleanupOptions): Promise<void> {
  const cwd = process.cwd();
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    out({ ok: false, nodeId, failure: `node not found: ${nodeId}` }, options.json);
    process.exit(1);
    return;
  }
  const q = fichaQuality(node, cwd);
  if (!q.parseOk && q.srcFile) {
    out({ ok: false, nodeId, failure: `could not parse the source to scan exports: ${q.srcFile}` }, options.json);
    process.exit(1);
    return;
  }
  const missing = q.contractGap.missing;
  const result = {
    ok: true,
    nodeId,
    srcFile: q.srcFile,
    missingExports: missing,
    proseRules: q.ruleNoise.prose,
    applied: false as boolean,
  };

  if (missing.length === 0) {
    out({ ...result, note: "contract already complete (no AST exports missing from provides)" }, options.json);
    if (q.ruleNoise.prose > 0 && !options.json) {
      console.log(`  note: ${q.ruleNoise.prose} prose/extraction-noise rule(s) — review manually (not auto-removed).`);
    }
    return;
  }

  if (!options.apply) {
    out({ ...result, note: `preview — pass --apply to add ${missing.length} missing export(s) to the contract` }, options.json);
    if (!options.json) console.log(`  would add to provides: ${missing.join(", ")}`);
    return;
  }

  // Apply the deterministic contract completion: union the existing provides
  // (preserving their signatures) with the AST-missing exports.
  const existingKeys = (node.context?.provides ?? []).map((p) => (typeof p === "string" ? p : p.key));
  updateNode({ id: nodeId, provides: [...existingKeys, ...missing], cwd, eventMetadata: { source: "ficha-cleanup", addedExports: missing } });
  out({ ...result, applied: true, note: `added ${missing.length} export(s) to the contract` }, options.json);
  if (!options.json) {
    console.log(`  ✔ contract completed: +${missing.join(", ")}`);
    if (q.ruleNoise.prose > 0) console.log(`  note: ${q.ruleNoise.prose} prose-rule(s) remain — review manually.`);
  }
}

function out(obj: Record<string, unknown>, json?: boolean): void {
  if (json) { console.log(JSON.stringify(obj, null, 2)); return; }
  if (obj.ok === false) { console.error(`✖ ficha cleanup ${obj.nodeId}: ${obj.failure}`); return; }
  console.log(`◆ ficha cleanup ${obj.nodeId}  (${obj.srcFile})`);
  if (obj.note) console.log(`  ${obj.note}`);
}
