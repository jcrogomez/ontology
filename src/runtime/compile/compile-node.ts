import { randomBytes } from "node:crypto";
import type { OntologyNode, OntologyEvent, OntologyModel, PersistedRunInput, PersistedRunModel } from "../../schemas/ontology.js";
import { OntologyEventSchema } from "../../schemas/ontology.js";
import { dispatchLlmRequest } from "../llm/dispatcher.js";
import { resolveNodeModel } from "../llm/resolve-node-model.js";
import type { LlmProvider, LlmTask } from "../llm/types.js";
import { hashPrompt } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";
import {
  writeArtifactPending,
  TargetExistsError,
  type PendingArtifact,
  type WriteArtifactResult,
} from "./artifact-writer.js";
import { extractCodeFence } from "./post/extract-code-fence.js";
import { validateLanguage } from "./post/validate-language.js";
import { runtimeCheck } from "./post/runtime-check.js";
import { assembleContext } from "../context/assembler.js";
import { buildFragment } from "../context/presheaf.js";
import { glueFragments } from "../context/gluing.js";
import { validateIntent } from "../context/intent-validator.js";
import { parsePromptAST } from "../prompt/parse.js";
import {
  buildUpstreamSystemPrompt,
  hashUpstreamContext,
  type UpstreamContextItem,
} from "./upstream-context.js";
import { getOntologyPaths } from "../../core/project/paths.js";
import { appendJsonl } from "../../core/fs/json.js";
import { readState, writeState } from "../../core/state/state-store.js";
import {
  type EffectWithLog,
  type LogEntry,
  pureWithLog,
  failWithLog,
  bindWithLog,
  runWithLog,
} from "../effects/io.js";
import { ok, err } from "../effects/result.js";
import {
  type AsyncEffectWithLog,
  bindAsyncWithLog,
  liftEffectWithLog,
  liftPromiseWithLog,
  runAsyncWithLog,
} from "../effects/async.js";

// Single-node compile primitive.
//
// Given a focal OntologyNode and a model provider, this helper:
//   1. dispatches the node's prompt against the model (always task=code_sketch
//      so the mock provider acts as the identity functor — see mock.ts);
//   2. persists the run as a content-addressed PersistedRun (so every
//      compilation has full provenance back to a runId);
//   3. writes the response as an artifact under .ontology/artifacts/generated/
//      with the file extension derived from the node's manifestation;
//   4. appends a compilation_run event to events.jsonl carrying the nodeId,
//      runId, artifact relative path, and the bytes written.
//
// Internal structure (Bootstrap 1.0): the body is composed of small
// EffectWithLog steps. Each step emits a log entry. Logs accumulate
// across the entire pipeline, **including across failure** — diagnostic
// breadcrumbs survive even when a downstream step rejects. The user-
// facing function has zero try/catch; the only places try/catch lives are
// inside the boundary helpers (`liftPromiseWithLog`, the small wrappers
// around `writeArtifact` / `createPersistedRun`) where they are isolated
// to one concern per call.
//
// Shape of the pipeline:
//   sync   resolveModel → buildPrelude → checkCache
//          (LogResult<{resolved, prelude, cache}, CompileFailure>)
//   async  if not cache hit: dispatch + persist
//          (LogResult<{runId, response, cached:false}, CompileFailure>)
//   sync   projectArtifact → writeArtifact → validateLanguage
//                          → runtimeCheck (optional) → emitEvent
//          (LogResult<{artifact, event}, CompileFailure>)
//
// Translation at the boundary preserves the original CompileNodeResult
// contract bit-for-bit: same reasons, same fields, same side effects.
// The new `logs` field is purely additive (optional).

