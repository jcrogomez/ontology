import * as fs from "node:fs";
import * as path from "node:path";
import type { OntologyNode } from "../../schemas/ontology.js";
import { scanFileSymbols } from "./ast-symbol-scanner.js";
import { classifyRule } from "./rule-checker.js";

// Ficha quality — measure how much each node's intent record (its "ficha":
// prompt + contract + rules) needs cleanup, BEFORE re-extracting anything
// (the house "measure before construct" discipline). The live graph was
// populated by a 3B extractor (2026-06-11), and every downstream experiment
// (bilateral M1, lens-laws GET, rules-field 75%-noise) pointed at the same
// binding constraint: extraction/ficha quality. This quantifies that per node.
//
// Two deterministic signals, both $0:
//   contractGap — exports the source file actually has (AST) that the ficha's
//     `provides` does NOT declare. This is the recall-bound thinness the
//     bilateral round-trip measured, made concrete and per-node. The fix is
//     deterministic (the AST names the missing exports) — no LLM needed.
//   ruleNoise  — fraction of `rules` that classify as prose (canon axioms on
//     the canon node are legitimate; extraction noise on code nodes is junk).

export interface FichaQuality {
  nodeId: string;
  srcFile: string | null;
  parseOk: boolean;
  contractGap: {
    declared: number;
    astExports: number;
    missing: string[];
  };
  // The dual of contractGap: `provides` keys the source does NOT actually
  // export (imported helpers or private symbols mislabelled as provides by
  // the extractor). Over-declaration; the determinacy killer measured in the
  // sync-loop acceptance — phantom provides make compile-back drafts disagree
  // on the module surface, so consensus never forms. Only populated when the
  // AST parsed and has a positive export surface to compare against (we never
  // call a provide phantom on a file we couldn't read).
  contractOverflow: {
    phantom: string[];
  };
  ruleNoise: {
    total: number;
    prose: number;
    behavioural: number;
    meta: number;
    staticDecidable: number;
  };
  promptChars: number;
  // Higher = needs more cleanup. Missing exports weigh 2 (a thin contract is
  // the load-bearing deficiency); prose rules on a code node weigh 1.
  cleanupScore: number;
}

export function fichaQuality(node: OntologyNode, cwd: string = process.cwd()): FichaQuality {
  const srcRel = node.outputs?.files?.[0] ?? null;
  const declaredKeys = new Set(
    (node.context?.provides ?? []).map((p) => (typeof p === "string" ? p : p.key)),
  );
  let astExports: string[] = [];
  let parseOk = false;
  if (srcRel) {
    const abs = path.isAbsolute(srcRel) ? srcRel : path.join(cwd, srcRel);
    const scan = scanFileSymbols(abs);
    parseOk = scan.ok;
    astExports = scan.mandatoryExports;
  }
  const missing = astExports.filter((e) => !declaredKeys.has(e));
  // Phantom = declared provides absent from the AST export surface. Conservative:
  // only when the file parsed AND exposes a positive export surface, so a node
  // whose source we couldn't read never has its provides judged phantom.
  const astSet = new Set(astExports);
  const phantom =
    parseOk && astExports.length > 0
      ? [...declaredKeys].filter((k) => !astSet.has(k))
      : [];

  const rules = node.rules ?? [];
  const classes = rules.map((r) => classifyRule(r).ruleClass);
  const ruleNoise = {
    total: rules.length,
    prose: classes.filter((c) => c === "prose").length,
    behavioural: classes.filter((c) => c === "behavioural").length,
    meta: classes.filter((c) => c === "meta").length,
    staticDecidable: classes.filter((c) => c === "forbid_static" || c === "require_static").length,
  };

  // Prose rules only count as "noise" on code nodes (a canon/intent node's
  // axioms are legitimately prose).
  const isCode = node.coordinates?.manifestation === "code";
  const cleanupScore = missing.length * 2 + (isCode ? ruleNoise.prose : 0);

  return {
    nodeId: node.id,
    srcFile: srcRel,
    parseOk,
    contractGap: { declared: declaredKeys.size, astExports: astExports.length, missing },
    contractOverflow: { phantom },
    ruleNoise,
    promptChars: (node.prompt?.raw ?? "").length,
    cleanupScore,
  };
}

export interface FichaAudit {
  nodesScanned: number;
  nodesWithMissingExports: number;
  totalMissingExports: number;
  nodesWithPhantomProvides: number;
  totalPhantomProvides: number;
  totalProseRulesOnCodeNodes: number;
  worklist: FichaQuality[]; // sorted by cleanupScore desc
}

export function auditFichas(nodes: readonly OntologyNode[], cwd: string = process.cwd()): FichaAudit {
  const scored = nodes
    .filter((n) => n.coordinates?.manifestation === "code" && n.outputs?.files?.[0])
    .map((n) => fichaQuality(n, cwd));
  const totalMissingExports = scored.reduce((a, q) => a + q.contractGap.missing.length, 0);
  return {
    nodesScanned: scored.length,
    nodesWithMissingExports: scored.filter((q) => q.contractGap.missing.length > 0).length,
    totalMissingExports,
    nodesWithPhantomProvides: scored.filter((q) => q.contractOverflow.phantom.length > 0).length,
    totalPhantomProvides: scored.reduce((a, q) => a + q.contractOverflow.phantom.length, 0),
    totalProseRulesOnCodeNodes: scored.reduce((a, q) => a + q.ruleNoise.prose, 0),
    worklist: scored.filter((q) => q.cleanupScore > 0).sort((a, b) => b.cleanupScore - a.cleanupScore),
  };
}
