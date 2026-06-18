import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodeById, loadEdges } from "../../../kernel/core/project/load.js";
import {
  computeCompilePlan,
  HARD_DEPENDENCY_EDGE_TYPES,
} from "../../../kernel/graph/compile-plan.js";
import { fichaQuality } from "../../../inverse/ficha-quality.js";
import { checkRules } from "../../../inverse/rule-checker.js";
import { resolveFixturePath } from "../../../laws/behavior-checker.js";
import { shadowReport, type ShadowStatus } from "../state/shadow-status.js";

// Walker v2 — the node-health dashboard (`:health`). The "first screen" the
// ROADMAP 2026-06-18 checkpoint calls for: for the focal node, compose its
// identity, code-shadow freshness, behaviour-fixture + static-rule coverage,
// ficha (contract) quality, dependency closure, and — the load-bearing part —
// the NEXT SAFE ACTION in the governed loop. A pure read-only composition of
// primitives that already exist (shadowReport, fichaQuality, checkRules, the
// fixture resolver, the compile plan); it writes nothing and runs no fixtures.

const HARD = new Set<string>(HARD_DEPENDENCY_EDGE_TYPES as readonly string[]);

export type SyncConfidence = "syncable" | "lower" | "blocked" | "no-shadow";

export interface NextAction {
  /** Human-readable, reason-first (what + why), e.g. "add a behaviour fixture
   *  — no fixture means a write can't be gated on behaviour". */
  label: string;
  /** The concrete CLI command to run, when there is one. */
  command?: string;
}

export interface NodeHealthResult {
  ok: boolean;
  message?: string;
  nodeId: string;
  label?: string;
  kind?: string;
  srcFile?: string;
  shadow: ShadowStatus;
  driftedFiles: string[];
  hasFixture: boolean;
  rules: { total: number; violations: number; staticDecidable: number; behavioural: number; prose: number };
  ficha: { missing: string[]; phantom: string[]; surfaceDeterminable: boolean; parseOk: boolean };
  closure: { upstream: string[]; dependents: string[] };
  confidence: SyncConfidence;
  nextActions: NextAction[];
}

export function nodeHealthFromWalker(
  nodeId: string,
  cwd: string = process.cwd(),
  fixturesDir: string = path.join(cwd, "tests/behavior-fixtures"),
): NodeHealthResult {
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    return emptyResult(nodeId, `node not found: ${nodeId}`);
  }

  const srcFile = node.outputs?.files?.[0];
  const shadow = shadowReport(node, cwd);
  const hasFixture = resolveFixturePath(fixturesDir, nodeId) !== null;
  const q = fichaQuality(node, cwd);

  // Static rule gate — the third sync gate. Only meaningful when the artifact
  // exists on disk; otherwise there is nothing to check against.
  let rules = { total: (node.rules ?? []).length, violations: 0, staticDecidable: 0, behavioural: 0, prose: 0 };
  if (srcFile && fs.existsSync(srcFile) && (node.rules ?? []).length > 0) {
    const rc = checkRules({ nodeId, rules: node.rules ?? [], artifactText: fs.readFileSync(srcFile, "utf-8") });
    rules = {
      total: rc.checks.length,
      violations: rc.violations,
      staticDecidable: rc.staticChecked,
      behavioural: rc.behavioural,
      prose: rc.prose,
    };
  }

  // Dependency closure: upstream hard-deps (focal → e.to) and direct dependents
  // (e.to === focal → e.from). Upstream-closed is what the executor needs to
  // attempt a node honestly.
  const edges = loadEdges(cwd);
  const upstream = edges.filter((e) => HARD.has(e.type) && e.from === nodeId).map((e) => e.to).sort();
  const dependents = edges.filter((e) => HARD.has(e.type) && e.to === nodeId).map((e) => e.from).sort();
  // Validate the focal still has a well-formed plan (cycle/conflict surfaces here).
  const plan = computeCompilePlan(nodeId, edges);
  const planProblem = plan.ok ? undefined : plan.reason;

  const confidence = classifyConfidence(shadow.status, hasFixture, rules.violations);
  const nextActions = deriveNextActions({
    nodeId,
    shadow: shadow.status,
    hasFixture,
    violations: rules.violations,
    missing: q.contractGap.missing.length,
    phantom: q.contractOverflow.phantom.length,
    planProblem,
  });

  return {
    ok: true,
    nodeId,
    label: node.label,
    kind: node.kind,
    srcFile,
    shadow: shadow.status,
    driftedFiles: shadow.driftedFiles,
    hasFixture,
    rules,
    ficha: {
      missing: q.contractGap.missing,
      phantom: q.contractOverflow.phantom,
      surfaceDeterminable: q.contractOverflow.surfaceDeterminable,
      parseOk: q.parseOk,
    },
    closure: { upstream, dependents },
    confidence,
    nextActions,
  };
}