export interface CompileNodeOptions {
  node: OntologyNode;
  // CLI-level override. When set, every node compiles through this provider
  // regardless of its `model.ref`. When undefined, the node's `model.ref`
  // is resolved against the registry (passed in `registry`). The schema
  // defaults `model.ref` to "mock_default", so legacy chains with no
  // explicit per-node selection still flow through mock.
  provider?: LlmProvider;
  // CLI-level model override. Only meaningful when `provider` is also set;
  // ignored when resolving via per-node ref (the registry entry's `name`
  // is used instead).
  model?: string;
  ollamaHost?: string;
  cwd?: string;
  // Models registry. Required when `provider` is undefined (per-node routing
  // path). The plan-runner loads it once and threads it to every step.
  registry?: { models: OntologyModel[] };
  // When true, after parse-validation the compiled artifact is **executed**
  // in a subprocess with a timeout (default 5s, max 60s). Non-zero exit or
  // timeout produces a `runtime_failed` outcome. Off by default because
  // running arbitrary LLM-generated code is a non-trivial operational
  // decision. Surfaces only via the CLI flag `--runtime-check` today.
  runtimeCheck?: boolean;
  // Custom runtime check timeout. Ignored when runtimeCheck is false/undefined.
  runtimeCheckTimeoutMs?: number;
  // Direct refinement parents' compiled outputs, in the order they were
  // produced by the plan-runner (deterministic — sorted by nodeId). When
  // present, they are concatenated into the dispatcher's `system` prompt
  // and hashed into `PersistedRunInput.contextHash` so the run id reflects
  // both the focal prompt and the lineage that informed it.
  upstream?: UpstreamContextItem[];
  // Optional artifact write target. When set, the compiled artifact is
  // written to this path instead of the default
  // `.ontology/artifacts/generated/<nodeId>.<ext>`. Threaded into
  // writeArtifact unchanged; the rest of the pipeline (validate, runtime
  // check, emit event) operates on the resulting absolutePath.
  targetPath?: string;
  // Required to overwrite an existing file at `targetPath`. Without
  // this, writeArtifact throws TargetExistsError and the compile fails
  // with reason="target_exists". Has no effect on the default
  // generated/<nodeId>.<ext> path. See artifact-writer.ts for rationale.
  force?: boolean;
}

export type CompileNodeFailureReason =
  | "dispatch_failed"
  | "persist_failed"
  | "write_failed"
  | "target_exists"
  | "validate_failed"
  | "intent_failed"
  | "runtime_failed"
  | "model_ref_unresolved";

interface CompileFailure {
  reason: CompileNodeFailureReason;
  message: string;
}

export type CompileNodeResult =
  | {
      ok: true;
      runId: string;
      cached: boolean;
      artifact: WriteArtifactResult;
      event: OntologyEvent;
      response: { text: string; provider: LlmProvider; model: string };
      // Diagnostic breadcrumbs from the EffectWithLog pipeline. One entry
      // per sub-step (resolve, parse, build, cache-check, dispatch,
      // persist, project, write, validate, runtime-check, emit). Always
      // populated; consumers that don't need them can ignore.
      logs: readonly LogEntry[];
    }
  | {
      ok: false;
      reason: CompileNodeFailureReason;
      message: string;
      // Same logs as the success variant — populated even on failure so
      // an auditor can see how far the pipeline got before rejecting.
      logs: readonly LogEntry[];
    };

const COMPILE_TASK: LlmTask = "code_sketch";

interface ResolvedModelHandle {
  provider: LlmProvider;
  // Optional override (path (a)). Distinct from `defaultModel` below:
  // overrides the resolved model name when set explicitly via CLI.
  resolvedModel: string | undefined;
}

interface PreludeShape {
  rawPrompt: string;
  promptForDispatch: string;
  systemPrompt: string | null;
  runInput: PersistedRunInput;
  runModel: PersistedRunModel;
}

type CacheOutcome =
  | { kind: "hit"; runId: string; response: { text: string; provider: LlmProvider; model: string } }
  | { kind: "miss"; expectedId: string };

interface DispatchResult {
  runId: string;
  response: { text: string; provider: LlmProvider; model: string };
}

interface PostShape {
  artifact: WriteArtifactResult;
  event: OntologyEvent;
}

// ── Sync sub-steps ──────────────────────────────────────────────────────────

// (a) Resolve the (provider, model) pair for this node.
function resolveModelE(options: CompileNodeOptions): EffectWithLog<ResolvedModelHandle, CompileFailure> {
  return () => {
    if (options.provider) {
      return {
        value: ok({ provider: options.provider, resolvedModel: options.model }),
        logs: [{ level: "info", message: `resolveModel: explicit override (provider=${options.provider}${options.model ? `, model=${options.model}` : ""})` }],
      };
    }
    if (!options.registry) {
      return {
        value: err({
          reason: "model_ref_unresolved",
          message: "compileNode called without an explicit provider and without a registry; cannot resolve node.model.ref",
        }),
        logs: [{ level: "error", message: "resolveModel: registry missing on per-node path" }],
      };
    }
    const r = resolveNodeModel(options.node.model.ref, options.registry);
    if (!r.ok) {
      return {
        value: err({ reason: "model_ref_unresolved", message: r.message }),
        logs: [{ level: "error", message: `resolveModel: ${r.message}` }],
      };
    }
    return {
      value: ok({ provider: r.resolved.provider, resolvedModel: r.resolved.model }),
      logs: [{ level: "info", message: `resolveModel: ref=${options.node.model.ref} → provider=${r.resolved.provider}, model=${r.resolved.model}` }],
    };
  };
}

