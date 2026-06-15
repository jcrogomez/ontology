import type { OntologyNode, PersistedRun, PersistedRunInput, PersistedRunModel } from "../../../kernel/schemas/ontology.js";
import { assembleContext } from "../../../forward/context/assembler.js";
import type { ContextAssemblyOutput } from "../../../forward/context/types.js";
import { dispatchLlmRequest } from "../../../runtime/llm/dispatcher.js";
import type { LlmProvider, LlmResponse, LlmTask } from "../../../runtime/llm/types.js";
import { hashPrompt, hashContext } from "../../../kernel/core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../../kernel/core/runs/persist.js";
import {
  type EffectWithLog,
  type LogEntry,
  ok,
  err,
  runWithLog,
} from "../../../runtime/effects/index.js";
import {
  type AsyncEffectWithLog,
  liftPromiseWithLog,
  runAsyncWithLog,
} from "../../../runtime/effects/async.js";

export interface RunFromWalkerOptions {
  focal: OntologyNode;
  provider?: LlmProvider;   // default "mock"
  task?: LlmTask;           // default "semantic_parse"
  model?: string;           // optional override; otherwise the adapter default
  ollamaHost?: string;      // optional Ollama host
  cwd?: string;
}

export type RunFromWalkerResult =
  | {
      ok: true;
      runId: string;
      cached: boolean;
      responseText: string;
      provider: LlmProvider;
      model: string;
      durationMs: number;
      // Diagnostic breadcrumbs accumulated through the run. Always present
      // (possibly empty for the early cache-hit path). The walker UI is
      // free to ignore the log; future iterations may render it in a
      // collapsible panel for the user to inspect.
      log: readonly LogEntry[];
    }
  | {
      ok: false;
      message: string;
      // Logs survive failure — the Writer leg is unconditional in the
      // EffectWithLog monad, so partial diagnostics from steps that
      // succeeded before the failure are preserved here.
      log: readonly LogEntry[];
    };

// Walker action: dispatch a model run against the focal node's assembled
// context, persist the result, and return the response. Mirrors `onto run
// context --persist` but invoked programmatically from the TUI.
//
// Persistence is always on. The walker is interactive; a deliberate `:run`
// produces a record the user can inspect with `onto runs show <id>` later.
// If the user wants to experiment without records, they can use the CLI
// directly with `--persist` omitted.
//
// Internally the action runs as a sequence of `EffectWithLog` /
// `AsyncEffectWithLog` steps. Each step emits an info log entry on
// success and an error entry on failure. The procedural runner threads
// the log array through the early-return paths (cache hit short-circuits
// the dispatch step) so the diagnostic record reflects exactly which
// steps actually ran.

// Internal typed failure carrying both a kind for control-flow decisions
// and the user-facing message the public Result will surface unchanged.
type RunFailure =
  | { kind: "context"; message: string }
  | { kind: "provider"; message: string }
  | { kind: "ollama"; message: string }
  | { kind: "dispatch"; message: string }
  | { kind: "persist"; message: string };

export async function runFromWalker(options: RunFromWalkerOptions): Promise<RunFromWalkerResult> {
  const cwd = options.cwd ?? process.cwd();
  const provider: LlmProvider = options.provider ?? "mock";
  const task: LlmTask = options.task ?? "semantic_parse";
  const logs: LogEntry[] = [];

  if (provider !== "mock" && provider !== "ollama") {
    return {
      ok: false,
      message: `unsupported provider: ${provider} (try mock or ollama)`,
      log: logs,
    };
  }

  // Step 1: assemble context (sync, may throw).
  const ctxR = runWithLog(assembleContextE(options.focal.id, cwd));
  logs.push(...ctxR.logs);
  if (ctxR.value.tag === "err") {
    return { ok: false, message: ctxR.value.error.message, log: logs };
  }
  const contextOutput = ctxR.value.value;

  // Step 2: derive deterministic run identity (pure).
  const runInput: PersistedRunInput = {
    promptHash: hashPrompt(contextOutput.prompt),
    contextHash: hashContext(contextOutput),
    targetNodeId: options.focal.id,
    branch: contextOutput.branch,
    time: null,
    task: task as string,
    includeEdges: false,
    edgeTypes: null,
  };
  const runModel: PersistedRunModel = {
    provider,
    model: options.model ?? (provider === "mock" ? "mock_default" : "unknown"),
    host: options.ollamaHost ?? null,
  };
  const expectedId = computeRunId(runInput, runModel);

  // Step 3: cache lookup (sync, never throws — returns null on miss).
  const cacheR = runWithLog(cacheLookupE(expectedId, cwd));
  logs.push(...cacheR.logs);
  // cacheLookupE never fails; the value is the optional cached run.
  const cached = cacheR.value.tag === "ok" ? cacheR.value.value : null;
  if (cached) {
    return {
      ok: true,
      runId: cached.id,
      cached: true,
      responseText: cached.output.text,
      provider: cached.model.provider,
      model: cached.model.model,
      durationMs: cached.duration_ms,
      log: logs,
    };
  }

  // Step 4: dispatch (async, may reject).
  const start = Date.now();
  const dispatchR = await runAsyncWithLog(
    dispatchE(provider, task, contextOutput, options.model, options.ollamaHost),
  );
  logs.push(...dispatchR.logs);
  if (dispatchR.value.tag === "err") {
    return { ok: false, message: dispatchR.value.error.message, log: logs };
  }
  const response = dispatchR.value.value;
  const durationMs = Date.now() - start;

  // Step 5: persist (sync, may throw).
  const finalModel: PersistedRunModel = { ...runModel, model: response.model };
  const persistR = runWithLog(persistE(runInput, finalModel, response, durationMs, cwd));
  logs.push(...persistR.logs);
  if (persistR.value.tag === "err") {
    return { ok: false, message: persistR.value.error.message, log: logs };
  }
  const runId = persistR.value.value;

  return {
    ok: true,
    runId,
    cached: false,
    responseText: response.text,
    provider: response.provider,
    model: response.model,
    durationMs,
    log: logs,
  };
}

