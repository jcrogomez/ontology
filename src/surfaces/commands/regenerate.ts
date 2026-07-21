import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodeById } from "../../kernel/core/project/load.js";
import { runCompilePlan, type CompilePlanRunResult } from "../../forward/compile/compile-plan-runner.js";
import { withLock, LockAcquireError } from "../../kernel/core/fs/lock.js";
import { writeArtifact, TargetExistsError } from "../../forward/compile/artifact-writer.js";
import { shadowReport } from "../walker/state/shadow-status.js";
import {
  compareFiles,
  classifyVerdict,
  DEFAULT_THRESHOLDS,
  type HomeomorphismVerdict,
  type VerdictThresholds,
  type DistanceMetrics,
} from "../../laws/verify-homeomorphism.js";
import { loadFixture, type BehaviorVerdict } from "../../laws/behavior-checker.js";
import { runBehaviorCheckIsolated } from "../../laws/behavior-checker-isolated.js";
import { checkRules } from "../../inverse/rule-checker.js";
import { buildRefineFeedbackSection, type RefineFeedback } from "../../forward/compile/refine-feedback.js";
import { lintDraft } from "../../forward/compile/draft-lint.js";
import {
  scanTopLevelDecls,
  planDecomposition,
  buildSliceInstruction,
  assembleSlices,
  hasSyntaxErrors,
  type AssemblyPart,
} from "../../forward/compile/decompose-plan.js";
import { computeKeepSet } from "../../forward/compile/slice-keep.js";
import { scanFileSymbols } from "../../inverse/ast-symbol-scanner.js";
import { computeGrayZone, recordGrayZone, type GrayZoneIndex } from "../../laws/gray-zone.js";
import type { LlmProvider } from "../../runtime/llm/types.js";

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

// One draw's compile outcome inside a round, with the typed failure cause.
type RoundDraft = { i: number; ok: boolean; message?: string; kind?: RegenFailureKind };

// Fold a compile-plan failure into the typed channel. The plan runner's
// step records carry compile-node's typed reason as a "<reason>: <message>"
// prefix, so the discrimination never depends on the free-text message (which
// can quote draft content).
function planFailureKind(r: Extract<CompilePlanRunResult, { ok: false }>): RegenFailureKind {
  if (r.reason === "missing_node") return "not-found";
  if (r.reason !== "step_failed") return "config"; // missing_branch / focal_off_branch / plan_failed
  const inner = r.completedSteps?.find((s) => s.status === "failed")?.reason?.split(":")[0]?.trim();
  if (inner === "dispatch_failed") return "transport";
  if (inner === "model_ref_unresolved") return "config";
  if (inner === "write_failed" || inner === "persist_failed" || inner === "target_exists") return "io";
  // validate_failed / intent_failed / runtime_failed — the draft is the problem.
  return "compile";
}

// When every draw of a round failed, pick the kind the whole run reports.
// Infra-ish causes outrank draft-quality (the 2026-07-07 lesson: a dead
// provider must never be read as a capacity result).
const FAILURE_KIND_PRIORITY: readonly RegenFailureKind[] = [
  "transport", "config", "io", "lock", "not-found", "oracle", "compile",
];
function dominantFailureKind(drafts: RoundDraft[]): RegenFailureKind {
  const kinds = drafts.filter((d) => !d.ok).map((d) => d.kind ?? "compile");
  return FAILURE_KIND_PRIORITY.find((k) => kinds.includes(k)) ?? "compile";
}

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
  // Verify-refine loop (REGEN_INTENT_CONSUMPTION_2026-06-17 §"WHAT TO BUILD"
  // #2). Maximum number of generate→check→refine rounds. Default 1 (a single
  // round — byte-identical to the pre-refine behaviour). When > 1 and a
  // behaviour fixture is present, a round that does not reach a writeable
  // consensus feeds the deterministic gates' critique (failed criteria +
  // export drift) of its best draft into the next round's prompt. Converges
  // the moment a round reaches consensus. Clamped to [1, 4].
  refine?: number;
  // Decomposition (REGEN_INTENT_CONSUMPTION_2026-06-17 #4). Regenerate the
  // module in slices (scaffold types+helpers → one slice per exported
  // function, each seeing the prior slices as fixed context), then assemble
  // and gate the whole. Attacks the "can't hold the whole contract at once" 7B
  // ceiling. v1: implies a single assembled candidate (no consensus/refine).
  decompose?: boolean;
  // Monotone decompose (composes with --decompose --refine N): between refine
  // rounds, slices that no failure implicates are FROZEN (reused verbatim, no
  // dispatch) and only the implicated slices re-generate — "passing work is
  // kept", so coverage grows monotonically across rounds instead of every
  // round re-rolling the whole module. Attribution is deterministic and
  // conservative (slice-keep.ts): any unattributable failure unfreezes all.
  keepSlices?: boolean;
  noLock?: boolean;
  json?: boolean;
}

