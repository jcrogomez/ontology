// `onto bakeoff` — cross-arm fidelity synthesis + release-gate (#4).
//
// Wraps the pure `synthesizeBakeoff` reducer (src/runtime/legend/
// bakeoff-synthesis.ts) so the cross-arm comparison isn't a hand-rolled
// script. Reads N verify-homeomorphism `--json` reports (recorded arm
// outputs), folds them into one synthesis, and applies an H1 floor GATE:
// the command exits non-zero if any arm's mean structural Jaccard is below
// `--min-jaccard`.
//
// HONESTY NOTE: this does NOT re-measure fidelity. It consumes already-
// recorded reports (a live verify-homeomorphism run needs a real LLM —
// cost + non-determinism, infeasible in CI). The gate is regression
// protection over the scoring machinery and the recorded corpus, not a
// fresh measurement. That is exactly its CI role.

import * as fs from "node:fs";
import {
  loadAggregateReport,
  synthesizeBakeoff,
  renderBakeoffSynthesisMarkdown,
  DEFAULT_H1_JACCARD_FLOOR,
  type BakeoffArm,
} from "../../runtime/legend/bakeoff-synthesis.js";
import { errorMessage } from "../../kernel/core/errors.js";

export interface BakeoffCommandOptions {
  minJaccard?: number;
  report?: string;
  json?: boolean;
  baseline?: string;
  gateAll?: boolean;
}

// Parse one positional token: "label=path" → {label, path}; "path" → auto
// label by index letter (A, B, C, …). Paths with no "=" are auto-labelled.
function parseArmArg(token: string, index: number): { label: string; path: string } {
  const eq = token.indexOf("=");
  if (eq > 0) {
    return { label: token.slice(0, eq), path: token.slice(eq + 1) };
  }
  return { label: String.fromCharCode(65 + index), path: token };
}

export async function bakeoffCommand(
  reportArgs: string[],
  options: BakeoffCommandOptions,
): Promise<void> {
  if (!Array.isArray(reportArgs) || reportArgs.length === 0) {
    console.error("✖ bakeoff: pass at least one report path (e.g. `onto bakeoff A=arm-a.json B=arm-b.json`).");
    process.exit(1);
    return;
  }

  const floor = options.minJaccard ?? DEFAULT_H1_JACCARD_FLOOR;

  // Load every report into an arm. loadAggregateReport handles the
  // { ok, report } wrapper that verify-homeomorphism --json emits.
  let arms: BakeoffArm[] = reportArgs.map((token, i) => {
    const { label, path } = parseArmArg(token, i);
    return { label, report: loadAggregateReport(path) };
  });

  // Optional baseline reorder (synthesizeBakeoff treats arms[0] as baseline).
  if (options.baseline !== undefined) {
    const idx = arms.findIndex((a) => a.label === options.baseline);
    if (idx < 0) {
      console.error(`✖ bakeoff: --baseline "${options.baseline}" not among arms: ${arms.map((a) => a.label).join(", ")}`);
      process.exit(1);
      return;
    }
    arms = [arms[idx], ...arms.slice(0, idx), ...arms.slice(idx + 1)];
  }

  const synthesis = synthesizeBakeoff(arms, { h1JaccardFloor: floor });

  if (options.report !== undefined) {
    fs.writeFileSync(options.report, renderBakeoffSynthesisMarkdown(synthesis));
  }

  // Gate evaluation. By DEFAULT the gate is on the BASELINE arm only (the
  // canonical treatment we ship/track) — comparison arms can legitimately
  // score low (e.g. the ε run's Arm B / Arm C-local collapsed to ~0, a real
  // recorded finding), so failing the build on them would be wrong. Pass
  // --gate-all to require every arm to clear the floor instead.
  const gateScope = options.gateAll ? synthesis.h1.perArm : synthesis.h1.perArm.slice(0, 1);
  const below = gateScope.filter(
    (p) => p.meanStructuralJaccard === null || p.meanStructuralJaccard < floor,
  );
  const gatePass = below.length === 0;
  const scopeLabel = options.gateAll ? "every arm" : `baseline "${synthesis.baselineLabel}"`;

  if (options.json) {
    console.log(JSON.stringify({ gate: { floor, scope: options.gateAll ? "all" : "baseline", pass: gatePass }, synthesis }, null, 2));
  } else {
    console.log(`Bake-off — ${synthesis.armCount} arm(s), baseline "${synthesis.baselineLabel}". H1 floor = ${floor}, gating ${scopeLabel}.\n`);
    const labelWidth = Math.max(4, ...synthesis.h1.perArm.map((p) => p.label.length));
    console.log(`  ${"Arm".padEnd(labelWidth)}  Mean Jaccard  Clears floor?`);
    for (const p of synthesis.h1.perArm) {
      const mean = p.meanStructuralJaccard === null ? "—" : p.meanStructuralJaccard.toFixed(4);
      const clears = p.meanStructuralJaccard === null ? "✖ no metrics" : p.passes ? "✓ yes" : "✖ no";
      console.log(`  ${p.label.padEnd(labelWidth)}  ${mean.padStart(12)}  ${clears}`);
    }
    console.log("");
    if (gatePass) {
      console.log(`✓ Fidelity gate PASSED: ${scopeLabel} clears the ${floor} floor.`);
    } else {
      console.error(`✖ Fidelity gate FAILED: ${below.map((p) => p.label).join(", ")} below the ${floor} floor (gating ${scopeLabel}).`);
    }
  }

  if (!gatePass) {
    process.exit(1);
  }
}

// Thin error-wrapping entry used by the CLI, mirroring sibling commands.
export async function runBakeoffCommand(
  reportArgs: string[],
  options: BakeoffCommandOptions,
): Promise<void> {
  try {
    await bakeoffCommand(reportArgs, options);
  } catch (err: unknown) {
    console.error(`✖ Error during bakeoff: ${errorMessage(err)}`);
    process.exit(1);
  }
}