// -----------------------------------------------------------------------
// Step wrappers — each is a thin EffectWithLog over a function that may
// throw or fail. The try/catch lives inside the wrapper so the orchestrator
// above never needs one. Success and failure both emit a single log entry
// describing what was attempted.
// -----------------------------------------------------------------------

function assembleContextE(focalId: string, cwd: string): EffectWithLog<ContextAssemblyOutput, RunFailure> {
  return () => {
    try {
      const value = assembleContext({ targetNodeId: focalId, mode: "strict" }, cwd);
      return {
        value: ok(value),
        logs: [{ level: "info", message: `assembleContext: ok (focal=${focalId})` }],
      };
    } catch (raw) {
      const detail = raw instanceof Error ? raw.message : String(raw);
      return {
        value: err({ kind: "context", message: `failed to assemble context: ${detail}` }),
        logs: [{ level: "error", message: `assembleContext: failed`, data: detail }],
      };
    }
  };
}

function cacheLookupE(expectedId: string, cwd: string): EffectWithLog<PersistedRun | null, never> {
  return () => {
    const cached = loadPersistedRun(expectedId, cwd);
    return {
      value: ok(cached),
      logs: [
        cached
          ? logEntryFor("cacheLookup", `hit ${cached.id}`)
          : logEntryFor("cacheLookup", `miss (expected ${expectedId})`),
      ],
    };
  };
}

function dispatchE(
  provider: LlmProvider,
  task: LlmTask,
  contextOutput: ContextAssemblyOutput,
  model: string | undefined,
  ollamaHost: string | undefined,
): AsyncEffectWithLog<LlmResponse, RunFailure> {
  return liftPromiseWithLog(
    `dispatch[provider=${provider} task=${task}]`,
    () =>
      dispatchLlmRequest(
        { task, prompt: contextOutput.prompt },
        { provider, defaultModel: model, ollamaHost },
      ),
    (raw) => {
      const detail = raw instanceof Error ? raw.message : String(raw);
      if (provider === "ollama") {
        return { kind: "ollama", message: `ollama unavailable: ${detail}` };
      }
      return { kind: "dispatch", message: `dispatch failed: ${detail}` };
    },
  );
}

function persistE(
  runInput: PersistedRunInput,
  finalModel: PersistedRunModel,
  response: LlmResponse,
  durationMs: number,
  cwd: string,
): EffectWithLog<string, RunFailure> {
  return () => {
    try {
      const { run } = createPersistedRun({
        kind: "context",
        input: runInput,
        model: finalModel,
        output: { text: response.text, parsed: null },
        validation: null,
        durationMs,
        cwd,
      });
      return {
        value: ok(run.id),
        logs: [{ level: "info", message: `createPersistedRun: ok (id=${run.id})` }],
      };
    } catch (raw) {
      const detail = raw instanceof Error ? raw.message : String(raw);
      return {
        value: err({ kind: "persist", message: `failed to persist run: ${detail}` }),
        logs: [{ level: "error", message: `createPersistedRun: failed`, data: detail }],
      };
    }
  };
}

function logEntryFor(label: string, detail: string): LogEntry {
  return { level: "info", message: `${label}: ${detail}` };
}