// Typed failure channel (2026-07-20, REVIEW_2026-07-20 §3). Consumers that
// must tell "the DRAFT is the problem" (refinable) from "the MACHINE is the
// problem" (terminal infra) route on this enum — never by sniffing the
// human-readable `failure` string, which can QUOTE draft content (a TS
// diagnostic citing 'ECONNREFUSED' must not read as a dead provider).
//   transport — provider/LLM dispatch failed; no draft was produced
//   compile   — a draft was attempted but does not build / fails the
//               compile-side gates / cannot be compared (draft-quality)
//   oracle    — the behaviour-oracle machinery itself failed
//   lock      — advisory-lock contention
//   not-found — node / shadow missing
//   config    — unresolvable provider/model/branch/plan configuration
//   io        — disk read/write on OUR side (staging, assembly, persist)
export type RegenFailureKind =
  | "transport"
  | "compile"
  | "oracle"
  | "lock"
  | "not-found"
  | "config"
  | "io";

export interface RegenerateResult {
  ok: boolean;
  nodeId: string;
  sourceFile?: string;
  regenPath?: string;
  shadowStatus?: string;
  verdict?: HomeomorphismVerdict;
  metrics?: DistanceMetrics;
  behaviorVerdict?: BehaviorVerdict | "no_fixture";
  /** Statically-decidable declared-rule violations in the chosen candidate
   *  (only meaningful when --check-rules ran; undefined otherwise). */
  ruleViolations?: number;
  written: boolean;
  writeBlockedReason?: string;
  failure?: string;
  /** Present whenever `failure` is — the typed cause. */
  failureKind?: RegenFailureKind;
  /** Static-lint issue count of the chosen candidate (undefined-reference +
   *  async/sync drift against the source signatures). Surfaced so the executor
   *  policy can tell a clean-but-failing draft (intention-insufficient →
   *  extraction-gap) from a broken one (refine/escalate). Single-draw path
   *  only; undefined when not computed. */
  lintIssueCount?: number;
  /** Whether a behaviour fixture was actually loaded for this node — INDEPENDENT
   *  of the draft's outcome. `behaviorVerdict` alone is ambiguous: it reports
   *  "no_fixture" both when no fixture exists AND when a fixture IS present but
   *  the draft could not be behaviourally evaluated (did not compile / not
   *  comparable). Callers (the executor policy) need the unambiguous signal to
   *  tell "genuinely unverifiable" from "a bad draw to refine/escalate". */
  fixturePresent?: boolean;
  // Multi-draw consensus fields (present only when draws > 1).
  draws?: number;
  acceptableDraws?: number;
  consensusSize?: number;
  consensusK?: number;
  clusterSizes?: number[];
  draftSummary?: { i: number; verdict?: HomeomorphismVerdict; behaviorVerdict: BehaviorVerdict | "no_fixture"; declKey?: string; acceptable: boolean }[];
  /** Draw-vs-draw disagreement fold (present only when draws > 1) — the
   *  gray-zone index persisted to .ontology/reports/gray-zone.json. */
  grayZone?: GrayZoneIndex;
  // Verify-refine fields (present only when refine > 1).
  refineRounds?: number;
  refineRoundsUsed?: number;
  converged?: boolean;
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
  // Per-case behaviour outcomes (when a fixture ran) — drives refine feedback.
  behaviorCases?: { name: string; outcome: string; detail?: string }[];
  // The checker's verdict reason (e.g. "regen_load_failed: <load error>").
  // Load failures produce NO cases, so without this the refine loop is BLIND
  // to a draft that throws at import time (observed 2026-07-08: a wrong
  // z.discriminatedUnion discriminator threw on load; 4 rounds re-rolled
  // with zero feedback). Draft-side only — safe to feed back.
  behaviorReason?: string;
}