export function classifyConfidence(
  shadow: ShadowStatus,
  hasFixture: boolean,
  violations: number,
): SyncConfidence {
  if (shadow === "no_shadow") return "no-shadow";
  if (violations > 0) return "blocked";
  if (!hasFixture) return "lower";
  return "syncable";
}

// The governed-loop recommendation, ranked: fix what blocks a confident write
// first, then close the loop. Each action states what AND why. Pure over plain
// primitives so it can be unit-tested exhaustively.
export function deriveNextActions(args: {
  nodeId: string;
  shadow: ShadowStatus;
  hasFixture: boolean;
  violations: number;
  missing: number;
  phantom: number;
  planProblem?: string;
}): NextAction[] {
  const { nodeId, shadow, hasFixture, violations, missing, phantom, planProblem } = args;
  const out: NextAction[] = [];

  if (planProblem) {
    out.push({ label: `dependency plan ${planProblem} — resolve before regenerating` });
  }
  if (shadow === "no_shadow") {
    out.push({ label: "no code shadow — this node emits no artifact to sync" });
    return out;
  }
  if (shadow === "missing") {
    out.push({ label: "shadow source missing on disk — compile it first", command: `onto compile ${nodeId}` });
  }

  if (missing + phantom > 0) {
    out.push({
      label: `reconcile the ficha — ${missing} missing / ${phantom} phantom contract key(s) lower regen determinacy`,
      command: `onto ficha cleanup ${nodeId} --apply --prune`,
    });
  }
  if (violations > 0) {
    out.push({ label: `resolve ${violations} static rule violation(s) — a violation blocks any write` });
  }
  if (!hasFixture) {
    out.push({
      label: "add a behaviour fixture — without one a write can't be gated on behaviour (lower confidence)",
      command: `onto probe ${nodeId}`,
    });
  }
  if (shadow === "drifted") {
    out.push({
      label: "shadow drifted from its anchor — sync to regenerate + re-anchor, or accept the drift",
      command: `onto sync ${nodeId}`,
    });
  }

  // When nothing blocks a confident write, name the close-the-loop action.
  if (hasFixture && violations === 0 && (shadow === "clean" || shadow === "no_anchor")) {
    out.push({ label: "syncable with confidence — regenerate + gate + write in one step", command: `onto sync ${nodeId}` });
    out.push({ label: "or run the governed executor (refine/escalate ladder)", command: `onto execute ${nodeId}` });
  }
  return out;
}

function emptyResult(nodeId: string, message: string): NodeHealthResult {
  return {
    ok: false,
    message,
    nodeId,
    shadow: "no_shadow",
    driftedFiles: [],
    hasFixture: false,
    rules: { total: 0, violations: 0, staticDecidable: 0, behavioural: 0, prose: 0 },
    ficha: { missing: [], phantom: [], surfaceDeterminable: false, parseOk: false },
    closure: { upstream: [], dependents: [] },
    confidence: "no-shadow",
    nextActions: [],
  };
}
