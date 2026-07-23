// `onto repair` — the CLI surface of the ficha-repair lever (MVP_REGEN_LOOP.md
// §4.2). Two shapes, discriminated by the target id prefix:
//
//   onto repair node_XXXX  [--operator strict|perm] [--provider/--model …]
//     run one repair: parent baseline → author → guards → proposal +
//     repair_proposed → fork evaluation → flip-diff report. Human-gated:
//     nothing is applied.
//
//   onto repair proposal_XXXX --promote | --discard
//     resolve a pending repair proposal (the Walker's decision, scriptable):
//     apply/reject + repair_promoted / repair_discarded with the evidence
//     replayed from the proposed event when available.

import {
  runFichaRepair,
  resolveRepair,
  repairSpecForProposal,
  type RepairConfig,
} from "../../runtime/executor/repair.js";
import {
  foldRepairEvents,
  computeOperatorGap,
  computeAgreement,
} from "../../runtime/executor/repair-report.js";
import { readEventLog } from "../../kernel/core/state/replay.js";

export interface RepairCommandOptions {
  operator?: string;
  provider?: string;
  model?: string;
  rung?: number;
  repairProvider?: string;
  repairModel?: string;
  draws?: number;
  /** commander maps --no-holdout to holdout === false. */
  holdout?: boolean;
  budgetChars?: number;
  behaviorFixturesDir?: string;
  ollamaHost?: string;
  maxTokens?: number;
  promote?: boolean;
  discard?: boolean;
  json?: boolean;
}

const emit = (line: string): void => {
  console.log(line);
};

