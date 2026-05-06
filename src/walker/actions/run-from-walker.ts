import type { OntologyNode, PersistedRunInput, PersistedRunModel } from "../../schemas/ontology.js";
import { assembleContext } from "../../runtime/context/assembler.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmProvider, LlmTask } from "../../runtime/llm/types.js";
import { hashPrompt, hashContext } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";

export interface RunFromWalkerOptions {
  focal: OntologyNode;
  provider?: LlmProvider;   // default "mock"
  task?: LlmTask;           // default "semantic_parse"
  model?: string;           // optional override; otherwise the adapter default
  ollamaHost?: string;      // optional Ollama host
  cwd?: string;
}

export type RunFromWalkerResult =
  | { ok: true; runId: string; cached: boolean; responseText: string; provider: LlmProvider; model: string; durationMs: number }
  | { ok: false; message: string };

// Walker action: dispatch a model run against the focal node's assembled
// context, persist the result, and return the response. Mirrors `onto run
// context --persist` but invoked programmatically from the TUI.
//
// Persistence is always on. The walker is interactive; a deliberate `:run`
// produces a record the user can inspect with `onto runs show <id>` later.
// If the user wants to experiment without records, they can use the CLI
// directly with `--persist` omitted.
export async function runFromWalker(options: RunFromWalkerOptions): Promise<RunFromWalkerResult> {
  const cwd = options.cwd ?? process.cwd();
  const provider: LlmProvider = options.provider ?? "mock";
  const task: LlmTask = options.task ?? "semantic_parse";

  if (provider !== "mock" && provider !== "ollama") {
    return { ok: false, message: `unsupported provider: ${provider} (try mock or ollama)` };
  }

  let contextOutput;
  try {
    contextOutput = assembleContext({ targetNodeId: options.focal.id, mode: "strict" }, cwd);
  } catch (err: unknown) {
    return { ok: false, message: `failed to assemble context: ${err instanceof Error ? err.message : String(err)}` };
  }

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

  // Cache hit on the deterministic id: skip dispatch and surface the existing
  // record. Same contract as `run context --persist`.
  const expectedId = computeRunId(runInput, runModel);
  const cached = loadPersistedRun(expectedId, cwd);
  if (cached) {
    return {
      ok: true,
      runId: cached.id,
      cached: true,
      responseText: cached.output.text,
      provider: cached.model.provider,
      model: cached.model.model,
      durationMs: cached.duration_ms,
    };
  }

  const start = Date.now();
  let response;
  try {
    response = await dispatchLlmRequest(
      { task, prompt: contextOutput.prompt },
      { provider, defaultModel: options.model, ollamaHost: options.ollamaHost },
    );
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    if (provider === "ollama") {
      return { ok: false, message: `ollama unavailable: ${detail}` };
    }
    return { ok: false, message: `dispatch failed: ${detail}` };
  }
  const durationMs = Date.now() - start;

  const finalModel: PersistedRunModel = { ...runModel, model: response.model };
  let runId: string;
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
    runId = run.id;
  } catch (err: unknown) {
    return { ok: false, message: `failed to persist run: ${err instanceof Error ? err.message : String(err)}` };
  }

  return {
    ok: true,
    runId,
    cached: false,
    responseText: response.text,
    provider: response.provider,
    model: response.model,
    durationMs,
  };
}