// (b) Parse the prompt AST + build the run envelope. Cannot fail.
function buildPreludeE(
  options: CompileNodeOptions,
  handle: ResolvedModelHandle,
): EffectWithLog<PreludeShape, never> {
  return () => {
    const rawPrompt = options.node.prompt.raw ?? "";
    const promptAst = parsePromptAST(rawPrompt);
    const promptForDispatch = promptAst.body.length > 0 ? promptAst.body : rawPrompt;
    const upstream = options.upstream ?? [];
    const systemPrompt = buildUpstreamSystemPrompt(upstream);
    const contextHash = hashUpstreamContext(upstream);

    const runInput: PersistedRunInput = {
      // Hash the RAW prompt (axiom 9 — provenance), not the body. Two
      // prompts that differ only in markers produce different runIds even
      // when their dispatch surface is the same: the author's intent is
      // part of the record.
      promptHash: hashPrompt(rawPrompt),
      contextHash,
      targetNodeId: options.node.id,
      branch: options.node.coordinates.branch,
      time: null,
      task: COMPILE_TASK as string,
      includeEdges: false,
      edgeTypes: null,
    };
    const runModel: PersistedRunModel = {
      provider: handle.provider,
      model: handle.resolvedModel ?? (handle.provider === "mock" ? "mock_default" : "unknown"),
      host: options.ollamaHost ?? null,
    };

    const markersTag = (promptAst.markers.requires.length || promptAst.markers.provides.length || promptAst.markers.expand.length)
      ? ` (markers: ${promptAst.markers.requires.length}R/${promptAst.markers.provides.length}P/${promptAst.markers.expand.length}E)`
      : "";
    return {
      value: ok({ rawPrompt, promptForDispatch, systemPrompt, runInput, runModel }),
      logs: [{ level: "info", message: `buildPrelude: ${rawPrompt.length} bytes raw, ${promptForDispatch.length} bytes dispatch${markersTag}, upstream=${upstream.length}` }],
    };
  };
}

// (c) Cache check. Cannot fail; returns either a hit (with response) or a
// miss (carrying the expectedId we'll need to record).
function checkCacheE(
  prelude: PreludeShape,
  cwd: string,
): EffectWithLog<CacheOutcome, never> {
  return () => {
    const expectedId = computeRunId(prelude.runInput, prelude.runModel);
    const cachedRun = loadPersistedRun(expectedId, cwd);
    if (cachedRun) {
      return {
        value: ok({
          kind: "hit",
          runId: cachedRun.id,
          response: {
            text: cachedRun.output.text,
            provider: cachedRun.model.provider,
            model: cachedRun.model.model,
          },
        }),
        logs: [{ level: "info", message: `checkCache: hit (runId=${cachedRun.id})` }],
      };
    }
    return {
      value: ok({ kind: "miss", expectedId }),
      logs: [{ level: "info", message: `checkCache: miss (expectedId=${expectedId})` }],
    };
  };
}

// ── Async slice: dispatch + persist (only on cache miss) ────────────────────

