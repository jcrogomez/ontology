import { assembleContext } from "../../runtime/context/assembler.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import { buildFragment } from "../../runtime/context/presheaf.js";
import { glueFragments } from "../../runtime/context/gluing.js";
import { validateIntent, type IntentValidationResult } from "../../runtime/context/intent-validator.js";
import type { LlmTask, LlmProvider } from "../../runtime/llm/types.js";
import { hashPrompt, hashContext } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";
import type { PersistedRunInput, PersistedRunModel } from "../../schemas/ontology.js";

export interface RunContextOptions {
  provider?: string;
  task?: string;
  branch?: string;
  time?: string;
  mode?: string;
  json?: boolean;
  validate?: boolean;
  model?: string;
  ollamaHost?: string;
  persist?: boolean;
}

export async function runContextCommand(id: string, options: RunContextOptions) {
  const provider = (options.provider || "mock") as string;
  const task = (options.task || "semantic_parse") as LlmTask;
  const mode = (options.mode || "strict") as "strict" | "compare" | "propose";
  const branch = options.branch;
  const time = options.time ? parseInt(options.time, 10) : undefined;
  const isJson = !!options.json;
  const isValidate = !!options.validate;
  const isPersist = !!options.persist;

  if (provider !== "mock" && provider !== "ollama") {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const contextOutput = assembleContext({
    targetNodeId: id,
    branch,
    time,
    mode,
  });

  // Build deterministic envelopes up front so we can detect cache hits before dispatch
  // when --persist is on.
  const runInput: PersistedRunInput = {
    promptHash: hashPrompt(contextOutput.prompt),
    contextHash: hashContext(contextOutput),
    targetNodeId: id,
    branch: contextOutput.branch,
    time: time ?? null,
    task: task as string,
    includeEdges: false,
    edgeTypes: null,
  };
  const runModel: PersistedRunModel = {
    provider: provider as LlmProvider,
    model: options.model ?? (provider === "mock" ? "mock_default" : "unknown"),
    host: options.ollamaHost ?? null,
  };

  if (isPersist) {
    const expectedId = computeRunId(runInput, runModel);
    const cached = loadPersistedRun(expectedId);
    if (cached) {
      emitRunContextOutput({
        contextOutput,
        responseText: cached.output.text,
        responseModel: cached.model.model,
        responseProvider: cached.model.provider,
        task,
        provider,
        validation: cached.validation ?? undefined,
        isJson,
        isValidate,
        persisted: { runId: cached.id, cached: true },
      });
      return;
    }
  }

  let llmResponse;
  try {
    const start = Date.now();
    llmResponse = await dispatchLlmRequest(
      {
        task,
        prompt: contextOutput.prompt,
        json: isJson,
      },
      {
        provider: provider as LlmProvider,
        defaultModel: options.model,
        ollamaHost: options.ollamaHost,
      }
    );
    (llmResponse as any).__durationMs = Date.now() - start;
  } catch (err: unknown) {
    if (provider === "ollama") {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isJson) {
        console.log(JSON.stringify({ ok: false, provider: "ollama", error: errorMessage }, null, 2));
      } else {
        console.error(`✖ Ollama unavailable: ${errorMessage}`);
      }
      process.exit(1);
    } else {
      throw err;
    }
  }

  let validationResult: IntentValidationResult | undefined;
  if (isValidate) {
    const fragments = contextOutput.nodes.map(buildFragment);
    const glued = glueFragments(fragments);
    validationResult = validateIntent({
      assembled: contextOutput,
      glued,
      candidate: {
        text: llmResponse.text,
        provider: llmResponse.provider,
        model: llmResponse.model,
      },
    });
  }

  let persistedInfo: { runId: string; cached: boolean } | undefined;
  if (isPersist) {
    const finalModel: PersistedRunModel = { ...runModel, model: llmResponse.model };
    const durationMs = (llmResponse as any).__durationMs ?? 0;
    const { run, cached } = createPersistedRun({
      kind: "context",
      input: runInput,
      model: finalModel,
      output: { text: llmResponse.text, parsed: null },
      validation: validationResult
        ? {
            ok: validationResult.ok,
            score: validationResult.score,
            violations: validationResult.violations,
            warnings: validationResult.warnings,
          }
        : null,
      durationMs,
    });
    persistedInfo = { runId: run.id, cached };
  }

  emitRunContextOutput({
    contextOutput,
    responseText: llmResponse.text,
    responseModel: llmResponse.model,
    responseProvider: llmResponse.provider,
    task,
    provider,
    validation: validationResult,
    isJson,
    isValidate,
    persisted: persistedInfo,
  });
}

interface EmitRunContextOutputOptions {
  contextOutput: ReturnType<typeof assembleContext>;
  responseText: string;
  responseModel: string;
  responseProvider: LlmProvider;
  task: LlmTask;
  provider: string;
  validation: IntentValidationResult | { ok: boolean; score: number; violations: string[]; warnings: string[] } | undefined;
  isJson: boolean;
  isValidate: boolean;
  persisted: { runId: string; cached: boolean } | undefined;
}

function emitRunContextOutput(opts: EmitRunContextOutputOptions): void {
  const {
    contextOutput,
    responseText,
    responseModel,
    responseProvider,
    task,
    provider,
    validation,
    isJson,
    isValidate,
    persisted,
  } = opts;

  if (isJson) {
    const output: Record<string, unknown> = {
      context: contextOutput,
      response: {
        text: responseText,
        model: responseModel,
        provider: responseProvider,
      },
    };

    if (isValidate && validation) {
      output.validation = {
        ok: validation.ok,
        score: validation.score,
        violations: validation.violations,
        warnings: validation.warnings,
      };
    }

    if (persisted) {
      output.persisted = { runId: persisted.runId, cached: persisted.cached };
    }

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  let truncatedText = responseText;
  if (truncatedText.length > 500) {
    truncatedText = truncatedText.substring(0, 500) + "...";
  }

  console.log(`=== ONTOLOGY RUN CONTEXT ===`);
  console.log(`Target:    ${contextOutput.targetNodeId}`);
  console.log(`Task:      ${task}`);
  console.log(`Provider:  ${provider}`);
  console.log(`Model:     ${responseModel}`);
  if (persisted) {
    const tag = persisted.cached ? " (cached)" : "";
    console.log(`Run:       ${persisted.runId}${tag}`);
  }
  console.log(``);
  console.log(`Context:`);
  console.log(`  Mode:    ${contextOutput.mode}`);
  console.log(`  Branch:  ${contextOutput.branch}`);
  console.log(`  Nodes:   ${contextOutput.nodes.length}`);
  console.log(``);
  console.log(`Response:\n${truncatedText}`);

  if (isValidate && validation) {
    console.log(``);
    console.log(`Validation:`);
    console.log(`  OK:       ${validation.ok}`);
    console.log(`  Score:    ${validation.score}`);
    console.log(`  Warnings: ${validation.warnings.length}`);
    console.log(`  Violations: ${validation.violations.length}`);
  }
}
