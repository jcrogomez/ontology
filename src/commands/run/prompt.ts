import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmTask, LlmProvider } from "../../runtime/llm/types.js";

export interface RunPromptOptions {
  task?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  ollamaHost?: string;
  json?: boolean;
}

export async function runPromptCommand(options: RunPromptOptions): Promise<void> {
  const provider = (options.provider ?? "mock") as LlmProvider;

  if (provider !== "mock" && provider !== "ollama") {
    // Fails clearly as per requirements
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const task = options.task as LlmTask;

  try {
    const response = await dispatchLlmRequest(
      {
        task,
        prompt: options.prompt!,
      },
      {
        provider,
        defaultModel: options.model,
        ollamaHost: options.ollamaHost
      }
    );

    if (options.json) {
      const jsonOutput = {
        response: {
          text: response.text,
          model: response.model,
          provider: response.provider,
        },
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    console.log("=== ONTOLOGY RUN PROMPT ===");
    console.log(`Task:      ${task}`);
    console.log(`Provider:  ${response.provider}`);
    console.log(`Model:     ${response.model}`);
    console.log("");
    console.log("Response:");
    console.log(response.text);
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