function dispatchAndPersistE(
  options: CompileNodeOptions,
  handle: ResolvedModelHandle,
  prelude: PreludeShape,
): AsyncEffectWithLog<DispatchResult, CompileFailure> {
  const start = Date.now();
  // Dispatch is the only genuinely async step. liftPromiseWithLog catches
  // any thrown error and translates it to a typed CompileFailure; nothing
  // else in this module ever needs try/catch.
  const dispatched = liftPromiseWithLog(
    `dispatch (${handle.provider}${handle.resolvedModel ? `/${handle.resolvedModel}` : ""})`,
    () =>
      dispatchLlmRequest(
        {
          task: COMPILE_TASK,
          prompt: prelude.promptForDispatch,
          ...(handle.resolvedModel ? { model: handle.resolvedModel } : {}),
          ...(prelude.systemPrompt ? { system: prelude.systemPrompt } : {}),
        },
        { provider: handle.provider, defaultModel: handle.resolvedModel, ollamaHost: options.ollamaHost },
      ),
    (raw): CompileFailure => ({
      reason: "dispatch_failed",
      message: raw instanceof Error ? raw.message : String(raw),
    }),
  );

  // Persist: synchronous in nature, but we keep it inside the async
  // pipeline for composition. Wrap in a lifted EffectWithLog that knows
  // how to recover from a thrown persist (the slot exists for IO bombs).
  return bindAsyncWithLog(dispatched, (resp) =>
    liftEffectWithLog<DispatchResult, CompileFailure>(() => {
      const durationMs = Date.now() - start;
      let persisted: ReturnType<typeof createPersistedRun>;
      try {
        persisted = createPersistedRun({
          kind: "context",
          input: prelude.runInput,
          model: { ...prelude.runModel, model: resp.model },
          output: { text: resp.text, parsed: null },
          validation: null,
          durationMs,
          cwd: options.cwd,
        });
      } catch (raw: unknown) {
        return {
          value: err({
            reason: "persist_failed",
            message: raw instanceof Error ? raw.message : String(raw),
          }),
          logs: [{ level: "error", message: "persist: failed", data: raw }],
        };
      }
      return {
        value: ok({
          runId: persisted.run.id,
          response: { text: resp.text, provider: resp.provider, model: resp.model },
        }),
        logs: [{ level: "info", message: `persist: ok (runId=${persisted.run.id}, durationMs=${durationMs})` }],
      };
    }),
  );
}

// ── Sync post-dispatch sub-steps ────────────────────────────────────────────

interface PostInput {
  options: CompileNodeOptions;
  runId: string;
  cached: boolean;
  response: { text: string; provider: LlmProvider; model: string };
}

// (e) Project the response text into the artifact body. For code nodes,
// strip the markdown fence; otherwise pass through verbatim. Literal-
// originated responses always pass through verbatim — the user pinned
// the bytes, including any fences they wrote on purpose; extracting one
// would silently re-shape their declared output.
function projectArtifactE(input: PostInput): EffectWithLog<string, never> {
  return () => {
    const { options, response } = input;
    if (options.node.literal !== undefined) {
      return {
        value: ok(response.text),
        logs: [{ level: "info", message: "projectArtifact: pass-through (literal escape hatch)" }],
      };
    }
    if (options.node.coordinates.manifestation !== "code") {
      return {
        value: ok(response.text),
        logs: [{ level: "info", message: "projectArtifact: pass-through (manifestation != code)" }],
      };
    }
    const projected = extractCodeFence({
      text: response.text,
      language: options.node.technical.language,
    });
    return {
      value: ok(projected.content),
      logs: [{
        level: "info",
        message: projected.extracted
          ? `projectArtifact: extracted ${projected.content.length} bytes from fence (info=${projected.fenceInfo ?? "none"})`
          : "projectArtifact: no fence detected, pass-through",
      }],
    };
  };
}

// (f) Stage the artifact on disk at a sibling tmp path. Validators
// (validateLanguage, runtimeCheck) read from `pending.stagingPath`;
// the final path is only swapped in by commitArtifactE after every
// gate has passed. Calibration finding §0 (Project Legend
// 2026-05-12 milestone review): without the two-phase commit, a
// rejected artifact lands at the user's --target path before the
// validator gets a chance to reject it.
function writeArtifactPendingE(
  input: PostInput,
  content: string,
): EffectWithLog<PendingArtifact, CompileFailure> {
  return () => {
    try {
      const pending = writeArtifactPending({
        node: input.options.node,
        content,
        cwd: input.options.cwd,
        targetPath: input.options.targetPath,
        force: input.options.force,
      });
      return {
        value: ok(pending),
        logs: [{
          level: "info",
          message: `writeArtifactPending: staged at ${pending.stagingPath} → ${pending.relativePath} (${pending.bytesWritten} bytes)`,
        }],
      };
    } catch (raw: unknown) {
      // TargetExistsError is a distinct failure mode: the artifact body
      // is well-formed, the user just hasn't authorised overwrite. Map
      // it to reason="target_exists" so a caller (CLI, walker) can
      // present the clobber-gate message instead of a generic write
      // failure.
      if (raw instanceof TargetExistsError) {
        return {
          value: err({
            reason: "target_exists",
            message: raw.message,
          }),
          logs: [{ level: "error", message: `writeArtifactPending: refused (target exists: ${raw.target})` }],
        };
      }
      return {
        value: err({
          reason: "write_failed",
          message: raw instanceof Error ? raw.message : String(raw),
        }),
        logs: [{ level: "error", message: "writeArtifactPending: failed", data: raw }],
      };
    }
  };
}

