import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmTask, LlmProvider } from "../../runtime/llm/types.js";
import { hashPrompt } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";
import type { PersistedRunInput, PersistedRunModel } from "../../schemas/ontology.js";

export interface RunPromptOptions {
  task?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  ollamaHost?: string;
  json?: boolean;
  persist?: boolean;
}

export async function runPromptCommand(options: RunPromptOptions): Promise<void> {
  const provider = (options.provider ?? "mock") as LlmProvider;

  if (provider !== "mock" && provider !== "ollama") {
    // Fails clearly as per requirements
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const task = options.task as LlmTask;
  const promptText = options.prompt!;
  const isPersist = !!options.persist;

  // Build the deterministic input/model envelopes up front so we can detect cache hits
  // before paying for an LLM call when --persist is set.
  const runInput: PersistedRunInput = {
    promptHash: hashPrompt(promptText),
    contextHash: null,
    targetNodeId: null,
    branch: null,
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

  if (isPersist) {
    const expectedId = computeRunId(runInput, runModel);
    const cached = loadPersistedRun(expectedId);
    if (cached) {
      emitRunPromptOutput(task, cached.model.provider, cached.model.model, cached.output.text, options.json, {
        persisted: true,
        runId: cached.id,
        cached: true,
      });
      return;
    }
  }

  try {
    const start = Date.now();
    const response = await dispatchLlmRequest(
      {
        task,
        prompt: promptText,
      },
      {
        provider,
        defaultModel: options.model,
        ollamaHost: options.ollamaHost
      }
    );
    const durationMs = Date.now() - start;

    let persistedInfo: { persisted: true; runId: string; cached: boolean } | undefined;
    if (isPersist) {
      // Update model.model to the actual model the adapter reports, so the persisted
      // record reflects what truly ran rather than the requested default.
      const finalModel: PersistedRunModel = { ...runModel, model: response.model };
      const finalInput: PersistedRunInput = runInput;
      const { run, cached } = createPersistedRun({
        kind: "prompt",
        input: finalInput,
        model: finalModel,
        output: { text: response.text, parsed: null },
        validation: null,
        durationMs,
      });
      persistedInfo = { persisted: true, runId: run.id, cached };
    }

    emitRunPromptOutput(task, response.provider, response.model, response.text, options.json, persistedInfo);
  } catch (err: unknown) {
    if (provider === "ollama") {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ok: false,
              provider: "ollama",
              error: (err as Error).message,
            },
            null,
            2
          )
        );
      } else {
        console.error(`✖ Ollama unavailable: ${(err as Error).message}`);
      }
      process.exit(1);
    }
    // Let it bubble up if it's not an expected ollama error, or for mock
    throw err;
  }
}

function emitRunPromptOutput(
  task: LlmTask,
  provider: LlmProvider,
  model: string,
  text: string,
  isJson: boolean | undefined,
  persisted?: { persisted: true; runId: string; cached: boolean }
) {
  if (isJson) {
    const jsonOutput: Record<string, unknown> = {
      response: {
        text,
        model,
        provider,
      },
    };
    if (persisted) {
      jsonOutput.persisted = { runId: persisted.runId, cached: persisted.cached };
    }
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  console.log("=== ONTOLOGY RUN PROMPT ===");
  console.log(`Task:      ${task}`);
  console.log(`Provider:  ${provider}`);
  console.log(`Model:     ${model}`);
  if (persisted) {
    const tag = persisted.cached ? " (cached)" : "";
    console.log(`Run:       ${persisted.runId}${tag}`);
  }
  console.log("");
  console.log("Response:");
  console.log(text);
}
