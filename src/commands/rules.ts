import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodeById, loadNodes } from "../core/project/load.js";
import { checkRules, classifyRule, type RuleVerdict } from "../runtime/legend/rule-checker.js";

// `onto rules check <node>` / `onto rules audit` — the enforcement + triage
// surface for a node's `rules`. rules-grounding (LENS_LAWS_2026-06-13 E2) made
// rules round-trip as preserved text; this turns the decidable ones into
// VERIFIED invariants and honestly classifies the rest. On the live graph the
// headline is the triage: most `rules` are prose / canon axioms / 3B extraction
// noise, not enforceable invariants — a ficha-quality signal.

export interface RulesCheckOptions {
  regen?: string;
  json?: boolean;
}

const VERDICT_MARK: Record<RuleVerdict, string> = {
  pass: "✓ pass",
  fail: "✗ FAIL",
  behavioural: "→ behavioural (enforce via `onto probe`)",
  meta: "· meta (property — not statically checked)",
  prose: "· prose (not an enforceable rule)",
  unparseable: "? unparseable",
};

export async function rulesCheckCommand(nodeId: string, options: RulesCheckOptions): Promise<void> {
  const cwd = process.cwd();
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    fail(`node not found: ${nodeId}`, options.json);
    process.exit(1);
    return;
  }
  const rules = node.rules ?? [];
  if (rules.length === 0) {
    if (options.json) console.log(JSON.stringify({ ok: true, nodeId, rules: 0, checks: [] }, null, 2));
    else console.log(`◆ rules check ${nodeId}: node declares no rules.`);
    return;
  }

  // Resolve the artifact to check the rules against: --regen, else the shadow.
  let artifactPath: string | null = options.regen ?? node.outputs?.files?.[0] ?? null;
  if (artifactPath && !path.isAbsolute(artifactPath)) artifactPath = path.join(cwd, artifactPath);
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    fail(`no artifact to check against (pass --regen <path> or give the node an outputs.files shadow)`, options.json);
    process.exit(1);
    return;
  }
  const artifactText = fs.readFileSync(artifactPath, "utf-8");
  const result = checkRules({ nodeId, rules, artifactText });

  if (options.json) {
    console.log(JSON.stringify({ ok: result.violations === 0, artifact: path.relative(cwd, artifactPath), ...result }, null, 2));
  } else {
    console.log(`◆ rules check ${nodeId}  (against ${path.relative(cwd, artifactPath)})`);
    for (const c of result.checks) {
      console.log(`  ${VERDICT_MARK[c.verdict]}  ${c.rule.slice(0, 88)}${c.detail && (c.verdict === "fail" || c.verdict === "pass") ? `\n        ${c.detail}` : ""}`);
    }
    console.log(
      `  — static-checked ${result.staticChecked}, violations ${result.violations}; behavioural ${result.behavioural}, meta ${result.meta}, prose ${result.prose}`,
    );
  }
  if (result.violations > 0) process.exit(1);
}

export async function rulesAuditCommand(options: { json?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const nodes = loadNodes(cwd);
  const dist = { forbid_static: 0, require_static: 0, behavioural: 0, meta: 0, prose: 0 };
  let withRules = 0;
  let totalRules = 0;
  const proseSamples: { nodeId: string; rule: string }[] = [];
  for (const n of nodes) {
    const rules = n.rules ?? [];
    if (rules.length === 0) continue;
    withRules++;
    for (const r of rules) {
      totalRules++;
      const { ruleClass } = classifyRule(r);
      dist[ruleClass]++;
      if (ruleClass === "prose" && proseSamples.length < 8) proseSamples.push({ nodeId: n.id, rule: r.slice(0, 70) });
    }
  }
  const enforceable = dist.forbid_static + dist.require_static;
  const summary = {
    nodesWithRules: withRules,
    totalRules,
    distribution: dist,
    staticallyEnforceable: enforceable,
    behaviourallyEnforceable: dist.behavioural,
    proseOrNoise: dist.prose,
    proseFraction: totalRules ? +(dist.prose / totalRules).toFixed(3) : 0,
  };
  if (options.json) {
    console.log(JSON.stringify({ ...summary, proseSamples }, null, 2));
    return;
  }
  console.log(`◆ rules audit — ${totalRules} rules across ${withRules} nodes`);
  console.log(`  statically enforceable (forbid/require symbol): ${enforceable}`);
  console.log(`  behavioural (→ onto probe):                     ${dist.behavioural}`);
  console.log(`  meta (property-level):                          ${dist.meta}`);
  console.log(`  prose / canon / extraction-noise:               ${dist.prose}  (${(summary.proseFraction * 100).toFixed(0)}% — a ficha-quality signal)`);
  if (proseSamples.length) {
    console.log(`  sample prose flagged for cleanup:`);
    for (const s of proseSamples) console.log(`    ${s.nodeId}: ${s.rule}`);
  }
}

function fail(msg: string, json?: boolean): void {
  if (json) console.log(JSON.stringify({ ok: false, failure: msg }, null, 2));
  else console.error(`✖ ${msg}`);
}