// (g) Parse-check the artifact against its declared language. Reads
// from the pending's staging path; the staging file is a sibling of
// the final path, so any tooling that resolves relative imports
// sees the same parent directory it would post-commit.
function validateLanguageE(
  input: PostInput,
  pending: PendingArtifact,
): EffectWithLog<void, CompileFailure> {
  return () => {
    const node = input.options.node;
    if (node.coordinates.manifestation !== "code" || !node.technical.language) {
      return {
        value: ok(undefined),
        logs: [{ level: "info", message: "validateLanguage: skipped (not code or no language)" }],
      };
    }
    const check = validateLanguage({
      absolutePath: pending.stagingPath,
      language: node.technical.language,
    });
    if (check.status === "failed") {
      return {
        value: err({
          reason: "validate_failed",
          message: `${node.technical.language} parse failed for ${pending.relativePath}: ${check.message}`,
        }),
        logs: [{ level: "error", message: `validateLanguage: ${node.technical.language} parse failed: ${check.message}` }],
      };
    }
    return {
      value: ok(undefined),
      logs: [{ level: "info", message: `validateLanguage: ${check.status}` }],
    };
  };
}

// (g.5) Semantic gate. After parse-check we evaluate the focal's
// structured contract (context.{requires, provides, forbids} + the
// FORBID prose from node.rules) against the artifact body via
// `validateIntent`. A decisive false verdict aborts the compile with
// reason="intent_failed" — the LLM produced something the linker would
// also reject, no point letting it pass downstream. Unknown verdicts
// (open-world mode in a future caller) pass with a warning so the
// audit log records the uncertainty.
//
// Cost: one `assembleContext` + `glueFragments` per compile step. For
// nodes with an empty contract the validator returns true trivially —
// the work is small relative to the LLM dispatch that preceded it.
function validateIntentE(
  input: PostInput,
  artifactContent: string,
): EffectWithLog<void, CompileFailure> {
  return () => {
    try {
      const cwd = input.options.cwd ?? process.cwd();
      // Pin the assembly to the focal's own branch — assembleContext
      // defaults to state.activeBranch, but compile-plan-runner can be
      // invoked against a focal on a non-active branch (e.g. multi-branch
      // CI flows, the --branch flag) and the default would falsely
      // trigger a branch mismatch error before the validator even ran.
      const assembled = assembleContext(
        {
          targetNodeId: input.options.node.id,
          branch: input.options.node.coordinates.branch,
          mode: "strict",
        },
        cwd,
      );
      const fragments = assembled.nodes.map(buildFragment);
      const glued = glueFragments(fragments);
      const validation = validateIntent({
        assembled,
        glued,
        candidate: {
          text: artifactContent,
          provider: input.response.provider,
          model: input.response.model,
        },
      });
      if (validation.verdict === "true") {
        return {
          value: ok(undefined),
          logs: [{
            level: "info",
            message: `validateIntent: ok (score=${validation.score})`,
          }],
        };
      }
      if (validation.verdict === "unknown") {
        return {
          value: ok(undefined),
          logs: [{
            level: "warn",
            message: `validateIntent: unknown verdict — passing with ${validation.warnings.length} warning(s)`,
            data: validation.warnings,
          }],
        };
      }
      // Decisive failure — surface the linker's violations as the failure
      // message so the user (or the next iteration of the loop) sees
      // exactly which clause of the contract was violated.
      const summary = validation.violations.length > 0
        ? validation.violations.join("; ")
        : "no specific violation surfaced by the validator";
      return {
        value: err({
          reason: "intent_failed",
          message: `Intent validation failed (score=${validation.score}): ${summary}`,
        }),
        logs: [{
          level: "error",
          message: `validateIntent: failed (score=${validation.score})`,
          data: validation.violations,
        }],
      };
    } catch (raw) {
      // assembleContext / glueFragments can throw on a malformed graph
      // (missing ancestor, broken parent chain). Surface as intent_failed
      // so the caller sees a single class of "the gate could not produce
      // a verdict" rather than an unrelated stack.
      return {
        value: err({
          reason: "intent_failed",
          message: `Could not run intent validation: ${raw instanceof Error ? raw.message : String(raw)}`,
        }),
        logs: [{
          level: "error",
          message: "validateIntent: pre-check threw",
          data: raw,
        }],
      };
    }
  };
}