export async function repairCommand(target: string, options: RepairCommandOptions): Promise<void> {
  const cwd = process.cwd();

  // ── Report shape: the two MVP numbers off the temporal log ────────────
  if (target === "report") {
    const { attempts, resolutions } = foldRepairEvents(readEventLog(cwd));
    const gap = computeOperatorGap(attempts);
    const agreement = computeAgreement(attempts, resolutions);
    if (options.json) {
      emit(JSON.stringify({ attempts: attempts.length, gap, agreement }, null, 2));
      return;
    }
    emit(`repair report — ${attempts.length} measured attempt(s), ${agreement.resolved} resolved`);
    emit("");
    emit("strict↔perm gap (same node, same parent ficha — the measured quantity):");
    if (gap.length === 0) emit("  (no repair attempts recorded yet)");
    for (const row of gap) {
      const s = row.strict ? `strict ${row.strict.netFlips >= 0 ? "+" : ""}${row.strict.netFlips}` : "strict —";
      const p = row.perm ? `perm ${row.perm.netFlips >= 0 ? "+" : ""}${row.perm.netFlips}` : "perm —";
      const g = row.gap !== undefined ? `  gap ${row.gap >= 0 ? "+" : ""}${row.gap}` : "  (need both arms at this baseline)";
      emit(`  ${row.nodeId} @${row.parentFichaHash.slice(0, 8)}  ${s} · ${p}${g}`);
    }
    emit("");
    emit("human↔auto agreement (the pre-registered v2 gate — autoDecision vs the human):");
    if (agreement.rate === null) {
      emit("  (no resolutions yet — promote/discard some repairs first)");
    } else {
      emit(`  rate: ${agreement.agreements}/${agreement.resolved} = ${(agreement.rate * 100).toFixed(0)}%`);
      for (const r of agreement.rows.filter((x) => !x.agree)) {
        emit(`  ✗ ${r.proposalId} ${r.nodeId} [${r.operator}] human=${r.human} auto=${r.auto}`);
      }
    }
    return;
  }

  // ── Resolution shape ───────────────────────────────────────────────────
  if (target.startsWith("proposal_")) {
    if (options.promote === options.discard) {
      throw new Error("resolving a repair proposal requires exactly one of --promote / --discard");
    }
    const spec = repairSpecForProposal(cwd, target);
    if (!spec) {
      throw new Error(`no repair_proposed event found for ${target} — is it a ficha-repair proposal?`);
    }
    const result = resolveRepair({
      proposalId: target,
      decision: options.promote ? "promote" : "discard",
      spec,
      cwd,
    });
    if (options.json) {
      emit(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      emit(`✔ ${target} ${result.decision === "promote" ? "promoted — ficha applied" : "discarded — proposal rejected"}`);
    } else {
      emit(`✖ ${target}: ${result.detail}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (!target.startsWith("node_")) {
    throw new Error(`repair target must be a node_… (run), proposal_… (resolve), or "report", got: ${target}`);
  }

  // ── Run shape ──────────────────────────────────────────────────────────
  const op = options.operator ?? "strict";
  if (op !== "strict" && op !== "perm") {
    throw new Error(`--operator must be strict or perm, got: ${op}`);
  }
  if (!options.provider) {
    throw new Error("an explicit --provider is required (same footgun-closure as regenerate: no silent mock)");
  }
  const config: RepairConfig = {
    nodeId: target,
    operator: op === "strict" ? "R_strict" : "R_perm",
    provider: options.provider,
    model: options.model,
    rung: options.rung,
    repairProvider: options.repairProvider,
    repairModel: options.repairModel,
    draws: options.draws,
    holdout: options.holdout,
    budgetChars: options.budgetChars,
    behaviorFixturesDir: options.behaviorFixturesDir,
    ollamaHost: options.ollamaHost,
    maxTokens: options.maxTokens,
    cwd,
  };
  const report = await runFichaRepair(config);

  if (options.json) {
    emit(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (!report.ok) {
    if (report.parentAlreadyPasses) {
      emit(`✔ ${target}: parent baseline already passes every case — nothing to repair`);
      return;
    }
    emit(`✖ ${target} repair failed at ${report.failedStage}: ${report.detail}`);
    process.exitCode = 1;
    return;
  }

  const d = report.diff!;
  emit(`✔ ${target} ${report.operator} → ${report.proposalId}`);
  emit(`  parent ${report.parentFichaHash!.slice(0, 8)} → fork ${report.forkFichaHash!.slice(0, 8)} (rung fixed: ${config.provider}${config.model ? `:${config.model}` : ""})`);
  emit(`  AUTHOR flips: +${d.wrongToRight.length} wrong→right, -${d.rightToWrong.length} right→wrong (net ${d.netFlips >= 0 ? "+" : ""}${d.netFlips} over ${d.comparableCases} cases)`);
  if (d.wrongToRight.length > 0) emit(`    fixed: ${d.wrongToRight.map((f) => f.name).join(", ")}`);
  if (d.rightToWrong.length > 0) emit(`    broke: ${d.rightToWrong.map((f) => f.name).join(", ")}`);
  if (report.split && report.confirmDiff) {
    const c = report.confirmDiff;
    emit(
      `  CONFIRM (held-out ${report.split.confirm.length} case(s), never prompted): +${c.wrongToRight.length}/-${c.rightToWrong.length}` +
        (report.confirmRegression ? " ⚠ REGRESSION — the repair broke a case the author never saw" : " ✓ no regression"),
    );
  } else {
    emit(`  holdout: none (${options.holdout === false ? "--no-holdout" : "fixture too small to split"}) — AUTHOR flips are in-sample`);
  }
  if (d.parentOnlyCases.length > 0 || d.forkOnlyCases.length > 0) {
    emit(`  ⚠ fixture drift: parent-only [${d.parentOnlyCases.join(", ")}] fork-only [${d.forkOnlyCases.join(", ")}]`);
  }
  if (!d.meetsDrawFloor) {
    emit(`  ⚠ below draw floor (${d.parentEvaluatedDraws}/${d.forkEvaluatedDraws} evaluated vs floor ${d.drawFloor}) — flips are noise-grade evidence`);
  }
  emit(`  budget: +${report.budget!.addedChars}/${report.budget!.budgetChars} chars`);
  emit(`  next: onto repair ${report.proposalId} --promote | --discard`);
}
