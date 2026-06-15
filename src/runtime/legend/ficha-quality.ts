import * as fs from "node:fs";
import * as path from "node:path";
import type { OntologyNode } from "../../kernel/schemas/ontology.js";
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
  // on the module surface, so consensus never forms.
  //
  // `phantom` is ONLY populated when the node's full export surface is
  // determinable from its source AST (`surfaceDeterminable`). We refuse to
  // call any provide phantom unless we can see the WHOLE surface, because a
  // false phantom feeds `--prune` and silently deletes a real contract key.
  // Three things break determinability and force `phantom: []`:
  //   1. an unreadable / unparseable source file (can't see exports at all);
  //   2. a bare wildcard re-export (`export * from "./x.js"`) — surfaces names
  //      with no local AST identifier, so an undeclared-looking provide may be
  //      legitimately re-exported through the star;
  //   3. an empty AST export surface (presence-only / side-effect modules).
  // Multi-file nodes are handled by unioning every `outputs.files` entry's
  // export surface (a provide satisfied by file[1] must not look phantom
  // because we only read file[0]).
  contractOverflow: {
    phantom: string[];
    // False when phantom detection was suppressed for safety (see above). A
    // consumer that prunes MUST check this: `phantom: []` with
    // `surfaceDeterminable: false` means "unknown", not "none".
    surfaceDeterminable: boolean;
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
  const srcFiles = node.outputs?.files ?? [];
  const srcRel = srcFiles[0] ?? null;
  const declaredKeys = new Set(
    (node.context?.provides ?? []).map((p) => (typeof p === "string" ? p : p.key)),
  );
  // Union the export surface across EVERY source file the node maps to. Reading
  // only file[0] (the previous behaviour) made any provide satisfied by a
  // second file look phantom — a silent-data-loss trap under `--prune`.
  const exportSet = new Set<string>();
  let allParsed = srcFiles.length > 0;
  let anyWildcard = false;
  for (const rel of srcFiles) {
    const abs = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
    const scan = scanFileSymbols(abs);
    if (!scan.ok) {
      allParsed = false;
      continue;
    }
    for (const e of scan.mandatoryExports) exportSet.add(e);
    if (scan.hasWildcardReExport) anyWildcard = true;
  }
  const astExports = [...exportSet];
  const parseOk = allParsed;
  const missing = astExports.filter((e) => !declaredKeys.has(e));
  // Phantom = declared provides absent from the AST export surface. We only
  // judge phantom when the WHOLE surface is determinable: every file parsed,
  // no bare `export *` (which surfaces names with no local AST identifier),
  // and a positive export surface to compare against. Otherwise `phantom: []`
  // means "unknown", and `surfaceDeterminable` says so — `--prune` must not
  // delete a key we cannot prove is absent.
  const surfaceDeterminable = parseOk && !anyWildcard && astExports.length > 0;
  const astSet = new Set(astExports);
  const phantom = surfaceDeterminable
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
    contractOverflow: { phantom, surfaceDeterminable },
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