// (h) Optional runtime check (opt-in via options.runtimeCheck). The
// staging file is executed; the user-facing path in the error
// message is the final relativePath (the user does not need to know
// the file lived under a tmp name during validation).
function runtimeCheckE(
  input: PostInput,
  pending: PendingArtifact,
): EffectWithLog<void, CompileFailure> {
  return () => {
    const opts = input.options;
    const node = opts.node;
    if (!opts.runtimeCheck || node.coordinates.manifestation !== "code" || !node.technical.language) {
      return {
        value: ok(undefined),
        logs: [{ level: "info", message: "runtimeCheck: skipped (off or not code)" }],
      };
    }
    const rc = runtimeCheck({
      absolutePath: pending.stagingPath,
      language: node.technical.language,
      timeoutMs: opts.runtimeCheckTimeoutMs,
    });
    if (rc.status === "failed") {
      return {
        value: err({
          reason: "runtime_failed",
          message: `${node.technical.language} runtime failed for ${pending.relativePath}: ${rc.message}`,
        }),
        logs: [{ level: "error", message: `runtimeCheck: ${node.technical.language} failed: ${rc.message}` }],
      };
    }
    return {
      value: ok(undefined),
      logs: [{ level: "info", message: `runtimeCheck: ${rc.status}` }],
    };
  };
}

// (h.5) Commit. Atomic rename from staging → final; returns the
// committed WriteArtifactResult that emitEventE records. Only runs
// after every post-write validator has accepted the bytes.
function commitArtifactE(
  pending: PendingArtifact,
): EffectWithLog<WriteArtifactResult, CompileFailure> {
  return () => {
    try {
      const artifact = pending.commit();
      return {
        value: ok(artifact),
        logs: [{
          level: "info",
          message: `commit: ${artifact.relativePath} (${artifact.bytesWritten} bytes)`,
        }],
      };
    } catch (raw: unknown) {
      return {
        value: err({
          reason: "write_failed",
          message: `commit failed for ${pending.relativePath}: ${raw instanceof Error ? raw.message : String(raw)}`,
        }),
        logs: [{ level: "error", message: "commit: rename failed", data: raw }],
      };
    }
  };
}

// (i) Emit the compilation_run event and update state. Cannot meaningfully
// fail today (state.json + events.jsonl are append/write-locally).
// If a future iteration tightens this, it joins the failure channel.
function emitEventE(
  input: PostInput,
  artifact: WriteArtifactResult,
): EffectWithLog<OntologyEvent, never> {
  return () => {
    const cwd = input.options.cwd;
    const paths = getOntologyPaths(cwd);
    const state = readState(cwd);
    const eventId = "evt_" + randomBytes(4).toString("hex");
    const event = OntologyEventSchema.parse({
      eventId,
      sequence: state.eventCount,
      timestamp: new Date().toISOString(),
      eventType: "compilation_run",
      branch: state.activeBranch,
      previousEventId: state.lastEventId,
      payload: {
        nodeId: input.options.node.id,
        runId: input.runId,
        cached: input.cached,
        artifactRelativePath: artifact.relativePath,
        bytes: artifact.bytesWritten,
      },
    });
    appendJsonl(paths.eventsPath, event);
    state.eventCount += 1;
    state.lastEventId = eventId;
    state.updatedAt = new Date().toISOString();
    writeState(state, cwd);
    return {
      value: ok(event),
      logs: [{ level: "info", message: `emitEvent: ${eventId} (sequence=${event.sequence})` }],
    };
  };
}

// ── Literal short-circuit (Project Legend Phase β-2) ────────────────────────
//
// When a node carries `literal`, we synthesise the dispatch outcome
// without calling any model. The persisted run is content-addressed on
// the literal bytes (plus upstream contextHash, branch, target id), so
// two byte-identical literals collapse to the same run id and a
// re-compile is a cache hit. Synchronous end-to-end — no async path
// needed since there is no IO to wait on.

interface LiteralOutcome {
  runId: string;
  cached: boolean;
  response: { text: string; provider: LlmProvider; model: string };
}

const LITERAL_MODEL_NAME = "literal";