// Reduce the behaviour checker's per-case detail to a DRAFT-SIDE-ONLY
// diagnostic safe to feed back into the prompt. The checker's detail can
// mention the source's behaviour ("src threw X, regen threw Y"); we surface
// only what the CANDIDATE itself did — its own thrown error, or a generic
// mismatch note — so the refine signal stays "fix your output" and never
// leaks the source implementation. Returns undefined when there's nothing
// draft-specific to say.
function draftSideDiagnostic(outcome: string, detail?: string): string | undefined {
  if (detail) {
    const threw = detail.match(/regen threw:\s*(.+)$/);
    if (threw) return `threw: ${threw[1]}`;
    if (/false on regen/.test(detail)) return "returned a value that failed the case's assertion";
    if (/non-deep-equal|values diverged/.test(detail)) return "returned a different value than the criterion requires";
    if (/regen side.*timed out|timed out.*regen/.test(detail)) return "timed out (possible infinite loop)";
  }
  if (outcome === "divergent") return "did not match the required behaviour for this case";
  return undefined;
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

// Untrusted-draft guard. The v0 behaviour checker imports and runs
// LLM-generated drafts IN-PROCESS, with no sandbox
// (BEHAVIOUR_AXIS_CHECKER_SPEC §3.2). A draft can schedule a DEFERRED throw
// — an undefined-symbol reference inside a process `exit`/signal hook, a
// stray timer, a late microtask — that surfaces as an `uncaughtException`
// or `unhandledRejection` on a later tick, AFTER the per-draft try/catch has
// returned. Without containment that kills the whole regenerate run (often
// mid-loop, before it can emit any verdict), which is exactly what a glue/IO
// node like lock.ts triggers when the model drops a helper it still calls.
// We scope process-level handlers to the run, swallow draft-originated async
// errors (we have already recorded each draft's verdict), and restore the
// prior handler behaviour in `finally`. This is the pragmatic containment;
// the principled fix is to run the check in a child process (tracked as
// follow-up — it would also cap runaway loops and `process.exit` calls by a
// draft). REGEN_INTENT_CONSUMPTION addendum.
async function withRegenDraftGuard<T>(fn: () => Promise<T>): Promise<T> {
  const swallowed: unknown[] = [];
  const guard = (err: unknown): void => {
    swallowed.push(err);
  };
  process.on("uncaughtException", guard);
  process.on("unhandledRejection", guard);
  try {
    return await fn();
  } finally {
    process.removeListener("uncaughtException", guard);
    process.removeListener("unhandledRejection", guard);
    if (swallowed.length > 0) {
      const first = swallowed[0];
      const msg = first instanceof Error ? first.message : String(first);
      console.error(
        `⚠ regenerate: contained ${swallowed.length} deferred error(s) from in-process draft execution (v0 behaviour checker has no sandbox; e.g. "${msg}").`,
      );
    }
  }
}

// The pure core: runs the whole regenerate pipeline and RETURNS the result
// (never calls `emit` or `process.exit`). `regenerateCommand` wraps it for the
// CLI; `onto sync` reuses it to compose the governed loop. Throws only on
// genuinely exceptional failures (a non-lock error from the compile lock); all
// expected outcomes — refusals, missing nodes, blocked writes — come back as a
// `RegenerateResult` with `ok`/`failure`/`writeBlockedReason` set.
export async function runRegenerate(
  nodeId: string,
  options: RegenerateCommandOptions,
  cwd: string = process.cwd(),
): Promise<RegenerateResult> {
  // 1. Validate provider override.
  let provider: LlmProvider | undefined;
  if (options.provider !== undefined) {
    const allowed = ["mock", "ollama", "anthropic", "gemini"];
    if (!allowed.includes(options.provider)) {
      return { ok: false, nodeId, written: false, failure: `unsupported provider: ${options.provider}`, failureKind: "config" };
    }
    provider = options.provider as LlmProvider;
  }

  // 2. Load the node.
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    return { ok: false, nodeId, written: false, failure: `node not found: ${nodeId}`, failureKind: "not-found" };
  }

  // 3. Precondition: a shadow to regenerate.
  const sourceRel = node.outputs?.files?.[0];
  if (!sourceRel) {
    return { ok: false, nodeId, written: false, failure: "node has no outputs.files[0] — no shadow to regenerate", failureKind: "not-found" };
  }
  const sourcePath = path.isAbsolute(sourceRel) ? sourceRel : path.join(cwd, sourceRel);
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, nodeId, sourceFile: sourceRel, written: false, failure: `shadow source not found on disk: ${sourceRel}`, failureKind: "not-found" };
  }
  const shadow = shadowReport(node, cwd);
  const thresholds: VerdictThresholds = {
    loc: options.locThreshold ?? DEFAULT_THRESHOLDS.loc,
    jaccard: options.jaccardThreshold ?? DEFAULT_THRESHOLDS.jaccard,
  };
  // Decomposition v1 produces a single assembled candidate, so it pins
  // draws=1 (and the refine loop to 1 round) — consensus/refine compose with
  // decomposition in a later iteration.
  const decompose = options.decompose === true;
  const draws = decompose ? 1 : Math.max(1, Math.min(options.draws ?? 1, 9));
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

  // Oracle-into-generation (REGEN_INTENT_CONSUMPTION_2026-06-17 §"WHAT TO
  // BUILD" #1). When a behaviour fixture is present, lift its per-case
  // acceptance criteria (name + optional contract-level description) and
  // feed them into the compile-back system prompt — so the SAME fixture
  // that GATES the regen also GUIDES it. The generator sees the spec it
  // will be executed against, instead of compiling blind and being judged
  // after. Carries only black-box contract prose (no implementation): the
  // fixture's setup/invoke/assert function bodies never reach the prompt.
  const behaviorOracle = fixture
    ? fixture.fixture.cases.map((c) => ({ name: c.name, description: c.description }))
    : undefined;

  // Verify-refine: up to `rounds` generate→check→refine iterations. rounds=1
  // (default) is byte-identical to the pre-refine path. Decomposition composes
  // WITH refine: each later round re-generates the slices with the prior
  // assembled attempt's critique (the lint catches e.g. the async-vs-sync
  // override that survives whole-file refine).
  const rounds = Math.max(1, Math.min(options.refine ?? 1, 4));

  // Per-round cache-bypass token. draws===1 keeps the canonical single-draw
  // runId (undefined). draws>1 with no refine (rounds===1) keeps the legacy
  // `regen_draw_i_of_N` token byte-for-byte so existing consensus runs are
  // unchanged; refine rounds qualify the token with the round so a re-draw
  // after feedback is a fresh dispatch rather than a cache hit.
  const draftToken = (round: number, i: number): string | undefined =>
    draws === 1
      ? undefined
      : rounds === 1
        ? `regen_draw_${i}_of_${draws}`
        : `regen_r${round}_draw_${i}_of_${draws}`;

  // Compile `draws` drafts for one round, threading the oracle (lever #1)
  // always and the refine feedback (lever #2) when present.
  const compileRound = async (
    round: number,
    refineFeedback: RefineFeedback | undefined,
  ): Promise<RoundDraft[]> => {
    const out: RoundDraft[] = [];
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
        repCacheBypassToken: draftToken(round, i),
        behaviorOracle,
        refineFeedback,
      });
      out.push({
        i,
        ok: r.ok,
        message: r.ok ? undefined : r.message ?? r.reason ?? "compile-back failed",
        kind: r.ok ? undefined : planFailureKind(r),
      });
    }
    return out;
  };

  // Decomposition (lever #4): generate the module in slices — a scaffold
  // (types + private helpers) then one slice per exported function, each
  // dispatch seeing the previously-generated slices as fixed context and
  // scoped to ITS declarations only (intent gate skipped per-slice). Assemble
  // the slice outputs into one module written to the canonical draft path, so
  // the SAME structural + behaviour gates judge the whole. Returns a single
  // compiled entry (i=1) like a draws=1 run.
  // Monotone-decompose state (--keep-slices): the prior round's per-slice
  // outputs and the KEEP set computed from its failures. Both live across
  // rounds; keepIdx is recomputed after every evaluated round (attribution is
  // per-round, so a kept slice that a NEW failure implicates unfreezes).
  let prevSliceParts: AssemblyPart[] | null = null;
  let keepIdx: ReadonlySet<number> = new Set<number>();
  // Fixture SOURCE TEXT for case → slice attribution (trusted test infra;
  // read once, "" on failure so attribution degrades to unfreeze-all).
  let fixtureTextCache: string | null = null;
  const readFixtureText = (): string => {
    if (fixtureTextCache !== null) return fixtureTextCache;
    try {
      fixtureTextCache = fixture ? fs.readFileSync(fixture.path, "utf-8") : "";
    } catch {
      fixtureTextCache = "";
    }
    return fixtureTextCache;
  };
  // The decomposition plan is deterministic from the (unchanged) source —
  // compute once, reuse across rounds and for keep-set attribution.
  let cachedSlices: ReturnType<typeof planDecomposition> | null = null;
  const getSlices = (): ReturnType<typeof planDecomposition> | null => {
    if (cachedSlices) return cachedSlices;
    try {
      cachedSlices = planDecomposition(scanTopLevelDecls(fs.readFileSync(sourcePath, "utf-8")));
    } catch {
      return null;
    }
    return cachedSlices;
  };

  const compileDecomposed = async (
    round: number,
    refineFeedback: RefineFeedback | undefined,
  ): Promise<RoundDraft[]> => {
    const slices = getSlices();
    if (slices === null) {
      return [{ i: 1, ok: false, message: `cannot read source for decomposition`, kind: "io" }];
    }
    const sliceOutputs: AssemblyPart[] = [];
    let priorCode = "";
    // The prior assembled attempt's critique (lint + failed criteria), shared
    // across this round's slices so the slice that owns a flagged export (e.g.
    // "acquireLock must be synchronous") fixes it.
    const refineSection = refineFeedback ? buildRefineFeedbackSection(refineFeedback) : null;
    for (let s = 0; s < slices.length; s++) {
      const slice = slices[s];
      // Kept slice (monotone decompose): no failure implicated it last round —
      // reuse its output verbatim, no dispatch. Still chained into priorCode so
      // later (re-generated) slices build against the frozen truth.
      const frozen = round > 1 && keepIdx.has(s) ? prevSliceParts?.[s] : undefined;
      if (frozen) {
        sliceOutputs.push(frozen);
        priorCode = priorCode.length > 0 ? `${priorCode}\n\n${frozen.code}` : frozen.code;
        continue;
      }
      const slicePath = path.join(stagingDir, `${nodeId}.slice${s}${ext}`);
      const r = await runCompilePlan({
        focalId: nodeId,
        provider,
        model: options.model,
        ollamaHost: options.ollamaHost,
        targetPath: slicePath,
        force: true,
        openWorld: options.openWorld ?? true,
        maxTokens: options.maxTokens,
        astGrounding: false, // the slice instruction supplies scoped grounding
        rulesGrounding: false,
        extraSystemSections: [
          buildSliceInstruction(slice, priorCode),
          ...(refineSection ? [refineSection] : []),
        ],
        skipIntentGate: true, // the assembled whole is contract-gated, not each slice
        behaviorOracle, // acceptance criteria help the entry-point slices
        // Round 1 keeps the legacy token so cached slices are reused; later
        // rounds qualify by round so the refined feedback dispatches fresh.
        repCacheBypassToken:
          round === 1
            ? `decompose_slice_${s}_of_${slices.length}`
            : `decompose_r${round}_slice_${s}_of_${slices.length}`,
      });
      if (!r.ok) {
        return [{ i: 1, ok: false, message: `decomposition slice "${slice.label}" failed: ${r.message ?? r.reason ?? "compile failed"}`, kind: planFailureKind(r) }];
      }
      let out: string;
      try {
        out = fs.readFileSync(slicePath, "utf-8");
      } catch (e) {
        return [{ i: 1, ok: false, message: `cannot read decomposition slice output: ${String(e)}`, kind: "io" }];
      }
      // A syntactically-broken slice (typically a truncated generation) must
      // not enter the assembly OR the priorCode chain — it would poison the
      // whole module into regen_load_failed and mislead later slices. Empty
      // code keeps the slot; the resulting missing-export feedback implicates
      // exactly this slice, so the next round re-dispatches it while healthy
      // slices stay frozen (see hasSyntaxErrors).
      if (hasSyntaxErrors(out)) {
        sliceOutputs.push({ code: "", owned: slice.targets });
        continue;
      }
      sliceOutputs.push({ code: out, owned: slice.targets });
      priorCode = priorCode.length > 0 ? `${priorCode}\n\n${out}` : out;
    }
    prevSliceParts = sliceOutputs;
    try {
      fs.writeFileSync(draftPath(1), assembleSlices(sliceOutputs), "utf-8");
    } catch (e) {
      return [{ i: 1, ok: false, message: `cannot write assembled module: ${String(e)}`, kind: "io" }];
    }
    return [{ i: 1, ok: true }];
  };

  // Evaluate one round's compiled drafts: structural verdict + behaviour.
  const evaluateRound = async (
    roundCompiled: RoundDraft[],
  ): Promise<DraftEval[]> => {
    const out: DraftEval[] = [];
    for (const c of roundCompiled) {
      if (!c.ok) {
        out.push({ i: c.i, regenPath: draftPath(c.i), compiled: false, behaviorVerdict: "no_fixture", acceptable: false });
        continue;
      }
      const rp = draftPath(c.i);
      const metrics = compareFiles(sourcePath, rp);
      if (metrics === null) {
        out.push({ i: c.i, regenPath: rp, compiled: true, behaviorVerdict: "no_fixture", acceptable: false });
        continue;
      }
      const verdict = classifyVerdict(metrics, thresholds);
      let behaviorVerdict: BehaviorVerdict | "no_fixture" = "no_fixture";
      let behaviorCases: { name: string; outcome: string }[] | undefined;
      let behaviorReason: string | undefined;
      if (fixture) {
        // Contain a pathological draft: the v0 behaviour checker imports and
        // runs LLM-generated code in-process (no sandbox — spec §3.2), so a
        // draft that, say, references an undefined symbol or registers a
        // throwing process hook can surface an error the per-case guards
        // don't reach. A single bad draft must not abort the whole multi-draw
        // run — treat a thrown check as a non-acceptable "untested" draft.
        try {
          // Run the DRAFT in a disposable child process. The draft is untrusted
          // LLM output; a deferred throw (orphaned timer in an IO node like
          // lock.ts) would otherwise escape the in-process guard and crash the
          // whole run. Isolation bounds it: the child dies with its verdict.
          const bc = runBehaviorCheckIsolated({ nodeId, sourcePath, regenPath: rp, fixturePath: fixture.path });
          behaviorVerdict = bc.verdict;
          behaviorCases = bc.cases?.map((cc) => ({ name: cc.name, outcome: cc.outcome, detail: cc.detail }));
          behaviorReason = bc.reason;
        } catch {
          // A draft that makes the trustworthy oracle itself throw is, for
          // our purposes, a behavioural failure — never acceptable to write.
          behaviorVerdict = "fail";
        }
      }
      const declKey = [...metrics.regenDeclarations].sort().join(",");
      // Rule gate (--check-rules): a regen that violates a statically-decidable
      // declared rule (FORBID/REQUIRE symbol) must not overwrite working source.
      let ruleViolations = 0;
      if (options.checkRules && (node.rules ?? []).length > 0) {
        const rc = checkRules({ nodeId, rules: node.rules ?? [], artifactText: fs.readFileSync(rp, "utf-8") });
        ruleViolations = rc.violations;
      }
      // Behaviour gate: when a fixture is present (behaviour-check requested
      // AND a fixture loaded), only a confirmed PASS is acceptable — a "fail"
      // OR an "untested" (the regen failed to load / the oracle threw) must
      // block, because a structurally-epsilon module that does not even import
      // must never be written or counted as a win. Without a fixture, fall
      // back to the structural gate (untested/no_fixture is expected there).
      const behaviorOk = fixture ? behaviorVerdict === "pass" : behaviorVerdict !== "fail";
      const acceptable = WRITE_SAFE_VERDICTS.has(verdict) && behaviorOk && ruleViolations === 0;
      out.push({ i: c.i, regenPath: rp, compiled: true, metrics, verdict, behaviorVerdict, declKey, acceptable, ruleViolations, behaviorCases, behaviorReason });
    }
    return out;
  };

  // Has this round produced a writeable consensus? Mirrors the write gate
  // below (draws===1: the single draft is acceptable; draws>1: the largest
  // acceptable declKey cluster reaches K). This is the refine convergence
  // test — the behaviour gate is folded into `acceptable`.
  const roundConverged = (roundEvals: DraftEval[]): boolean => {
    if (draws === 1) return roundEvals[0]?.acceptable === true;
    const sizes = new Map<string, number>();
    for (const e of roundEvals.filter((x) => x.acceptable)) {
      const k = e.declKey ?? "";
      sizes.set(k, (sizes.get(k) ?? 0) + 1);
    }
    const top = Math.max(0, ...sizes.values());
    return top >= consensusK;
  };

  // Grounded export signatures (same data the AST grounding puts in the
  // prompt) — used to decide which exports the draft lint must hold to be
  // synchronous. Empty {} when the source can't be scanned; the lint degrades
  // to the undefined-reference check only.
  const sourceSignatures = scanFileSymbols(sourcePath).signatures;

  // Build refinement feedback from the round's BEST failing draft — the one
  // closest to passing (most behavioural matches, tie-broken by a write-safe
  // structural verdict). Drives the next round. Returns undefined when there
  // is nothing actionable to say (then the next round re-draws with the
  // oracle only, exactly like round 1).
  const buildFeedback = (roundEvals: DraftEval[], nextRound: number): RefineFeedback | undefined => {
    const candidates = roundEvals.filter((e) => e.compiled && e.metrics);
    if (candidates.length === 0) return undefined;
    const score = (e: DraftEval): number => {
      const matches = (e.behaviorCases ?? []).filter((cc) => cc.outcome === "match").length;
      return matches + (WRITE_SAFE_VERDICTS.has(e.verdict!) ? 0.5 : 0);
    };
    const best = [...candidates].sort((a, b) => score(b) - score(a))[0];
    const failedCriteria = (best.behaviorCases ?? [])
      .filter((cc) => cc.outcome !== "match")
      .map((cc) => ({ name: cc.name, diagnostic: draftSideDiagnostic(cc.outcome, cc.detail) }));
    // A draft that THROWS AT IMPORT TIME produces no cases at all — without
    // this synthetic criterion the refine loop is blind to the single most
    // blocking defect (observed 2026-07-08: a wrong z.discriminatedUnion
    // discriminator threw on load and 4 rounds re-rolled with zero feedback).
    // The load error is the draft's own runtime output — draft-side, leak-free.
    if (
      fixture &&
      best.behaviorVerdict === "untested" &&
      best.behaviorReason !== undefined &&
      best.behaviorReason.startsWith("regen_load_failed")
    ) {
      failedCriteria.push({
        name: "module must load: importing your output threw before any case could run",
        diagnostic: best.behaviorReason.slice("regen_load_failed: ".length) || best.behaviorReason,
      });
    }
    const original = new Set(best.metrics!.originalDeclarations);
    const regen = new Set(best.metrics!.regenDeclarations);
    const extraExports = [...regen].filter((d) => !original.has(d));
    const missingExports = [...original].filter((d) => !regen.has(d));
    // Static lint on the best draft's own source — undefined-reference calls
    // and async-where-the-signature-is-sync. Leak-free (reads the candidate),
    // best-effort (never throws).
    let lintIssues: { symbol: string; message: string }[] = [];
    try {
      lintIssues = lintDraft(fs.readFileSync(best.regenPath, "utf-8"), sourceSignatures);
    } catch {
      lintIssues = [];
    }
    if (
      failedCriteria.length === 0 &&
      extraExports.length === 0 &&
      missingExports.length === 0 &&
      lintIssues.length === 0
    ) {
      return undefined;
    }
    return { round: nextRound, failedCriteria, extraExports, missingExports, lintIssues };
  };

  // 4. Run the verify-refine rounds inside one lock. Round 1 is the
  //    oracle-grounded blind draw; each later round feeds the prior round's
  //    deterministic critique back into the prompt. Stop the moment a round
  //    reaches a writeable consensus. Keep the last round that actually
  //    compiled something, so a flaky empty round does not erase progress.
  //
  // Everything that EXECUTES untrusted draft code (the round loop, the
  // behaviour check, the write) runs under withRegenDraftGuard so a draft's
  // deferred throw cannot abort the run before it returns a verdict.
  return await withRegenDraftGuard(async (): Promise<RegenerateResult> => {
  let compiled: RoundDraft[] = [];
  let evals: DraftEval[] = [];
  let roundsUsed = 0;
  let converged = false;
  // Score a round by its best draft: a write-acceptable draft ranks highest,
  // then by how many behavioural criteria it passes. Used to keep the BEST
  // round across a refine run rather than the LAST — the local 7B is
  // high-variance round-to-round (a later round can regress), so reporting
  // the last round would discard a better earlier one.
  const roundScore = (rEvals: DraftEval[]): number =>
    Math.max(
      -1,
      ...rEvals.map(
        (e) =>
          (e.acceptable ? 1000 : 0) +
          (e.behaviorCases?.filter((c) => c.outcome === "match").length ?? 0),
      ),
    );
  // Snapshot a round's draft artifact(s) to stable `.best` paths so the
  // reported result and `--write` read the BEST round even after a later
  // round overwrites the working draft path. Only used when refining.
  const bestPath = (i: number): string =>
    draws === 1
      ? path.join(stagingDir, `${nodeId}.best${ext}`)
      : path.join(stagingDir, `${nodeId}.best.d${i}${ext}`);
  const snapshotBest = (rEvals: DraftEval[]): DraftEval[] =>
    rEvals.map((e) => {
      if (!e.compiled) return e;
      try {
        const bp = bestPath(e.i);
        fs.copyFileSync(e.regenPath, bp);
        return { ...e, regenPath: bp };
      } catch {
        return e;
      }
    });
  let bestScore = -1;
  const adopt = (rc: typeof compiled, re: DraftEval[]): void => {
    compiled = rc;
    evals = rounds > 1 ? snapshotBest(re) : re;
  };
  try {
    await withLock(
      cwd,
      async () => {
        let refineFeedback: RefineFeedback | undefined;
        for (let round = 1; round <= rounds; round++) {
          const roundCompiled = decompose
            ? await compileDecomposed(round, refineFeedback)
            : await compileRound(round, refineFeedback);
          roundsUsed = round;
          if (roundCompiled.every((c) => !c.ok)) {
            if (compiled.length === 0) compiled = roundCompiled; // record for failure message
            continue;
          }
          const roundEvals = await evaluateRound(roundCompiled);
          const score = roundScore(roundEvals);
          if (rounds === 1 || score > bestScore) {
            bestScore = score;
            adopt(roundCompiled, roundEvals);
          }
          if (roundConverged(roundEvals)) {
            converged = true;
            adopt(roundCompiled, roundEvals);
            break;
          }
          if (round < rounds) {
            refineFeedback = buildFeedback(roundEvals, round + 1);
            // Monotone decompose: freeze the slices this round's failures do
            // NOT implicate. The feedback already carries the failure facts
            // (failed criteria / export drift / lint symbols); attribution is
            // conservative — anything unattributable unfreezes everything.
            if (decompose && options.keepSlices === true) {
              const slices = getSlices();
              keepIdx =
                refineFeedback && slices && prevSliceParts && fixture
                  ? computeKeepSet({
                      slices,
                      parts: prevSliceParts,
                      failingCaseNames: refineFeedback.failedCriteria.map((c) => c.name),
                      fixtureText: readFixtureText(),
                      missingExports: refineFeedback.missingExports,
                      extraExports: refineFeedback.extraExports,
                      lintSymbols: (refineFeedback.lintIssues ?? []).map((i) => i.symbol),
                    })
                  : new Set<number>();
            }
          }
        }
      },
      { skipLock: options.noLock, command: `regenerate ${nodeId}` },
    );
  } catch (err: unknown) {
    if (err instanceof LockAcquireError) {
      return { ok: false, nodeId, written: false, failure: err.message, failureKind: "lock" };
    }
    throw err;
  }

  if (compiled.length === 0 || compiled.every((c) => !c.ok)) {
    return {
      ok: false,
      nodeId,
      sourceFile: sourceRel,
      written: false,
      failure: `compile-back failed: ${compiled[0]?.message ?? "no draft compiled"}`,
      failureKind: dominantFailureKind(compiled),
    };
  }

  // Verify-refine reporting fields, attached to whichever result shape we
  // return below. Empty (omitted) for the default single-round path.
  const refineFields = rounds > 1 ? { refineRounds: rounds, refineRoundsUsed: roundsUsed, converged } : {};

  // ── Single-draw path (draws === 1): preserve the exact original gate. ──
  if (draws === 1) {
    const e = evals[0];
    // Lint the chosen candidate against the source signatures (same check the
    // refine loop uses) so the result carries a clean/dirty signal even on a
    // single round. Best-effort: a read/parse failure leaves it undefined.
    let lintIssueCount: number | undefined;
    if (e.compiled) {
      try {
        lintIssueCount = lintDraft(fs.readFileSync(e.regenPath, "utf-8"), sourceSignatures).length;
      } catch {
        lintIssueCount = undefined;
      }
    }
    const base: RegenerateResult = {
      ok: true,
      nodeId,
      sourceFile: sourceRel,
      regenPath: e.regenPath,
      shadowStatus: shadow.status,
      verdict: e.verdict,
      metrics: e.metrics,
      behaviorVerdict: e.behaviorVerdict,
      ruleViolations: e.ruleViolations,
      lintIssueCount,
      fixturePresent: fixture != null,
      written: false,
      ...refineFields,
    };
    if (e.metrics === undefined) {
      return { ...base, ok: false, failure: "could not read source or regen for comparison", failureKind: "compile" };
    }
    if (!options.write) {
      return base;
    }
    if (!WRITE_SAFE_VERDICTS.has(e.verdict!)) {
      return { ...base, writeBlockedReason: `verdict ${e.verdict} is not structure-preserving — refusing to overwrite working source` };
    }
    // With a fixture present, only a confirmed PASS may write — "fail" and
    // "untested" (regen failed to load / oracle threw) both block.
    if (e.behaviorVerdict === "fail" || (fixture && e.behaviorVerdict !== "pass")) {
      return { ...base, writeBlockedReason: `behaviour check ${e.behaviorVerdict} — refusing to overwrite working source` };
    }
    if ((e.ruleViolations ?? 0) > 0) {
      return { ...base, writeBlockedReason: `${e.ruleViolations} declared rule(s) violated — refusing to overwrite working source` };
    }
    writeShadow(node, e.regenPath, sourcePath, cwd);
    return { ...base, written: true };
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

  // Gray-zone index: what the losing draws prove about the FICHA. Folded from
  // the same evals the consensus ranking just consumed; persisted best-effort
  // (a bookkeeping failure must never sink a regeneration that already has a
  // verdict). Preview runs record too — the measurement is read-only.
  const grayZone = computeGrayZone(
    evals.map((e) => ({ i: e.i, compiled: e.compiled, declKey: e.declKey, verdict: e.verdict, behaviorVerdict: e.behaviorVerdict, acceptable: e.acceptable, caseOutcomes: e.behaviorCases })),
  );
  try {
    recordGrayZone(cwd, { nodeId, measuredAt: new Date().toISOString(), provider: options.provider, ...grayZone });
  } catch {
    // best-effort by contract
  }

  const base: RegenerateResult = {
    ok: true,
    nodeId,
    sourceFile: sourceRel,
    regenPath: rep?.regenPath,
    shadowStatus: shadow.status,
    verdict: rep?.verdict,
    metrics: rep?.metrics,
    behaviorVerdict: rep?.behaviorVerdict ?? "no_fixture",
    ruleViolations: rep?.ruleViolations,
    written: false,
    draws,
    acceptableDraws: acceptable.length,
    consensusSize: consensusClass.length,
    consensusK,
    clusterSizes,
    draftSummary: evals.map((e) => ({ i: e.i, verdict: e.verdict, behaviorVerdict: e.behaviorVerdict, declKey: e.declKey, acceptable: e.acceptable })),
    grayZone,
    ...refineFields,
  };

  if (!options.write) {
    return base;
  }
  if (consensusClass.length < consensusK || !rep) {
    return { ...base, writeBlockedReason: `consensus not reached: largest agreeing class is ${consensusClass.length}/${draws} (need ${consensusK}) — refusing to write an unstable regeneration` };
  }
  writeShadow(node, rep.regenPath, sourcePath, cwd);
  return { ...base, written: true };
  });
}

