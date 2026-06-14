import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodeById } from "../core/project/load.js";
import { runCompilePlan } from "../runtime/compile/compile-plan-runner.js";
import { withLock, LockAcquireError } from "../core/fs/lock.js";
import { writeArtifact, TargetExistsError } from "../runtime/compile/artifact-writer.js";
import { shadowReport } from "../walker/state/shadow-status.js";
import {
  compareFiles,
  classifyVerdict,
  DEFAULT_THRESHOLDS,
  type HomeomorphismVerdict,
  type VerdictThresholds,
  type DistanceMetrics,
} from "../runtime/legend/verify-homeomorphism.js";
import { loadFixture, runBehaviorCheck, type BehaviorVerdict } from "../runtime/legend/behavior-checker.js";
import { checkRules } from "../runtime/legend/rule-checker.js";
import type { LlmProvider } from "../runtime/llm/types.js";

// `onto regenerate <nodeId>` — the governed lever that turns the
// kernel-of-equivalence map (ROUNDTRIP_BILATERAL_2026-06-12) into a
// daily operation. It regenerates a node's CODE shadow from its intent
// (the forward functor F), verifies the candidate against the shadow on
// disk, and only then — and only with an explicit `--write` — overwrites
// the real source file.
//
// Governance model (deliberately NOT the proposal fence): overwriting a
// real `src/` file is an ARTEFACT write, not a graph mutation, so the
// proposal system (which governs node/edge mutations) is the wrong fence.
// The right fence is *verification* + the artifact-writer's force gate:
//   • default (no --write): PREVIEW. Compile-back to staging, diff, report
//     the verdict. Touches nothing under the source tree.
//   • --write: APPLY, but ONLY if the candidate is structure-preserving
//     (verdict ∈ {epsilon_equivalent, divergent_loc}) and — when a
//     behaviour fixture exists — does not behaviourally regress. We refuse
//     to clobber working source with a divergent regeneration.
// The human still reviews the diff and re-anchors drift (`onto drift
// --update`) as separate, explicit acts — one governance step per command.

const WRITE_SAFE_VERDICTS: ReadonlySet<HomeomorphismVerdict> = new Set([
  "epsilon_equivalent",
  "divergent_loc",
]);

// Multi-draw consensus (--draws N): a single local-model draw is unsafe in two
// independent ways — random VARIANCE (one draw drops an `export` or a token)
// and SYSTEMATIC error (a stale ficha that mis-specifies the behaviour). This
// command's two gates address them separately: consensus across N draws defangs
// variance (an outlier draw is outvoted), while --behavior-check defangs the
// systematic case (every draw faithfully implements a wrong spec, but all fail
// the fixture). With --draws we compile N independent drafts, cluster the
// write-acceptable ones by their declaration set, and only write the majority
// class when it reaches the consensus floor K.

export interface RegenerateCommandOptions {
  provider?: string;
  model?: string;
  ollamaHost?: string;
  write?: boolean;
  behaviorCheck?: boolean;
  behaviorFixturesDir?: string;
  locThreshold?: number;
  jaccardThreshold?: number;
  openWorld?: boolean;
  maxTokens?: number;
  astGrounding?: boolean;
  rulesGrounding?: boolean;
  checkRules?: boolean;
  draws?: number;
  consensus?: number;
  noLock?: boolean;
  json?: boolean;
}

interface RegenerateResult {
  ok: boolean;
  nodeId: string;
  sourceFile?: string;
  regenPath?: string;
  shadowStatus?: string;
  verdict?: HomeomorphismVerdict;
  metrics?: DistanceMetrics;
  behaviorVerdict?: BehaviorVerdict | "no_fixture";
  written: boolean;
  writeBlockedReason?: string;
  failure?: string;
  // Multi-draw consensus fields (present only when draws > 1).
  draws?: number;
  acceptableDraws?: number;
  consensusSize?: number;
  consensusK?: number;
  clusterSizes?: number[];
  draftSummary?: { i: number; verdict?: HomeomorphismVerdict; behaviorVerdict: BehaviorVerdict | "no_fixture"; acceptable: boolean }[];
}

