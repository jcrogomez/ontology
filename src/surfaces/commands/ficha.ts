import { loadNodeById, loadNodes } from "../../kernel/core/project/load.js";
import { updateNode } from "../../kernel/core/nodes/update-node.js";
import { fichaQuality, auditFichas } from "../../inverse/ficha-quality.js";

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
  console.log(`  contract overflow: ${audit.nodesWithPhantomProvides} nodes over-declare (phantom provides)`);
  console.log(`    → ${audit.totalPhantomProvides} provide(s) not in the source's AST export surface — imports/private symbols (fix: \`onto ficha cleanup --prune\`)`);
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
  /** Also remove phantom provides (declared keys the source doesn't export —
   *  imports/private symbols mislabelled as provides). The determinacy fix. */
  prune?: boolean;
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
  // Phantom only enters the picture under --prune. fichaQuality gates it on a
  // FULLY determinable export surface (every file parsed, no bare `export *`,
  // positive surface) — when that fails, phantom is [] and surfaceDeterminable
  // is false. `--prune` must respect that: a non-determinable surface means we
  // cannot prove any provide is absent, so pruning is skipped, not silent.
  const phantom = options.prune ? q.contractOverflow.phantom : [];
  const pruneSuppressed = options.prune === true && !q.contractOverflow.surfaceDeterminable;
  const result = {
    ok: true,
    nodeId,
    srcFile: q.srcFile,
    missingExports: missing,
    phantomProvides: phantom,
    pruneSuppressed,
    proseRules: q.ruleNoise.prose,
    applied: false as boolean,
  };

  if (missing.length === 0 && phantom.length === 0) {
    const note = pruneSuppressed
      ? "no missing exports; phantom pruning SKIPPED — export surface not fully AST-determinable (wildcard re-export or unreadable file), so no provide can be safely called phantom"
      : options.prune
        ? "contract already reconciled (no missing exports, no phantom provides)"
        : "contract already complete (no AST exports missing from provides)";
    out({ ...result, note }, options.json);
    if (pruneSuppressed && !options.json) {
      console.log(`  ⚠ --prune did nothing here on purpose: this node's full export surface can't be determined from its AST, so pruning could delete a legitimately re-exported provide.`);
    }
    if (q.ruleNoise.prose > 0 && !options.json) {
      console.log(`  note: ${q.ruleNoise.prose} prose/extraction-noise rule(s) — review manually (not auto-removed).`);
    }
    return;
  }

  if (!options.apply) {
    const acts: string[] = [];
    if (missing.length) acts.push(`add ${missing.length} missing export(s)`);
    if (phantom.length) acts.push(`prune ${phantom.length} phantom provide(s)`);
    out({ ...result, note: `preview — pass --apply to ${acts.join(" and ")}` }, options.json);
    if (!options.json) {
      if (missing.length) console.log(`  would add to provides: ${missing.join(", ")}`);
      if (phantom.length) console.log(`  would prune (not in AST exports): ${phantom.join(", ")}`);
      if (pruneSuppressed) console.log(`  ⚠ --prune suppressed: export surface not fully AST-determinable (wildcard re-export or unreadable file); no provide pruned.`);
    }
    return;
  }

  // Apply the deterministic reconciliation: drop phantom provides (when --prune)
  // and union with the AST-missing exports. CRITICAL: updateNode replaces the
  // whole provides array, so we must re-supply the KEPT keys' O1 signatures via
  // provideSignatures or they would be silently dropped (216/228 live nodes
  // carry signatures). The newly-added exports are presence-only (the AST
  // scanner gives names, not signatures).
  const phantomSet = new Set(phantom);
  const keptProvides = (node.context?.provides ?? []).filter(
    (p) => !phantomSet.has(typeof p === "string" ? p : p.key),
  );
  const keptKeys = keptProvides.map((p) => (typeof p === "string" ? p : p.key));
  const provideSignatures: Record<string, string> = {};
  for (const p of keptProvides) {
    if (typeof p === "object" && p.signature) provideSignatures[p.key] = p.signature;
  }
  updateNode({
    id: nodeId,
    provides: [...keptKeys, ...missing],
    provideSignatures,
    cwd,
    eventMetadata: { source: "ficha-cleanup", addedExports: missing, prunedProvides: phantom },
  });
  const notes: string[] = [];
  if (missing.length) notes.push(`added ${missing.length} export(s)`);
  if (phantom.length) notes.push(`pruned ${phantom.length} phantom provide(s)`);
  out({ ...result, applied: true, note: notes.join("; ") }, options.json);
  if (!options.json) {
    if (missing.length) console.log(`  ✔ contract completed: +${missing.join(", ")}`);
    if (phantom.length) console.log(`  ✔ pruned (not real exports): -${phantom.join(", ")}`);
    if (pruneSuppressed) console.log(`  ⚠ --prune suppressed: export surface not fully AST-determinable (wildcard re-export or unreadable file); no provide pruned.`);
    if (q.ruleNoise.prose > 0) console.log(`  note: ${q.ruleNoise.prose} prose-rule(s) remain — review manually.`);
  }
}

function out(obj: Record<string, unknown>, json?: boolean): void {
  if (json) { console.log(JSON.stringify(obj, null, 2)); return; }
  if (obj.ok === false) { console.error(`✖ ficha cleanup ${obj.nodeId}: ${obj.failure}`); return; }
  console.log(`◆ ficha cleanup ${obj.nodeId}  (${obj.srcFile})`);
  if (obj.note) console.log(`  ${obj.note}`);
}