// CLI wrapper: run the core, render it, and map the outcome to an exit code.
// A non-ok result (error) or a blocked write exits 1; preview and successful
// writes exit 0 — preserving the exact observable contract the CLI tests pin.
export async function regenerateCommand(
  nodeId: string,
  options: RegenerateCommandOptions,
): Promise<void> {
  // Footgun guard: an omitted --provider silently routes the compile-back to
  // the mock provider, which is the IDENTITY functor for code_sketch (returns
  // the prompt verbatim). That yields a run whose metrics look pristine
  // (locDistance≈0) but measures nothing — a fake-measured result, worse than
  // no run. Require an explicit provider at the human/CLI boundary; mock stays
  // reachable, but only when asked for by name. (Internal callers — sync.ts,
  // the executor — invoke runRegenerate directly and are unaffected.)
  if (options.provider === undefined) {
    const result: RegenerateResult = {
      ok: false,
      nodeId,
      written: false,
      failure:
        "regenerate needs an explicit --provider (mock | ollama | anthropic | gemini). " +
        "Omitting it would route to the mock identity functor and produce a fake-measured run. " +
        "Pass --provider mock to force an identity/self-test run deliberately.",
      failureKind: "config",
    };
    emit(result, options.json);
    process.exitCode = 1;
    return;
  }
  const result = await runRegenerate(nodeId, options, process.cwd());
  emit(result, options.json);
  if (!result.ok || result.writeBlockedReason) process.exitCode = 1;
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
