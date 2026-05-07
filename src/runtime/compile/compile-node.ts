import { randomBytes } from "node:crypto";
import type { OntologyNode, OntologyEvent, OntologyModel, PersistedRunInput, PersistedRunModel } from "../../schemas/ontology.js";
import { OntologyEventSchema } from "../../schemas/ontology.js";
import { dispatchLlmRequest } from "../llm/dispatcher.js";
import { resolveNodeModel } from "../llm/resolve-node-model.js";
import type { LlmProvider, LlmTask } from "../llm/types.js";
import { hashPrompt } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";
import { writeArtifact, type WriteArtifactResult } from "./artifact-writer.js";
import { extractCodeFence } from "./post/extract-code-fence.js";
import { validateLanguage } from "./post/validate-language.js";
import { runtimeCheck } from "./post/runtime-check.js";
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
}

export type CompileNodeFailureReason =
  | "dispatch_failed"
  | "persist_failed"
  | "write_failed"
  | "validate_failed"
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
// strip the markdown fence; otherwise pass through verbatim.
function projectArtifactE(input: PostInput): EffectWithLog<string, never> {
  return () => {
    const { options, response } = input;
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

// (f) Write the artifact to disk.
function writeArtifactE(
  input: PostInput,
  content: string,
): EffectWithLog<WriteArtifactResult, CompileFailure> {
  return () => {
    try {
      const artifact = writeArtifact({
        node: input.options.node,
        content,
        cwd: input.options.cwd,
      });
      return {
        value: ok(artifact),
        logs: [{ level: "info", message: `writeArtifact: ${artifact.relativePath} (${artifact.bytesWritten} bytes)` }],
      };
    } catch (raw: unknown) {
      return {
        value: err({
          reason: "write_failed",
          message: raw instanceof Error ? raw.message : String(raw),
        }),
        logs: [{ level: "error", message: "writeArtifact: failed", data: raw }],
      };
    }
  };
}

// (g) Parse-check the artifact against its declared language.
function validateLanguageE(
  input: PostInput,
  artifact: WriteArtifactResult,
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
      absolutePath: artifact.absolutePath,
      language: node.technical.language,
    });
    if (check.status === "failed") {
      return {
        value: err({
          reason: "validate_failed",
          message: `${node.technical.language} parse failed for ${artifact.relativePath}: ${check.message}`,
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

// (h) Optional runtime check (opt-in via options.runtimeCheck).
function runtimeCheckE(
  input: PostInput,
  artifact: WriteArtifactResult,
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
      absolutePath: artifact.absolutePath,
      language: node.technical.language,
      timeoutMs: opts.runtimeCheckTimeoutMs,
    });
    if (rc.status === "failed") {
      return {
        value: err({
          reason: "runtime_failed",
          message: `${node.technical.language} runtime failed for ${artifact.relativePath}: ${rc.message}`,
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

// ── Top-level orchestration ─────────────────────────────────────────────────

export async function compileNode(options: CompileNodeOptions): Promise<CompileNodeResult> {
  const cwd = options.cwd ?? process.cwd();
  const optionsWithCwd = { ...options, cwd };

  // (1) Synchronous prelude: resolve model, build run envelope, check cache.
  // Each sub-step's logs accumulate; an err short-circuits the rest.
  const preludePipeline = bindWithLog(resolveModelE(optionsWithCwd), (handle) =>
    bindWithLog(buildPreludeE(optionsWithCwd, handle), (prelude) =>
      bindWithLog(checkCacheE(prelude, cwd), (cache) =>
        pureWithLog({ handle, prelude, cache }))));
  const preludeOutcome = runWithLog(preludePipeline);

  if (preludeOutcome.value.tag === "err") {
    return packageFailure(preludeOutcome.value.error, preludeOutcome.logs);
  }

  const { handle, prelude, cache } = preludeOutcome.value.value;
  const accumulatedLogs: LogEntry[] = [...preludeOutcome.logs];

  // (2) Async slice: cache hit short-circuits to the post-dispatch slice
  // with a synthetic log entry; cache miss runs dispatch + persist.
  let runId: string;
  let cached: boolean;
  let response: { text: string; provider: LlmProvider; model: string };

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

  // (3) Synchronous post-dispatch slice: project, write, validate, runtime
  // check, emit event. Same shape as prelude — bindWithLog tower, single
  // run at the end, logs accumulate.
  const postInput: PostInput = { options: optionsWithCwd, runId, cached, response };
  const postPipeline: EffectWithLog<PostShape, CompileFailure> = bindWithLog(
    projectArtifactE(postInput),
    (content) => bindWithLog(
      writeArtifactE(postInput, content),
      (artifact) => bindWithLog(
        validateLanguageE(postInput, artifact),
        () => bindWithLog(
          runtimeCheckE(postInput, artifact),
          () => bindWithLog(
            emitEventE(postInput, artifact),
            (event) => pureWithLog({ artifact, event } as PostShape),
          ),
        ),
      ),
    ),
  );
  const postOutcome = runWithLog(postPipeline);
  accumulatedLogs.push(...postOutcome.logs);

  if (postOutcome.value.tag === "err") {
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