interface DraftEval {
  i: number;
  regenPath: string;
  compiled: boolean;
  metrics?: DistanceMetrics;
  verdict?: HomeomorphismVerdict;
  behaviorVerdict: BehaviorVerdict | "no_fixture";
  declKey?: string;
  acceptable: boolean;
  ruleViolations?: number;
}

function emit(result: RegenerateResult, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    console.error(`✖ regenerate ${result.nodeId}: ${result.failure}`);
    return;
  }
  const m = result.metrics;
  console.log(`◆ regenerate ${result.nodeId}`);
  console.log(`  shadow:   ${result.sourceFile} (${result.shadowStatus})`);
  if (result.regenPath) console.log(`  staged:   ${result.regenPath}`);
  if (m) {
    console.log(
      `  verdict:  ${result.verdict}  (loc-dist ${m.locDistance.toFixed(3)}, jaccard ${m.structuralJaccard.toFixed(3)})`,
    );
  }
  if (result.behaviorVerdict && result.behaviorVerdict !== "no_fixture") {
    console.log(`  behavior: ${result.behaviorVerdict}`);
  }
  if (result.draws && result.draws > 1) {
    console.log(
      `  consensus: ${result.consensusSize}/${result.draws} agree (need ${result.consensusK}); acceptable ${result.acceptableDraws}/${result.draws}; clusters [${(result.clusterSizes ?? []).join(", ")}]`,
    );
    for (const d of result.draftSummary ?? []) {
      const beh = d.behaviorVerdict !== "no_fixture" ? `, behavior ${d.behaviorVerdict}` : "";
      console.log(`    draw ${d.i}: ${d.verdict ?? "compile_failed"}${beh}${d.acceptable ? "  ✓" : ""}`);
    }
  }
  if (result.written) {
    console.log(`  ✔ wrote regenerated shadow to ${result.sourceFile}`);
    console.log(`    review the diff, then \`onto drift --update\` to re-anchor.`);
  } else if (result.writeBlockedReason) {
    console.log(`  ✖ not written: ${result.writeBlockedReason}`);
  } else {
    console.log(`  preview only — pass --write to overwrite the shadow (gated on verification).`);
  }
}