function runLiteralShortCircuit(
  options: CompileNodeOptions,
  literal: string,
  cwd: string,
): { value: ReturnType<typeof ok<LiteralOutcome>> | ReturnType<typeof err<CompileFailure>>; logs: LogEntry[] } {
  const upstream = options.upstream ?? [];
  const runInput: PersistedRunInput = {
    // Hash the literal bytes as the prompt: the literal IS the prompt
    // here (the identity functor between literal and output is the whole
    // point). Including upstream contextHash means a literal whose
    // refinement parents change still gets a fresh run id.
    promptHash: hashPrompt(literal),
    contextHash: hashUpstreamContext(upstream),
    targetNodeId: options.node.id,
    branch: options.node.coordinates.branch,
    time: null,
    task: COMPILE_TASK as string,
    includeEdges: false,
    edgeTypes: null,
  };
  const runModel: PersistedRunModel = {
    provider: "literal",
    model: LITERAL_MODEL_NAME,
    host: null,
  };
  const expectedId = computeRunId(runInput, runModel);
  const cachedRun = loadPersistedRun(expectedId, cwd);
  if (cachedRun) {
    return {
      value: ok({
        runId: cachedRun.id,
        cached: true,
        response: { text: cachedRun.output.text, provider: "literal", model: LITERAL_MODEL_NAME },
      }),
      logs: [{ level: "info", message: `literal: cache hit (runId=${cachedRun.id}, ${literal.length} bytes)` }],
    };
  }
  try {
    const persisted = createPersistedRun({
      kind: "context",
      input: runInput,
      model: runModel,
      output: { text: literal, parsed: null },
      validation: null,
      durationMs: 0,
      cwd: options.cwd,
    });
    return {
      value: ok({
        runId: persisted.run.id,
        cached: false,
        response: { text: literal, provider: "literal", model: LITERAL_MODEL_NAME },
      }),
      logs: [{ level: "info", message: `literal: persisted (runId=${persisted.run.id}, ${literal.length} bytes)` }],
    };
  } catch (raw: unknown) {
    return {
      value: err({
        reason: "persist_failed",
        message: raw instanceof Error ? raw.message : String(raw),
      }),
      logs: [{ level: "error", message: "literal: persist failed", data: raw }],
    };
  }
}

// ── Top-level orchestration ─────────────────────────────────────────────────

