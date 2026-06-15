import { runRegenerate, type RegenerateCommandOptions, type RegenerateResult } from "./regenerate.js";
import { reanchorNodeArtifacts, type ReanchorResult } from "../../laws/reanchor-node.js";

// `onto sync <node>` — the governed intent→code loop, in one command.
//
// It is a THIN orchestration over primitives that already exist and are tested:
// regenerate (with multi-draw consensus) + the three verification gates +
// a per-node drift re-anchor. It introduces NO new verification semantics — it
// just flips the gates ON by default, re-anchors only the synced node on a
// successful write, and renders the whole decision in one place.
//
//   edit a node's intent  →  onto sync <node>
//     → regenerate (--draws 3, consensus floor 2)
//     → gate: structural verdict + behaviour fixture + declared rules
//     → ALL pass → write the shadow + re-anchor THIS node's drift
//       ANY block → write nothing, exit non-zero, name the blocking gate
//
// See docs/design/runtime/SYNC_LOOP_SPEC.md for the acceptance contract.

export interface SyncCommandOptions {
  provider?: string;
  model?: string;
  ollamaHost?: string;
  draws?: number;
  consensus?: number;
  locThreshold?: number;
  jaccardThreshold?: number;
  behaviorFixturesDir?: string;
  /** Run the full loop (regen + gates) but never write or re-anchor. */
  dryRun?: boolean;
  /** Show the full reasoning (draws, verdict, behaviour, rules) behind the decision. */
  explain?: boolean;
  noLock?: boolean;
  json?: boolean;
}

type SyncDecision = "wrote" | "refused" | "preview" | "error";

export interface SyncResult {
  ok: boolean;
  nodeId: string;
  decision: SyncDecision;
  /** The full regenerate result — the evidence behind the decision (--explain). */
  regen: RegenerateResult;
  /** Present only when a write happened and we attempted to re-anchor. */
  reanchor?: ReanchorResult;
  /** The single, precise reason a write was refused or the run errored. */
  reason?: string;
}

// Default consensus posture: 3 draws, majority floor (regenerate computes
// floor(N/2)+1 = 2 when --consensus is omitted). Gates are forced ON here —
// that is the whole difference between `sync` and a raw `regenerate`.
const DEFAULT_DRAWS = 3;

export async function runSync(
  nodeId: string,
  options: SyncCommandOptions,
  cwd: string = process.cwd(),
): Promise<SyncResult> {
  const regenOptions: RegenerateCommandOptions = {
    provider: options.provider,
    model: options.model,
    ollamaHost: options.ollamaHost,
    write: !options.dryRun,
    behaviorCheck: true, // always load the fixture if present (untested ≠ pass)
    behaviorFixturesDir: options.behaviorFixturesDir,
    checkRules: true, // always enforce statically-decidable declared rules
    draws: options.draws ?? DEFAULT_DRAWS,
    consensus: options.consensus,
    locThreshold: options.locThreshold,
    jaccardThreshold: options.jaccardThreshold,
    noLock: options.noLock,
  };

  const regen = await runRegenerate(nodeId, regenOptions, cwd);

  if (!regen.ok) {
    return { ok: false, nodeId, decision: "error", regen, reason: regen.failure };
  }
  if (options.dryRun) {
    return { ok: true, nodeId, decision: "preview", regen };
  }
  if (regen.written) {
    const reanchor = reanchorNodeArtifacts(nodeId, cwd);
    return { ok: true, nodeId, decision: "wrote", regen, reanchor };
  }
  // Gates blocked the write — surface the precise reason verbatim.
  return { ok: false, nodeId, decision: "refused", regen, reason: regen.writeBlockedReason };
}

export async function syncCommand(nodeId: string, options: SyncCommandOptions): Promise<void> {
  const result = await runSync(nodeId, options, process.cwd());
  emit(result, options);
  if (!result.ok) process.exitCode = 1;
}

// ── Rendering ──────────────────────────────────────────────────────────────

function emit(result: SyncResult, options: SyncCommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const { regen } = result;

  // The full reasoning, when asked (spec §5): draws → structural → behaviour
  // → rules → decision. Nothing here requires reading source to follow.
  if (options.explain) {
    console.log(`◆ sync ${result.nodeId} — reasoning`);
    if (regen.draws && regen.draws > 1) {
      console.log(
        `  draws:      ${regen.consensusSize}/${regen.draws} agree (need ${regen.consensusK}); acceptable ${regen.acceptableDraws}/${regen.draws}; clusters [${(regen.clusterSizes ?? []).join(", ")}]`,
      );
    }
    if (regen.metrics) {
      console.log(
        `  structural: ${regen.verdict}  (loc-dist ${regen.metrics.locDistance.toFixed(3)}, jaccard ${regen.metrics.structuralJaccard.toFixed(3)})`,
      );
    }
    console.log(`  behaviour:  ${renderBehaviour(regen.behaviorVerdict)}`);
    console.log(`  rules:      ${renderRules(regen.ruleViolations)}`);
    console.log("");
  }

  console.log(decisionLine(result));

  // A refusal/error always states the precise reason, even without --explain.
  if (!result.ok && result.reason) {
    console.log(`  reason: ${result.reason}`);
  }
  if (result.decision === "wrote") {
    console.log(`  wrote:  ${regen.sourceFile}`);
    console.log(`  ${renderReanchor(result.reanchor)}`);
  }
}

function decisionLine(result: SyncResult): string {
  switch (result.decision) {
    case "wrote":
      return `✔ SYNC ${result.nodeId} — WROTE (all gates passed)`;
    case "refused":
      return `✖ SYNC ${result.nodeId} — REFUSED (wrote nothing)`;
    case "preview":
      return `◆ SYNC ${result.nodeId} — PREVIEW (dry-run, wrote nothing)`;
    case "error":
      return `✖ SYNC ${result.nodeId} — ERROR`;
  }
}

function renderBehaviour(v: RegenerateResult["behaviorVerdict"]): string {
  if (v === undefined || v === "no_fixture") return "untested (no fixture)";
  return v; // "pass" | "fail" | "untested"
}

function renderRules(violations: number | undefined): string {
  if (violations === undefined) return "not checked";
  return violations === 0 ? "clean (0 violations)" : `✖ ${violations} violation(s)`;
}

function renderReanchor(r: ReanchorResult | undefined): string {
  if (!r) return "re-anchor: skipped";
  if (r.anchored) return `re-anchored: ${r.paths.join(", ")} (this node only)`;
  return `re-anchor: skipped — ${r.reason}`;
}