export async function regenerateCommand(
  nodeId: string,
  options: RegenerateCommandOptions,
): Promise<void> {
  const cwd = process.cwd();

  // 1. Validate provider override.
  let provider: LlmProvider | undefined;
  if (options.provider !== undefined) {
    const allowed = ["mock", "ollama", "anthropic", "gemini"];
    if (!allowed.includes(options.provider)) {
      emit({ ok: false, nodeId, written: false, failure: `unsupported provider: ${options.provider}` }, options.json);
      process.exit(1);
    }
    provider = options.provider as LlmProvider;
  }

  // 2. Load the node.
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    emit({ ok: false, nodeId, written: false, failure: `node not found: ${nodeId}` }, options.json);
    process.exit(1);
    return;
  }

  // 3. Precondition: a shadow to regenerate.
  const sourceRel = node.outputs?.files?.[0];
  if (!sourceRel) {
    emit({ ok: false, nodeId, written: false, failure: "node has no outputs.files[0] — no shadow to regenerate" }, options.json);
    process.exit(1);
    return;
  }
  const sourcePath = path.isAbsolute(sourceRel) ? sourceRel : path.join(cwd, sourceRel);
  if (!fs.existsSync(sourcePath)) {
    emit({ ok: false, nodeId, sourceFile: sourceRel, written: false, failure: `shadow source not found on disk: ${sourceRel}` }, options.json);
    process.exit(1);
    return;
  }
  const shadow = shadowReport(node, cwd);
  const thresholds: VerdictThresholds = {
    loc: options.locThreshold ?? DEFAULT_THRESHOLDS.loc,
    jaccard: options.jaccardThreshold ?? DEFAULT_THRESHOLDS.jaccard,
  };
  const draws = Math.max(1, Math.min(options.draws ?? 1, 9));
  const consensusK = options.consensus ?? Math.floor(draws / 2) + 1;
  const ext = path.extname(sourcePath) || ".txt";
  const stagingDir = path.join(cwd, ".ontology/verify");
  // draws=1 keeps the canonical single-draw staging path (byte-compatible
  // with verify-homeomorphism); draws>1 stages each draft separately.
  const draftPath = (i: number): string =>
    draws === 1 ? path.join(stagingDir, `${nodeId}${ext}`) : path.join(stagingDir, `${nodeId}.d${i}${ext}`);

  // Load the behaviour fixture once (if requested + present).
  let fixture: Awaited<ReturnType<typeof loadFixture>> = null;
  if (options.behaviorCheck) {
    const fixturesDir = options.behaviorFixturesDir ?? path.join(cwd, "tests/behavior-fixtures");
    fixture = await loadFixture(fixturesDir, nodeId).catch(() => null);
  }

  // 4. Compile N drafts inside one lock (each a fresh dispatch via a distinct
  //    cache-bypass token, mirroring verify-homeomorphism --reps).
  const compiled: { i: number; ok: boolean; message?: string }[] = [];
  try {
    await withLock(
      cwd,
      async () => {
        for (let i = 1; i <= draws; i++) {
          const r = await runCompilePlan({
            focalId: nodeId,
            provider,
            model: options.model,
            ollamaHost: options.ollamaHost,
            targetPath: draftPath(i),
            force: true,
            openWorld: options.openWorld ?? true,
            maxTokens: options.maxTokens,
            astGrounding: options.astGrounding ?? true,
            rulesGrounding: options.rulesGrounding ?? false,
            repCacheBypassToken: draws === 1 ? undefined : `regen_draw_${i}_of_${draws}`,
          });
          compiled.push({ i, ok: r.ok, message: r.ok ? undefined : r.message ?? r.reason ?? "compile-back failed" });
        }
      },
      { skipLock: options.noLock, command: `regenerate ${nodeId}` },
    );
  } catch (err: unknown) {
    if (err instanceof LockAcquireError) {
      emit({ ok: false, nodeId, written: false, failure: err.message }, options.json);
      process.exit(1);
      return;
    }
    throw err;
  }

  if (compiled.every((c) => !c.ok)) {
    emit({ ok: false, nodeId, sourceFile: sourceRel, written: false, failure: `compile-back failed: ${compiled[0]?.message ?? "no draft compiled"}` }, options.json);
    process.exit(1);
    return;
  }

  // 5. Evaluate each compiled draft: structural verdict + behaviour.
  const evals: DraftEval[] = [];
  for (const c of compiled) {
    if (!c.ok) {
      evals.push({ i: c.i, regenPath: draftPath(c.i), compiled: false, behaviorVerdict: "no_fixture", acceptable: false });
      continue;
    }
    const rp = draftPath(c.i);
    const metrics = compareFiles(sourcePath, rp);
    if (metrics === null) {
      evals.push({ i: c.i, regenPath: rp, compiled: true, behaviorVerdict: "no_fixture", acceptable: false });
      continue;
    }
    const verdict = classifyVerdict(metrics, thresholds);
    let behaviorVerdict: BehaviorVerdict | "no_fixture" = "no_fixture";
    if (fixture) {
      const bc = await runBehaviorCheck({ nodeId, sourcePath, regenPath: rp, fixture: fixture.fixture });
      behaviorVerdict = bc.verdict;
    }
    const declKey = [...metrics.regenDeclarations].sort().join(",");
    // Rule gate (--check-rules): a regen that violates a statically-decidable
    // declared rule (FORBID/REQUIRE symbol) must not overwrite working source.
    let ruleViolations = 0;
    if (options.checkRules && (node.rules ?? []).length > 0) {
      const rc = checkRules({ nodeId, rules: node.rules ?? [], artifactText: fs.readFileSync(rp, "utf-8") });
      ruleViolations = rc.violations;
    }
    const acceptable = WRITE_SAFE_VERDICTS.has(verdict) && behaviorVerdict !== "fail" && ruleViolations === 0;
    evals.push({ i: c.i, regenPath: rp, compiled: true, metrics, verdict, behaviorVerdict, declKey, acceptable, ruleViolations });
  }

  // ── Single-draw path (draws === 1): preserve the exact original gate. ──
  if (draws === 1) {
    const e = evals[0];
    const base: RegenerateResult = {
      ok: true,
      nodeId,
      sourceFile: sourceRel,
      regenPath: e.regenPath,
      shadowStatus: shadow.status,
      verdict: e.verdict,
      metrics: e.metrics,
      behaviorVerdict: e.behaviorVerdict,
      written: false,
    };
    if (e.metrics === undefined) {
      emit({ ...base, ok: false, failure: "could not read source or regen for comparison" }, options.json);
      process.exit(1);
      return;
    }
    if (!options.write) {
      emit(base, options.json);
      return;
    }
    if (!WRITE_SAFE_VERDICTS.has(e.verdict!)) {
      emit({ ...base, writeBlockedReason: `verdict ${e.verdict} is not structure-preserving — refusing to overwrite working source` }, options.json);
      process.exit(1);
      return;
    }
    if (e.behaviorVerdict === "fail") {
      emit({ ...base, writeBlockedReason: "behaviour check failed — refusing to overwrite working source" }, options.json);
      process.exit(1);
      return;
    }
    if ((e.ruleViolations ?? 0) > 0) {
      emit({ ...base, writeBlockedReason: `${e.ruleViolations} declared rule(s) violated — refusing to overwrite working source` }, options.json);
      process.exit(1);
      return;
    }
    writeShadow(node, e.regenPath, sourcePath, cwd);
    emit({ ...base, written: true }, options.json);
    return;
  }

  // ── Multi-draw consensus path (draws > 1). ──
  const acceptable = evals.filter((e) => e.acceptable);
  const clusters = new Map<string, DraftEval[]>();
  for (const e of acceptable) {
    const key = e.declKey ?? "";
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(e);
  }
  const ranked = [...clusters.values()].sort((a, b) => b.length - a.length);
  const consensusClass = ranked[0] ?? [];
  const rep = consensusClass[0];
  const clusterSizes = ranked.map((c) => c.length);

  const base: RegenerateResult = {
    ok: true,
    nodeId,
    sourceFile: sourceRel,
    regenPath: rep?.regenPath,
    shadowStatus: shadow.status,
    verdict: rep?.verdict,
    metrics: rep?.metrics,
    behaviorVerdict: rep?.behaviorVerdict ?? "no_fixture",
    written: false,
    draws,
    acceptableDraws: acceptable.length,
    consensusSize: consensusClass.length,
    consensusK,
    clusterSizes,
    draftSummary: evals.map((e) => ({ i: e.i, verdict: e.verdict, behaviorVerdict: e.behaviorVerdict, acceptable: e.acceptable })),
  };

  if (!options.write) {
    emit(base, options.json);
    return;
  }
  if (consensusClass.length < consensusK || !rep) {
    emit(
      { ...base, writeBlockedReason: `consensus not reached: largest agreeing class is ${consensusClass.length}/${draws} (need ${consensusK}) — refusing to write an unstable regeneration` },
      options.json,
    );
    process.exit(1);
    return;
  }
  writeShadow(node, rep.regenPath, sourcePath, cwd);
  emit({ ...base, written: true }, options.json);
}

// Overwrite the shadow source via the artifact writer's force gate.
function writeShadow(node: Parameters<typeof writeArtifact>[0]["node"], regenPath: string, sourcePath: string, cwd: string): void {
  const content = fs.readFileSync(regenPath, "utf-8");
  try {
    writeArtifact({ node, content, cwd, targetPath: sourcePath, force: true });
  } catch (err: unknown) {
    if (err instanceof TargetExistsError) {
      throw new Error(`target exists and force write failed: ${err.message}`);
    }
    throw err;
  }
}
