import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmTask, LlmProvider } from "../../runtime/llm/types.js";

export interface RunPromptOptions {
  task?: string;
  prompt?: string;
  provider?: string;
  json?: boolean;
}

export async function runPromptCommand(options: RunPromptOptions): Promise<void> {
  if (!options.task) {
    throw new Error("error: required option '--task <task>' not specified");
  }

  if (!options.prompt) {
    throw new Error("error: required option '--prompt <prompt>' not specified");
  }

  const provider = (options.provider ?? "mock") as LlmProvider;

  if (provider !== "mock") {
    // Fails clearly as per requirements
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const task = options.task as LlmTask;

  // We are asked to run dispatchLlmRequest, which throws if provider is not 'mock'
  // and we'll let that happen, but we already catch the specific string match above.
  const response = await dispatchLlmRequest(
    {
      task,
      prompt: options.prompt,
    },
    { provider }
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
}