export async function compileNode(options: CompileNodeOptions): Promise<CompileNodeResult> {
  const cwd = options.cwd ?? process.cwd();
  const optionsWithCwd = { ...options, cwd };

  let runId: string;
  let cached: boolean;
  let response: { text: string; provider: LlmProvider; model: string };
  const accumulatedLogs: LogEntry[] = [];

  // (0) Literal escape hatch (Project Legend Phase β-2). When the node
  // pins its output as `literal`, no model dispatch occurs: the literal
  // is the response text. We still build a content-addressed persisted
  // run (provider=literal, model=literal, promptHash over the literal
  // bytes) so the audit chain — events.jsonl, runs/, artifact relativ
  // path — has the same shape as an LLM-generated artifact. Two literal
  // nodes whose text is byte-identical share a runId; a re-compile of
  // the same literal is a cache hit.
  if (options.node.literal !== undefined) {
    const literalOutcome = runLiteralShortCircuit(optionsWithCwd, options.node.literal, cwd);
    accumulatedLogs.push(...literalOutcome.logs);
    if (literalOutcome.value.tag === "err") {
      return packageFailure(literalOutcome.value.error, accumulatedLogs);
    }
    runId = literalOutcome.value.value.runId;
    cached = literalOutcome.value.value.cached;
    response = literalOutcome.value.value.response;
  } else {
    // (1) Synchronous prelude: resolve model, build run envelope, check cache.
    // Each sub-step's logs accumulate; an err short-circuits the rest.
    const preludePipeline = bindWithLog(resolveModelE(optionsWithCwd), (handle) =>
      bindWithLog(buildPreludeE(optionsWithCwd, handle), (prelude) =>
        bindWithLog(checkCacheE(prelude, cwd), (cache) =>
          pureWithLog({ handle, prelude, cache }))));
    const preludeOutcome = runWithLog(preludePipeline);
    accumulatedLogs.push(...preludeOutcome.logs);

    if (preludeOutcome.value.tag === "err") {
      return packageFailure(preludeOutcome.value.error, accumulatedLogs);
    }

    const { handle, prelude, cache } = preludeOutcome.value.value;

    // (2) Async slice: cache hit short-circuits to the post-dispatch slice
    // with a synthetic log entry; cache miss runs dispatch + persist.
    if (cache.kind === "hit") {
      runId = cache.runId;
      cached = true;
      response = cache.response;
      accumulatedLogs.push({ level: "info", message: "dispatch: skipped (cache hit)" });
    } else {
      const dispatchOutcome = await runAsyncWithLog(dispatchAndPersistE(optionsWithCwd, handle, prelude));
      accumulatedLogs.push(...dispatchOutcome.logs);
      if (dispatchOutcome.value.tag === "err") {
        return packageFailure(dispatchOutcome.value.error, accumulatedLogs);
      }
      runId = dispatchOutcome.value.value.runId;
      cached = false;
      response = dispatchOutcome.value.value.response;
    }
  }

  // (3) Synchronous post-dispatch slice: project, stage the write,
  // validate (language + intent + runtime), commit, emit event. The
  // post-dispatch pipeline is now two-phase: writeArtifactPendingE
  // stages bytes at a sibling tmp path; commitArtifactE renames to
  // the final path only after every gate has passed. Any error
  // between stage and commit triggers a rollback (unlink the tmp)
  // so a rejected artifact never lands at the user's --target path.
  //
  // The pending is captured via a closure (rather than threaded as
  // a function value through bindWithLog) because the rollback has
  // to run *outside* the bindWithLog chain: when a downstream step
  // returns err the chain short-circuits, and the cleanup callback
  // inside wouldn't fire. The closure variable is the simplest way
  // to thread the rollback signal out of the chain.
  const postInput: PostInput = { options: optionsWithCwd, runId, cached, response };
  let pendingForCleanup: PendingArtifact | null = null;
  const postPipeline: EffectWithLog<PostShape, CompileFailure> = bindWithLog(
    projectArtifactE(postInput),
    (content) => bindWithLog(
      writeArtifactPendingE(postInput, content),
      (pending) => {
        pendingForCleanup = pending;
        return bindWithLog(
          validateLanguageE(postInput, pending),
          () => bindWithLog(
            validateIntentE(postInput, content),
            () => bindWithLog(
              runtimeCheckE(postInput, pending),
              () => bindWithLog(
                commitArtifactE(pending),
                (artifact) => {
                  // Commit succeeded — the tmp has been renamed to
                  // the final path. Disarm the cleanup so a
                  // downstream emit-event failure (currently
                  // impossible, but tightening the channel is the
                  // direction of travel) does not unlink the
                  // committed artifact.
                  pendingForCleanup = null;
                  return bindWithLog(
                    emitEventE(postInput, artifact),
                    (event) => pureWithLog({ artifact, event } as PostShape),
                  );
                },
              ),
            ),
          ),
        );
      },
    ),
  );
  const postOutcome = runWithLog(postPipeline);
  accumulatedLogs.push(...postOutcome.logs);

  if (postOutcome.value.tag === "err") {
    // Rollback the staged write if it got that far. The rollback is
    // best-effort: if the staging file already disappeared (e.g.,
    // concurrent removal), the rollback silently no-ops. We log
    // either way so an auditor can see the safety property fired.
    // The cast is needed because TS's control-flow analysis cannot
    // see the assignment inside the bindWithLog callback above.
    const pending = pendingForCleanup as PendingArtifact | null;
    if (pending) {
      pending.rollback();
      accumulatedLogs.push({
        level: "info",
        message: `rollback: staged artifact unlinked (target ${pending.relativePath} untouched)`,
      });
    }
    return packageFailure(postOutcome.value.error, accumulatedLogs);
  }

  return {
    ok: true,
    runId,
    cached,
    artifact: postOutcome.value.value.artifact,
    event: postOutcome.value.value.event,
    response,
    logs: accumulatedLogs,
  };
}

// Translate a CompileFailure + accumulated logs into the public failure
// shape. The reason / message fields match the original union exactly so
// callers (compile-plan-runner, walker actions, the CLI) do not change.
function packageFailure(failure: CompileFailure, logs: readonly LogEntry[]): CompileNodeResult {
  return { ok: false, reason: failure.reason, message: failure.message, logs };
}

// Tiny helper used by `failWithLog` consumers in unit tests. Re-exported
// for symmetry with the other effect modules; not load-bearing.
export const _internalFailWithLog = failWithLog;
